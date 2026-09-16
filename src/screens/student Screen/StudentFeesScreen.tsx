import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  ActivityIndicator, RefreshControl, Platform, TextInput, Modal, KeyboardAvoidingView, Alert, Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import {API_BASE} from '../../network/api';
const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueDark: '#0284C7', blueSoft: '#E0F2FE',
  green: '#10B981', greenDark: '#059669', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberDark: '#D97706', amberSoft: '#FEF3C7',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

const PAYMENT_MODES = ['Online', 'UPI', 'Card', 'Bank Transfer', 'Cash'];

export default function StudentFeesScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isParent, setIsParent] = useState(false);

  // Data States
  const [feeData, setFeeData] = useState<any>(null);
  const [childrenList, setChildrenList] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'structure' | 'history'>('structure');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Payment Modal States
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedFeeAssignment, setSelectedFeeAssignment] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Online');
  const [refNo, setRefNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const userRole = await AsyncStorage.getItem('userRole');
    setAuthToken(token);
    
    const parentCheck = userRole === 'Parent' || userRole === 'parent';
    setIsParent(parentCheck);

    if (parentCheck) {
      try {
        const childRes = await axios.get(`${API_BASE}/parent/children`, { headers: { Authorization: `Bearer ${token}` } });
        if (childRes.data?.data?.length > 0) {
          setChildrenList(childRes.data.data);
          setSelectedChildId(childRes.data.data[0]._id);
          fetchFeeData(token, childRes.data.data[0]._id);
          return;
        }
      } catch (e) { console.warn("Could not fetch children"); }
    }
    
    fetchFeeData(token, null);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchFeeData = async (token: string | null = authToken, childId: string | null = selectedChildId, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params: any = {};
      if (childId) params.studentId = childId;
      const res = await axios.get(`${API_BASE}/fees/my-student-fees`, { params, ...authHeaders(token) });
      if (res.data?.success) setFeeData(res.data.data);
    } catch (err: any) { Alert.alert('Error', err.response?.data?.message || 'Failed to load fee details'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  // --- Actions ---
  const openPaymentModal = (assignment: any) => {
    const due = Math.max((assignment.totalPayable || 0) - (assignment.totalPaid || 0), 0);
    setSelectedFeeAssignment(assignment);
    setPayAmount(due > 0 ? String(due) : '');
    setPayMode('Online');
    setRefNo('TXN-' + Date.now().toString().slice(-8));
    setRemarks('');
    setActiveDropdown(null);
    setShowPayModal(true);
  };

  const handleSubmitPayment = async () => {
    if (!selectedFeeAssignment) return;
    const amountNum = parseFloat(payAmount);
    if (!amountNum || amountNum <= 0) { Alert.alert('Invalid Amount', 'Please enter a valid payment amount'); return; }

    const due = Math.max((selectedFeeAssignment.totalPayable || 0) - (selectedFeeAssignment.totalPaid || 0), 0);
    if (amountNum > due + 0.01) { Alert.alert('Overpayment', `Amount cannot exceed pending due of ₹${due.toLocaleString('en-IN')}`); return; }

    setSubmittingPayment(true);
    try {
      const res = await axios.post(`${API_BASE}/fees/my-student-fees/${selectedFeeAssignment._id}/pay`, {
        amount: amountNum, mode: payMode, referenceNo: refNo, remarks: remarks || 'Self-payment',
      }, authHeaders(authToken));

      if (res.data?.success) {
        Alert.alert('Payment Successful', `Payment of ₹${amountNum.toLocaleString('en-IN')} submitted successfully!`);
        setShowPayModal(false);
        fetchFeeData(authToken, selectedChildId, true);
      }
    } catch (err: any) { Alert.alert('Payment Error', err.response?.data?.message || 'Payment submission failed. Please try again.'); } 
    finally { setSubmittingPayment(false); }
  };

  const handleDownloadReceipt = async (paymentId: string) => {
    const receiptUrl = `${API_BASE}/fees/payments/${paymentId}/receipt?token=${authToken}`;
    const supported = await Linking.canOpenURL(receiptUrl);
    if (supported) await Linking.openURL(receiptUrl);
    else Alert.alert('Error', 'Unable to open receipt URL');
  };

  const summary = feeData?.summary || { totalPayable: 0, totalPaid: 0, totalDiscount: 0, totalDue: 0, hasPendingDues: false };
  const feeAssignments = feeData?.feeAssignments || [];
  const payments = feeData?.payments || [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="credit-card" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{isParent ? "Child's Fees & Dues" : "My Fees & Payments"}</Text>
          <Text style={styles.subtitle}>View breakdowns and pay securely online.</Text>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchFeeData(authToken, selectedChildId, true)} colors={[C.primary]} />}
      >
        {/* Optional Child Selector for Parents */}
        {childrenList.length > 0 && (
          <View style={[styles.inputWrapper, { zIndex: 100, marginBottom: 16 }]}>
            <Text style={styles.inputLabel}>SELECT CHILD</Text>
            <TouchableOpacity style={[styles.dropdownHeader, activeDropdown === 'child' && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(activeDropdown === 'child' ? null : 'child')} activeOpacity={0.85}>
              <Text style={styles.dropdownSelectedText} numberOfLines={1}>{childrenList.find(c => c._id === selectedChildId)?.name || 'Select Child'}</Text>
              <Feather name={activeDropdown === 'child' ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
            </TouchableOpacity>
            {activeDropdown === 'child' && (
              <View style={styles.dropdownListContainer}>
                {childrenList.map((c) => (
                  <TouchableOpacity key={c._id} style={styles.dropdownItem} onPress={() => { setSelectedChildId(c._id); setActiveDropdown(null); fetchFeeData(authToken, c._id); }}>
                    <Text style={styles.dropdownItemText}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Status Bar */}
        <View style={[styles.statusBar, { backgroundColor: summary.hasPendingDues ? C.primarySoft : C.greenSoft, borderColor: summary.hasPendingDues ? '#FECACA' : '#A7F3D0' }]}>
          <Feather name={summary.hasPendingDues ? 'alert-circle' : 'check-circle'} size={16} color={summary.hasPendingDues ? C.primary : C.greenDark} />
          <Text style={[styles.statusText, { color: summary.hasPendingDues ? C.primaryDark : C.greenDark }]}>
            {summary.hasPendingDues ? `Pending Dues: ₹${summary.totalDue.toLocaleString('en-IN')}` : 'All Fees Cleared'}
          </Text>
        </View>

        {/* KPI Grid */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: C.blueSoft }]}><Feather name="file-text" size={14} color={C.blue} /></View>
              <Text style={styles.kpiLabel}>TOTAL ASSIGNED</Text>
            </View>
            <Text style={styles.kpiValue}>₹{summary.totalPayable.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: C.greenSoft }]}><Feather name="check" size={14} color={C.green} /></View>
              <Text style={styles.kpiLabel}>TOTAL PAID</Text>
            </View>
            <Text style={[styles.kpiValue, { color: C.greenDark }]}>₹{summary.totalPaid.toLocaleString('en-IN')}</Text>
          </View>
          <View style={[styles.kpiCard, summary.totalDue > 0 && { borderColor: '#FECACA', backgroundColor: C.primarySoft }]}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: summary.totalDue > 0 ? '#FEE2E2' : C.slateSoft }]}><Feather name="clock" size={14} color={summary.totalDue > 0 ? C.primary : C.slate} /></View>
              <Text style={[styles.kpiLabel, summary.totalDue > 0 && { color: C.primary }]}>OUTSTANDING</Text>
            </View>
            <Text style={[styles.kpiValue, summary.totalDue > 0 && { color: C.primaryDark }]}>₹{summary.totalDue.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: C.amberSoft }]}><Feather name="tag" size={14} color={C.amber} /></View>
              <Text style={styles.kpiLabel}>DISCOUNT</Text>
            </View>
            <Text style={[styles.kpiValue, { color: C.amberDark }]}>₹{summary.totalDiscount.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* TAB SWITCHER */}
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'structure' && styles.tabBtnActive]} onPress={() => setActiveTab('structure')}>
            <Feather name="list" size={14} color={activeTab === 'structure' ? '#fff' : C.textMuted} />
            <Text style={[styles.tabText, activeTab === 'structure' && styles.tabTextActive]}>Fee Breakdown</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]} onPress={() => setActiveTab('history')}>
            <Feather name="receipt" size={14} color={activeTab === 'history' ? '#fff' : C.textMuted} />
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>History ({payments.length})</Text>
          </TouchableOpacity>
        </View>

        {/* TAB CONTENT */}
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : activeTab === 'structure' ? (
          feeAssignments.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="file-minus" size={40} color={C.textFaint} />
              <Text style={styles.emptyTitle}>No Fee Assigned</Text>
              <Text style={styles.emptySubtitle}>There are no active fee structures assigned to this account.</Text>
            </View>
          ) : (
            feeAssignments.map((assignment: any) => {
              const pendingDue = Math.max((assignment.totalPayable || 0) - (assignment.totalPaid || 0), 0);
              return (
                <View key={assignment._id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{assignment.feeStructure?.name || 'Academic Fee'}</Text>
                      <View style={styles.sessionBadge}><Text style={styles.sessionBadgeText}>Session: {assignment.academicYear}</Text></View>
                    </View>
                  </View>

                  <View style={styles.financeSummary}>
                    <Text style={styles.financeSummaryText}>Net Payable: <Text style={{fontWeight: '800'}}>₹{(assignment.totalPayable || 0).toLocaleString('en-IN')}</Text></Text>
                    {assignment.discountAmount > 0 && <Text style={[styles.financeSummaryText, { color: C.green }]}> (Discount: ₹{assignment.discountAmount})</Text>}
                  </View>

                  {/* Items List */}
                  <View style={styles.itemsBox}>
                    <View style={styles.listHeaderRow}>
                      <Text style={[styles.listHeaderCell, { flex: 1.5 }]}>Head</Text>
                      <Text style={[styles.listHeaderCell, { flex: 1, textAlign: 'center' }]}>Amount</Text>
                      <Text style={[styles.listHeaderCell, { flex: 1, textAlign: 'right' }]}>Status</Text>
                    </View>
                    {(assignment.items || []).map((item: any, idx: number) => {
                      const itemDue = Math.max((item.amount || 0) - (item.paidAmount || 0), 0);
                      const isOverdue = item.status !== 'Paid' && item.dueDate && new Date(item.dueDate) < new Date();
                      
                      return (
                        <View key={idx} style={styles.listDataRow}>
                          <View style={{ flex: 1.5 }}>
                            <Text style={styles.listDataTitle}>{item.label || `Item ${idx+1}`}</Text>
                            {!!item.dueDate && (
                              <Text style={[styles.listDataSub, isOverdue && { color: C.primaryDark }]}>Due: {item.dueDate}</Text>
                            )}
                          </View>
                          <Text style={[styles.listDataCell, { flex: 1, textAlign: 'center', fontWeight: '800' }]}>₹{(item.amount || 0).toLocaleString('en-IN')}</Text>
                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <View style={[styles.miniBadge, { backgroundColor: item.status === 'Paid' ? C.greenSoft : item.status === 'PartiallyPaid' ? C.amberSoft : C.primarySoft }]}>
                              <Text style={[styles.miniBadgeText, { color: item.status === 'Paid' ? C.greenDark : item.status === 'PartiallyPaid' ? C.amberDark : C.primaryDark }]}>
                                {item.status === 'Paid' ? 'PAID' : item.status === 'PartiallyPaid' ? 'PARTIAL' : isOverdue ? 'OVERDUE' : 'PENDING'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.cardFooter}>
                    <View>
                      <Text style={styles.pendingLbl}>Pending Balance</Text>
                      <Text style={[styles.pendingVal, pendingDue > 0 ? {color: C.primaryDark} : {color: C.greenDark}]}>₹{pendingDue.toLocaleString('en-IN')}</Text>
                    </View>
                    {pendingDue > 0 ? (
                      <TouchableOpacity style={styles.payBtn} onPress={() => openPaymentModal(assignment)}>
                        <Feather name="credit-card" size={14} color="#fff" />
                        <Text style={styles.payBtnText}>Pay Now</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.paidBadge}><Feather name="check-circle" size={14} color={C.greenDark}/><Text style={styles.paidBadgeText}>Fully Paid</Text></View>
                    )}
                  </View>
                </View>
              );
            })
          )
        ) : (
          /* Payment History Tab */
          payments.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="receipt" size={40} color={C.textFaint} />
              <Text style={styles.emptyTitle}>No Payments Yet</Text>
              <Text style={styles.emptySubtitle}>Receipts will appear here once a payment is made.</Text>
            </View>
          ) : (
            payments.map((p: any) => (
              <View key={p._id} style={styles.receiptCard}>
                <View style={styles.receiptHeader}>
                  <Text style={styles.receiptNo}>{p.receiptNo}</Text>
                  <Text style={styles.receiptAmount}>₹{(p.amount || 0).toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.receiptMeta}>
                  <View style={styles.modeBadge}><Text style={styles.modeBadgeText}>{p.mode}</Text></View>
                  <Text style={styles.receiptDate}>{p.paidOn || p.createdAt?.slice(0, 10)}</Text>
                </View>
                {!!p.referenceNo && <Text style={styles.refText}>Ref: {p.referenceNo}</Text>}
                
                <TouchableOpacity style={styles.downloadBtn} onPress={() => handleDownloadReceipt(p._id)}>
                  <Feather name="download" size={14} color={C.text} />
                  <Text style={styles.downloadBtnText}>Download PDF Receipt</Text>
                </TouchableOpacity>
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* --- PAYMENT MODAL --- */}
      <Modal visible={showPayModal} animationType="fade" transparent onRequestClose={() => setShowPayModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Submit Payment</Text>
              <TouchableOpacity onPress={() => setShowPayModal(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>{selectedFeeAssignment?.feeStructure?.name || 'Academic Fee'}</Text>
                <Text style={styles.infoSub}>Pending Due: <Text style={{color: C.primaryDark, fontWeight: '800'}}>₹{Math.max((selectedFeeAssignment?.totalPayable || 0) - (selectedFeeAssignment?.totalPaid || 0), 0).toLocaleString('en-IN')}</Text></Text>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Payment Amount (₹) *</Text>
                <TextInput style={[styles.input, { fontSize: 18, fontWeight: '800', color: C.greenDark }]} keyboardType="numeric" value={payAmount} onChangeText={setPayAmount} placeholder="0" />
              </View>

              <View style={{ zIndex: 50, marginBottom: 16 }}>
                {renderInlineDropdown('payMode', 'Payment Method *', PAYMENT_MODES.map(m => ({label: m, value: m})), payMode, setPayMode)}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Transaction / Reference ID</Text>
                <TextInput style={styles.input} value={refNo} onChangeText={setRefNo} placeholder="UPI Ref / Cheque No" />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Remarks (Optional)</Text>
                <TextInput style={styles.input} value={remarks} onChangeText={setRemarks} placeholder="e.g. Paid via GPay" />
              </View>

              <TouchableOpacity style={styles.saveBtnFullGreen} onPress={handleSubmitPayment} disabled={submittingPayment}>
                {submittingPayment ? <ActivityIndicator color="#fff" /> : <><Feather name="check" size={16} color="#fff" style={{marginRight:8}}/><Text style={styles.saveBtnFullText}>Confirm & Pay ₹{parseFloat(payAmount || '0').toLocaleString('en-IN')}</Text></>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );

  function renderInlineDropdown(fieldKey: string, label: string, options: {label: string, value: string}[], value: string, onSelect: (v: string) => void) {
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
            <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
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
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  scrollContent: { padding: 16, paddingBottom: 40 },

  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  statusText: { fontSize: 13, fontWeight: '800' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  kpiCard: { width: '48%', backgroundColor: C.surface, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, elevation: 1 },
  kpiRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  iconCircle: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  kpiLabel: { fontSize: 9.5, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, flex: 1 },
  kpiValue: { fontSize: 18, fontWeight: '800', color: C.text },

  tabContainer: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 4, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 6 },
  tabBtnActive: { backgroundColor: C.primary, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  tabTextActive: { color: '#fff' },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center', lineHeight: 18 },

  card: { backgroundColor: C.surface, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border, elevation: 1, overflow: 'hidden' },
  cardHeader: { padding: 16, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  sessionBadge: { backgroundColor: C.blueSoft, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 6 },
  sessionBadgeText: { fontSize: 10, fontWeight: '800', color: C.blue },

  financeSummary: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border },
  financeSummaryText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },

  itemsBox: { backgroundColor: C.surface },
  listHeaderRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderColor: C.border },
  listHeaderCell: { fontSize: 10, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase' },
  listDataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: C.border },
  listDataTitle: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 2 },
  listDataSub: { fontSize: 10, color: C.textMuted, fontWeight: '600' },
  listDataCell: { fontSize: 13, color: C.text },
  miniBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  miniBadgeText: { fontSize: 9, fontWeight: '800' },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: C.surfaceSoft },
  pendingLbl: { fontSize: 10, color: C.textMuted, fontWeight: '800', textTransform: 'uppercase', marginBottom: 2 },
  pendingVal: { fontSize: 18, fontWeight: '900', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  payBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.green, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, gap: 6, elevation: 2 },
  payBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  paidBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.greenSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 4 },
  paidBadgeText: { color: C.greenDark, fontSize: 12, fontWeight: '800' },

  // Receipt Card
  receiptCard: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  receiptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  receiptNo: { fontSize: 15, fontWeight: '800', color: C.primary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  receiptAmount: { fontSize: 18, fontWeight: '900', color: C.greenDark },
  receiptMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modeBadge: { backgroundColor: C.slateSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  modeBadgeText: { fontSize: 10, fontWeight: '800', color: C.slateDark },
  receiptDate: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  refText: { fontSize: 11, color: C.textFaint, fontStyle: 'italic', marginBottom: 14 },
  downloadBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, paddingVertical: 10, borderRadius: 10, gap: 8 },
  downloadBtnText: { fontSize: 13, fontWeight: '700', color: C.text },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  closeBtnIcon: { padding: 4 },
  formScroll: { padding: 20 },

  infoBox: { backgroundColor: C.surfaceSoft, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 20 },
  infoTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 4 },
  infoSub: { fontSize: 13, color: C.textMuted, fontWeight: '600' },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },

  saveBtnFullGreen: { backgroundColor: C.green, flexDirection: 'row', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});