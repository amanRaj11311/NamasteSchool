import React, { useState, useEffect, } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  ActivityIndicator, RefreshControl, Platform, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';


const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueDark: '#0284C7', blueSoft: '#E0F2FE',
  green: '#10B981', greenDark: '#059669', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberDark: '#D97706', amberSoft: '#FEF3C7',
  slate: '#64748B', slateDark: '#475569', slateSoft: '#F1F5F9',
};

export default function StudentResultsScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isParent, setIsParent] = useState(false);

  // Data States
  const [resultsData, setResultsData] = useState<any>(null);
  const [childrenList, setChildrenList] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [selectedExamKey, setSelectedExamKey] = useState<string>('');
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

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
          fetchResults(token, childRes.data.data[0]._id);
          return;
        }
      } catch (e) { console.warn("Could not fetch children"); }
    }
    
    fetchResults(token, null);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchResults = async (token: string | null = authToken, childId: string | null = selectedChildId, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params: any = {};
      if (childId) params.studentId = childId;
      const res = await axios.get(`${API_BASE}/results/my-results`, { params, ...authHeaders(token) });
      
      if (res.data?.success) {
        setResultsData(res.data);
        if (res.data.exams && res.data.exams.length > 0) {
          setSelectedExamKey(res.data.exams[0].examKey);
        } else {
          setSelectedExamKey('');
        }
      }
    } catch (err: any) { Alert.alert('Error', err.response?.data?.message || 'Failed to load exam results'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const getGradeStyle = (grade: string) => {
    const g = (grade || '').toUpperCase();
    if (['A+', 'A'].includes(g)) return { bg: C.greenSoft, text: C.greenDark };
    if (['B+', 'B'].includes(g)) return { bg: C.blueSoft, text: C.blueDark };
    if (['C', 'D'].includes(g)) return { bg: C.amberSoft, text: C.amberDark };
    return { bg: C.primarySoft, text: C.primaryDark };
  };

  const student = resultsData?.student || {};
  const exams = resultsData?.exams || [];
  const currentExam = exams.find((e: any) => String(e.examKey) === String(selectedExamKey)) || exams[0] || null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="award" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My Exam Results</Text>
          <Text style={styles.subtitle}>View your published test scores and grades.</Text>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchResults(authToken, selectedChildId, true)} colors={[C.primary]} />}
      >
        {/* Child Selector for Parents */}
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
                  <TouchableOpacity key={c._id} style={styles.dropdownItem} onPress={() => { setSelectedChildId(c._id); setActiveDropdown(null); fetchResults(authToken, c._id); }}>
                    <Text style={styles.dropdownItemText}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : exams.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="folder-minus" size={40} color={C.textFaint} />
            <Text style={styles.emptyTitle}>No Results Found</Text>
            <Text style={styles.emptySubtitle}>Your exam results will appear here once published by the administration.</Text>
          </View>
        ) : (
          <>
            {/* Exam Tabs Selector */}
            <View style={styles.tabsWrapper}>
              <Text style={styles.inputLabel}>SELECT EXAM TERM</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
                {exams.map((exam: any) => {
                  const isActive = selectedExamKey === exam.examKey;
                  return (
                    <TouchableOpacity 
                      key={exam.examKey} 
                      style={[styles.tabBtn, isActive ? styles.tabBtnActive : styles.tabBtnInactive]}
                      onPress={() => setSelectedExamKey(exam.examKey)}
                    >
                      <Text style={[styles.tabText, isActive ? styles.tabTextActive : styles.tabTextInactive]}>
                        {exam.examName} {exam.term ? `(${exam.term})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Current Exam Scorecard */}
            {currentExam && (
              <View style={styles.card}>
                {/* Scorecard Header */}
                <View style={styles.scorecardHeader}>
                  <View style={styles.badgePrimary}><Text style={styles.badgePrimaryText}>Official Marksheet</Text></View>
                  <Text style={styles.examName}>{currentExam.examName}</Text>
                  {!!currentExam.academicYear && <Text style={styles.academicYearText}>Academic Year: {currentExam.academicYear}</Text>}
                </View>

                {/* Student Info */}
                <View style={styles.studentInfoBox}>
                  <View style={styles.infoRow}>
                    <View style={styles.infoCol}><Text style={styles.infoLabel}>Student Name</Text><Text style={styles.infoVal}>{student.name || '—'}</Text></View>
                    <View style={styles.infoCol}><Text style={styles.infoLabel}>Roll No</Text><Text style={styles.infoVal}>{student.rollNo || '—'}</Text></View>
                  </View>
                  <View style={styles.infoRow}>
                    <View style={styles.infoCol}><Text style={styles.infoLabel}>Admission No</Text><Text style={styles.infoVal}>{student.admissionNo || '—'}</Text></View>
                    <View style={styles.infoCol}><Text style={styles.infoLabel}>Class / Div</Text><Text style={styles.infoVal}>{currentExam.class || student.division || '—'}</Text></View>
                  </View>
                </View>

                {/* KPI Grid */}
                <View style={styles.kpiGrid}>
                  <View style={[styles.kpiCard, { backgroundColor: C.blueSoft, borderColor: '#BAE6FD' }]}>
                    <Text style={[styles.kpiLabel, { color: C.blueDark }]}>OBTAINED MARKS</Text>
                    <Text style={[styles.kpiValue, { color: C.blueDark }]}>
                      {currentExam.totalMarksObtained} <Text style={styles.kpiSub}>/ {currentExam.totalMaxMarks}</Text>
                    </Text>
                  </View>
                  <View style={[styles.kpiCard, { backgroundColor: C.greenSoft, borderColor: '#A7F3D0' }]}>
                    <Text style={[styles.kpiLabel, { color: C.greenDark }]}>PERCENTAGE</Text>
                    <Text style={[styles.kpiValue, { color: C.greenDark }]}>{currentExam.overallPercent}%</Text>
                  </View>
                  <View style={[styles.kpiCard, { backgroundColor: C.amberSoft, borderColor: '#FDE68A' }]}>
                    <Text style={[styles.kpiLabel, { color: C.amberDark }]}>OVERALL GRADE</Text>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4}}>
                      <View style={[styles.gradePill, { backgroundColor: getGradeStyle(currentExam.overallGrade).bg }]}>
                        <Text style={[styles.gradePillText, { color: getGradeStyle(currentExam.overallGrade).text }]}>{currentExam.overallGrade || '—'}</Text>
                      </View>
                      <View style={[styles.passPill, { backgroundColor: currentExam.isAllPass ? C.green : C.primary }]}>
                        <Text style={styles.passPillText}>{currentExam.status}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Subject List */}
                <View style={styles.subjectsContainer}>
                  <Text style={styles.subjectSectionTitle}>SUBJECT PERFORMANCE</Text>
                  {(currentExam.subjects || []).map((sub: any, idx: number) => {
                    const gradeColors = getGradeStyle(sub.grade);
                    return (
                      <View key={idx} style={[styles.subjectRow, !sub.isPass && styles.subjectRowFail]}>
                        <View style={styles.subjectRowTop}>
                          <Text style={styles.subjectName}>{sub.subject}</Text>
                          <Text style={styles.subjectMarks}>{sub.marksObtained} <Text style={styles.subjectMax}>/ {sub.maxMarks}</Text></Text>
                        </View>
                        
                        <View style={styles.subjectRowBottom}>
                          <View style={{flexDirection: 'row', gap: 6}}>
                            <View style={[styles.microBadge, { backgroundColor: gradeColors.bg }]}><Text style={[styles.microBadgeText, { color: gradeColors.text }]}>Grade {sub.grade || '—'}</Text></View>
                            <View style={[styles.microBadge, { backgroundColor: sub.isPass ? C.greenSoft : C.primarySoft }]}><Text style={[styles.microBadgeText, { color: sub.isPass ? C.greenDark : C.primaryDark }]}>{sub.isPass ? 'PASS' : 'FAIL'}</Text></View>
                          </View>
                          <Text style={styles.subjectPercent}>{sub.percent}%</Text>
                        </View>
                        
                        {!!sub.remarks && <Text style={styles.subjectRemarks}>Note: {sub.remarks}</Text>}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
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

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center', lineHeight: 18 },

  tabsWrapper: { marginBottom: 20 },
  tabsScroll: { gap: 10 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  tabBtnActive: { backgroundColor: C.primary, borderColor: C.primary, elevation: 2 },
  tabBtnInactive: { backgroundColor: C.surface, borderColor: C.border },
  tabText: { fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  tabTextInactive: { color: C.textMuted },

  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, elevation: 1, overflow: 'hidden', padding: 16 },
  scorecardHeader: { alignItems: 'center', borderBottomWidth: 1, borderColor: C.border, paddingBottom: 16, marginBottom: 16 },
  badgePrimary: { backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  badgePrimaryText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  examName: { fontSize: 20, fontWeight: '900', color: C.text, textAlign: 'center' },
  academicYearText: { fontSize: 12, color: C.textMuted, fontWeight: '600', marginTop: 4 },

  studentInfoBox: { backgroundColor: C.surfaceSoft, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  infoCol: { flex: 1 },
  infoLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', marginBottom: 2 },
  infoVal: { fontSize: 14, fontWeight: '700', color: C.text },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  kpiCard: { flex: 1, minWidth: '30%', padding: 14, borderRadius: 12, borderWidth: 1 },
  kpiLabel: { fontSize: 9.5, fontWeight: '800', marginBottom: 4, letterSpacing: 0.5 },
  kpiValue: { fontSize: 22, fontWeight: '900', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  kpiSub: { fontSize: 14, fontWeight: '600', color: 'rgba(0,0,0,0.4)' },
  
  gradePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  gradePillText: { fontSize: 11, fontWeight: '800' },
  passPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  passPillText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  subjectsContainer: { marginTop: 10 },
  subjectSectionTitle: { fontSize: 11, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 10, borderBottomWidth: 1, borderColor: C.border, paddingBottom: 6 },
  
  subjectRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  subjectRowFail: { backgroundColor: C.primarySoft, marginHorizontal: -16, paddingHorizontal: 16 },
  subjectRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  subjectName: { fontSize: 15, fontWeight: '800', color: C.text },
  subjectMarks: { fontSize: 16, fontWeight: '900', color: C.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  subjectMax: { fontSize: 12, fontWeight: '600', color: C.textMuted },
  
  subjectRowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  microBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  microBadgeText: { fontSize: 10, fontWeight: '800' },
  subjectPercent: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  subjectRemarks: { fontSize: 11, color: C.textMuted, fontStyle: 'italic', marginTop: 6 },

  // Dropdown for Child Selection
  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, backgroundColor: C.surface },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '700' },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '600' },
});