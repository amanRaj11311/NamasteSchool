import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList,
  ScrollView, ActivityIndicator, RefreshControl, Linking, Platform,
  TextInput, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import DocumentPicker from '@react-native-documents/picker';
import axios from 'axios';

import RNFS from 'react-native-fs';
import * as XLSX from 'xlsx';
import { io, Socket } from 'socket.io-client';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';
const SOCKET_URL = BASE_URL.replace(/\/api\/?$/, '');
const ACADEMIC_YEAR_STORAGE_KEY = 'selectedAcademicYearId';

const C = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSoft: '#F1F5F9',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  primary: '#E11D48',
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

// ---- Excel helpers (mirrors web's utils/excelParser + excelBatchProcessor) ----

const getExcelVal = (row: Record<string, any>, keys: string[]) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const match = rowKeys.find((rk) => rk.toLowerCase() === k.toLowerCase());
    if (match && row[match] !== undefined && row[match] !== null && row[match] !== '') return row[match];
  }
  return undefined;
};

const processExcelBatches = async ({
  items, batchSize, onProgress, processBatch,
}: {
  items: any[]; batchSize: number;
  onProgress: (p: { current: number; total: number }) => void;
  processBatch: (batch: any[]) => Promise<any>;
}) => {
  let successCount = 0;
  let failedCount = 0;
  const total = items.length;
  for (let i = 0; i < total; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    try {
      const res = await processBatch(batch);
      successCount += res?.summary?.saved ?? batch.length;
      failedCount += res?.summary?.failed ?? 0;
    } catch (err) {
      failedCount += batch.length;
    }
    onProgress({ current: Math.min(i + batchSize, total), total });
  }
  return { successCount, failedCount, total };
};

export default function ClassResultsScreen() {
  const route = useRoute<RouteProp<ParamList, 'ClassResults'>>();
  const navigation = useNavigation<any>();
  const classId = route.params?.classId;

  const [authToken, setAuthToken] = useState<string | null>(null);

  const [classInfo, setClassInfo] = useState<any>(null);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState('');
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

  // Same inline alert banner as web (replaces native Alert.alert popups —
  // web never uses confirm() or blocking dialogs, so neither do we).
  const [alert, setAlert] = useState<{ type: 'success' | 'danger' | ''; message: string }>({ type: '', message: '' });

  // Search / filter / pagination — mirrors web's results table toolbar
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'Final' | 'Draft'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Excel batch progress modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchFileName, setBatchFileName] = useState('');
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    const yearId = await fetchAcademicYears(token);
    fetchResults(token, false, yearId);
  };

  const authHeaders = (token: string | null) => ({ Authorization: `Bearer ${token}` });

  const fetchAcademicYears = async (token: string | null): Promise<string> => {
    try {
      const res = await axios.get(`${BASE_URL}/academic-years`, { headers: authHeaders(token) });
      const list = res.data?.data || [];
      setAcademicYears(Array.isArray(list) ? list : []);
      let currentId = (await AsyncStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY)) || '';
      if (!currentId || !list.find((y: any) => String(y._id) === String(currentId))) {
        const active = list.find((y: any) => y.isActive) || list[0];
        currentId = active?._id || '';
      }
      setSelectedAcademicYearId(currentId);
      return currentId;
    } catch (e) {
      console.error('Failed to load academic years:', e);
      return '';
    }
  };

  const onSelectAcademicYear = async (val: string) => {
    setSelectedAcademicYearId(val);
    await AsyncStorage.setItem(ACADEMIC_YEAR_STORAGE_KEY, val);
    fetchResults(authToken, false, val);
  };

  // Mirrors web's fetchResults: same three parallel calls (class / results /
  // exams), same academicYearId param threading, same state assignments.
  const fetchResults = async (
    token: string | null = authToken,
    isRefresh = false,
    yearIdParam?: string,
  ) => {
    if (!classId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (isRefresh) setRefreshing(true); else setLoading(true);

    try {
      const activeYear = yearIdParam !== undefined
        ? yearIdParam
        : selectedAcademicYearId || (await AsyncStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY)) || '';
      const resultsParams = activeYear ? { academicYearId: activeYear } : {};
      const examsParams = { classId, ...(activeYear ? { academicYearId: activeYear } : {}) };

      const [clsRes, resData, examsRes] = await Promise.all([
        axios.get(`${BASE_URL}/classes/${classId}`, { headers: authHeaders(token) }),
        axios.get(`${BASE_URL}/promotions/results/class/${classId}`, { headers: authHeaders(token), params: resultsParams }).catch(() => ({ data: {} })),
        axios.get(`${BASE_URL}/exams`, { headers: authHeaders(token), params: examsParams }).catch(() => ({ data: {} })),
      ]);

      if (clsRes.data?.data) setClassInfo(clsRes.data.data);
      if (resData.data?.data) setResults(Array.isArray(resData.data.data) ? resData.data.data : []);
      const examList = examsRes.data?.data || [];
      setExams(Array.isArray(examList) ? examList : []);
    } catch (err) {
      console.error(err);
      setAlert({ type: 'danger', message: 'Failed to load class results' });
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
    try {
      const exam = exams.find((e) => String(e._id || e.id) === String(selectedExamId));
      const res = await axios.get(`${BASE_URL}/results/sheet/${classId}`, {
        params: { examId: selectedExamId, subject: exam?.subject, division: classInfo?.division || undefined },
        headers: authHeaders(authToken),
      });
      setExamResults(res.data?.data?.sheet || []);
    } catch (err) {
      console.error(err);
      setExamResults([]);
    }
  }, [classId, selectedExamId, exams, classInfo, authToken]);

  useEffect(() => {
    if (tab === 'entry') fetchExamSheet();
  }, [tab, fetchExamSheet]);

  // Live updates — mirrors web's useSocket('result_computed' / 'result_finalized'
  // / 'result_changed') listeners that auto-refetch when another device changes
  // results for this class.
  useEffect(() => {
    if (!authToken || !classId) return;
    const socket: Socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token: authToken },
    });

    const refetchResults = () => fetchResults(authToken, true);
    const refetchAll = () => {
      fetchResults(authToken, true);
      if (tab === 'entry') fetchExamSheet();
    };

    socket.on('result_computed', refetchResults);
    socket.on('result_finalized', refetchResults);
    socket.on('result_changed', refetchAll);

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, classId, tab, selectedExamId]);

  const handleCompute = async () => {
    setComputing(true);
    try {
      const effectiveYearId = selectedAcademicYearId || (await AsyncStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY)) || '';
      await axios.post(
        `${BASE_URL}/promotions/results/class/${classId}/compute`,
        { academicYearId: effectiveYearId || undefined },
        { headers: authHeaders(authToken) },
      );
      setAlert({ type: 'success', message: 'Class results computed from ExamResult / completed exams' });
      fetchResults(authToken, true, effectiveYearId);
    } catch (e: any) {
      setAlert({ type: 'danger', message: e.response?.data?.message || 'Failed to compute' });
    } finally { setComputing(false); }
  };

  // Matches web exactly: no confirm dialog before finalizing/unlocking.
  const handleFinalize = async (unlock = false) => {
    setFinalizing(true);
    try {
      const effectiveYearId = selectedAcademicYearId || (await AsyncStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY)) || '';
      const res = await axios.post(
        `${BASE_URL}/promotions/results/class/${classId}/finalize`,
        { academicYearId: effectiveYearId || undefined, unlock },
        { headers: authHeaders(authToken) },
      );
      setAlert({
        type: 'success',
        message: res.data?.message || (unlock ? 'Results unlocked to Draft mode' : 'Class results locked & finalized (Live for Promotion)'),
      });
      fetchResults(authToken, true, effectiveYearId);
    } catch (e: any) {
      setAlert({ type: 'danger', message: e.response?.data?.message || 'Failed to finalize' });
    } finally { setFinalizing(false); }
  };

  const handlePublish = async () => {
    if (!selectedExamId) { setAlert({ type: 'danger', message: 'Select an exam first' }); return; }
    setPublishing(true);
    try {
      const res = await axios.post(
        `${BASE_URL}/results/publish`,
        { classId, examId: selectedExamId, division: classInfo?.division || undefined },
        { headers: authHeaders(authToken) },
      );
      setAlert({ type: 'success', message: res.data?.message || 'Results published' });
      fetchExamSheet();
    } catch (e: any) {
      setAlert({ type: 'danger', message: e.response?.data?.message || 'Publish failed' });
    } finally { setPublishing(false); }
  };

  // Params now match web's /results/format call exactly (classId, division,
  // subject, maxMarks, className — no examId). `token` is added only because
  // RN's Linking.openURL can't attach an Authorization header the way the
  // web app's axios blob request does; it's the one unavoidable RN-only param.
  const handleDownloadFormat = () => {
    const exam = exams.find((e) => String(e._id || e.id) === String(selectedExamId));
    const qs = new URLSearchParams({
      classId: String(classId || ''),
      division: String(classInfo?.division || ''),
      subject: String(exam?.subject || ''),
      maxMarks: String(exam?.maxMarks || 100),
      className: String(classInfo?.className || ''),
      token: String(authToken || ''),
    }).toString();
    const url = `${BASE_URL}/results/format?${qs}`;
    Linking.openURL(url).catch(() => setAlert({ type: 'danger', message: 'Failed to download format' }));
  };

  // Client-side Excel parsing + chunked bulk upload, mirroring web's
  // XLSX.read + processExcelBatches -> POST /results/bulk flow (JSON rows,
  // not a multipart file), with a progress modal for large sheets.
  const handleExcelUpload = async () => {
    if (!selectedExamId) { setAlert({ type: 'danger', message: 'Select exam and file' }); return; }
    try {
      const picked = await DocumentPicker.pick({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/csv', // .csv
          'text/comma-separated-values',
        ],
      });
      const file = picked[0];
      setUploading(true);

      const base64 = await RNFS.readFile(file.uri, 'base64');
      const workbook = XLSX.read(base64, { type: 'base64' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData: any[] = XLSX.utils.sheet_to_json(sheet);

      const rows = rawData
        .map((r) => ({
          rollNo: getExcelVal(r, ['Roll No', 'Roll Number', 'Roll', 'rollNo']),
          studentName: getExcelVal(r, ['Student Name', 'Name', 'Student', 'studentName']),
          marksObtained: Number(getExcelVal(r, ['Marks Obtained', 'Marks', 'Score', 'marksObtained']) || 0),
          remarks: getExcelVal(r, ['Remarks', 'remarks', 'Comments']),
        }))
        .filter((r) => r.rollNo || r.studentName);

      if (rows.length === 0) {
        setAlert({ type: 'danger', message: 'No valid student result rows found in Excel file.' });
        setUploading(false);
        return;
      }

      const exam = exams.find((e) => String(e._id || e.id) === String(selectedExamId));
      setBatchFileName(file.name || 'results.xlsx');
      setBatchProgress({ current: 0, total: rows.length });
      setBatchModalOpen(true);

      const result = await processExcelBatches({
        items: rows,
        batchSize: 25,
        onProgress: (p) => setBatchProgress(p),
        processBatch: async (batchRows) => {
          const res = await axios.post(
            `${BASE_URL}/results/bulk`,
            {
              classId,
              division: classInfo?.division || undefined,
              examId: selectedExamId,
              subject: exam?.subject || '',
              maxMarks: Number(exam?.maxMarks || 100),
              passMarks: Number(exam?.passMarks || 33),
              status: 'Draft',
              results: batchRows,
            },
            { headers: authHeaders(authToken) },
          );
          return res.data;
        },
      });

      if (result.successCount > 0) {
        setAlert({ type: 'success', message: `Uploaded: ${result.successCount} saved, ${result.failedCount} failed` });
      } else if (result.failedCount > 0) {
        setAlert({ type: 'danger', message: `Failed to import ${result.failedCount} student results.` });
      }
      fetchExamSheet();
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) {
        console.error('Failed to import result Excel:', err);
        setAlert({ type: 'danger', message: err.response?.data?.message || err.message || 'Upload failed' });
      }
    } finally {
      setUploading(false);
      setBatchModalOpen(false);
      setBatchProgress(null);
    }
  };

  const finalCount = results.filter((r) => r.isFinal).length;
  const draftCount = results.length - finalCount;
  const isAllFinal = results.length > 0 && finalCount === results.length;

  const filteredResults = results.filter((r) => {
    if (filterStatus === 'Final' && !r.isFinal) return false;
    if (filterStatus === 'Draft' && r.isFinal) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const stu = r.studentId || {};
    return (
      (stu.name || '').toLowerCase().includes(q) ||
      (stu.rollNo && String(stu.rollNo).toLowerCase().includes(q)) ||
      (stu.admissionNo && String(stu.admissionNo).toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(filteredResults.length / pageSize) || 1;
  const paginatedResults = pageSize >= 9999
    ? filteredResults
    : filteredResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setCurrentPage(1); }, [search, filterStatus, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const renderInlineDropdown = (fieldKey: string, label: string, options: {label: string, value: string}[], value: string, onSelect: (v: string) => void, emptyLabel = 'No scheduled exams found', placeholder = '— Choose scheduled exam —') => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || placeholder}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
              {options.length === 0 ? (
                <View style={styles.dropdownItem}>
                  <Text style={[styles.dropdownItemText, { color: C.textFaint }]}>{emptyLabel}</Text>
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

  const pageSizeOptions = [10, 15, 25, 50, 100, 9999];

  // Same alert banner shape as web's `.alert-{type} alert-dismissible`.
  const AlertBanner = () => {
    if (!alert.message) return null;
    const isSuccess = alert.type === 'success';
    return (
      <View style={[styles.alertBanner, { backgroundColor: isSuccess ? C.greenSoft : C.primarySoft, borderColor: isSuccess ? C.green : C.primary }]}>
        <Text style={[styles.alertText, { color: isSuccess ? C.green : C.primary }]}>{alert.message}</Text>
        <TouchableOpacity onPress={() => setAlert({ type: '', message: '' })}>
          <Feather name="x" size={16} color={isSuccess ? C.green : C.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  const ResultsToolbar = () => (
    <View>
      <View style={styles.tableHeaderCard}>
        <View style={styles.tableHeaderTop}>
          <Text style={styles.tableHeaderTitle}>Student Results ({results.length})</Text>
          {isAllFinal ? (
            <View style={[styles.globalBadge, { backgroundColor: C.green }]}>
              <Feather name="check-circle" size={12} color="#fff" />
              <Text style={[styles.globalBadgeText, { color: '#fff' }]}>LOCKED & FINALIZED (LIVE)</Text>
            </View>
          ) : (
            <View style={[styles.globalBadge, { backgroundColor: C.primary }]}>
              <Feather name="edit-3" size={12} color="#fff" />
              <Text style={[styles.globalBadgeText, { color: '#fff' }]}>DRAFT MODE ({draftCount})</Text>
            </View>
          )}
        </View>

        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={C.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search student or roll no..."
            placeholderTextColor={C.textFaint}
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Feather name="x" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterChipsRow}>
          {(['ALL', 'Final', 'Draft'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filterStatus === f && styles.filterChipActive]}
              onPress={() => setFilterStatus(f)}
            >
              <Text style={[styles.filterChipText, filterStatus === f && styles.filterChipTextActive]}>
                {f === 'ALL' ? `All (${results.length})` : f === 'Final' ? `Final / Live (${finalCount})` : `Draft (${draftCount})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.pageSizeRow}>
          <Text style={styles.pageSizeLabel}>Rows:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {pageSizeOptions.map((size) => (
              <TouchableOpacity
                key={size}
                style={[styles.pageSizeChip, pageSize === size && styles.pageSizeChipActive]}
                onPress={() => setPageSize(size)}
              >
                <Text style={[styles.pageSizeChipText, pageSize === size && styles.pageSizeChipTextActive]}>
                  {size >= 9999 ? 'All' : size}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <Text style={styles.resultCountText}>
          Showing {filteredResults.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredResults.length)} of {filteredResults.length} students
        </Text>
      </View>
    </View>
  );

  const PaginationBar = () => (
    totalPages > 1 ? (
      <View style={styles.paginationBar}>
        <TouchableOpacity
          style={[styles.pageNavBtn, currentPage === 1 && styles.pageNavBtnDisabled]}
          onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
        >
          <Feather name="chevron-left" size={16} color={currentPage === 1 ? C.textFaint : C.primary} />
          <Text style={[styles.pageNavBtnText, currentPage === 1 && { color: C.textFaint }]}>Prev</Text>
        </TouchableOpacity>
        <Text style={styles.pageNavCenterText}>Page {currentPage} of {totalPages}</Text>
        <TouchableOpacity
          style={[styles.pageNavBtn, currentPage === totalPages && styles.pageNavBtnDisabled]}
          onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
        >
          <Text style={[styles.pageNavBtnText, currentPage === totalPages && { color: C.textFaint }]}>Next</Text>
          <Feather name="chevron-right" size={16} color={currentPage === totalPages ? C.textFaint : C.primary} />
        </TouchableOpacity>
      </View>
    ) : null
  );

  // ---- Annual Matrix table — same columns as web:
  // Student | Roll | Overall % | Obtained/Max | Subjects | Eligible | Status
  const ANNUAL_COLS = [
    { key: 'student', label: 'Student', width: 140 },
    { key: 'roll', label: 'Roll', width: 70 },
    { key: 'pct', label: 'Overall %', width: 90 },
    { key: 'marks', label: 'Obtained / Max', width: 120 },
    { key: 'subjects', label: 'Subjects', width: 220 },
    { key: 'eligible', label: 'Eligible', width: 80 },
    { key: 'status', label: 'Status', width: 130 },
  ];
  const annualTableWidth = ANNUAL_COLS.reduce((s, c) => s + c.width, 0);

  const AnnualTableHeader = () => (
    <View style={[styles.trHeader, { width: annualTableWidth }]}>
      {ANNUAL_COLS.map((c) => (
        <Text key={c.key} style={[styles.thCell, { width: c.width }]}>{c.label}</Text>
      ))}
    </View>
  );

  const AnnualTableRow = ({ item }: { item: any }) => {
    const stu = item.studentId || {};
    return (
      <View style={[styles.tr, { width: annualTableWidth }]}>
        <Text style={[styles.tdCell, styles.tdBold, { width: ANNUAL_COLS[0].width }]} numberOfLines={1}>{stu.name || '—'}</Text>
        <Text style={[styles.tdCell, { width: ANNUAL_COLS[1].width }]}>{stu.rollNo || '—'}</Text>
        <Text style={[styles.tdCell, styles.tdBold, { width: ANNUAL_COLS[2].width, color: C.primary }]}>{item.overallPercent ?? 0}%</Text>
        <Text style={[styles.tdCell, { width: ANNUAL_COLS[3].width }]}>{item.overallObtained ?? 0} / {item.overallMaxMarks ?? 0}</Text>
        <View style={[styles.tdCell, { width: ANNUAL_COLS[4].width, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }]}>
          {(item.subjects || []).map((s: any, i: number) => (
            <View key={i} style={[styles.subjBadge, { backgroundColor: s.isPass ? C.greenSoft : C.primarySoft }]}>
              <Text style={[styles.subjBadgeText, { color: s.isPass ? C.green : C.primary }]}>{s.subject}: {s.percent}%</Text>
            </View>
          ))}
        </View>
        <View style={[styles.tdCell, { width: ANNUAL_COLS[5].width }]}>
          <View style={[styles.statusPill, { backgroundColor: item.isEligibleForPromotion ? C.green : C.textMuted }]}>
            <Text style={styles.statusPillText}>{item.isEligibleForPromotion ? 'Yes' : 'No'}</Text>
          </View>
        </View>
        <View style={[styles.tdCell, { width: ANNUAL_COLS[6].width }]}>
          <View style={[styles.statusPill, { backgroundColor: item.isFinal ? C.green : C.amber }]}>
            <Text style={styles.statusPillText}>{item.isFinal ? 'Final (Live)' : 'Draft'}</Text>
          </View>
        </View>
      </View>
    );
  };

  // ---- Marks Entry table — same columns as web:
  // Roll | Student | Marks | % | Grade | Pass | Status
  const ENTRY_COLS = [
    { key: 'roll', label: 'Roll', width: 70 },
    { key: 'student', label: 'Student', width: 140 },
    { key: 'marks', label: 'Marks', width: 100 },
    { key: 'pct', label: '%', width: 60 },
    { key: 'grade', label: 'Grade', width: 70 },
    { key: 'pass', label: 'Pass', width: 80 },
    { key: 'status', label: 'Status', width: 110 },
  ];
  const entryTableWidth = ENTRY_COLS.reduce((s, c) => s + c.width, 0);

  const EntryTableHeader = () => (
    <View style={[styles.trHeader, { width: entryTableWidth }]}>
      {ENTRY_COLS.map((c) => (
        <Text key={c.key} style={[styles.thCell, { width: c.width }]}>{c.label}</Text>
      ))}
    </View>
  );

  const EntryTableRow = ({ item }: { item: any }) => {
    const hasRes = !!item.result;
    const isPass = hasRes && item.result.isPass;
    return (
      <View style={[styles.tr, { width: entryTableWidth }]}>
        <Text style={[styles.tdCell, styles.tdBold, { width: ENTRY_COLS[0].width, color: C.textMuted }]}>{item.rollNo || '—'}</Text>
        <Text style={[styles.tdCell, styles.tdBold, { width: ENTRY_COLS[1].width }]} numberOfLines={1}>{item.name || '—'}</Text>
        <Text style={[styles.tdCell, { width: ENTRY_COLS[2].width }]}>{hasRes ? `${item.result.marksObtained} / ${item.result.maxMarks}` : '—'}</Text>
        <Text style={[styles.tdCell, { width: ENTRY_COLS[3].width }]}>{hasRes ? item.result.percent : '—'}</Text>
        <Text style={[styles.tdCell, { width: ENTRY_COLS[4].width }]}>{hasRes ? item.result.grade : '—'}</Text>
        <View style={[styles.tdCell, { width: ENTRY_COLS[5].width }]}>
          {hasRes ? (
            <View style={[styles.smallBadge, { backgroundColor: isPass ? C.greenSoft : C.primarySoft }]}>
              <Text style={[styles.smallBadgeText, { color: isPass ? C.green : C.primary }]}>{isPass ? 'Pass' : 'Fail'}</Text>
            </View>
          ) : <Text style={styles.tdCell}>—</Text>}
        </View>
        <Text style={[styles.tdCell, { width: ENTRY_COLS[6].width }]}>{item.result?.status || 'Not entered'}</Text>
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
      </View>

      <AlertBanner />

      {/* Academic Session selector + tabs */}
      <View style={styles.filterSection}>
        {academicYears.length > 0 && (
          <View style={{ marginBottom: 12, zIndex: 20 }}>
            {renderInlineDropdown(
              'academicYear',
              'ACADEMIC SESSION',
              academicYears.map((ay) => ({ label: `${ay.name}${ay.isActive ? ' ★' : ''}`, value: ay._id })),
              selectedAcademicYearId,
              onSelectAcademicYear,
              'No academic sessions found',
              '— Select session —',
            )}
          </View>
        )}

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
                {computing ? (
                  <><ActivityIndicator color={C.primary} size="small" /><Text style={styles.actionBtnOutlineText}>Computing...</Text></>
                ) : (
                  <><Feather name="cpu" size={16} color={C.primary} /><Text style={styles.actionBtnOutlineText}>Compute Results</Text></>
                )}
              </TouchableOpacity>

              {isAllFinal ? (
                <>
                  <View style={styles.actionBtnSuccess}>
                    <Feather name="check-circle" size={16} color="#fff" />
                    <Text style={styles.actionBtnSolidText}>Results Finalized (Live)</Text>
                  </View>
                  <TouchableOpacity style={styles.actionBtnWarningOutline} onPress={() => handleFinalize(true)} disabled={finalizing}>
                    {finalizing ? <ActivityIndicator color={C.amber} size="small" /> : <><Feather name="unlock" size={16} color={C.amber} /><Text style={styles.actionBtnWarningOutlineText}>Unlock to Draft</Text></>}
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.actionBtnSolid} onPress={() => handleFinalize(false)} disabled={finalizing}>
                  {finalizing ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="lock" size={16} color="#fff" /><Text style={styles.actionBtnSolidText}>Finalize & Lock (Make Live)</Text></>}
                </TouchableOpacity>
              )}

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
              <Text style={styles.emptyTitle}>No Computed Results Found</Text>
              <Text style={styles.emptySubtitle}>Enter marks via Marks Entry tab or Class Exams, then compute annual results.</Text>
              <TouchableOpacity style={[styles.actionBtnSolid, { marginTop: 20 }]} onPress={handleCompute} disabled={computing}>
                {computing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.actionBtnSolidText}>Compute Class Results Now</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <ResultsToolbar />
              <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableWrap}>
                <View>
                  <AnnualTableHeader />
                  <FlatList
                    data={paginatedResults}
                    keyExtractor={item => item._id || item.id}
                    ListEmptyComponent={
                      <View style={[styles.emptyStateSmall, { width: annualTableWidth }]}>
                        <Text style={styles.emptySubtitle}>No student results match your search or filter.</Text>
                      </View>
                    }
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchResults(authToken, true)} colors={[C.primary]} tintColor={C.primary} />}
                    renderItem={({ item }) => <AnnualTableRow item={item} />}
                  />
                </View>
              </ScrollView>
              <PaginationBar />
            </View>
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
              <Text style={styles.emptySubtitle}>Select an exam to view / upload marks. Schedule exams from Class Exams page.</Text>
            </View>
          ) : examResults.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="file-text" size={40} color={C.textFaint} />
              </View>
              <Text style={styles.emptyTitle}>No Marks Entered</Text>
              <Text style={styles.emptySubtitle}>No marks entered yet. Download format, fill marks, and upload Excel.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableWrap}>
              <View>
                <EntryTableHeader />
                <FlatList
                  data={examResults}
                  keyExtractor={(item, index) => item.studentId || item.rollNo || index.toString()}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchExamSheet} colors={[C.primary]} tintColor={C.primary} />}
                  renderItem={({ item }) => <EntryTableRow item={item} />}
                />
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* Excel batch import progress modal — mirrors web's ExcelBatchProgressModal */}
      <Modal visible={batchModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Importing Exam Results via Excel</Text>
            <Text style={styles.modalFileName} numberOfLines={1}>{batchFileName}</Text>
            {batchProgress && (
              <>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${batchProgress.total ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}%` }]} />
                </View>
                <Text style={styles.progressText}>{batchProgress.current} / {batchProgress.total} processed</Text>
              </>
            )}
            <ActivityIndicator color={C.primary} style={{ marginTop: 14 }} />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn: { padding: 4, marginRight: -4 },
  headerIconBadge: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: C.textMuted, marginTop: 4, fontWeight: '500' },

  alertBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  alertText: { fontSize: 13, fontWeight: '700', flex: 1, marginRight: 10 },

  globalBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  globalBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

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
  actionBtnSuccess: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.green, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, gap: 8, opacity: 0.9 },
  actionBtnWarningOutline: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.amber, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, gap: 8 },
  actionBtnWarningOutlineText: { color: C.amber, fontSize: 13, fontWeight: '700' },
  actionBtnNeutral: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, gap: 8 },
  actionBtnNeutralText: { color: C.textMuted, fontSize: 13, fontWeight: '700' },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyStateSmall: { alignItems: 'center', paddingVertical: 30 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  emptySubtitle: { fontSize: 14, color: C.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 22 },

  // Results table header (search / filter / pagesize / summary)
  tableHeaderCard: { backgroundColor: C.surface, borderRadius: 20, padding: 18, marginHorizontal: 16, marginTop: 4, marginBottom: 12, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  tableHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  tableHeaderTitle: { fontSize: 15, fontWeight: '800', color: C.text },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surfaceSoft, borderRadius: 12, paddingHorizontal: 14, height: 44, marginBottom: 14 },
  searchInput: { flex: 1, fontSize: 14, color: C.text, fontWeight: '500' },

  filterChipsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  filterChipTextActive: { color: '#fff' },

  pageSizeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  pageSizeLabel: { fontSize: 11, fontWeight: '800', color: C.textFaint },
  pageSizeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.surfaceSoft },
  pageSizeChipActive: { backgroundColor: C.slate },
  pageSizeChipText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  pageSizeChipTextActive: { color: '#fff' },

  resultCountText: { fontSize: 11, color: C.textFaint, fontWeight: '600' },

  paginationBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, padding: 12, marginHorizontal: 16, marginTop: 8, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  pageNavBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  pageNavBtnDisabled: { opacity: 0.5 },
  pageNavBtnText: { fontSize: 13, fontWeight: '700', color: C.primary },
  pageNavCenterText: { fontSize: 12, fontWeight: '700', color: C.textMuted },

  // Table (mirrors web's <table> markup 1:1)
  tableWrap: { marginHorizontal: 16, marginBottom: 16, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  trHeader: { flexDirection: 'row', backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 10 },
  thCell: { fontSize: 11, fontWeight: '800', color: C.textFaint, textTransform: 'uppercase', paddingHorizontal: 10 },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: C.surfaceSoft, paddingVertical: 12 },
  tdCell: { fontSize: 13, color: C.text, paddingHorizontal: 10 },
  tdBold: { fontWeight: '800' },

  // Marks Entry
  entryConfigBar: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  entryActionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  entryActionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, height: 44, borderRadius: 12, gap: 8 },
  entryActionText: { fontSize: 13, fontWeight: '700' },

  smallBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  smallBadgeText: { fontSize: 11, fontWeight: '800' },
  subjBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  subjBadgeText: { fontSize: 11, fontWeight: '800' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 11, fontWeight: '800', color: '#fff' },

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

  // Excel batch progress modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  modalCard: { width: '100%', backgroundColor: C.surface, borderRadius: 20, padding: 24, alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 4, textAlign: 'center' },
  modalFileName: { fontSize: 12, color: C.textMuted, fontWeight: '600', marginBottom: 16, maxWidth: '100%' },
  progressBarTrack: { width: '100%', height: 8, borderRadius: 4, backgroundColor: C.surfaceSoft, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: C.primary, borderRadius: 5 },
  progressText: { fontSize: 12, color: C.textMuted, fontWeight: '700', marginTop: 9 },
});