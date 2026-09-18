import React, { useState, useEffect,useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, Modal, KeyboardAvoidingView, Platform, FlatList, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
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

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
};

const isOverdue = (dueDate: string, dueTime = '23:59') => {
  if (!dueDate) return false;
  return new Date() > new Date(`${dueDate}T${dueTime}:00`);
};

export default function StudentHomeworkScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isParent, setIsParent] = useState(false);

  // Data States
  const [homeworkData, setHomeworkData] = useState<any>(null);
  const [childrenList, setChildrenList] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  
  // UI & List States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Modals
  const [submittingHw, setSubmittingHw] = useState<any>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingSubmission, setViewingSubmission] = useState<any>(null);

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
          fetchHomework(token, childRes.data.data[0]._id);
          return;
        }
      } catch (e) { console.warn("Could not fetch children"); }
    }
    
    fetchHomework(token, null);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchHomework = async (token: string | null = authToken, childId: string | null = selectedChildId, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params: any = {};
      if (childId) params.studentId = childId;
      const res = await axios.get(`${API_BASE}/homework/my-student-homework`, { params, ...authHeaders(token) });
      if (res.data?.success) setHomeworkData(res.data);
    } catch (err: any) { Alert.alert('Error', err.response?.data?.message || 'Failed to load homework'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const handleOpenSubmit = (hw: any) => {
    setSubmittingHw(hw);
    setTextAnswer(hw.mySubmission?.textAnswer || '');
  };

  const handleSubmitHomework = async () => {
    if (!textAnswer.trim()) { Alert.alert('Error', 'Please enter your answer before submitting.'); return; }
    if (!submittingHw) return;

    setIsSubmitting(true);
    try {
      await axios.post(`${API_BASE}/homework/${submittingHw._id}/student-submit`, {
        textAnswer, files: [], ...(selectedChildId ? { studentId: selectedChildId } : {})
      }, authHeaders(authToken));
      
      Alert.alert('Success', 'Homework submitted successfully!');
      setSubmittingHw(null);
      setTextAnswer('');
      fetchHomework(authToken, selectedChildId, true);
    } catch (err: any) { Alert.alert('Error', err.response?.data?.message || 'Failed to submit homework'); } 
    finally { setIsSubmitting(false); }
  };

  const homeworkList = homeworkData?.homeworks || [];
  const subjects = Array.from(new Set(homeworkList.map((h: any) => h.subjectName || h.subjectId?.name).filter(Boolean)));

  const filteredHomeworks = useMemo(() => {
    return homeworkList.filter((hw: any) => {
      const sName = hw.subjectName || hw.subjectId?.name;
      const matchesSubject = subjectFilter === 'All' || sName === subjectFilter;

      let matchesStatus = true;
      if (statusFilter === 'Pending') matchesStatus = !hw.hasSubmitted;
      else if (statusFilter === 'Submitted') matchesStatus = hw.hasSubmitted && hw.submissionStatus !== 'checked';
      else if (statusFilter === 'Checked') matchesStatus = hw.submissionStatus === 'checked';

      const matchesSearch = !searchQuery || 
        hw.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        hw.description?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        sName?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesSubject && matchesStatus && matchesSearch;
    });
  }, [homeworkList, subjectFilter, statusFilter, searchQuery]);

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
        <View style={styles.headerIconBadge}><Feather name="edit-3" size={20} color={C.blueDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Homework Portal</Text>
          <Text style={styles.subtitle}>Complete tasks & submit answers online.</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        {/* Child Selector for Parents */}
        {childrenList.length > 0 && (
          <View style={{ zIndex: 100, marginBottom: 12 }}>
            {renderInlineDropdown('child', 'SELECT CHILD', childrenList.map(c => ({label: c.name, value: c._id})), selectedChildId || '', (v) => { setSelectedChildId(v); fetchHomework(authToken, v); })}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 10, zIndex: 50 }}>
          <View style={styles.searchContainer}>
            <Feather name="search" size={16} color={C.textFaint} />
            <TextInput style={styles.searchInput} placeholder="Search tasks..." value={searchQuery} onChangeText={setSearchQuery} />
          </View>
          <View style={{ flex: 0.8 }}>
            {renderInlineDropdown('subject', '', [{label: 'All Subjects', value: 'All'}, ...subjects.map((s: any) => ({label: s, value: s}))], subjectFilter, setSubjectFilter)}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
          {['All', 'Pending', 'Submitted', 'Checked'].map((st) => (
            <TouchableOpacity key={st} style={[styles.filterPill, statusFilter === st ? styles.filterPillActive : styles.filterPillInactive]} onPress={() => setStatusFilter(st)}>
              <Text style={[styles.filterPillText, statusFilter === st ? styles.filterPillTextActive : styles.filterPillTextInactive]}>{st}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.blueDark} /></View>
      ) : filteredHomeworks.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="check-circle" size={40} color={C.textFaint} />
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptySubtitle}>No homework tasks matching your current filters.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredHomeworks}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchHomework(authToken, selectedChildId, true)} colors={[C.blueDark]} />}
          renderItem={({ item }) => {
            const overdue = isOverdue(item.dueDate, item.dueTime);
            const isChecked = item.submissionStatus === 'checked';
            const isSubmitted = item.hasSubmitted;

            let statusColor = C.amber; let statusBg = C.amberSoft; let statusIcon = 'clock'; let statusText = 'Pending';
            if (isChecked) { statusColor = C.greenDark; statusBg = C.greenSoft; statusIcon = 'check-double'; statusText = `Graded (${item.mySubmission?.marks}/${item.maxMarks})`; }
            else if (isSubmitted) { statusColor = C.blueDark; statusBg = C.blueSoft; statusIcon = 'check'; statusText = 'Submitted'; }
            else if (overdue) { statusColor = C.primaryDark; statusBg = C.primarySoft; statusIcon = 'alert-triangle'; statusText = 'Overdue'; }

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.subjectBadge}><Text style={styles.subjectBadgeText}>{item.subjectName || item.subjectId?.name || 'General'}</Text></View>
                  <View style={[styles.statusBadge, { backgroundColor: statusBg }]}><Feather name={statusIcon as any} size={10} color={statusColor} style={{marginRight:4}} /><Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text></View>
                </View>

                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDesc} numberOfLines={3}>{item.description || 'No additional instructions.'}</Text>

                <View style={styles.metaBox}>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLbl}>Due Date:</Text>
                    <Text style={[styles.metaVal, (overdue && !isSubmitted) && { color: C.primaryDark }]}>{formatDateDisplay(item.dueDate)} {item.dueTime ? `@ ${item.dueTime}` : ''}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLbl}>Max Marks:</Text>
                    <Text style={styles.metaVal}>{item.maxMarks || 10} pts</Text>
                  </View>
                </View>

                {isChecked && item.mySubmission?.teacherComment && (
                  <View style={styles.feedbackBox}>
                    <Text style={styles.feedbackTitle}><Feather name="message-circle" size={12} color={C.greenDark} /> Teacher Feedback:</Text>
                    <Text style={styles.feedbackText}>{item.mySubmission.teacherComment}</Text>
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <Text style={styles.authorText}>By: {item.createdBy?.name || 'Class Teacher'}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {isSubmitted && (
                      <TouchableOpacity style={styles.viewBtn} onPress={() => setViewingSubmission(item)}>
                        <Feather name="eye" size={14} color={C.blueDark} /><Text style={styles.viewBtnText}>View</Text>
                      </TouchableOpacity>
                    )}
                    {!isChecked && (
                      <TouchableOpacity style={isSubmitted ? styles.actionBtnOutline : styles.actionBtnSolid} onPress={() => handleOpenSubmit(item)}>
                        <Text style={isSubmitted ? styles.actionBtnOutlineText : styles.actionBtnSolidText}>{isSubmitted ? 'Edit Answer' : 'Submit Now'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* SUBMIT HOMEWORK MODAL */}
      <Modal visible={!!submittingHw} animationType="fade" transparent onRequestClose={() => setSubmittingHw(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.modalHeaderBlue}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <View style={styles.modalSubjectBadge}><Text style={styles.modalSubjectBadgeText}>{submittingHw?.subjectName || 'Homework'}</Text></View>
                <Text style={styles.modalTitle} numberOfLines={2}>{submittingHw?.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setSubmittingHw(null)} disabled={isSubmitting} style={styles.closeBtnIconLight} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text style={{ fontSize: 18, color: '#fff' }}>✕</Text></TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              {submittingHw?.description && (
                <View style={styles.instructionBox}>
                  <Text style={styles.instructionTitle}>Teacher Instructions:</Text>
                  <Text style={styles.instructionText}>{submittingHw.description}</Text>
                </View>
              )}

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Your Answer / Solution *</Text>
                <TextInput 
                  style={[styles.input, { height: 160, textAlignVertical: 'top' }]} 
                  multiline 
                  placeholder="Type your homework answer or solution here..." 
                  value={textAnswer} 
                  onChangeText={setTextAnswer} 
                />
              </View>

              <View style={styles.modalActionsRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setSubmittingHw(null)} disabled={isSubmitting}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtnSolid} onPress={handleSubmitHomework} disabled={isSubmitting}>
                  {isSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnSolidText}>Submit Answer</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* VIEW SUBMISSION MODAL */}
      <Modal visible={!!viewingSubmission} animationType="fade" transparent onRequestClose={() => setViewingSubmission(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View style={{ flex: 1 }}>
                <View style={[styles.subjectBadge, { alignSelf: 'flex-start', marginBottom: 6 }]}><Text style={styles.subjectBadgeText}>Submitted Answer</Text></View>
                <Text style={styles.formTitle} numberOfLines={1}>{viewingSubmission?.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setViewingSubmission(null)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.metaRowSmall}>
                <Text style={styles.metaLblSmall}>Submitted On:</Text>
                <Text style={styles.metaValSmall}>{formatDateDisplay(viewingSubmission?.mySubmission?.submittedAt)}</Text>
              </View>

              <View style={styles.answerBox}>
                <Text style={styles.answerBoxTitle}>Your Submitted Answer:</Text>
                <Text style={styles.answerBoxText}>{viewingSubmission?.mySubmission?.textAnswer || 'No text answer submitted.'}</Text>
              </View>

              {viewingSubmission?.mySubmission?.status === 'checked' && (
                <View style={styles.gradingBox}>
                  <View style={styles.gradingHeaderRow}>
                    <Text style={styles.gradingTitle}>Grade / Score:</Text>
                    <View style={styles.gradingBadge}><Text style={styles.gradingBadgeText}>{viewingSubmission.mySubmission.marks} / {viewingSubmission.maxMarks}</Text></View>
                  </View>
                  {!!viewingSubmission.mySubmission.teacherComment && (
                    <Text style={styles.gradingFeedback}><Text style={{fontWeight: '800'}}>Teacher Feedback:</Text> {viewingSubmission.mySubmission.teacherComment}</Text>
                  )}
                </View>
              )}
            </ScrollView>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.doneBtnFull} onPress={() => setViewingSubmission(null)}>
                <Text style={styles.doneBtnFullText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.blueSoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text },
  filterPillsScroll: { gap: 8, marginTop: 12 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterPillActive: { backgroundColor: C.blueDark, borderColor: C.blueDark },
  filterPillInactive: { backgroundColor: C.surface, borderColor: C.border },
  filterPillText: { fontSize: 12, fontWeight: '700' },
  filterPillTextActive: { color: '#fff' },
  filterPillTextInactive: { color: C.textMuted },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  subjectBadge: { backgroundColor: C.blueSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  subjectBadgeText: { fontSize: 10, fontWeight: '800', color: C.blueDark },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: C.textMuted, lineHeight: 20, marginBottom: 14 },
  
  metaBox: { backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 8, gap: 6, marginBottom: 14 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLbl: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  metaVal: { fontSize: 12, fontWeight: '800', color: C.text },

  feedbackBox: { backgroundColor: C.greenSoft, padding: 12, borderRadius: 8, marginBottom: 14, borderWidth: 1, borderColor: '#A7F3D0' },
  feedbackTitle: { fontSize: 11, fontWeight: '800', color: C.greenDark, marginBottom: 4 },
  feedbackText: { fontSize: 13, color: C.text, fontWeight: '500' },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  authorText: { fontSize: 11, fontWeight: '600', color: C.textMuted },
  viewBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 4 },
  viewBtnText: { color: C.blueDark, fontSize: 12, fontWeight: '800' },
  actionBtnOutline: { borderWidth: 1, borderColor: C.blueDark, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  actionBtnOutlineText: { color: C.blueDark, fontSize: 12, fontWeight: '800' },
  actionBtnSolid: { backgroundColor: C.blueDark, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  actionBtnSolidText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Dropdown
  inputWrapper: { marginBottom: 0 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.blueDark },
  dropdownSelectedText: { fontSize: 13, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 13, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6 },
  dropdownItem: { padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },
  textBrand: { color: C.blueDark, fontWeight: '700' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  modalHeaderBlue: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 20, backgroundColor: C.blueDark },
  modalSubjectBadge: { backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  modalSubjectBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#fff', lineHeight: 24 },
  closeBtnIconLight: { padding: 4, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 20 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  closeBtnIcon: { padding: 6, backgroundColor: C.border, borderRadius: 20 },
  formScroll: { padding: 20 },

  instructionBox: { backgroundColor: C.surfaceSoft, padding: 14, borderRadius: 12, marginBottom: 20 },
  instructionTitle: { fontSize: 12, fontWeight: '800', color: C.text, marginBottom: 4 },
  instructionText: { fontSize: 13, color: C.textMuted, lineHeight: 20 },

  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingTop: 14, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  
  modalActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  cancelBtn: { backgroundColor: C.surfaceSoft, paddingHorizontal: 20, height: 44, borderRadius: 12, justifyContent: 'center' },
  cancelBtnText: { color: C.textMuted, fontWeight: '800' },
  submitBtnSolid: { backgroundColor: C.blueDark, paddingHorizontal: 24, height: 44, borderRadius: 12, justifyContent: 'center' },
  submitBtnSolidText: { color: '#fff', fontWeight: '800' },

  metaRowSmall: { marginBottom: 16 },
  metaLblSmall: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 2 },
  metaValSmall: { fontSize: 14, fontWeight: '800', color: C.text },
  
  answerBox: { marginBottom: 20 },
  answerBoxTitle: { fontSize: 12, fontWeight: '800', color: C.textMuted, marginBottom: 6 },
  answerBoxText: { backgroundColor: C.surfaceSoft, padding: 14, borderRadius: 12, fontSize: 14, color: C.text, lineHeight: 22 },

  gradingBox: { backgroundColor: C.greenSoft, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#A7F3D0' },
  gradingHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  gradingTitle: { fontSize: 13, fontWeight: '800', color: C.greenDark },
  gradingBadge: { backgroundColor: C.greenDark, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  gradingBadgeText: { fontSize: 12, fontWeight: '900', color: '#fff', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  gradingFeedback: { fontSize: 13, color: C.text, lineHeight: 20 },

  modalFooter: { padding: 16, borderTopWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSoft },
  doneBtnFull: { backgroundColor: '#111827', height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  doneBtnFullText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});