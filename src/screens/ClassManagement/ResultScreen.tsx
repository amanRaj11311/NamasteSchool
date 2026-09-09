import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList,
  ScrollView, Alert, ActivityIndicator, RefreshControl, Linking, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import DocumentPicker from '@react-native-documents/picker';
import axios from 'axios';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';

// Premium Color Palette aligning with Web's "Danger" (Red) theme
const C = {
  bg: '#F8FAFC',          // Soft slate background
  surface: '#FFFFFF',     // Clean white cards
  surfaceSoft: '#F1F5F9', // Subtle gray for inputs
  border: '#E2E8F0',      // Soft borders
  text: '#0F172A',        // Deep slate for primary text
  textMuted: '#64748B',   // Muted slate
  textFaint: '#94A3B8',
  primary: '#E11D48',     // Rose/Red matching web's btn-danger
  primaryDark: '#BE123C',
  primarySoft: '#FFE4E6',
  blue: '#0284C7',
  blueSoft: '#E0F2FE',
  green: '#10B981',
  greenSoft: '#D1FAE5',
  amber: '#F59E0B',
  amberSoft: '#FEF3C7',
  slate: '#334155',
};

type ParamList = { ClassResults: { classId: string }; ClassExams: { classId: string } };

export default function ClassResultsScreen() {
  const route = useRoute<RouteProp<ParamList, 'ClassResults'>>();
  const navigation = useNavigation<any>();
  const classId = route.params?.classId;

  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [classInfo, setClassInfo] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [examResults, setExamResults] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);

  const [selectedExamId, setSelectedExamId] = useState('');
  const [tab, setTab] = useState<'annual' | 'entry'>('annual');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [computing, setComputing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchResults(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchResults = async (token: string | null = authToken, isRefresh = false) => {
    if (!classId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);

    try {
      const [clsRes, resData, examsRes] = await Promise.all([
        axios.get(`${BASE_URL}/classes/${classId}`, authHeaders(token)),
        axios.get(`${BASE_URL}/promotions/results/class/${classId}`, authHeaders(token)).catch(() => ({ data: {} })),
        axios.get(`${BASE_URL}/exams?classId=${classId}`, authHeaders(token)).catch(() => ({ data: {} })),
      ]);

      if (clsRes.data?.data) setClassInfo(clsRes.data.data);
      if (resData.data?.data) setResults(Array.isArray(resData.data.data) ? resData.data.data : []);
      const examList = examsRes.data?.data || [];
      setExams(Array.isArray(examList) ? examList : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchExamSheet = useCallback(async () => {
    if (!classId || !selectedExamId || !authToken) {
      setExamResults([]);
      return;
    }
    setLoading(true);
    try {
      const exam = exams.find((e) => String(e._id || e.id) === String(selectedExamId));
      const res = await axios.get(`${BASE_URL}/results/sheet/${classId}`, {
        params: { examId: selectedExamId, subject: exam?.subject, division: classInfo?.division || undefined },
        ...authHeaders(authToken)
      });
      setExamResults(res.data?.data?.sheet || []);
    } catch (err) {
      console.error(err);
      setExamResults([]);
    } finally {
      setLoading(false);
    }
  }, [classId, selectedExamId, exams, classInfo, authToken]);

  useEffect(() => {
    if (tab === 'entry') fetchExamSheet();
  }, [tab, fetchExamSheet]);

  const handleCompute = async () => {
    setComputing(true);
    try {
      await axios.post(`${BASE_URL}/promotions/results/class/${classId}/compute`, {}, authHeaders(authToken));
      Alert.alert('Success', 'Class results computed from completed exams.');
      fetchResults(authToken, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to compute'); }
    finally { setComputing(false); }
  };

  const handleFinalize = () => {
    Alert.alert('Finalize Results', 'Are you sure? This will lock the results permanently.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finalize & Lock', style: 'destructive', onPress: async () => {
          setFinalizing(true);
          try {
            await axios.post(`${BASE_URL}/promotions/results/class/${classId}/finalize`, {}, authHeaders(authToken));
            Alert.alert('Success', 'Class results locked & finalized');
            fetchResults(authToken, true);
          } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to finalize'); }
          finally { setFinalizing(false); }
      }}
    ]);
  };

  const handlePublish = async () => {
    if (!selectedExamId) { Alert.alert('Error', 'Select an exam first'); return; }
    setPublishing(true);
    try {
      const res = await axios.post(`${BASE_URL}/results/publish`, { classId, examId: selectedExamId, division: classInfo?.division || undefined }, authHeaders(authToken));
      Alert.alert('Success', res.data?.message || 'Results published');
      fetchExamSheet();
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Publish failed'); }
    finally { setPublishing(false); }
  };

  // Matches web's GET /results/format params exactly (including `division`,
  // which the previous mobile version was missing) and URL-encodes every
  // value so class/subject names with spaces or symbols don't break the link.
  const handleDownloadFormat = () => {
    const exam = exams.find((e) => String(e._id || e.id) === String(selectedExamId));
    const qs = new URLSearchParams({
      classId: String(classId || ''),
      examId: String(selectedExamId || ''),
      subject: String(exam?.subject || ''),
      maxMarks: String(exam?.maxMarks || 100),
      className: String(classInfo?.className || ''),
      division: String(classInfo?.division || ''),
      token: String(authToken || ''),
    }).toString();
    const url = `${BASE_URL}/results/format?${qs}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Failed to open download link'));
  };

  const handleExcelUpload = async () => {
    if (!selectedExamId) { Alert.alert('Error', 'Please select an exam first'); return; }
    try {
      // Matches web's accept=".xlsx,.xls,.csv" — the previous mobile version
      // only allowed xls/xlsx and silently rejected CSV uploads.
      const res = await DocumentPicker.pick({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/csv', // .csv
          'text/comma-separated-values',
        ],
      });
      const file = { uri: res[0].uri, type: res[0].type, name: res[0].name };

      const exam = exams.find((e) => String(e._id || e.id) === String(selectedExamId));
      const fd = new FormData();
      fd.append('file', file as any);
      fd.append('classId', classId);
      fd.append('examId', selectedExamId);
      if (classInfo?.division) fd.append('division', classInfo.division);
      fd.append('subject', exam?.subject || '');
      fd.append('maxMarks', String(exam?.maxMarks || 100));
      fd.append('passMarks', String(exam?.passMarks || 33));
      fd.append('status', 'Draft');

      setUploading(true);
      const uploadRes = await axios.post(`${BASE_URL}/results/bulk-excel`, fd, {
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'multipart/form-data' }
      });

      const s = uploadRes.data?.summary;
      Alert.alert('Success', s ? `Uploaded: ${s.saved} saved, ${s.failed} failed` : 'Upload complete');
      fetchExamSheet();
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) Alert.alert('Error', err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const isAllFinalized = results.length > 0 && results.every((r) => r.isFinal);

  const renderInlineDropdown = (fieldKey: string, label: string, options: {label: string, value: string}[], value: string, onSelect: (v: string) => void) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || '— Choose scheduled exam —'}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
              {options.length === 0 ? (
                <View style={styles.dropdownItem}>
                  <Text style={[styles.dropdownItemText, { color: C.textFaint }]}>No scheduled exams found</Text>
                </View>
              ) : options.map((opt, i) => (
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color={C.text} />
          </TouchableOpacity>
          <View style={styles.headerIconBadge}>
            <Feather name="bar-chart-2" size={20} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Class Results</Text>
            <Text style={styles.subtitle}>
              {classInfo ? `${classInfo.className} ${classInfo.division ? `(${classInfo.division})` : ''}` : 'Loading...'}
            </Text>
          </View>
        </View>

        <View style={styles.badgeRow}>
          {/* Global Status Badge for Annual Tab */}
          {tab === 'annual' && results.length > 0 && (
            <View style={[styles.globalBadge, { backgroundColor: isAllFinalized ? C.text : C.amberSoft }]}>
              <Feather name={isAllFinalized ? "lock" : "edit-3"} size={12} color={isAllFinalized ? '#fff' : C.amber} />
              <Text style={[styles.globalBadgeText, { color: isAllFinalized ? '#fff' : C.amber }]}>
                {isAllFinalized ? 'LOCKED & FINALIZED' : 'DRAFT MODE'}
              </Text>
            </View>
          )}
          {tab === 'annual' && results.length > 0 && (
            <View style={styles.countBadge}>
              <Feather name="users" size={12} color={C.textMuted} />
              <Text style={styles.countBadgeText}>{results.length} student{results.length !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, tab === 'annual' && styles.tabBtnActive]} onPress={() => setTab('annual')}>
            <Text style={[styles.tabText, tab === 'annual' && styles.tabTextActive]}>Annual Matrix</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'entry' && styles.tabBtnActive]} onPress={() => setTab('entry')}>
            <Text style={[styles.tabText, tab === 'entry' && styles.tabTextActive]}>Marks Entry / Excel</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ------------------ ANNUAL MATRIX TAB ------------------ */}
      {tab === 'annual' && (
        <>
          <View style={styles.actionBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
              <TouchableOpacity style={styles.actionBtnOutline} onPress={handleCompute} disabled={computing}>
                {computing ? <ActivityIndicator color={C.primary} size="small" /> : <><Feather name="cpu" size={16} color={C.primary} /><Text style={styles.actionBtnOutlineText}>Compute Results</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtnSolid} onPress={handleFinalize} disabled={finalizing}>
                {finalizing ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="lock" size={16} color="#fff" /><Text style={styles.actionBtnSolidText}>Finalize & Lock</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtnNeutral} onPress={() => navigation.navigate('ClassExams', { classId })}>
                <Feather name="pen-tool" size={16} color={C.textMuted} /><Text style={styles.actionBtnNeutralText}>Class Exams</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
          ) : results.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="pie-chart" size={40} color={C.primarySoft} />
              </View>
              <Text style={styles.emptyTitle}>No Computed Results</Text>
              <Text style={styles.emptySubtitle}>Enter marks via Marks Entry tab or Class Exams, then compute annual results to view them here.</Text>
              <TouchableOpacity style={[styles.actionBtnSolid, { marginTop: 20 }]} onPress={handleCompute}>
                <Text style={styles.actionBtnSolidText}>Compute Class Results Now</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={item => item._id || item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchResults(authToken, true)} colors={[C.primary]} tintColor={C.primary} />}
              renderItem={({ item }) => {
                const stu = item.studentId || {};
                return (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.studentName}>{stu.name || '—'}</Text>
                        <Text style={styles.rollText}>Roll No: {stu.rollNo || '—'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.percentText, item.overallPercent >= 33 ? {color: C.green} : {color: C.primary}]}>{item.overallPercent ?? 0}%</Text>
                        <Text style={styles.marksSub}>{item.overallObtained ?? 0} / {item.overallMaxMarks ?? 0}</Text>
                      </View>
                    </View>

                    <Text style={styles.subjectsLabel}>SUBJECTS & MARKS</Text>
                    <View style={styles.subjectsGrid}>
                      {(item.subjects || []).map((s: any, i: number) => (
                        <View key={i} style={[styles.subjBadge, { backgroundColor: s.isPass ? C.greenSoft : C.primarySoft }]}>
                          <Text style={[styles.subjBadgeText, { color: s.isPass ? C.green : C.primary }]}>{s.subject}: {s.percent}%</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.cardFooter}>
                      <View style={styles.footerCol}>
                        <Text style={styles.footerLbl}>ELIGIBLE</Text>
                        <View style={[styles.statusPill, { backgroundColor: item.isEligibleForPromotion ? C.green : C.textMuted }]}>
                          <Text style={styles.statusPillText}>{item.isEligibleForPromotion ? 'Yes' : 'No'}</Text>
                        </View>
                      </View>
                      <View style={[styles.footerCol, { alignItems: 'flex-end' }]}>
                        <Text style={styles.footerLbl}>STATUS</Text>
                        <View style={[styles.statusPill, { backgroundColor: item.isFinal ? C.text : C.amber }]}>
                          <Text style={styles.statusPillText}>{item.isFinal ? 'FINAL' : 'DRAFT'}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </>
      )}

      {/* ------------------ MARKS ENTRY TAB ------------------ */}
      {tab === 'entry' && (
        <View style={{ flex: 1 }}>
          <View style={styles.entryConfigBar}>
            <View style={{ zIndex: 10 }}>
              {renderInlineDropdown('examSlot', 'SELECT EXAM SLOT', exams.map(ex => ({ label: `${ex.title || ex.examName} (${ex.subject}) — ${ex.date}`, value: ex._id || ex.id })), selectedExamId, setSelectedExamId)}
            </View>

            <View style={styles.entryActionsRow}>
              <TouchableOpacity style={[styles.entryActionBtn, { backgroundColor: C.surface, borderColor: C.green }]} disabled={!selectedExamId} onPress={handleDownloadFormat}>
                <Feather name="download-cloud" size={16} color={C.green} /><Text style={[styles.entryActionText, { color: C.green }]}>Format</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.entryActionBtn, { backgroundColor: C.surface, borderColor: C.blue }]} disabled={!selectedExamId || uploading} onPress={handleExcelUpload}>
                {uploading ? <ActivityIndicator size="small" color={C.blue} /> : <><Feather name="upload-cloud" size={16} color={C.blue} /><Text style={[styles.entryActionText, { color: C.blue }]}>Upload Excel</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.entryActionBtn, { backgroundColor: C.primary, borderColor: C.primary }]} disabled={!selectedExamId || publishing} onPress={handlePublish}>
                {publishing ? <ActivityIndicator size="small" color="#fff" /> : <><Feather name="send" size={16} color="#fff" /><Text style={[styles.entryActionText, { color: '#fff' }]}>Publish</Text></>}
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
          ) : !selectedExamId ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="inbox" size={40} color={C.textFaint} />
              </View>
              <Text style={styles.emptyTitle}>Select an Exam</Text>
              <Text style={styles.emptySubtitle}>Choose a scheduled exam from the dropdown above to view or upload marks.</Text>
            </View>
          ) : examResults.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="file-text" size={40} color={C.textFaint} />
              </View>
              <Text style={styles.emptyTitle}>No Marks Entered</Text>
              <Text style={styles.emptySubtitle}>Download the format, fill in the marks, and upload the Excel file.</Text>
            </View>
          ) : (
            <FlatList
              data={examResults}
              keyExtractor={(item, index) => item.studentId || item.rollNo || index.toString()}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchExamSheet} colors={[C.primary]} tintColor={C.primary} />}
              renderItem={({ item }) => {
                const hasRes = !!item.result;
                const isPass = hasRes && item.result.isPass;
                return (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.studentName}>{item.name || '—'}</Text>
                        <Text style={styles.rollText}>Roll: {item.rollNo || '—'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.percentText, hasRes ? {color: C.text} : {color: C.textFaint}]}>{hasRes ? `${item.result.percent}%` : 'N/A'}</Text>
                        <Text style={styles.marksSub}>{hasRes ? `${item.result.marksObtained} / ${item.result.maxMarks}` : '—'}</Text>
                      </View>
                    </View>

                    <View style={styles.metaGrid}>
                      <View style={styles.metaRow}><Text style={styles.metaLbl}>Grade</Text><Text style={styles.metaVal}>{hasRes ? item.result.grade : '—'}</Text></View>
                      <View style={[styles.metaRow, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border }]}><Text style={styles.metaLbl}>Status</Text><Text style={styles.metaVal}>{item.result?.status || 'Not entered'}</Text></View>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaLbl}>Result</Text>
                        {hasRes ? (
                          <View style={[styles.smallBadge, { backgroundColor: isPass ? C.greenSoft : C.primarySoft }]}><Text style={[styles.smallBadgeText, { color: isPass ? C.green : C.primary }]}>{isPass ? 'PASS' : 'FAIL'}</Text></View>
                        ) : <Text style={styles.metaVal}>—</Text>}
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Premium Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn: { padding: 4, marginRight: -4 },
  headerIconBadge: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: C.textMuted, marginTop: 4, fontWeight: '500' },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  globalBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  globalBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surfaceSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  countBadgeText: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5 },

  filterSection: { paddingHorizontal: 16, paddingTop: 16, backgroundColor: C.bg },
  tabContainer: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 4, borderRadius: 14 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10 },
  tabBtnActive: { backgroundColor: C.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  tabTextActive: { color: C.primary },

  actionBar: { paddingVertical: 16, backgroundColor: C.bg },
  actionBtnOutline: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 2, elevation: 1 },
  actionBtnOutlineText: { color: C.text, fontSize: 13, fontWeight: '700' },
  actionBtnSolid: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, gap: 8, shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  actionBtnSolidText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionBtnNeutral: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, gap: 8 },
  actionBtnNeutralText: { color: C.textMuted, fontSize: 13, fontWeight: '700' },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  emptySubtitle: { fontSize: 14, color: C.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 22 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 4 },
  card: { backgroundColor: C.surface, borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: C.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  studentName: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 4 },
  rollText: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
  percentText: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  marksSub: { fontSize: 12, color: C.textMuted, fontWeight: '700', marginTop: 4, textAlign: 'right' },

  subjectsLabel: { fontSize: 10, fontWeight: '800', color: C.textFaint, letterSpacing: 1, marginBottom: 10 },
  subjectsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  subjBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  subjBadgeText: { fontSize: 11, fontWeight: '800' },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: C.border, paddingTop: 16 },
  footerCol: { flex: 1 },
  footerLbl: { fontSize: 10, color: C.textFaint, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  // Marks Entry
  entryConfigBar: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  entryActionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  entryActionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, height: 44, borderRadius: 12, gap: 8 },
  entryActionText: { fontSize: 13, fontWeight: '700' },

  metaGrid: { flexDirection: 'row', backgroundColor: C.surfaceSoft, paddingVertical: 12, borderRadius: 12, marginTop: 16 },
  metaRow: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metaLbl: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 4 },
  metaVal: { fontSize: 14, color: C.text, fontWeight: '800' },
  smallBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  smallBadgeText: { fontSize: 11, fontWeight: '800' },

  inputWrapper: { marginBottom: 0 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textFaint, marginBottom: 8, marginLeft: 2, letterSpacing: 0.5 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, height: 50, backgroundColor: C.surface },
  dropdownHeaderActive: { borderColor: C.primary, shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 76, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  dropdownItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: C.surfaceSoft },
  dropdownItemText: { fontSize: 14, color: C.text, fontWeight: '600' },
  textBrand: { color: C.primary, fontWeight: '800' },
});