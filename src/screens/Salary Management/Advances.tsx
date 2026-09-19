import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import {API_BASE} from '../../network/api';

const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#B3122A', primarySoft: '#FEF2F2', // Updated to match project red
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Pending: { bg: C.amberSoft, fg: C.amber },
  Approved: { bg: C.blueSoft, fg: C.blue },
  Rejected: { bg: C.primarySoft, fg: C.primary },
  Recovered: { bg: C.greenSoft, fg: C.green },
};

function getEmptyForm() {
  return { staff: '', amount: '', reason: '', recoveryPerMonth: '0' };
}

export default function AdvancesScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [advances, setAdvances] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(getEmptyForm());
  const [saving, setSaving] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchStaff(token);
    fetchAdvances(token, statusFilter);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchStaff = async (token: string | null) => {
    try {
      const res = await axios.get(`${API_BASE}/staff?limit=500`, authHeaders(token));
      if (res.data?.success) setStaffList(res.data.data || []);
    } catch (err) { console.error(err); }
  };

  const fetchAdvances = async (token: string | null = authToken, filter: string = statusFilter, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = filter ? { status: filter } : {};
      const res = await axios.get(`${API_BASE}/salary/advances`, { params, ...authHeaders(token) });
      if (res.data?.success) setAdvances(res.data.data || []);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'salaryAdvance' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const handleSubmit = async () => {
    if (!form.staff || !form.amount) { Alert.alert('Error', 'Staff and amount are required'); return; }
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/salary/advances`, { ...form, amount: Number(form.amount), recoveryPerMonth: Number(form.recoveryPerMonth) || 0 }, authHeaders(authToken));
      Alert.alert('Success', 'Advance request submitted');
      setShowForm(false);
      fetchAdvances(authToken, statusFilter, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Request failed'); } 
    finally { setSaving(false); }
  };

  const handleDecide = (id: string, status: string) => {
    Alert.alert(`Confirm ${status}`, `Are you sure you want to mark this request as ${status}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
          setDecidingId(id);
          try {
            await axios.patch(`${API_BASE}/salary/advances/${id}/decide`, { status }, authHeaders(authToken));
            fetchAdvances(authToken, statusFilter, true);
          } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Decision failed'); } 
          finally { setDecidingId(null); }
      }}
    ]);
  };

  const renderInlineDropdown = (fieldKey: string, label: string, options: any[], value: string, onSelect: (v: string) => void) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1, marginBottom: 0 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || 'Select...'}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
              {options.map(opt => (
                <TouchableOpacity key={opt.value} style={styles.dropdownItem} onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}>
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
        <View style={styles.headerIconBadge}><Feather name="shield" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Salary Advances</Text>
          <Text style={styles.subtitle}>Staff advance requests and recovery tracking.</Text>
        </View>
      </View>

      {/* FILTER ROW FIXED: Side by Side layout */}
      <View style={styles.filterSection}>
        <View style={{ flex: 1, zIndex: 10 }}>
          {renderInlineDropdown('statusFilter', 'FILTER BY STATUS', [{label: 'All Status', value: ''}, {label: 'Pending', value: 'Pending'}, {label: 'Approved', value: 'Approved'}, {label: 'Rejected', value: 'Rejected'}, {label: 'Recovered', value: 'Recovered'}], statusFilter, (v) => { setStatusFilter(v); fetchAdvances(authToken, v); })}
        </View>
        {hasPermission('create') && (
          <TouchableOpacity style={styles.addBtnFull} onPress={() => { setForm(getEmptyForm()); setShowForm(true); }}>
            <Feather name="plus" size={14} color="#fff" />
            <Text style={styles.addBtnTextFull}>Request</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={advances}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAdvances(authToken, statusFilter, true)} colors={[C.primary]} />}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="shield-off" size={40} color={C.textFaint} /><Text style={styles.emptyTitle}>No Advances Found</Text></View>}
          renderItem={({ item }) => {
            const statusStyle = STATUS_STYLE[item.status] || STATUS_STYLE.Pending;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staffName}>{item.staff?.name}</Text>
                    <Text style={styles.staffId}>ID: {item.staff?.staffId || '—'} • {item.staff?.staffType}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}><Text style={[styles.statusText, { color: statusStyle.fg }]}>{item.status}</Text></View>
                </View>

                <View style={styles.financeGrid}>
                  <View style={styles.finBox}><Text style={styles.finLbl}>REQUESTED</Text><Text style={[styles.finVal, {color: C.blue}]}>₹{item.amount}</Text></View>
                  <View style={styles.finBox}><Text style={styles.finLbl}>RECOVERED</Text><Text style={[styles.finVal, {color: C.green}]}>₹{item.recoveredAmount}</Text></View>
                  <View style={styles.finBox}><Text style={styles.finLbl}>MONTHLY CUT</Text><Text style={styles.finVal}>{item.recoveryPerMonth > 0 ? `₹${item.recoveryPerMonth}` : 'Full'}</Text></View>
                </View>

                {!!item.reason && <View style={styles.reasonBox}><Text style={styles.reasonText}>{item.reason}</Text></View>}

                {hasPermission('update') && item.status === 'Pending' && (
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.actionBtnReject} onPress={() => handleDecide(item._id, 'Rejected')} disabled={decidingId === item._id}>
                      <Feather name="x" size={14} color={C.primary} /><Text style={styles.actionBtnTextReject}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtnApprove} onPress={() => handleDecide(item._id, 'Approved')} disabled={decidingId === item._id}>
                      <Feather name="check" size={14} color="#fff" /><Text style={styles.actionBtnTextApprove}>Approve Advance</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Form Modal */}
      <Modal visible={showForm} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            
            {/* UPDATED MODAL HEADER: Project Color & X Icon */}
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>New Advance Request</Text>
                <Text style={styles.formSubtitle}>Apply for staff salary advance</Text>
              </View>
              <TouchableOpacity onPress={() => setShowForm(false)} style={styles.closeBtnIcon} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={{ zIndex: 40, marginBottom: 16 }}>
                {renderInlineDropdown('staffId', 'Staff Member *', staffList.map(s => ({label: `${s.name} (${s.staffId || ''})`, value: s._id})), form.staff, (v) => setForm({...form, staff: v}))}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Amount (₹) *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="e.g. 5000" value={form.amount} onChangeText={t => setForm({...form, amount: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Monthly Recovery</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="0 = full cut" value={form.recoveryPerMonth} onChangeText={t => setForm({...form, recoveryPerMonth: t})} />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Reason</Text>
                <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} multiline placeholder="Medical, travel, etc." value={form.reason} onChangeText={t => setForm({...form, reason: t})} />
              </View>

              {/* ACTION BUTTONS (CANCEL AND SUBMIT IN SAME ROW) */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)} activeOpacity={0.9}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.saveBtnFull, { flex: 1, marginTop: 0 }, saving && { opacity: 0.7 }]} onPress={handleSubmit} disabled={saving} activeOpacity={0.9}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Submit</Text>}
                </TouchableOpacity>
              </View>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, paddingTop: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  
  // UPDATED FILTER SECTION FOR SAME ROW LAYOUT
  filterSection: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  addBtnFull: { flex: 0.45, backgroundColor: '#B3122A', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 46, borderRadius: 10, elevation: 2 },
  addBtnTextFull: { color: '#fff', fontSize: 13, fontWeight: '800', marginLeft: 6 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  staffName: { fontSize: 16, fontWeight: '800', color: C.text },
  staffId: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },

  financeGrid: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  finBox: { flex: 1 },
  finLbl: { fontSize: 9, color: C.textMuted, fontWeight: '800', marginBottom: 4, letterSpacing: 0.5 },
  finVal: { fontSize: 14, color: C.text, fontWeight: '800' },

  reasonBox: { marginTop: 12, padding: 10, backgroundColor: C.surfaceSoft, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  reasonText: { fontSize: 12, color: C.textMuted, fontStyle: 'italic' },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  actionBtnReject: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA', marginRight: 10 },
  actionBtnTextReject: { color: C.primary, fontSize: 13, fontWeight: '800', marginLeft: 6 },
  actionBtnApprove: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.green, paddingVertical: 10, borderRadius: 8 },
  actionBtnTextApprove: { color: '#fff', fontSize: 13, fontWeight: '800', marginLeft: 6 },

  // UPDATED MODAL STYLES
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 12, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.primary },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  formSubtitle: { fontSize: 12, color: '#FCA5A5', marginTop: 3 },
  closeBtnIcon: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  
  formScroll: { padding: 20, paddingBottom: 40 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  row: { flexDirection: 'row' },
  
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 13, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 13, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10 },
  dropdownItem: { padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },

  // UPDATED BUTTON STYLES FOR SIDE BY SIDE LAYOUT
  saveBtnFull: { backgroundColor: C.primary, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: { flex: 1, height: 50, borderRadius: 12, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelBtnText: { color: C.textMuted, fontSize: 15, fontWeight: '800' },
});