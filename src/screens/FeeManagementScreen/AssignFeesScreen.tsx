import React, { useState, useEffect, useCallback, } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';


const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
};

type Option = { label: string; value: string };

// --- Safe Date Parsers ---
const formatToYMD = (d: Date): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

export default function FeesScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [studentFees, setStudentFees] = useState<any[]>([]);
  const [dueList, setDueList] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);

  // UI & Filter States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'assignments' | 'due'>('assignments');
  const [classFilter, setClassFilter] = useState<string>('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Assign Modal
  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({
    mode: 'single', student: '', classId: '', feeStructure: '',
    discountType: 'None', discountValue: '0', discountReason: ''
  });

  // Collect Modal
  const [collectTarget, setCollectTarget] = useState<any>(null);
  const [showCollectDatePicker, setShowCollectDatePicker] = useState(false);
  const [collectForm, setCollectForm] = useState({
    amount: '', lateFeeCharged: '0', mode: 'Cash', referenceNo: '', paidOn: new Date(), remarks: ''
  });

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchStaticData(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchStaticData = async (token: string | null) => {
    try {
      const [stuRes, clsRes, structRes] = await Promise.all([
        axios.get(`${BASE_URL}/students?limit=500`, authHeaders(token)),
        axios.get(`${BASE_URL}/classes?limit=200`, authHeaders(token)),
        axios.get(`${BASE_URL}/fees/structures`, authHeaders(token)),
      ]);
      if (stuRes.data?.success) setStudents(stuRes.data.data || []);
      if (clsRes.data?.success) setClasses(clsRes.data.data || []);
      if (structRes.data?.success) setStructures(structRes.data.data || []);
    } catch (err) { console.error(err); }
    fetchLists(token, classFilter);
  };

  const fetchLists = async (token: string | null, filterCls: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = filterCls ? { classId: filterCls } : {};
      const [assignRes, dueRes] = await Promise.all([
        axios.get(`${BASE_URL}/fees`, { params, ...authHeaders(token) }),
        axios.get(`${BASE_URL}/fees/reports/due-list`, { params, ...authHeaders(token) })
      ]);
      if (assignRes.data?.success) setStudentFees(assignRes.data.data || []);
      if (dueRes.data?.success) setDueList(dueRes.data.data || []);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'fees' && p.action === action);
  }, [permissions, isSuperAdmin]);

  // --- Actions ---
  const handleAssign = async () => {
    if (!assignForm.feeStructure) { Alert.alert('Error', 'Select a fee structure'); return; }
    if (assignForm.mode === 'single' && !assignForm.student) { Alert.alert('Error', 'Select a student'); return; }
    if (assignForm.mode === 'bulk' && !assignForm.classId) { Alert.alert('Error', 'Select a class'); return; }

    const discountValue = Number(assignForm.discountValue) || 0;
    const discount = assignForm.discountType !== 'None' && discountValue > 0
      ? { type: assignForm.discountType, value: discountValue, reason: assignForm.discountReason }
      : { type: 'None', value: 0, reason: '' };

    setSaving(true);
    try {
      if (assignForm.mode === 'single') {
        await axios.post(`${BASE_URL}/fees/assign`, { student: assignForm.student, feeStructure: assignForm.feeStructure, discount }, authHeaders(authToken));
        Alert.alert('Success', 'Fee assigned to student');
      } else {
        const res = await axios.post(`${BASE_URL}/fees/assign/bulk`, { classId: assignForm.classId, feeStructure: assignForm.feeStructure, discount }, authHeaders(authToken));
        Alert.alert('Success', res.data?.message || 'Bulk assignment complete');
      }
      setShowAssign(false);
      fetchLists(authToken, classFilter, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Assignment failed'); } 
    finally { setSaving(false); }
  };

  const openCollectModal = (sf: any) => {
    setCollectTarget(sf);
    setCollectForm({
      amount: (sf.totalPayable - sf.totalPaid).toFixed(2),
      lateFeeCharged: '0',
      mode: 'Cash',
      referenceNo: '',
      paidOn: new Date(),
      remarks: ''
    });
  };

  const handleCollect = async () => {
    if (!collectForm.amount) { Alert.alert('Error', 'Amount is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...collectForm,
        amount: Number(collectForm.amount),
        lateFeeCharged: Number(collectForm.lateFeeCharged) || 0,
        paidOn: formatToYMD(collectForm.paidOn),
      };
      await axios.post(`${BASE_URL}/fees/${collectTarget._id}/collect`, payload, authHeaders(authToken));
      Alert.alert('Success', 'Payment recorded successfully');
      setCollectTarget(null);
      fetchLists(authToken, classFilter, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Payment failed'); } 
    finally { setSaving(false); }
  };

  // --- Render Helpers ---
  const renderInlineDropdown = (fieldKey: string, label: string, options: Option[], value: string, onSelect: (v: string) => void, placeholder = "Select...", stateObj?: any) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || placeholder}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
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

  const renderCard = ({ item }: { item: any }) => {
    const outstanding = item.totalPayable - item.totalPaid;
    const pct = item.totalPayable > 0 ? Math.min((item.totalPaid / item.totalPayable) * 100, 100) : 0;
    const isPaid = pct >= 100;
    
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.studentName} numberOfLines={1}>{item.student?.name}</Text>
            <Text style={styles.admissionNo}>Adm No: {item.student?.admissionNo || item.student?.rollNo || '—'}</Text>
          </View>
          <View style={styles.structBadge}>
            <Text style={styles.structBadgeText}>{item.feeStructure?.name}</Text>
          </View>
        </View>

        <View style={styles.financeGrid}>
          <View style={styles.finBox}><Text style={styles.finLbl}>PAYABLE</Text><Text style={styles.finVal}>₹{item.totalPayable?.toLocaleString('en-IN')}</Text></View>
          <View style={styles.finBox}><Text style={styles.finLbl}>PAID</Text><Text style={[styles.finVal, { color: C.green }]}>₹{item.totalPaid?.toLocaleString('en-IN')}</Text></View>
          <View style={styles.finBox}><Text style={styles.finLbl}>DUE</Text><Text style={[styles.finVal, outstanding > 0 ? { color: C.primary } : { color: C.green }]}>₹{outstanding.toFixed(2)}</Text></View>
        </View>

        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${pct}%`, backgroundColor: isPaid ? C.green : outstanding > 0 && item.totalPaid > 0 ? C.amber : C.primary }]} />
        </View>

        {hasPermission('update') && outstanding > 0 && (
          <View style={styles.cardFooter}>
            <TouchableOpacity style={styles.collectBtn} onPress={() => openCollectModal(item)}>
              <Feather name="plus-circle" size={16} color="#fff" />
              <Text style={styles.collectBtnText}>Collect Payment</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const listData = activeTab === 'assignments' ? studentFees : dueList;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="credit-card" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Collect & Assign Fees</Text>
          <Text style={styles.subtitle}>Manage student fee structures and process collections.</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={{ flex: 1, zIndex: 100 }}>
          {renderInlineDropdown('classFilter', '', [{label: 'All Classes', value: ''}, ...classes.map(c => ({ label: c.className, value: c._id }))], classFilter, (v) => { setClassFilter(v); fetchLists(authToken, v); }, 'Filter by Class')}
        </View>
        
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'assignments' && styles.tabBtnActive]} onPress={() => setActiveTab('assignments')}>
            <Feather name="list" size={14} color={activeTab === 'assignments' ? '#fff' : C.textMuted} />
            <Text style={[styles.tabText, activeTab === 'assignments' && styles.tabTextActive]}>All Assignments</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'due' && styles.tabBtnActive]} onPress={() => setActiveTab('due')}>
            <Feather name="alert-circle" size={14} color={activeTab === 'due' ? '#fff' : C.textMuted} />
            <Text style={[styles.tabText, activeTab === 'due' && styles.tabTextActive]}>Pending Dues</Text>
          </TouchableOpacity>
        </View>

        {hasPermission('create') && (
          <TouchableOpacity style={styles.addBtnFull} onPress={() => { setAssignForm({...assignForm, mode: 'single', student: '', classId: '', feeStructure: ''}); setShowAssign(true); }}>
            <Feather name="plus" size={16} color="#fff" /><Text style={styles.addBtnTextFull}>Assign New Fee</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchLists(authToken, classFilter, true)} colors={[C.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="file-text" size={40} color={C.textFaint} />
              <Text style={styles.emptyTitle}>No Records Found</Text>
              <Text style={styles.emptySubtitle}>{activeTab === 'due' ? 'No pending dues for this selection.' : 'No fee assignments created yet.'}</Text>
            </View>
          }
          renderItem={renderCard}
        />
      )}

      {/* MODAL: Assign Fee */}
      <Modal visible={showAssign} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Assign Fee Structure</Text>
              <TouchableOpacity onPress={() => setShowAssign(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.segmentControl}>
                <TouchableOpacity style={[styles.segmentBtn, assignForm.mode === 'single' && styles.segmentBtnActive]} onPress={() => setAssignForm({...assignForm, mode: 'single'})}>
                  <Text style={[styles.segmentText, assignForm.mode === 'single' && styles.segmentTextActive]}>Single Student</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.segmentBtn, assignForm.mode === 'bulk' && styles.segmentBtnActive]} onPress={() => setAssignForm({...assignForm, mode: 'bulk'})}>
                  <Text style={[styles.segmentText, assignForm.mode === 'bulk' && styles.segmentTextActive]}>Whole Class</Text>
                </TouchableOpacity>
              </View>

              <View style={{ zIndex: 40, marginBottom: 4 }}>
                {assignForm.mode === 'single' 
                  ? renderInlineDropdown('studentId', 'Select Student *', students.map(s => ({label: `${s.name} (${s.rollNo || ''})`, value: s._id})), assignForm.student, (v) => setAssignForm({...assignForm, student: v}))
                  : renderInlineDropdown('classId', 'Select Class *', classes.map(c => ({label: c.className, value: c._id})), assignForm.classId, (v) => setAssignForm({...assignForm, classId: v}))
                }
              </View>

              <View style={{ zIndex: 30, marginBottom: 4 }}>
                {renderInlineDropdown('structureId', 'Fee Structure *', structures.map(s => ({label: `${s.name} (${s.academicYear})`, value: s._id})), assignForm.feeStructure, (v) => setAssignForm({...assignForm, feeStructure: v}))}
              </View>

              <View style={{ zIndex: 20, marginBottom: 4 }}>
                {renderInlineDropdown('discType', 'Discount Type', [{label:'None',value:'None'},{label:'Fixed (₹)',value:'Fixed'},{label:'Percentage (%)',value:'Percentage'}], assignForm.discountType, (v) => setAssignForm({...assignForm, discountType: v}))}
              </View>

              {assignForm.discountType !== 'None' && (
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.inputLabel}>Discount Value</Text>
                    <TextInput style={styles.input} keyboardType="numeric" value={assignForm.discountValue} onChangeText={t => setAssignForm({...assignForm, discountValue: t})} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Reason</Text>
                    <TextInput style={styles.input} placeholder="e.g. Scholarship" value={assignForm.discountReason} onChangeText={t => setAssignForm({...assignForm, discountReason: t})} />
                  </View>
                </View>
              )}

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleAssign} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Confirm Assignment</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Collect Payment */}
      <Modal visible={!!collectTarget} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>Collect Payment</Text>
                <Text style={styles.formSubtitle}>{collectTarget?.student?.name} • Adm: {collectTarget?.student?.admissionNo || '-'}</Text>
              </View>
              <TouchableOpacity onPress={() => setCollectTarget(null)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.alertBox}>
                <Feather name="info" size={18} color={C.primaryDark} />
                <Text style={styles.alertText}>Total Outstanding Due: ₹{(collectTarget?.totalPayable - collectTarget?.totalPaid).toFixed(2)}</Text>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Amount to Collect (₹) *</Text>
                  <TextInput style={[styles.input, styles.inputBold]} keyboardType="numeric" value={collectForm.amount} onChangeText={t => setCollectForm({...collectForm, amount: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Late Fee Charge (₹)</Text>
                  <TextInput style={[styles.input, styles.inputBold, { color: C.amber }]} keyboardType="numeric" value={collectForm.lateFeeCharged} onChangeText={t => setCollectForm({...collectForm, lateFeeCharged: t})} />
                </View>
              </View>

              <View style={{ zIndex: 40, marginBottom: 4 }}>
                {renderInlineDropdown('payMode', 'Payment Mode *', ['Cash','Online','Cheque','Card','UPI','Bank Transfer'].map(m => ({label: m, value: m})), collectForm.mode, (v) => setCollectForm({...collectForm, mode: v}))}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Reference / Transaction No.</Text>
                <TextInput style={styles.input} placeholder="Cheque / UTR / Txn ID" value={collectForm.referenceNo} onChangeText={t => setCollectForm({...collectForm, referenceNo: t})} />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Payment Date *</Text>
                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowCollectDatePicker(true)}>
                  <Text style={styles.datePickerText}>{formatToYMD(collectForm.paidOn)}</Text>
                  <Feather name="calendar" size={16} color={C.textMuted} />
                </TouchableOpacity>
                {showCollectDatePicker && (
                  <DateTimePicker value={collectForm.paidOn} mode="date" display="default" onChange={(e, d) => { setShowCollectDatePicker(Platform.OS === 'ios'); if (d) setCollectForm({ ...collectForm, paidOn: d }); }} />
                )}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Remarks (Optional)</Text>
                <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} multiline placeholder="Notes..." value={collectForm.remarks} onChangeText={t => setCollectForm({...collectForm, remarks: t})} />
              </View>

              <TouchableOpacity style={styles.saveBtnFullGreen} onPress={handleCollect} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <><Feather name="check" size={18} color="#fff" style={{marginRight: 8}}/><Text style={styles.saveBtnFullText}>Record Payment</Text></>}
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
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 3 },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  tabContainer: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 4, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 6 },
  tabBtnActive: { backgroundColor: C.primary, shadowColor: C.primary, shadowOpacity: 0.2, shadowRadius: 6, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  tabTextActive: { color: '#fff' },
  
  addBtnFull: { backgroundColor: '#111827', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 12, marginTop: 12, elevation: 2 },
  addBtnTextFull: { color: '#fff', fontSize: 14, fontWeight: '800', marginLeft: 8 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  // Cards
  card: { backgroundColor: C.surface, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  studentName: { fontSize: 16, fontWeight: '800', color: C.text },
  admissionNo: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  structBadge: { backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  structBadgeText: { fontSize: 10, fontWeight: '800', color: C.primaryDark },

  financeGrid: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  finBox: { flex: 1, alignItems: 'center' },
  finLbl: { fontSize: 9, color: C.textMuted, fontWeight: '800', marginBottom: 4, letterSpacing: 0.5 },
  finVal: { fontSize: 14, color: C.text, fontWeight: '800' },

  progressContainer: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 3 },

  cardFooter: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  collectBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: C.green, paddingVertical: 12, borderRadius: 10, gap: 6 },
  collectBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 24, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  formSubtitle: { fontSize: 11.5, color: C.textMuted, marginTop: 2, fontWeight: '600' },
  closeBtnIcon: { padding: 6, backgroundColor: C.border, borderRadius: 20 },
  formScroll: { padding: 20 },

  segmentControl: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 4, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 20 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  segmentBtnActive: { backgroundColor: C.primary, elevation: 1 },
  segmentText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  segmentTextActive: { color: '#fff' },

  alertBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primarySoft, padding: 14, borderRadius: 12, marginBottom: 20, gap: 8, borderWidth: 1, borderColor: '#FECACA' },
  alertText: { fontSize: 14, fontWeight: '800', color: C.primaryDark },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  inputBold: { fontWeight: '800', fontSize: 16 },
  row: { flexDirection: 'row', marginBottom: 16, zIndex: 2 },
  
  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 14, color: C.text, fontWeight: '600' },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 76, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },

  saveBtnFull: { backgroundColor: C.primary, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullGreen: { backgroundColor: C.green, flexDirection: 'row', height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});