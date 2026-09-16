import React, { useState, useEffect } from 'react';
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
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueDark: '#0284C7', blueSoft: '#E0F2FE',
  green: '#10B981', greenDark: '#059669', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberDark: '#D97706', amberSoft: '#FEF3C7',
  purple: '#A855F7', purpleDark: '#7E22CE', purpleSoft: '#F3E8FF',
  slate: '#64748B', slateDark: '#475569', slateSoft: '#F1F5F9',
};

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

export default function StudentLeaveScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isParent, setIsParent] = useState(false);

  // Data States
  const [leaveData, setLeaveData] = useState<any>(null);
  const [childrenList, setChildrenList] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Modal & Form States
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  
  const [form, setForm] = useState({
    fromDate: new Date(),
    toDate: new Date(),
    isHalfDay: false,
    halfDaySession: 'First Half',
    reason: ''
  });

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
          fetchLeaves(token, childRes.data.data[0]._id);
          return;
        }
      } catch (e) { console.warn("Could not fetch children"); }
    }
    
    fetchLeaves(token, null);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchLeaves = async (token: string | null = authToken, childId: string | null = selectedChildId, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params: any = {};
      if (childId) params.studentId = childId;
      const res = await axios.get(`${API_BASE}/leave/my-student-leaves`, { params, ...authHeaders(token) });
      if (res.data?.success) setLeaveData(res.data);
    } catch (err: any) { Alert.alert('Error', err.response?.data?.message || 'Failed to load leave history'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const handleApplyLeave = async () => {
    if (!form.reason.trim()) { Alert.alert('Error', 'Please provide a reason for your leave.'); return; }
    
    setSubmitting(true);
    try {
      const payload = {
        fromDate: formatToYMD(form.fromDate),
        toDate: formatToYMD(form.isHalfDay ? form.fromDate : form.toDate),
        isHalfDay: form.isHalfDay,
        halfDaySession: form.isHalfDay ? form.halfDaySession : '',
        reason: form.reason.trim(),
        ...(selectedChildId ? { studentId: selectedChildId } : {})
      };

      await axios.post(`${API_BASE}/leave/student-apply`, payload, authHeaders(authToken));
      Alert.alert('Success', 'Leave application submitted successfully. Pending review.');
      
      setShowApplyModal(false);
      setForm({ fromDate: new Date(), toDate: new Date(), isHalfDay: false, halfDaySession: 'First Half', reason: '' });
      fetchLeaves(authToken, selectedChildId, true);
    } catch (err: any) { Alert.alert('Error', err.response?.data?.message || 'Failed to submit leave application'); } 
    finally { setSubmitting(false); }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Approved': return { bg: C.greenSoft, text: C.greenDark, icon: 'check-circle' };
      case 'Rejected': return { bg: C.primarySoft, text: C.primaryDark, icon: 'x-circle' };
      case 'Cancelled': return { bg: C.slateSoft, text: C.slateDark, icon: 'slash' };
      default: return { bg: C.amberSoft, text: C.amberDark, icon: 'clock' };
    }
  };

  const leaves = leaveData?.leaves || [];
  const pendingCount = leaves.filter((l: any) => l.status === 'Pending').length;
  const approvedCount = leaves.filter((l: any) => l.status === 'Approved').length;
  const rejectedCount = leaves.filter((l: any) => l.status === 'Rejected').length;

  const renderInlineDropdown = (fieldKey: string, label: string, options: {label: string, value: string}[], value: string, onSelect: (v: string) => void) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        {!!label && <Text style={styles.inputLabel}>{label}</Text>}
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
        <View style={styles.headerIconBadge}><Feather name="calendar" size={20} color={C.purpleDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Leave Management</Text>
          <Text style={styles.subtitle}>Apply for leave and track approvals.</Text>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchLeaves(authToken, selectedChildId, true)} colors={[C.purpleDark]} />}
      >
        {/* Optional Child Selector for Parents */}
        {childrenList.length > 0 && (
          <View style={{ zIndex: 100, marginBottom: 16 }}>
            {renderInlineDropdown('child', 'SELECT CHILD', childrenList.map(c => ({label: c.name, value: c._id})), selectedChildId || '', (v) => { setSelectedChildId(v); fetchLeaves(authToken, v); })}
          </View>
        )}

        <TouchableOpacity style={styles.applyBtn} onPress={() => setShowApplyModal(true)} activeOpacity={0.85}>
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.applyBtnText}>Apply for Leave</Text>
        </TouchableOpacity>

        {/* STATUS COUNTERS */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { borderLeftColor: C.amber }]}>
            <View style={styles.kpiHeaderRow}>
              <Text style={styles.kpiLabel}>PENDING</Text>
              <View style={[styles.kpiIconWrap, { backgroundColor: C.amberSoft }]}><Feather name="clock" size={14} color={C.amberDark}/></View>
            </View>
            <Text style={styles.kpiValue}>{pendingCount}</Text>
          </View>

          <View style={[styles.kpiCard, { borderLeftColor: C.green }]}>
            <View style={styles.kpiHeaderRow}>
              <Text style={styles.kpiLabel}>APPROVED</Text>
              <View style={[styles.kpiIconWrap, { backgroundColor: C.greenSoft }]}><Feather name="check-circle" size={14} color={C.greenDark}/></View>
            </View>
            <Text style={styles.kpiValue}>{approvedCount}</Text>
          </View>

          <View style={[styles.kpiCard, { borderLeftColor: C.primary }]}>
            <View style={styles.kpiHeaderRow}>
              <Text style={styles.kpiLabel}>REJECTED</Text>
              <View style={[styles.kpiIconWrap, { backgroundColor: C.primarySoft }]}><Feather name="x-circle" size={14} color={C.primaryDark}/></View>
            </View>
            <Text style={styles.kpiValue}>{rejectedCount}</Text>
          </View>
        </View>

        {/* LEAVES LIST */}
        <View style={styles.sectionHeader}>
          <Feather name="history" size={16} color={C.textMuted} />
          <Text style={styles.sectionTitle}>Application History</Text>
          <View style={styles.countBadge}><Text style={styles.countBadgeText}>{leaves.length} Entries</Text></View>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={C.purpleDark} /></View>
        ) : leaves.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="calendar" size={40} color={C.textFaint} />
            <Text style={styles.emptyTitle}>No Leave Applications</Text>
            <Text style={styles.emptySubtitle}>Click "Apply for Leave" to request time off.</Text>
          </View>
        ) : (
          <View style={styles.listGrid}>
            {leaves.map((l: any, idx: number) => {
              const statusMeta = getStatusStyle(l.status);
              return (
                <View key={l._id || idx} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dateRangeText}>
                        {formatDateDisplay(l.fromDate)}
                        {l.fromDate !== l.toDate && ` → ${formatDateDisplay(l.toDate)}`}
                      </Text>
                      {l.isHalfDay && (
                        <View style={styles.halfDayBadge}><Text style={styles.halfDayText}>Half Day ({l.halfDaySession || 'First Half'})</Text></View>
                      )}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                      <Feather name={statusIcon as any} size={10} color={statusMeta.text} style={{marginRight: 4}} />
                      <Text style={[styles.statusBadgeText, { color: statusMeta.text }]}>{l.status}</Text>
                    </View>
                  </View>

                  <Text style={styles.reasonText}>{l.reason}</Text>

                  <View style={styles.cardFooter}>
                    <View style={{flex: 1}}>
                      <Text style={styles.appliedOnText}>Applied: {formatDateDisplay(l.appliedOn || l.createdAt)}</Text>
                      <Text style={styles.daysText}>{l.totalDays} {l.totalDays === 1 ? 'Day' : 'Days'}</Text>
                    </View>
                    
                    {l.status !== 'Pending' && (
                      <View style={styles.adminNoteBox}>
                        <Text style={styles.adminNoteTitle}>Admin Note:</Text>
                        <Text style={styles.adminNoteText} numberOfLines={2}>{l.comments || '—'}</Text>
                        {!!l.approvedBy && <Text style={styles.adminNoteAuthor}>By: {l.approvedBy.name || l.approvedBy.staffId}</Text>}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* APPLY LEAVE MODAL */}
      <Modal visible={showApplyModal} animationType="fade" transparent onRequestClose={() => setShowApplyModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.modalHeaderPurple}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="send" size={18} color="#fff" />
                <Text style={styles.modalTitle}>Apply for Leave</Text>
              </View>
              <TouchableOpacity onPress={() => setShowApplyModal(false)} style={styles.closeBtnIconLight} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Is this a Half-Day Leave?</Text>
                <Switch 
                  value={form.isHalfDay} 
                  onValueChange={v => setForm({...form, isHalfDay: v, toDate: v ? form.fromDate : form.toDate})} 
                  trackColor={{ false: C.border, true: C.purpleSoft }} 
                  thumbColor={form.isHalfDay ? C.purpleDark : C.textFaint} 
                />
              </View>

              {form.isHalfDay && (
                <View style={{ zIndex: 60, marginBottom: 16 }}>
                  {renderInlineDropdown('session', 'Session *', [{label:'First Half (Morning)', value:'First Half'}, {label:'Second Half (Afternoon)', value:'Second Half'}], form.halfDaySession, (v) => setForm({...form, halfDaySession: v}))}
                </View>
              )}

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>From Date *</Text>
                  <TouchableOpacity style={styles.datePickerBtnForm} onPress={() => setShowFromPicker(true)}>
                    <Text style={styles.datePickerText}>{form.fromDate.toLocaleDateString('en-GB')}</Text>
                    <Feather name="calendar" size={14} color={C.textMuted} />
                  </TouchableOpacity>
                  {showFromPicker && <DateTimePicker value={form.fromDate} mode="date" display="default" minimumDate={new Date()} onChange={(e, d) => { setShowFromPicker(Platform.OS === 'ios'); if (d) { setForm({ ...form, fromDate: d, toDate: form.isHalfDay || d > form.toDate ? d : form.toDate }); } }} />}
                </View>
                
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>To Date *</Text>
                  <TouchableOpacity style={[styles.datePickerBtnForm, form.isHalfDay && {backgroundColor: C.bg, opacity: 0.7}]} onPress={() => !form.isHalfDay && setShowToPicker(true)} disabled={form.isHalfDay}>
                    <Text style={styles.datePickerText}>{form.toDate.toLocaleDateString('en-GB')}</Text>
                    <Feather name="calendar" size={14} color={C.textMuted} />
                  </TouchableOpacity>
                  {showToPicker && <DateTimePicker value={form.toDate} mode="date" display="default" minimumDate={form.fromDate} onChange={(e, d) => { setShowToPicker(Platform.OS === 'ios'); if (d) setForm({ ...form, toDate: d }); }} />}
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Reason for Leave *</Text>
                <TextInput 
                  style={[styles.input, { height: 100, textAlignVertical: 'top' }]} 
                  multiline 
                  placeholder="Describe reason for absence (e.g. Medical, Family event)..." 
                  value={form.reason} 
                  onChangeText={t => setForm({...form, reason: t})} 
                />
              </View>

              <View style={styles.modalActionsRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowApplyModal(false)} disabled={submitting}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtnSolid} onPress={handleApplyLeave} disabled={submitting}>
                  {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnSolidText}>Submit Application</Text>}
                </TouchableOpacity>
              </View>
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
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.purpleSoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  scrollContent: { padding: 16, paddingBottom: 40 },

  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.purpleDark, paddingVertical: 14, borderRadius: 12, marginBottom: 20, elevation: 2, shadowColor: C.purpleDark, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: {width:0, height:4} },
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', marginLeft: 8 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  kpiCard: { flex: 1, minWidth: '30%', backgroundColor: C.surface, padding: 14, borderRadius: 12, borderLeftWidth: 4, elevation: 1 },
  kpiHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  kpiLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5 },
  kpiIconWrap: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 24, fontWeight: '900', color: C.text },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: C.text, marginLeft: 8, flex: 1 },
  countBadge: { backgroundColor: C.surfaceSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: C.text },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 10, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center', lineHeight: 18 },

  listGrid: { gap: 14 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  dateRangeText: { fontSize: 15, fontWeight: '800', color: C.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 4 },
  halfDayBadge: { alignSelf: 'flex-start', backgroundColor: C.blueSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#BAE6FD' },
  halfDayText: { fontSize: 10, fontWeight: '800', color: C.blueDark },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  
  reasonText: { fontSize: 14, color: C.text, fontWeight: '500', lineHeight: 22, marginBottom: 16 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  appliedOnText: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 2 },
  daysText: { fontSize: 12, fontWeight: '800', color: C.text },
  
  adminNoteBox: { flex: 1.2, backgroundColor: C.surfaceSoft, padding: 10, borderRadius: 8, marginLeft: 16 },
  adminNoteTitle: { fontSize: 10, fontWeight: '800', color: C.textMuted, marginBottom: 2 },
  adminNoteText: { fontSize: 12, color: C.text, fontWeight: '600' },
  adminNoteAuthor: { fontSize: 9, color: C.textFaint, marginTop: 4, fontStyle: 'italic' },

  // Form Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  modalHeaderPurple: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: C.purpleDark },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  closeBtnIconLight: { padding: 4, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 20 },
  formScroll: { padding: 20 },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  switchLabel: { fontSize: 13, fontWeight: '800', color: C.text },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  row: { flexDirection: 'row', marginBottom: 16 },
  
  datePickerBtnForm: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 14, color: C.text, fontWeight: '600' },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.purpleDark },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },
  textBrand: { color: C.purpleDark, fontWeight: '700' },

  modalActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  cancelBtn: { backgroundColor: C.surfaceSoft, paddingHorizontal: 20, height: 44, borderRadius: 12, justifyContent: 'center' },
  cancelBtnText: { color: C.textMuted, fontWeight: '800' },
  submitBtnSolid: { backgroundColor: C.purpleDark, paddingHorizontal: 24, height: 44, borderRadius: 12, justifyContent: 'center' },
  submitBtnSolidText: { color: '#fff', fontWeight: '800' },
});