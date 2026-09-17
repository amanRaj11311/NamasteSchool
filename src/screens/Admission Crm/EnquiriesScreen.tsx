import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput,
  Modal, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { API_BASE } from '../../network/api';


const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#B3122A', primaryDark: '#C5221F', primarySoft: '#FDE8E8',
  blue: '#0EA5E9', blueDark: '#0284C7', blueSoft: '#E0F2FE',
  green: '#10B981', greenDark: '#059669', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberDark: '#D97706', amberSoft: '#FEF3C7',
  purple: '#A855F7', purpleDark: '#7E22CE', purpleSoft: '#F3E8FF',
  slate: '#64748B', slateDark: '#475569', slateSoft: '#F1F5F9',
};

const STAGE_STATUSES = ['New', 'Contacted', 'Campus Visit', 'Application Submitted', 'Admitted', 'Rejected'];
const LEAD_SOURCES = ['Walk-in', 'Website', 'Referral', 'Social Media', 'Other'];

const formatToYMD = (d: Date): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

const parseSafeDate = (dStr: string) => {
  if (!dStr) return new Date();
  const d = new Date(dStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

export default function EnquiriesScreen() {
  const navigation = useNavigation<any>();
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [classLevels, setClassLevels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Modal & Form States
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const emptyForm = { studentName: '', parentName: '', phone: '', email: '', classApplied: '', source: 'Walk-in', status: 'New', followUpDate: new Date() };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    
    fetchClassLevels(token);
    fetchEnquiries(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchClassLevels = async (token: string | null) => {
    try {
      const res = await axios.get(`${API_BASE}/class-levels`, authHeaders(token));
      if (res.data?.data) setClassLevels(res.data.data);
    } catch (err) { console.error('Failed to load class levels'); }
  };

  const fetchEnquiries = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/enquiries`, authHeaders(token));
      if (res.data?.success) setEnquiries(res.data.data || []);
    } catch (err) { Alert.alert('Error', 'Failed to load admission enquiries'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'enquiry' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const canCreate = hasPermission('create');
  const canUpdate = hasPermission('update');
  const canDelete = hasPermission('delete');

  const filteredEnquiries = useMemo(() => {
    return enquiries.filter(eq => {
      const matchesStatus = !statusFilter || eq.status === statusFilter;
      const matchesSource = !sourceFilter || eq.source === sourceFilter;
      const matchesSearch = !searchQuery || 
        (eq.studentName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (eq.parentName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (eq.phone || '').includes(searchQuery);
      return matchesStatus && matchesSource && matchesSearch;
    });
  }, [enquiries, statusFilter, sourceFilter, searchQuery]);

  const handleSave = async () => {
    if (!form.studentName.trim() || !form.parentName.trim() || !form.phone.trim() || !form.classApplied) {
      Alert.alert('Validation', 'Student Name, Parent Name, Phone, and Class Applied are required.'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, followUpDate: formatToYMD(form.followUpDate) };
      if (editingId) {
        await axios.put(`${API_BASE}/enquiries/${editingId}`, payload, authHeaders(authToken));
        Alert.alert('Success', 'Enquiry updated successfully');
      } else {
        await axios.post(`${API_BASE}/enquiries`, payload, authHeaders(authToken));
        Alert.alert('Success', 'Enquiry recorded successfully');
      }
      setShowModal(false);
      fetchEnquiries(authToken, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to save enquiry'); } 
    finally { setSaving(false); }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Enquiry', 'Are you sure you want to delete this enquiry record?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/enquiries/${id}`, authHeaders(authToken));
            fetchEnquiries(authToken, true);
          } catch (error) { Alert.alert('Error', 'Failed to delete enquiry'); }
      }}
    ]);
  };

  const openAddForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setActiveDropdown(null);
    setShowModal(true);
  };

  const openEditForm = (eq: any) => {
    setEditingId(eq._id);
    setForm({
      studentName: eq.studentName || '',
      parentName: eq.parentName || '',
      phone: eq.phone || '',
      email: eq.email || '',
      classApplied: eq.classApplied?._id || eq.classApplied || '',
      source: eq.source || 'Walk-in',
      status: eq.status || 'New',
      followUpDate: parseSafeDate(eq.followUpDate)
    });
    setActiveDropdown(null);
    setShowModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New': return { bg: C.blueSoft, text: C.blueDark };
      case 'Contacted': return { bg: C.purpleSoft, text: C.purpleDark };
      case 'Campus Visit': return { bg: C.amberSoft, text: C.amberDark };
      case 'Application Submitted': return { bg: C.slateSoft, text: C.slateDark };
      case 'Admitted': return { bg: C.greenSoft, text: C.greenDark };
      case 'Rejected': return { bg: C.primarySoft, text: C.primaryDark };
      default: return { bg: C.border, text: C.text };
    }
  };

  const renderInlineDropdown = (fieldKey: string, label: string, options: {label: string, value: string}[], value: string, onSelect: (v: string) => void, zIndexOff = 0) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 + zIndexOff : 1 + zIndexOff }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || 'Select...'}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => (
                <TouchableOpacity key={opt.value + i} style={styles.dropdownItem} onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}>
                  <Text style={[styles.dropdownItemText, value === opt.value && styles.textBrand]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{top:10, bottom:10, left:10, right:10}}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={styles.headerIconBadge}><Feather name="filter" size={20} color={C.purpleDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Admission CRM</Text>
          <Text style={styles.subtitle}>Enquiries & Follow-ups.</Text>
        </View>
        {canCreate && (
          <TouchableOpacity style={styles.addBtnFull} onPress={openAddForm}>
            <Feather name="plus" size={14} color="#fff" /><Text style={styles.addBtnTextFull}>Record</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={C.textFaint} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search student, parent, phone..." 
            value={searchQuery} 
            onChangeText={setSearchQuery} 
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 10, zIndex: 20 }}>
          <View style={{ flex: 1 }}>
            {renderInlineDropdown('fStatus', 'STAGE STATUS', [{label: 'All Stages', value: ''}, ...STAGE_STATUSES.map(s => ({label: s, value: s}))], statusFilter, setStatusFilter, 10)}
          </View>
          <View style={{ flex: 1 }}>
            {renderInlineDropdown('fSource', 'LEAD SOURCE', [{label: 'All Sources', value: ''}, ...LEAD_SOURCES.map(s => ({label: s, value: s}))], sourceFilter, setSourceFilter)}
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.totalText}>{filteredEnquiries.length} Enquiries Found</Text>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.purpleDark} /></View>
      ) : filteredEnquiries.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="inbox" size={40} color={C.textFaint} />
          <Text style={styles.emptyTitle}>No Enquiries Found</Text>
          <Text style={styles.emptySubtitle}>Adjust your filters or add a new enquiry.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEnquiries}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchEnquiries(authToken, true)} colors={[C.purpleDark]} />}
          renderItem={({ item }) => {
            const statColors = getStatusColor(item.status);
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.studentName} numberOfLines={1}>{item.studentName}</Text>
                    <Text style={styles.classText}>Applied: {item.classApplied?.name || 'N/A'}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statColors.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statColors.text }]}>{item.status}</Text>
                  </View>
                </View>

                <View style={styles.contactBox}>
                  <View style={styles.contactRow}>
                    <Feather name="user" size={14} color={C.textMuted} style={{marginRight: 8}}/>
                    <Text style={styles.contactText}>{item.parentName}</Text>
                  </View>
                  <View style={styles.contactRow}>
                    <Feather name="phone" size={14} color={C.textMuted} style={{marginRight: 8}}/>
                    <Text style={styles.contactText}>{item.phone}</Text>
                  </View>
                  {!!item.email && (
                    <View style={styles.contactRow}>
                      <Feather name="mail" size={14} color={C.textMuted} style={{marginRight: 8}}/>
                      <Text style={styles.contactText} numberOfLines={1}>{item.email}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLbl}>SOURCE</Text>
                    <Text style={styles.footerVal}>{item.source || 'Walk-in'}</Text>
                  </View>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLbl}>FOLLOW-UP</Text>
                    <Text style={[styles.footerVal, { color: C.amberDark, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>{item.followUpDate || '-'}</Text>
                  </View>
                  
                  <View style={{ flexDirection: 'row', gap: 8, flex: 0.5, justifyContent: 'flex-end' }}>
                    {canUpdate && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditForm(item)}><Feather name="edit-2" size={14} color={C.blueDark} /></TouchableOpacity>}
                    {canDelete && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(item._id)}><Feather name="trash-2" size={14} color={C.primaryDark} /></TouchableOpacity>}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* FORM MODAL */}
      <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.modalHeaderPurple}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="filter" size={18} color="#fff" />
                <Text style={styles.modalTitle}>{editingId ? 'Edit Enquiry' : 'Record Enquiry'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtnIconLight} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Student Name *</Text>
                  <TextInput style={styles.input} placeholder="e.g. Aarav Sharma" value={form.studentName} onChangeText={t => setForm({...form, studentName: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Parent Name *</Text>
                  <TextInput style={styles.input} placeholder="e.g. Vikas Sharma" value={form.parentName} onChangeText={t => setForm({...form, parentName: t})} />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Phone No. *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" maxLength={10} placeholder="10 Digits" value={form.phone} onChangeText={t => setForm({...form, phone: t.replace(/[^0-9]/g, '')})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" placeholder="example@mail.com" value={form.email} onChangeText={t => setForm({...form, email: t})} />
                </View>
              </View>

              <View style={{ zIndex: 60, marginBottom: 16 }}>
                {renderInlineDropdown('classApplied', 'Class Applied *', classLevels.map(cl => ({label: cl.name, value: cl._id})), form.classApplied, (v) => setForm({...form, classApplied: v}))}
              </View>

              <View style={{ zIndex: 50, marginBottom: 16 }}>
                {renderInlineDropdown('source', 'Lead Source', LEAD_SOURCES.map(s => ({label: s, value: s})), form.source, (v) => setForm({...form, source: v}))}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10, zIndex: 40 }}>
                  {renderInlineDropdown('status', 'Stage Status', STAGE_STATUSES.map(s => ({label: s, value: s})), form.status, (v) => setForm({...form, status: v}))}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Follow-Up Date</Text>
                  <TouchableOpacity style={styles.datePickerBtnForm} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.datePickerText}>{form.followUpDate.toLocaleDateString('en-GB')}</Text>
                    <Feather name="calendar" size={14} color={C.textMuted} />
                  </TouchableOpacity>
                  {showDatePicker && <DateTimePicker value={form.followUpDate} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if (d) setForm({ ...form, followUpDate: d }); }} />}
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingId ? 'Update Enquiry' : 'Save Enquiry'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  backBtn: { padding: 4, marginRight: -4 },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.purpleSoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  addBtnFull: { backgroundColor: '#B3122A', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, height: 38, borderRadius: 10, elevation: 2 },
  addBtnTextFull: { color: '#fff', fontSize: 12, fontWeight: '800', marginLeft: 6 },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44, marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text },

  statsRow: { paddingHorizontal: 16, marginTop: 16 },
  totalText: { fontSize: 13, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 },
  
  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  studentName: { fontSize: 17, fontWeight: '900', color: C.primaryDark, marginBottom: 4 },
  classText: { fontSize: 12, color: C.text, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

  contactBox: { backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 14, gap: 8 },
  contactRow: { flexDirection: 'row', alignItems: 'center' },
  contactText: { fontSize: 13, color: C.text, fontWeight: '600' },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  footerCol: { flex: 1 },
  footerLbl: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  footerVal: { fontSize: 13, fontWeight: '700', color: C.text },
  
  iconBtnEdit: { padding: 8, backgroundColor: C.blueSoft, borderRadius: 8, borderWidth: 1, borderColor: '#BAE6FD' },
  iconBtnDelete: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  modalHeaderPurple: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: C.purpleDark },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  closeBtnIconLight: { padding: 4, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 20 },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text, fontWeight: '500' },
  row: { flexDirection: 'row', marginBottom: 16 },
  
  datePickerBtnForm: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 14, color: C.text, fontWeight: '600' },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.purpleDark },
  dropdownSelectedText: { fontSize: 13, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 13, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },
  textBrand: { color: C.purpleDark, fontWeight: '700' },

  saveBtnFull: { backgroundColor: C.purpleDark, flexDirection: 'row', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});