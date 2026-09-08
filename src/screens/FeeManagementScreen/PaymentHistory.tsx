import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, RefreshControl, Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';

const API_BASE = 'https://mern.schoolapi.dcstechnosis.com/api';

// ---------------------------------------------------------------------------
// Design tokens — shared premium palette (matches FeesScreen)
// ---------------------------------------------------------------------------
const C = {
  bg: '#F3F5F9',
  surface: '#FFFFFF',
  surfaceSoft: '#F8F9FC',
  surfaceSunken: '#EEF1F6',
  border: '#E7EAF1',
  borderStrong: '#D9DEE8',
  text: '#0F1626',
  textMuted: '#5B667A',
  textFaint: '#9AA4B6',

  primary: '#E11D48',
  primaryDark: '#BE123C',
  primarySoft: '#FFF1F3',
  primaryBorder: '#FBD1D9',

  ink: '#111827',
  slate: '#334155',

  green: '#0F9D63',
  greenDark: '#0B7A4E',
  greenSoft: '#E7F8F1',
  greenBorder: '#BFEBD8',

  amber: '#B45309',
  amberSoft: '#FEF3C7',
  amberBorder: '#FCE2A4',

  blue: '#2563EB',
  blueSoft: '#EAF1FE',
};

const AVATAR_PALETTE = ['#E11D48', '#2563EB', '#0F9D63', '#C99A2E', '#7C3AED', '#0891B2'];

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

const initialsOf = (name?: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0]?.toUpperCase() || '?';
};

const avatarColorFor = (name?: string) => {
  if (!name) return AVATAR_PALETTE[0];
  const code = name.charCodeAt(0) || 0;
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
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

      const res = await axios.get(`${API_BASE}/fees/payments`, { params, ...authHeaders(token) });
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
    const url = `${API_BASE}/fees/payments/${id}/receipt${qs}`;

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
      await axios.patch(`${API_BASE}/fees/payments/${cancelTarget._id}/cancel`, { reason: cancelReason }, authHeaders(authToken));
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
          <Text style={styles.subtitle}>View fee transactions and generate receipts</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>DATE RANGE FILTER</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowFromPicker(true)} activeOpacity={0.85}>
            <Feather name="calendar" size={14} color={C.textMuted} style={{ marginRight: 6 }} />
            <Text style={[styles.datePickerText, !fromDate && { color: C.textFaint }]}>{fromDate ? formatDisplayDate(formatToYMD(fromDate)) : 'Start Date'}</Text>
          </TouchableOpacity>
          {showFromPicker && (
            <DateTimePicker value={fromDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowFromPicker(Platform.OS === 'ios'); if (d) { setFromDate(d); fetchPayments(authToken, d, toDate); } }} />
          )}

          <View style={styles.dateDividerWrap}><View style={styles.dateDividerLine} /></View>

          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowToPicker(true)} activeOpacity={0.85}>
            <Feather name="calendar" size={14} color={C.textMuted} style={{ marginRight: 6 }} />
            <Text style={[styles.datePickerText, !toDate && { color: C.textFaint }]}>{toDate ? formatDisplayDate(formatToYMD(toDate)) : 'End Date'}</Text>
          </TouchableOpacity>
          {showToPicker && (
            <DateTimePicker value={toDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowToPicker(Platform.OS === 'ios'); if (d) { setToDate(d); fetchPayments(authToken, fromDate, d); } }} />
          )}
        </View>
      </View>

      {/* KPI Cards */}
      {!loading && payments.length > 0 && (
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { borderColor: C.greenBorder }]}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: C.greenSoft }]}><Feather name="dollar-sign" size={16} color={C.greenDark} /></View>
              <Text style={[styles.kpiValue, { color: C.greenDark }]}>₹{totalAmount.toLocaleString('en-IN')}</Text>
            </View>
            <Text style={styles.kpiLabel}>TOTAL COLLECTIONS</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: C.primaryBorder }]}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: C.primarySoft }]}><Feather name="file-text" size={16} color={C.primaryDark} /></View>
              <Text style={[styles.kpiValue, { color: C.primaryDark }]}>{payments.length}</Text>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPayments(authToken, fromDate, toDate, true)} colors={[C.primary]} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}><Feather name="inbox" size={28} color={C.textFaint} /></View>
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
                <View style={[styles.avatar, { backgroundColor: avatarColorFor(item.student?.name) + '1A', borderColor: avatarColorFor(item.student?.name) + '33' }]}>
                  <Text style={[styles.avatarText, { color: avatarColorFor(item.student?.name) }]}>{initialsOf(item.student?.name)}</Text>
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.studentName} numberOfLines={1}>{item.student?.name}</Text>
                  <Text style={styles.studentAdm}>Adm No. {item.student?.admissionNo || item.student?.rollNo || '—'}</Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.modeBadge}><Feather name="tag" size={10} color={C.primaryDark} style={{ marginRight: 4 }} /><Text style={styles.modeBadgeText}>{item.mode || 'Cash'}</Text></View>
                <Text style={styles.collectedBy}>By: {item.collectedBy?.name || '—'}</Text>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.receiptBtn} onPress={() => openReceipt(item._id)} activeOpacity={0.9}>
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
      <Modal visible={!!cancelTarget} animationType="fade" transparent statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={[styles.formHeader, { backgroundColor: C.primarySoft }]}>
              <View style={styles.formHeaderIconBadgeDanger}>
                <Feather name="alert-triangle" size={16} color={C.primaryDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.formTitle, { color: C.primaryDark }]}>Cancel Receipt?</Text>
                <Text style={[styles.formHint, { color: C.primaryDark, opacity: 0.75 }]}>This reverses the payment allocation</Text>
              </View>
              <TouchableOpacity onPress={() => { setCancelTarget(null); setCancelReason(''); }} style={styles.closeBtnIconDanger}><Feather name="x" size={18} color={C.primaryDark} /></TouchableOpacity>
            </View>

            <View style={styles.formScroll}>
              <Text style={styles.cancelWarningText}>
                Cancelling receipt <Text style={{ fontWeight: '800', color: C.ink }}>{cancelTarget?.receiptNo}</Text> will reverse the payment allocation and increase the student's due balance. This action cannot be undone.
              </Text>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Reason for Cancellation *</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                  multiline
                  placeholder="Explain why this payment is being cancelled..."
                  placeholderTextColor={C.textFaint}
                  value={cancelReason}
                  onChangeText={setCancelReason}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => { setCancelTarget(null); setCancelReason(''); }}>
                  <Text style={styles.ghostBtnText}>Keep Payment</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtnFullRed} onPress={handleCancelPayment} disabled={cancelling} activeOpacity={0.9}>
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

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, paddingBottom: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.primaryBorder },
  title: { fontSize: 21, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 3, fontWeight: '500' },

  filterSection: { backgroundColor: C.surface, padding: 16, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  filterLabel: { fontSize: 10, fontWeight: '800', color: C.textFaint, letterSpacing: 0.5, marginBottom: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  datePickerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, height: 44, borderRadius: 12 },
  datePickerText: { fontSize: 13, fontWeight: '700', color: C.text },
  dateDividerWrap: { width: 22, alignItems: 'center' },
  dateDividerLine: { width: 10, height: 1.5, backgroundColor: C.borderStrong },

  kpiGrid: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  kpiCard: { flex: 1, backgroundColor: C.surface, padding: 14, borderRadius: 16, borderWidth: 1, shadowColor: '#0F1626', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  kpiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 18, fontWeight: '800' },
  kpiLabel: { fontSize: 9.5, fontWeight: '800', color: C.textFaint, letterSpacing: 0.5 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.surfaceSunken, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  card: {
    backgroundColor: C.surface, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border,
    shadowColor: '#0F1626', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 12 },
  receiptNo: { fontSize: 14, fontWeight: '800', color: C.primaryDark, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  dateText: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 4 },
  amountContainer: { alignItems: 'flex-end' },
  amountText: { fontSize: 18, fontWeight: '800', color: C.greenDark },
  lateFeeBadge: { backgroundColor: C.primarySoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, marginTop: 4 },
  lateFeeText: { fontSize: 9, fontWeight: '800', color: C.primaryDark },

  studentInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  avatarText: { fontSize: 12.5, fontWeight: '800' },
  studentName: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  studentAdm: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 2 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 10, borderRadius: 11, borderWidth: 1, borderColor: C.border },
  modeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primarySoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7 },
  modeBadgeText: { fontSize: 10, fontWeight: '800', color: C.primaryDark },
  collectedBy: { fontSize: 11, fontWeight: '600', color: C.textMuted },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10 },
  receiptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink, paddingVertical: 12, borderRadius: 11, gap: 6 },
  receiptBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  iconBtnDelete: { padding: 12, backgroundColor: C.primarySoft, borderRadius: 11, borderWidth: 1, borderColor: C.primaryBorder },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(9,14,26,0.62)', justifyContent: 'center', padding: 16 },
  compactModalContainer: {
    backgroundColor: C.surface, borderRadius: 26, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
  },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  formHeaderIconBadgeDanger: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.6)', justifyContent: 'center', alignItems: 'center' },
  formTitle: { fontSize: 16.5, fontWeight: '800' },
  formHint: { fontSize: 11.5, marginTop: 2, fontWeight: '600' },
  closeBtnIconDanger: { padding: 8, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 20 },
  formScroll: { padding: 20 },

  cancelWarningText: { fontSize: 13, color: C.text, lineHeight: 20, marginBottom: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },

  ghostBtn: { paddingVertical: 10, paddingHorizontal: 16, justifyContent: 'center' },
  ghostBtnText: { color: C.textMuted, fontSize: 14, fontWeight: '700' },
  saveBtnFullRed: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  saveBtnFullText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});