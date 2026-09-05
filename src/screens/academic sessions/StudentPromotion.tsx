import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';

// ---------------------------------------------------------------------------
// Design tokens — premium red/coral brand system
// ---------------------------------------------------------------------------
const C = {
  bg: '#F4F6F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#101828', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#E11D2E', primaryDark: '#B91424', primarySoft: '#FEECEC',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

type Option = { label: string; value: string };

interface StudentDecision {
  studentId: string;
  studentName: string;
  rollNo: string;
  currentClassName: string;
  currentDivision: string;
  overallPercent: number;
  computedDecision: string;
  decision: string;
  targetLevelId: string;
  proposedDivision: string;
  isNewSection: boolean;
  overrideNote: string;
}

export default function PromotionsDashboardScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [classLevels, setClassLevels] = useState<any[]>([]);

  // Filter States
  const [fromAcademicYearId, setFromAcademicYearId] = useState('');
  const [toAcademicYearId, setToAcademicYearId] = useState('');
  const [selectedClassLevelId, setSelectedClassLevelId] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Data States
  const [previewData, setPreviewData] = useState<any>(null);
  const [studentDecisions, setStudentDecisions] = useState<StudentDecision[]>([]);
  
  // Loading States
  const [loading, setLoading] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [committing, setCommitting] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchDependencies(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchDependencies = async (token: string | null) => {
    setLoading(true);
    try {
      const [yearsRes, levelsRes] = await Promise.all([
        axios.get(`${BASE_URL}/academic-years`, authHeaders(token)),
        axios.get(`${BASE_URL}/class-levels`, authHeaders(token)),
      ]);
      
      const years = yearsRes.data?.data || [];
      setAcademicYears(years);
      
      const activeYear = years.find((y: any) => y.isActive);
      if (activeYear) {
        setFromAcademicYearId(activeYear._id);
        const nextYear = years.find((y: any) => new Date(y.startDate).getTime() > new Date(activeYear.startDate).getTime());
        if (nextYear) setToAcademicYearId(nextYear._id);
      }

      setClassLevels(levelsRes.data?.data || []);
    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  };

  const handleRunPreview = async () => {
    if (!fromAcademicYearId || !toAcademicYearId) {
      Alert.alert("Missing Selection", "Please select Source and Target Academic Years.");
      return;
    }
    setLoadingPreview(true);
    try {
      let url = `${BASE_URL}/promotions/preview?fromAcademicYearId=${fromAcademicYearId}&toAcademicYearId=${toAcademicYearId}`;
      if (selectedClassLevelId) url += `&classLevelId=${selectedClassLevelId}`;

      const res = await axios.get(url, authHeaders(authToken));
      if (res.data?.data) {
        const pData = res.data.data;
        setPreviewData(pData);

        const editableList: StudentDecision[] = (pData.previewList || []).map((item: any) => ({
          studentId: item.studentId,
          studentName: item.studentName,
          rollNo: item.rollNo,
          currentClassName: item.currentClassName,
          currentDivision: item.currentDivision,
          overallPercent: item.overallPercent,
          computedDecision: item.computedDecision,
          decision: item.computedDecision,
          targetLevelId: item.targetLevelId,
          proposedDivision: item.proposedDivision || 'A',
          isNewSection: item.isNewSection || false,
          overrideNote: '',
        }));
        setStudentDecisions(editableList);
      }
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.message || "Failed to run promotion preview.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const updateDecisionField = (index: number, field: keyof StudentDecision, value: string) => {
    const updated = [...studentDecisions];
    updated[index] = { ...updated[index], [field]: value };
    setStudentDecisions(updated);
  };

  const handleCommitPromotion = async () => {
    if (studentDecisions.length === 0) return;

    // Validation: Check if override note is provided when decision is manually altered
    const invalidOverride = studentDecisions.find(
      (d) => d.decision !== d.computedDecision && (!d.overrideNote || d.overrideNote.trim() === '')
    );

    if (invalidOverride) {
      Alert.alert(
        "Override Note Required", 
        `Please provide an override note for ${invalidOverride.studentName} as their decision was manually changed.`
      );
      return;
    }

    Alert.alert('Confirm Commit', 'Are you sure you want to execute these promotions?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Execute', style: 'destructive', onPress: async () => {
          setCommitting(true);
          try {
            const payload = {
              fromAcademicYearId,
              toAcademicYearId,
              decisions: studentDecisions.map((d) => ({
                studentId: d.studentId,
                decision: d.decision,
                targetLevelId: d.targetLevelId,
                proposedDivision: d.proposedDivision,
                overrideNote: d.overrideNote,
              })),
            };

            const res = await axios.post(`${BASE_URL}/promotions/commit`, payload, authHeaders(authToken));
            if (res.data?.success) {
              Alert.alert("Success", res.data.message || "Promotion executed successfully!");
              setPreviewData(null);
              setStudentDecisions([]);
            }
          } catch (e: any) {
            Alert.alert("Error", e.response?.data?.message || "Failed to commit promotion.");
          } finally {
            setCommitting(false);
          }
      }}
    ]);
  };

  const renderInlineDropdown = (fieldKey: string, label: string, options: Option[], value: string, onSelect: (v: string) => void) => {
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
            <ScrollView nestedScrollEnabled style={{ maxHeight: 190 }} showsVerticalScrollIndicator={false}>
              {options.map((opt, idx) => (
                <TouchableOpacity key={opt.value + idx} style={styles.dropdownItem} onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}>
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIconBadge}><Feather name="award" size={20} color={C.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Promotion Engine</Text>
            <Text style={styles.subtitle}>Evaluate, reshuffle, and promote students.</Text>
          </View>
        </View>

        {/* Filters & Configuration */}
        <View style={styles.filterSection}>
          <View style={{ zIndex: 30 }}>
            {renderInlineDropdown('fromYear', 'SOURCE SESSION (CURRENT) *', academicYears.map(y => ({ label: `${y.name} ${y.isActive ? '(Active)' : ''}`, value: y._id })), fromAcademicYearId, setFromAcademicYearId)}
          </View>
          <View style={{ zIndex: 20 }}>
            {renderInlineDropdown('toYear', 'TARGET SESSION (NEXT) *', academicYears.map(y => ({ label: y.name, value: y._id })), toAcademicYearId, setToAcademicYearId)}
          </View>
          <View style={{ zIndex: 10 }}>
            {renderInlineDropdown('classLvl', 'FILTER CLASS LEVEL (OPTIONAL)', [{ label: 'All Class Levels', value: '' }, ...classLevels.map(l => ({ label: l.name, value: l._id }))], selectedClassLevelId, setSelectedClassLevelId)}
          </View>

          <TouchableOpacity style={styles.previewBtn} onPress={handleRunPreview} disabled={loadingPreview}>
            {loadingPreview ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="eye" size={16} color="#fff" /><Text style={styles.previewBtnText}>Run Promotion Preview</Text></>}
          </TouchableOpacity>
        </View>

        {/* Results List */}
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : previewData ? (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>{previewData.totalStudents} Students Evaluated</Text>
              <Text style={styles.resultsRoute}>{previewData.fromAcademicYear?.name} → {previewData.toAcademicYear?.name}</Text>
            </View>
            <FlatList
              data={studentDecisions}
              keyExtractor={(item) => item.studentId}
              contentContainerStyle={styles.listContent}
              renderItem={({ item, index }) => {
                const isOverridden = item.decision !== item.computedDecision;
                return (
                  <View style={[styles.card, isOverridden && styles.cardOverridden]}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.studentName}>{item.studentName}</Text>
                        <Text style={styles.studentRoll}>Roll No: {item.rollNo || '—'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.classText}>{item.currentClassName} {item.currentDivision ? `- ${item.currentDivision}` : ''}</Text>
                        <Text style={[styles.percentText, item.overallPercent >= 33 ? { color: C.green } : { color: C.primary }]}>{item.overallPercent}%</Text>
                      </View>
                    </View>

                    <Text style={styles.inputLabel}>DECISION</Text>
                    <View style={styles.decisionRow}>
                      {['Promoted', 'Detained', 'Passed Out'].map(dec => (
                        <TouchableOpacity
                          key={dec}
                          style={[styles.decisionPill, item.decision === dec && styles.decisionPillActive]}
                          onPress={() => updateDecisionField(index, 'decision', dec)}
                        >
                          <Text style={[styles.decisionPillText, item.decision === dec && styles.decisionPillTextActive]}>{dec}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {item.decision !== 'Passed Out' && (
                      <View style={styles.sectionRow}>
                        <Text style={styles.inputLabel}>TARGET SEC:</Text>
                        <TextInput
                          style={styles.sectionInput}
                          value={item.proposedDivision}
                          onChangeText={(t) => updateDecisionField(index, 'proposedDivision', t.toUpperCase())}
                          maxLength={3}
                        />
                        {item.isNewSection && <View style={styles.newSecBadge}><Text style={styles.newSecText}>Auto-Created</Text></View>}
                      </View>
                    )}

                    {isOverridden && (
                      <View style={styles.overrideBox}>
                        <TextInput
                          style={styles.overrideInput}
                          placeholder="Reason required for manual override..."
                          placeholderTextColor={C.primary}
                          value={item.overrideNote}
                          onChangeText={(t) => updateDecisionField(index, 'overrideNote', t)}
                        />
                      </View>
                    )}
                  </View>
                );
              }}
            />
            {/* Sticky Bottom Action */}
            <View style={styles.bottomBar}>
              <TouchableOpacity style={styles.commitBtn} onPress={handleCommitPromotion} disabled={committing}>
                {committing ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="check-circle" size={16} color="#fff" /><Text style={styles.commitBtnText}>Commit Promotion Batch</Text></>}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Feather name="settings" size={40} color={C.textFaint} />
            <Text style={styles.emptyTitle}>Ready to Compute</Text>
            <Text style={styles.emptySubtitle}>Select your parameters and run the preview to evaluate student results.</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 100 },
  previewBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: C.primary, paddingVertical: 14, borderRadius: 12, gap: 8, marginTop: 6 },
  previewBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: C.bg },
  resultsCount: { fontSize: 14, fontWeight: '800', color: C.text },
  resultsRoute: { fontSize: 12, fontWeight: '700', color: C.textMuted },

  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardOverridden: { borderColor: C.amber, borderWidth: 2 },
  
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  studentName: { fontSize: 16, fontWeight: '800', color: C.text },
  studentRoll: { fontSize: 12, color: C.textMuted, marginTop: 2, fontWeight: '600' },
  classText: { fontSize: 12, fontWeight: '700', color: C.slate, backgroundColor: C.slateSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  percentText: { fontSize: 16, fontWeight: '800', marginTop: 4, textAlign: 'right' },

  decisionRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 14 },
  decisionPill: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 8 },
  decisionPillActive: { backgroundColor: '#111827', borderColor: '#111827' },
  decisionPillText: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  decisionPillTextActive: { color: '#fff' },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sectionInput: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSoft, borderRadius: 8, width: 60, height: 36, textAlign: 'center', fontWeight: '800', color: C.text },
  newSecBadge: { backgroundColor: C.amberSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  newSecText: { fontSize: 10, fontWeight: '800', color: C.amber },

  overrideBox: { backgroundColor: C.primarySoft, borderRadius: 8, marginTop: 8, padding: 4 },
  overrideInput: { height: 40, paddingHorizontal: 12, fontSize: 13, color: C.primaryDark, fontWeight: '500' },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: C.surface, borderTopWidth: 1, borderColor: C.border, elevation: 10 },
  commitBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: C.green, paddingVertical: 14, borderRadius: 12, gap: 8 },
  commitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginTop: 16 },
  emptySubtitle: { fontSize: 13, color: C.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, marginBottom: 6, letterSpacing: 0.5 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44, backgroundColor: C.surface },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 13, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 13, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },
});