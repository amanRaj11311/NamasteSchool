import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl, Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';

const API_BASE = 'https://mern.schoolapi.dcstechnosis.com/api';

const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Generated: { bg: C.amberSoft, fg: C.amber },
  Paid: { bg: C.greenSoft, fg: C.green },
  Cancelled: { bg: C.slateSoft, fg: C.slate },
};

export default function SalaryScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  const [monthDate, setMonthDate] = useState<Date>(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [staffTypes, setStaffTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [showGenerate, setShowGenerate] = useState(false);
  const [genScope, setGenScope] = useState<'all' | 'byType'>('all');
  const [genStaffType, setGenStaffType] = useState('');
  const [generating, setGenerating] = useState(false);

  const [payTarget, setPayTarget] = useState<any>(null);
  const [payForm, setPayForm] = useState({ paymentMode: 'Bank Transfer', referenceNo: '', paidOn: new Date() });
  const [showPayDatePicker, setShowPayDatePicker] = useState(false);
  const [paying, setPaying] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    const sId = await AsyncStorage.getItem('schoolId');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    setSchoolId(sId);
    fetchPayrolls(token, monthStr);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchPayrolls = async (token: string | null = authToken, m: string = monthStr, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/salary/payroll?month=${m}`, authHeaders(token));
      if (res.data?.success) {
        const data = res.data.data || [];
        setPayrolls(data);
        setStaffTypes([...new Set(data.map((p: any) => p.staff?.staffType).filter(Boolean))] as string[]);
      }
    } catch (err) { console.error(err); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'salary' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const payload: any = { month: monthStr };
      if (genScope === 'byType' && genStaffType) payload.staffType = genStaffType;
      const res = await axios.post(`${API_BASE}/salary/payroll/generate`, payload, authHeaders(authToken));
      Alert.alert('Success', res.data?.message || 'Payroll generated');
      setShowGenerate(false);
      fetchPayrolls(authToken, monthStr, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Generation failed'); } 
    finally { setGenerating(false); }
  };

  const handlePay = async () => {
    setPaying(true);
    try {
      const payload = {
        ...payForm,
        paidOn: payForm.paidOn.toISOString().split('T')[0]
      };
      await axios.patch(`${API_BASE}/salary/payroll/${payTarget._id}/pay`, payload, authHeaders(authToken));
      Alert.alert('Success', 'Marked as paid');
      setPayTarget(null);
      fetchPayrolls(authToken, monthStr, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to mark as paid'); } 
    finally { setPaying(false); }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) { Alert.alert('Error', 'Reason required'); return; }
    setCancelling(true);
    try {
      await axios.patch(`${API_BASE}/salary/payroll/${cancelTarget._id}/cancel`, { reason: cancelReason }, authHeaders(authToken));
      Alert.alert('Success', 'Payroll cancelled');
      setCancelTarget(null); setCancelReason('');
      fetchPayrolls(authToken, monthStr, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Cancellation failed'); } 
    finally { setCancelling(false); }
  };

  const openSlip = async (id: string) => {
    const qs = schoolId ? `?schoolId=${schoolId}` : '';
    const url = `${API_BASE}/salary/payroll/${id}/slip${qs}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  };

  const totals = payrolls.reduce((acc, p) => {
    if (p.status !== 'Cancelled') { acc.gross += p.grossEarnings; acc.net += p.netPay; }
    return acc;
  }, { gross: 0, net: 0 });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="dollar-sign" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Payroll Management</Text>
          <Text style={styles.subtitle}>Generate and manage monthly staff salaries.</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={{ flex: 1 }}>
          <Text style={styles.inputLabel}>PAYROLL MONTH</Text>
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowMonthPicker(true)}>
            <Feather name="calendar" size={14} color={C.textMuted} style={{marginRight: 6}} />
            <Text style={styles.datePickerText}>{monthStr}</Text>
          </TouchableOpacity>
          {showMonthPicker && (
            <DateTimePicker value={monthDate} mode="date" display="default" onChange={(e, d) => { setShowMonthPicker(Platform.OS === 'ios'); if (d) { setMonthDate(d); const newMonthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; fetchPayrolls(authToken, newMonthStr); } }} />
          )}
        </View>
        {hasPermission('update') && (
          <TouchableOpacity style={styles.generateBtn} onPress={() => setShowGenerate(true)}>
            <Feather name="play" size={14} color="#fff" /><Text style={styles.generateBtnText}>Generate</Text>
          </TouchableOpacity>
        )}
      </View>

      {!loading && payrolls.length > 0 && (
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>STAFF PAID</Text>
            <Text style={styles.kpiValue}>{payrolls.length}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>GROSS TOTAL</Text>
            <Text style={styles.kpiValue}>₹{totals.gross.toLocaleString('en-IN')}</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: C.greenSoft, borderColor: '#A7F3D0' }]}>
            <Text style={[styles.kpiLabel, { color: C.green }]}>NET PAYABLE</Text>
            <Text style={[styles.kpiValue, { color: C.green }]}>₹{totals.net.toLocaleString('en-IN')}</Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={payrolls}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPayrolls(authToken, monthStr, true)} colors={[C.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="file-minus" size={40} color={C.textFaint} />
              <Text style={styles.emptyTitle}>No Payroll Generated</Text>
              <Text style={styles.emptySubtitle}>No salary data exists for {monthStr}.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = STATUS_STYLE[item.status] || STATUS_STYLE.Generated;
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
                  <View style={styles.finBox}><Text style={styles.finLbl}>GROSS</Text><Text style={styles.finVal}>₹{item.grossEarnings}</Text></View>
                  <View style={styles.finBox}><Text style={styles.finLbl}>LOP DEDUCT</Text><Text style={[styles.finVal, item.lopDeduction > 0 && {color: C.primary}]}>₹{item.lopDeduction}</Text></View>
                  <View style={styles.finBox}><Text style={styles.finLbl}>NET PAY</Text><Text style={[styles.finVal, {color: C.green}]}>₹{item.netPay}</Text></View>
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.outlineBtn} onPress={() => openSlip(item._id)}>
                    <Feather name="file-pdf" size={14} color={C.blue} /><Text style={[styles.outlineBtnText, {color: C.blue}]}>Payslip</Text>
                  </TouchableOpacity>
                  
                  <View style={{flexDirection: 'row', gap: 10}}>
                    {hasPermission('update') && item.status === 'Generated' && (
                      <TouchableOpacity style={styles.actionBtnGreen} onPress={() => { setPayTarget(item); setPayForm({paymentMode: 'Bank Transfer', referenceNo: '', paidOn: new Date()}); }}>
                        <Text style={styles.actionBtnText}>Mark Paid</Text>
                      </TouchableOpacity>
                    )}
                    {hasPermission('delete') && item.status !== 'Cancelled' && (
                      <TouchableOpacity style={styles.iconBtnDelete} onPress={() => setCancelTarget(item)}>
                        <Feather name="ban" size={14} color={C.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Generate Payroll Modal */}
      <Modal visible={showGenerate} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Generate Payroll • {monthStr}</Text>
              <TouchableOpacity onPress={() => setShowGenerate(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <View style={styles.formScroll}>
              <Text style={styles.helperText}>Pulls attendance to compute loss-of-pay and recovers pending advances. Existing payrolls for this month are skipped.</Text>
              
              <View style={styles.segmentControl}>
                <TouchableOpacity style={[styles.segmentBtn, genScope === 'all' && styles.segmentBtnActive]} onPress={() => setGenScope('all')}><Text style={[styles.segmentText, genScope === 'all' && styles.segmentTextActive]}>All Staff</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.segmentBtn, genScope === 'byType' && styles.segmentBtnActive]} onPress={() => setGenScope('byType')}><Text style={[styles.segmentText, genScope === 'byType' && styles.segmentTextActive]}>By Type</Text></TouchableOpacity>
              </View>

              {genScope === 'byType' && (
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Staff Type *</Text>
                  <TextInput style={styles.input} placeholder="e.g. Teacher" value={genStaffType} onChangeText={setGenStaffType} />
                </View>
              )}

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleGenerate} disabled={generating}>
                {generating ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Generate</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Pay Modal */}
      <Modal visible={!!payTarget} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>Mark Paid</Text>
                <Text style={styles.formSubtitle}>{payTarget?.staff?.name} • Net Pay: ₹{payTarget?.netPay}</Text>
              </View>
              <TouchableOpacity onPress={() => setPayTarget(null)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={[styles.inputWrapper, { zIndex: 50 }]}>
                <Text style={styles.inputLabel}>Payment Mode *</Text>
                <TouchableOpacity style={styles.dropdownHeader} onPress={() => setActiveDropdown(activeDropdown === 'mode' ? null : 'mode')} activeOpacity={0.85}>
                  <Text style={styles.dropdownSelectedText}>{payForm.paymentMode}</Text>
                  <Feather name={activeDropdown === 'mode' ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
                </TouchableOpacity>
                {activeDropdown === 'mode' && (
                  <View style={styles.dropdownListContainer}>
                    {['Bank Transfer', 'Cash', 'Cheque', 'UPI'].map(m => (
                      <TouchableOpacity key={m} style={styles.dropdownItem} onPress={() => { setPayForm({...payForm, paymentMode: m}); setActiveDropdown(null); }}>
                        <Text style={styles.dropdownItemText}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Reference No.</Text>
                <TextInput style={styles.input} placeholder="UTR / Cheque no." value={payForm.referenceNo} onChangeText={t => setPayForm({...payForm, referenceNo: t})} />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Payment Date *</Text>
                <TouchableOpacity style={styles.datePickerBtnForm} onPress={() => setShowPayDatePicker(true)}>
                  <Text style={styles.datePickerText}>{payForm.paidOn.toLocaleDateString('en-GB')}</Text>
                  <Feather name="calendar" size={14} color={C.textMuted} />
                </TouchableOpacity>
                {showPayDatePicker && <DateTimePicker value={payForm.paidOn} mode="date" display="default" onChange={(e, d) => { setShowPayDatePicker(Platform.OS === 'ios'); if (d) setPayForm({ ...payForm, paidOn: d }); }} />}
              </View>

              <TouchableOpacity style={[styles.saveBtnFull, { backgroundColor: C.green }]} onPress={handlePay} disabled={paying}>
                {paying ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Confirm Payment</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cancel Modal */}
      <Modal visible={!!cancelTarget} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={[styles.formTitle, { color: C.primary }]}>Cancel Payroll</Text>
              <TouchableOpacity onPress={() => setCancelTarget(null)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <View style={styles.formScroll}>
              <Text style={styles.helperText}>This reverses any advance recovery applied to {cancelTarget?.staff?.name}. This cannot be undone.</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Reason *</Text>
                <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} multiline placeholder="Cancellation reason..." value={cancelReason} onChangeText={setCancelReason} />
              </View>
              <TouchableOpacity style={[styles.saveBtnFull, { backgroundColor: C.primaryDark }]} onPress={handleCancel} disabled={cancelling}>
                {cancelling ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Confirm Cancel</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  
  filterSection: { flexDirection: 'row', alignItems: 'flex-end', padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, height: 44, borderRadius: 10 },
  datePickerText: { fontSize: 13, fontWeight: '700', color: C.text },
  generateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, height: 44, paddingHorizontal: 16, borderRadius: 10, marginLeft: 10, elevation: 2 },
  generateBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, marginLeft: 6 },

  kpiGrid: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16 },
  kpiCard: { flex: 1, backgroundColor: C.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, elevation: 1 },
  kpiLabel: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  kpiValue: { fontSize: 16, fontWeight: '800', color: C.text },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  staffName: { fontSize: 16, fontWeight: '800', color: C.text },
  staffId: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },

  financeGrid: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  finBox: { flex: 1 },
  finLbl: { fontSize: 9, color: C.textMuted, fontWeight: '800', marginBottom: 4, letterSpacing: 0.5 },
  finVal: { fontSize: 14, color: C.text, fontWeight: '800' },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.blueSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#BAE6FD', gap: 6 },
  outlineBtnText: { fontWeight: '700', fontSize: 12 },
  actionBtnGreen: { backgroundColor: C.green, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  iconBtnDelete: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  formSubtitle: { fontSize: 11, color: C.textMuted, marginTop: 2, fontWeight: '600' },
  closeBtnIcon: { padding: 4 },
  formScroll: { padding: 20 },

  helperText: { fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 16 },
  segmentControl: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 4, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segmentBtnActive: { backgroundColor: C.primary, elevation: 1 },
  segmentText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  segmentTextActive: { color: '#fff' },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  
  datePickerBtnForm: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 13, color: C.text, fontWeight: '600' },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6 },
  dropdownItem: { padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },

  saveBtnFull: { backgroundColor: C.primary, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});