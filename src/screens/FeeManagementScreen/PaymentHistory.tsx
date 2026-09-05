import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, RefreshControl, Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';

// ---------------------------------------------------------------------------
// Design tokens — premium red/coral brand system
// ---------------------------------------------------------------------------
const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

// --- Safe Date Utilities ---
const formatToYMD = (d: Date | null): string => {
  if (!d) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

const formatDisplayDate = (d: string) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
};

export default function PaymentsScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  // Data States
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter States
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  // Cancel Modal States
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    const storedSchoolId = await AsyncStorage.getItem('schoolId'); // Ensure this matches how you store it

    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    setSchoolId(storedSchoolId);
    
    fetchPayments(token, null, null);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchPayments = async (token: string | null = authToken, fDate: Date | null = fromDate, tDate: Date | null = toDate, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params: any = {};
      if (fDate) params.fromDate = formatToYMD(fDate);
      if (tDate) params.toDate = formatToYMD(tDate);

      const res = await axios.get(`${BASE_URL}/fees/payments`, { params, ...authHeaders(token) });
      if (res.data?.success) setPayments(res.data.data || []);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'fees' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const canCancel = hasPermission('delete');

  // --- Actions ---
  const openReceipt = async (id: string) => {
    const qs = schoolId ? `?schoolId=${schoolId}` : '';
    const url = `${BASE_URL}/fees/payments/${id}/receipt${qs}`;
    
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert("Error", "Unable to open receipt URL.");
    }
  };

  const handleCancelPayment = async () => {
    if (!cancelReason.trim()) { Alert.alert('Error', 'A cancellation reason is required.'); return; }
    setCancelling(true);
    try {
      await axios.patch(`${BASE_URL}/fees/payments/${cancelTarget._id}/cancel`, { reason: cancelReason }, authHeaders(authToken));
      Alert.alert('Success', 'Payment cancelled successfully.');
      setCancelTarget(null);
      setCancelReason('');
      fetchPayments(authToken, fromDate, toDate, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Cancellation failed.'); } 
    finally { setCancelling(false); }
  };

  const totalAmount = payments.reduce((sum, p) => sum + p.amount + (p.lateFeeCharged || 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="file-text" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Payment History</Text>
          <Text style={styles.subtitle}>View fee transactions and generate receipts.</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>DATE RANGE FILTER</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowFromPicker(true)}>
            <Feather name="calendar" size={14} color={C.textMuted} style={{marginRight: 6}} />
            <Text style={[styles.datePickerText, !fromDate && {color: C.textFaint}]}>{fromDate ? formatDisplayDate(formatToYMD(fromDate)) : 'Start Date'}</Text>
          </TouchableOpacity>
          {showFromPicker && (
            <DateTimePicker value={fromDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowFromPicker(Platform.OS === 'ios'); if (d) { setFromDate(d); fetchPayments(authToken, d, toDate); } }} />
          )}

          <Text style={styles.dateDivider}>—</Text>

          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowToPicker(true)}>
            <Feather name="calendar" size={14} color={C.textMuted} style={{marginRight: 6}} />
            <Text style={[styles.datePickerText, !toDate && {color: C.textFaint}]}>{toDate ? formatDisplayDate(formatToYMD(toDate)) : 'End Date'}</Text>
          </TouchableOpacity>
          {showToPicker && (
            <DateTimePicker value={toDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowToPicker(Platform.OS === 'ios'); if (d) { setToDate(d); fetchPayments(authToken, fromDate, d); } }} />
          )}
        </View>
      </View>

      {/* KPI Cards */}
      {!loading && payments.length > 0 && (
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { borderColor: '#A7F3D0' }]}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: C.greenSoft }]}><Feather name="dollar-sign" size={16} color={C.green} /></View>
              <Text style={[styles.kpiValue, { color: C.green }]}>₹{totalAmount.toLocaleString('en-IN')}</Text>
            </View>
            <Text style={styles.kpiLabel}>TOTAL COLLECTIONS</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: '#FECACA' }]}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: C.primarySoft }]}><Feather name="file-text" size={16} color={C.primary} /></View>
              <Text style={[styles.kpiValue, { color: C.primary }]}>{payments.length}</Text>
            </View>
            <Text style={styles.kpiLabel}>ACTIVE RECEIPTS</Text>
          </View>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={payments}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPayments(authToken, fromDate, toDate, true)} colors={[C.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="receipt" size={40} color={C.textFaint} />
              <Text style={styles.emptyTitle}>No Receipts Found</Text>
              <Text style={styles.emptySubtitle}>No payment receipts recorded for this range.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.receiptNo}>{item.receiptNo}</Text>
                  <Text style={styles.dateText}>{formatDisplayDate(item.paidOn)}</Text>
                </View>
                <View style={styles.amountContainer}>
                  <Text style={styles.amountText}>₹{item.amount?.toLocaleString('en-IN')}</Text>
                  {item.lateFeeCharged > 0 && <View style={styles.lateFeeBadge}><Text style={styles.lateFeeText}>+₹{item.lateFeeCharged} late</Text></View>}
                </View>
              </View>

              <View style={styles.studentInfo}>
                <Text style={styles.studentName} numberOfLines={1}>{item.student?.name}</Text>
                <Text style={styles.studentAdm}>Adm No: {item.student?.admissionNo || item.student?.rollNo || '—'}</Text>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.modeBadge}><Feather name="tag" size={10} color={C.primary} style={{marginRight: 4}} /><Text style={styles.modeBadgeText}>{item.mode || 'Cash'}</Text></View>
                <Text style={styles.collectedBy}>By: {item.collectedBy?.name || '—'}</Text>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.receiptBtn} onPress={() => openReceipt(item._id)}>
                  <Feather name="download-cloud" size={14} color="#fff" />
                  <Text style={styles.receiptBtnText}>Receipt PDF</Text>
                </TouchableOpacity>
                {canCancel && (
                  <TouchableOpacity style={styles.iconBtnDelete} onPress={() => setCancelTarget(item)}>
                    <Feather name="slash" size={14} color={C.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}

      {/* Cancel Modal */}
      <Modal visible={!!cancelTarget} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={[styles.formHeader, { backgroundColor: C.primarySoft }]}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Feather name="alert-triangle" size={18} color={C.primary} />
                <Text style={[styles.formTitle, { color: C.primary }]}>Cancel Receipt?</Text>
              </View>
              <TouchableOpacity onPress={() => { setCancelTarget(null); setCancelReason(''); }} style={styles.closeBtnIcon}><Feather name="x" size={18} color={C.primary} /></TouchableOpacity>
            </View>
            
            <View style={styles.formScroll}>
              <Text style={styles.cancelWarningText}>
                Cancelling receipt <Text style={{fontWeight: '800'}}>{cancelTarget?.receiptNo}</Text> will reverse the payment allocation and increase the student's due balance. This action cannot be undone.
              </Text>
              
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Reason for Cancellation *</Text>
                <TextInput 
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
                  multiline 
                  placeholder="Explain why this payment is being cancelled..." 
                  value={cancelReason} 
                  onChangeText={setCancelReason} 
                />
              </View>

              <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10}}>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => { setCancelTarget(null); setCancelReason(''); }}>
                  <Text style={styles.ghostBtnText}>Keep Payment</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtnFullRed} onPress={handleCancelPayment} disabled={cancelling}>
                  {cancelling ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnFullText}>Confirm Cancel</Text>}
                </TouchableOpacity>
              </View>
            </View>
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
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  filterSection: { backgroundColor: C.surface, padding: 16, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  filterLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  datePickerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, height: 40, borderRadius: 10 },
  datePickerText: { fontSize: 13, fontWeight: '600', color: C.text },
  dateDivider: { paddingHorizontal: 10, color: C.textFaint, fontWeight: '800' },

  kpiGrid: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  kpiCard: { flex: 1, backgroundColor: C.surface, padding: 14, borderRadius: 16, borderWidth: 1, shadowColor: '#0F172A', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
  kpiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 18, fontWeight: '800' },
  kpiLabel: { fontSize: 9.5, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 12 },
  receiptNo: { fontSize: 14, fontWeight: '800', color: C.primaryDark, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  dateText: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 4 },
  amountContainer: { alignItems: 'flex-end' },
  amountText: { fontSize: 18, fontWeight: '800', color: C.green },
  lateFeeBadge: { backgroundColor: C.primarySoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  lateFeeText: { fontSize: 9, fontWeight: '800', color: C.primaryDark },

  studentInfo: { marginBottom: 10 },
  studentName: { fontSize: 15, fontWeight: '800', color: C.text },
  studentAdm: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 2 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  modeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primarySoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  modeBadgeText: { fontSize: 10, fontWeight: '800', color: C.primary },
  collectedBy: { fontSize: 11, fontWeight: '600', color: C.textMuted },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  receiptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', paddingVertical: 10, borderRadius: 10, gap: 6, marginRight: 10 },
  receiptBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  iconBtnDelete: { padding: 10, backgroundColor: '#FEF2F2', borderRadius: 10, borderWidth: 1, borderColor: '#FECACA' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 16, fontWeight: '800' },
  closeBtnIcon: { padding: 4 },
  formScroll: { padding: 20 },

  cancelWarningText: { fontSize: 13, color: C.text, lineHeight: 20, marginBottom: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },

  ghostBtn: { paddingVertical: 10, paddingHorizontal: 16, justifyContent: 'center' },
  ghostBtnText: { color: C.textMuted, fontSize: 14, fontWeight: '700' },
  saveBtnFullRed: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});