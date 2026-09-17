import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, Modal, KeyboardAvoidingView, Platform, FlatList, Alert, Switch
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  slate: '#64748B', slateDark: '#475569', slateSoft: '#F1F5F9',
};

const HOLIDAY_TYPES = [
  { label: 'Festival (Diwali, Eid, Christmas...)', value: 'Festival' },
  { label: 'National Holiday (Republic Day...)', value: 'National' },
  { label: 'Vacation (Summer, Winter Break...)', value: 'Vacation' },
  { label: 'Special Holiday / Function', value: 'Special' },
  { label: 'Other', value: 'Other' }
];

const formatDateDisplay = (dateStr: string | Date) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return String(dateStr); }
};

const formatToYMD = (d: Date): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

export default function HolidaysAdminScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal & Form States
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [form, setForm] = useState({
    title: '', description: '', type: 'Festival',
    startDate: new Date(), endDate: new Date(),
    totalDays: 1, isPublished: true, allowStudentView: true,
  });

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchHolidays(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchHolidays = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/holidays`, authHeaders(token));
      if (res.data?.success) setHolidays(res.data.data || []);
    } catch (err) { console.error('Failed to load holidays'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'holidays' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const canCreate = hasPermission('create');
  const canUpdate = hasPermission('update');
  const canDelete = hasPermission('delete');

  // --- Handlers ---
  const handleDateChange = (field: 'startDate' | 'endDate', val: Date) => {
    let updatedStart = field === 'startDate' ? val : form.startDate;
    let updatedEnd = field === 'endDate' ? val : form.endDate;
    
    // Ensure end date is not before start date
    if (updatedEnd < updatedStart) updatedEnd = updatedStart;

    const diffMs = updatedEnd.getTime() - updatedStart.getTime();
    const totalDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);

    setForm({ ...form, startDate: updatedStart, endDate: updatedEnd, totalDays });
  };

  const handleSave = async () => {
    if (!form.title.trim()) { Alert.alert('Error', 'Holiday Title is required.'); return; }

    setSaving(true);
    try {
      const payload = {
        ...form,
        startDate: formatToYMD(form.startDate),
        endDate: formatToYMD(form.endDate),
      };

      if (editingId) {
        await axios.put(`${API_BASE}/holidays/${editingId}`, payload, authHeaders(authToken));
        Alert.alert('Success', 'Holiday updated successfully.');
      } else {
        await axios.post(`${API_BASE}/holidays`, payload, authHeaders(authToken));
        Alert.alert('Success', 'Holiday created successfully.');
      }
      setShowModal(false);
      fetchHolidays(authToken, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to save holiday.'); } 
    finally { setSaving(false); }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Holiday', 'Are you sure you want to delete this holiday record?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/holidays/${id}`, authHeaders(authToken));
            fetchHolidays(authToken, true);
          } catch (error) { Alert.alert('Error', 'Failed to delete holiday.'); }
      }}
    ]);
  };

  const openAddForm = () => {
    setEditingId(null);
    setForm({ title: '', description: '', type: 'Festival', startDate: new Date(), endDate: new Date(), totalDays: 1, isPublished: true, allowStudentView: true });
    setActiveDropdown(null);
    setShowModal(true);
  };

  const openEditForm = (item: any) => {
    setEditingId(item._id);
    setForm({
      title: item.title || '',
      description: item.description || '',
      type: item.type || 'Festival',
      startDate: new Date(item.startDate),
      endDate: new Date(item.endDate),
      totalDays: item.totalDays || 1,
      isPublished: item.isPublished ?? true,
      allowStudentView: item.allowStudentView ?? true,
    });
    setActiveDropdown(null);
    setShowModal(true);
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'National': return { bg: C.primarySoft, text: C.primaryDark, icon: 'flag' };
      case 'Festival': return { bg: C.amberSoft, text: C.amberDark, icon: 'star' };
      case 'Vacation': return { bg: C.greenSoft, text: C.greenDark, icon: 'sun' };
      case 'Special': return { bg: C.blueSoft, text: C.blueDark, icon: 'award' };
      default: return { bg: C.slateSoft, text: C.slateDark, icon: 'calendar' };
    }
  };

  const displayedHolidays = useMemo(() => {
    return holidays.filter((h) => {
      const matchesType = filterType === 'All' || h.type === filterType;
      const matchesSearch = !searchQuery || h.title?.toLowerCase().includes(searchQuery.toLowerCase()) || h.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [holidays, filterType, searchQuery]);

  const renderInlineDropdown = (fieldKey: string, label: string, options: {label: string, value: string}[], value: string, onSelect: (v: string) => void) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
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
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="umbrella" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Holidays Manager</Text>
          <Text style={styles.subtitle}>Schedule vacations and events.</Text>
        </View>
        {canCreate && (
          <TouchableOpacity style={styles.addBtnFull} onPress={openAddForm}>
            <Feather name="plus" size={14} color="#fff" /><Text style={styles.addBtnTextFull}>Add Holiday</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={C.textFaint} />
          <TextInput style={styles.searchInput} placeholder="Search holidays..." value={searchQuery} onChangeText={setSearchQuery} />
        </View>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
          {['All', 'Festival', 'National', 'Vacation', 'Special'].map((t) => (
            <TouchableOpacity key={t} style={[styles.filterPill, filterType === t ? styles.filterPillActive : styles.filterPillInactive]} onPress={() => setFilterType(t)}>
              <Text style={[styles.filterPillText, filterType === t ? styles.filterPillTextActive : styles.filterPillTextInactive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : displayedHolidays.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="calendar" size={40} color={C.textFaint} />
          <Text style={styles.emptyTitle}>No Holidays Found</Text>
          <Text style={styles.emptySubtitle}>No matching schedules found. Click 'Add Holiday' to create one.</Text>
        </View>
      ) : (
        <FlatList
          data={displayedHolidays}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchHolidays(authToken, true)} colors={[C.primary]} />}
          renderItem={({ item }) => {
            const styleMeta = getTypeStyle(item.type);
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                    <View style={[styles.typeBadge, { backgroundColor: styleMeta.bg }]}>
                      <Feather name={styleMeta.icon as any} size={10} color={styleMeta.text} style={{marginRight: 4}} />
                      <Text style={[styles.typeBadgeText, { color: styleMeta.text }]}>{item.type}</Text>
                    </View>
                    <View style={styles.daysBadge}><Text style={styles.daysBadgeText}>{item.totalDays} {item.totalDays === 1 ? 'Day' : 'Days'}</Text></View>
                  </View>
                  <View style={{flexDirection: 'row', gap: 6}}>
                    <View style={[styles.statusIndicator, { backgroundColor: item.isPublished ? C.greenSoft : C.slateSoft, borderColor: item.isPublished ? '#A7F3D0' : C.border }]}>
                      <Text style={[styles.statusIndicatorText, { color: item.isPublished ? C.greenDark : C.slateDark }]}>{item.isPublished ? 'Published' : 'Draft'}</Text>
                    </View>
                    <View style={[styles.statusIndicator, { backgroundColor: item.allowStudentView ? C.blueSoft : C.primarySoft, borderColor: item.allowStudentView ? '#BAE6FD' : '#FECACA' }]}>
                      <Feather name={item.allowStudentView ? "eye" : "eye-off"} size={10} color={item.allowStudentView ? C.blueDark : C.primaryDark} style={{marginRight: 4}}/>
                      <Text style={[styles.statusIndicatorText, { color: item.allowStudentView ? C.blueDark : C.primaryDark }]}>{item.allowStudentView ? 'Public' : 'Hidden'}</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.cardTitle}>{item.title}</Text>
                {!!item.description && <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>}

                <View style={styles.cardFooter}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Feather name="calendar" size={14} color={C.textMuted} style={{marginRight: 6}} />
                    <Text style={styles.cardDateText}>{formatDateDisplay(item.startDate)}{item.startDate !== item.endDate ? ` - ${formatDateDisplay(item.endDate)}` : ''}</Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
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
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingId ? 'Edit Holiday' : 'Add New Holiday'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Holiday Title *</Text>
                <TextInput style={styles.input} placeholder="e.g. Diwali Vacation" value={form.title} onChangeText={t => setForm({...form, title: t})} />
              </View>

              <View style={{ zIndex: 60, marginBottom: 16 }}>
                {renderInlineDropdown('hType', 'Holiday Type *', HOLIDAY_TYPES, form.type, (v) => setForm({...form, type: v}))}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Start Date *</Text>
                  <TouchableOpacity style={styles.datePickerBtnForm} onPress={() => setShowStartPicker(true)}>
                    <Text style={styles.datePickerText}>{form.startDate.toLocaleDateString('en-GB')}</Text>
                    <Feather name="calendar" size={14} color={C.textMuted} />
                  </TouchableOpacity>
                  {showStartPicker && <DateTimePicker value={form.startDate} mode="date" display="default" onChange={(e, d) => { setShowStartPicker(Platform.OS === 'ios'); if (d) handleDateChange('startDate', d); }} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>End Date *</Text>
                  <TouchableOpacity style={styles.datePickerBtnForm} onPress={() => setShowEndPicker(true)}>
                    <Text style={styles.datePickerText}>{form.endDate.toLocaleDateString('en-GB')}</Text>
                    <Feather name="calendar" size={14} color={C.textMuted} />
                  </TouchableOpacity>
                  {showEndPicker && <DateTimePicker value={form.endDate} mode="date" display="default" minimumDate={form.startDate} onChange={(e, d) => { setShowEndPicker(Platform.OS === 'ios'); if (d) handleDateChange('endDate', d); }} />}
                </View>
              </View>

              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText}>Total Days Off: <Text style={{fontWeight: '900', color: C.primaryDark}}>{form.totalDays}</Text></Text>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Description / Notes</Text>
                <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} multiline placeholder="Optional details..." value={form.description} onChangeText={t => setForm({...form, description: t})} />
              </View>

              <View style={styles.switchesContainer}>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.switchTitle}>Allow Student View</Text>
                    <Text style={styles.switchSub}>Show this holiday in the Student & Parent portals.</Text>
                  </View>
                  <Switch value={form.allowStudentView} onValueChange={v => setForm({...form, allowStudentView: v})} trackColor={{ false: C.border, true: C.primarySoft }} thumbColor={form.allowStudentView ? C.primary : C.textFaint} />
                </View>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.switchTitle}>Publish Status</Text>
                    <Text style={styles.switchSub}>Make this holiday active and visible immediately.</Text>
                  </View>
                  <Switch value={form.isPublished} onValueChange={v => setForm({...form, isPublished: v})} trackColor={{ false: C.border, true: C.primarySoft }} thumbColor={form.isPublished ? C.primary : C.textFaint} />
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingId ? 'Update' : 'Create'} Holiday</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  addBtnFull: { backgroundColor: '#111827', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, height: 38, borderRadius: 10, elevation: 2 },
  addBtnTextFull: { color: '#fff', fontSize: 12, fontWeight: '800', marginLeft: 6 },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44, marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text },
  filterPillsScroll: { gap: 8 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterPillActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterPillInactive: { backgroundColor: C.surface, borderColor: C.border },
  filterPillText: { fontSize: 12, fontWeight: '700' },
  filterPillTextActive: { color: '#fff' },
  filterPillTextInactive: { color: C.textMuted },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', marginHorizontal: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  daysBadge: { backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  daysBadgeText: { fontSize: 10, fontWeight: '800', color: C.text },
  
  statusIndicator: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  statusIndicatorText: { fontSize: 9, fontWeight: '800' },

  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: C.textMuted, lineHeight: 20, marginBottom: 14 },
  
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  cardDateText: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  
  iconBtnEdit: { padding: 8, backgroundColor: C.blueSoft, borderRadius: 8, borderWidth: 1, borderColor: '#BAE6FD' },
  iconBtnDelete: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  closeBtnIcon: { padding: 6, backgroundColor: C.border, borderRadius: 20 },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  row: { flexDirection: 'row', marginBottom: 16 },
  
  datePickerBtnForm: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 14, color: C.text, fontWeight: '600' },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },

  infoBanner: { backgroundColor: C.primarySoft, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA', marginBottom: 16, alignItems: 'center' },
  infoBannerText: { fontSize: 13, color: C.primaryDark, fontWeight: '600' },

  switchesContainer: { borderTopWidth: 1, borderColor: C.border, paddingTop: 16, marginBottom: 16 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  switchTitle: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 2 },
  switchSub: { fontSize: 11, color: C.textMuted },

  saveBtnFull: { backgroundColor: C.primary, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});