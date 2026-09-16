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
import { API_BASE } from '../../network/api';

import RNFS from 'react-native-fs';
import * as XLSX from 'xlsx';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = API_BASE.replace(/\/api\/?$/, '');
const ACADEMIC_YEAR_STORAGE_KEY = 'selectedAcademicYearId';

// ---- Brand palette — matches the web app's red gradient (#e52e2e -> #c5221f) ----
const C = {
  bg: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceSoft: '#F1F3F9',
  border: '#E7E9F2',
  text: '#12172B',
  textMuted: '#5D6478',
  textFaint: '#9AA0B4',
  primary: '#E52E2E',
  primaryDark: '#C5221F',
  primarySoft: '#FDE8E8',
  blue: '#0369A1',
  blueSoft: '#E0F2FE',
  green: '#059669',
  greenSoft: '#DCFCE9',
  amber: '#B45309',
  amberSoft: '#FEF3C7',
  slate: '#1E293B',
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

// Mirrors web's utils/excelValidator -> validateExcelStructure: checks the
// parsed sheet has at least one recognizable column from each required
// group before we bother mapping rows, and returns diagnostics for the
// progress modal instead of silently failing.
const validateExcelStructure = (rawData: any[]) => {
  const headers = Object.keys(rawData[0] || {});
  const normalized = headers.map((h) => h.toLowerCase());
  const candidateGroups = [
    { label: 'Roll No / Student Name', keys: ['Roll No', 'Roll Number', 'rollNo', 'Student Name', 'Name', 'studentName'] },
    { label: 'Marks Obtained', keys: ['Marks Obtained', 'Marks', 'marksObtained', 'Score'] },
  ];
  const missingGroups = candidateGroups.filter((g) => !g.keys.some((k) => normalized.includes(k.toLowerCase())));
  if (missingGroups.length > 0) {
    return {
      isValid: false,
      detectedHeaders: headers,
      expectedHeaders: candidateGroups.flatMap((g) => g.keys),
      diagnostics: [
        `Detected columns: ${headers.join(', ') || 'none'}`,
        `Missing required column group(s): ${missingGroups.map((g) => g.label).join(', ')}`,
      ],
    };
  }
  return { isValid: true as const };
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
  const [classInfoFailed, setClassInfoFailed] = useState(false);
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

  // Inline alert banner — same shape as web's `.alert-{type} alert-dismissible`.
  const [alert, setAlert] = useState<{ type: 'success' | 'danger' | ''; message: string }>({ type: '', message: '' });

  // Search / filter / pagination — mirrors web's results table toolbar
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'Final' | 'Draft'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Universal Excel batch progress / validation-error modal — mirrors web's
  // <ExcelBatchProgressModal isOpen title fileName progress validationError onDownloadTemplate onClose />
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchFileName, setBatchFileName] = useState('');
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [validationError, setValidationError] = useState<any>(null);

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
      const res = await axios.get(`${API_BASE}/academic-years`, { headers: authHeaders(token) });
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

  // Mirrors web's fetchResults 1:1 — same three parallel calls (class /
  // results / exams), same academicYearId param threading, same state
  // assignments. The one addition is a dedicated .catch on the class-info
  // call: the web version has none, so a failed class fetch silently rejects
  // the whole Promise.all and the subtitle is stuck on "Loading class..."
  // forever with no way to tell the user anything went wrong. Catching it
  // here keeps every successful-path behavior identical while giving the
  // failure path a real, retryable state instead of an infinite spinner.
  const fetchResults = async (
    token: string | null = authToken,
    isRefresh = false,
    yearIdParam?: string,
  ) => {
    if (!classId) {
      setLoading(false);
      setRefreshing(false);
      setClassInfoFailed(true);
      return;
    }
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setClassInfoFailed(false);

    try {
      const activeYear = yearIdParam !== undefined
        ? yearIdParam
        : selectedAcademicYearId || (await AsyncStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY)) || '';
      const resultsParams = activeYear ? { academicYearId: activeYear } : {};
      const examsParams = { classId, ...(activeYear ? { academicYearId: activeYear } : {}) };

      const [clsRes, resData, examsRes] = await Promise.all([
        axios.get(`${API_BASE}/classes/${classId}`, { headers: authHeaders(token) })
          .catch((e) => { console.error('Failed to load class info:', e); setClassInfoFailed(true); return { data: {} }; }),
        axios.get(`${API_BASE}/promotions/results/class/${classId}`, { headers: authHeaders(token), params: resultsParams }).catch(() => ({ data: {} })),
        axios.get(`${API_BASE}/exams`, { headers: authHeaders(token), params: examsParams }).catch(() => ({ data: {} })),
      ]);

      if (clsRes.data?.data) setClassInfo(clsRes.data.data);
      else setClassInfoFailed(true);
      if (resData.data?.data) setResults(Array.isArray(resData.data.data) ? resData.data.data : []);
      const examList = examsRes.data?.data || [];
      setExams(Array.isArray(examList) ? examList : []);
    } catch (err) {
      console.error(err);
      setClassInfoFailed(true);
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
      const res = await axios.get(`${API_BASE}/results/sheet/${classId}`, {
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
        `${API_BASE}/promotions/results/class/${classId}/compute`,
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
        `${API_BASE}/promotions/results/class/${classId}/finalize`,
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
        `${API_BASE}/results/publish`,
        { classId, examId: selectedExamId, division: classInfo?.division || undefined },
        { headers: authHeaders(authToken) },
      );
      setAlert({ type: 'success', message: res.data?.message || 'Results published' });
      fetchExamSheet();
    } catch (e: any) {
      setAlert({ type: 'danger', message: e.response?.data?.message || 'Publish failed' });
    } finally { setPublishing(false); }
  };

  // Web downloads this as a blob and clicks a synthetic <a>. RN can't attach
  // an Authorization header to Linking.openURL, so — same endpoint, same
  // params (classId, division, subject, maxMarks, className) — a `token`
  // query param is added as the one unavoidable RN-only difference.
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
    const url = `${API_BASE}/results/format?${qs}`;
    Linking.openURL(url).catch(() => setAlert({ type: 'danger', message: 'Failed to download format' }));
  };

  // Mirrors web's handleExcelUpload: pick file -> parse -> validate
  // structure -> map rows -> processExcelBatches -> POST /results/bulk,
  // including the pre-validation and empty-file diagnostics the web version
  // surfaces in its batch modal.
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

      const structureCheck = validateExcelStructure(rawData);
      if (!structureCheck.isValid) {
        setValidationError(structureCheck);
        setBatchFileName(file.name || 'results.xlsx');
        setBatchModalOpen(true);
        setUploading(false);
        return;
      }

      const rows = rawData
        .map((r) => ({
          rollNo: getExcelVal(r, ['Roll No', 'Roll Number', 'Roll', 'rollNo']),
          studentName: getExcelVal(r, ['Student Name', 'Name', 'Student', 'studentName']),
          marksObtained: Number(getExcelVal(r, ['Marks Obtained', 'Marks', 'Score', 'marksObtained']) || 0),
          remarks: getExcelVal(r, ['Remarks', 'remarks', 'Comments']),
        }))
        .filter((r) => r.rollNo || r.studentName);

      if (rows.length === 0) {
        setValidationError({
          isValid: false,
          detectedHeaders: Object.keys(rawData[0] || {}),
          expectedHeaders: [],
          diagnostics: ['The file was parsed but all rows were filtered out as invalid. Ensure student name or roll number is present.'],
        });
        setBatchFileName(file.name || 'results.xlsx');
        setBatchModalOpen(true);
        setAlert({ type: 'danger', message: 'No valid student result rows found in Excel file.' });
        setUploading(false);
        return;
      }

      const exam = exams.find((e) => String(e._id || e.id) === String(selectedExamId));
      setValidationError(null);
      setBatchFileName(file.name || 'results.xlsx');
      setBatchProgress({ current: 0, total: rows.length });
      setBatchModalOpen(true);

      const result = await processExcelBatches({
        items: rows,
        batchSize: 25,
        onProgress: (p) => setBatchProgress(p),
        processBatch: async (batchRows) => {
          const res = await axios.post(
            `${API_BASE}/results/bulk`,
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
    }
  };

  const closeBatchModal = () => {
    setBatchModalOpen(false);
    setBatchProgress(null);
    setValidationError(null);
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
          <View style={styles.dropdownChevronWrap}>
            <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
          </View>
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
                  {value === opt.value && <Feather name="check" size={16} color={C.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const pageSizeOptions = [10, 15, 25, 50, 100, 9999];

  const AlertBanner = () => {
    if (!alert.message) return null;
    const isSuccess = alert.type === 'success';
    return (
      <View style={[styles.alertBanner, { backgroundColor: isSuccess ? C.greenSoft : C.primarySoft }]}>
        <View style={[styles.alertAccent, { backgroundColor: isSuccess ? C.green : C.primary }]} />
        <Feather name={isSuccess ? 'check-circle' : 'alert-circle'} size={16} color={isSuccess ? C.green : C.primary} />
        <Text style={[styles.alertText, { color: isSuccess ? C.green : C.primary }]}>{alert.message}</Text>
        <TouchableOpacity onPress={() => setAlert({ type: '', message: '' })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
          <Text style={styles.pageSizeLabel}>ROWS</Text>
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
        <View style={styles.pageNavCenterPill}>
          <Text style={styles.pageNavCenterText}>Page {currentPage} of {totalPages}</Text>
        </View>
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

  const AnnualTableRow = ({ item, index }: { item: any; index: number }) => {
    const stu = item.studentId || {};
    return (
      <View style={[styles.tr, { width: annualTableWidth }, index % 2 === 1 && styles.trStripe]}>
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

  // Read-only, matching web — marks are only ever edited via the Excel
  // upload flow, not per-row in this table.
  const ENTRY_COLS = [
    { key: 'roll', label: 'Roll', width: 70 },
    { key: 'student', label: 'Student', width: 140 },
    { key: 'marks', label: 'Marks', width: 100 },
    { key: 'pct', label: '%', width: 60 },
    { key: 'grade', label: 'Grade', width: 70 },
    { key: 'pass', label: 'Pass', width: 80 },
    { key: 'status', label: 'Status', width: 130 },
  ];
  const entryTableWidth = ENTRY_COLS.reduce((s, c) => s + c.width, 0);

  const EntryTableHeader = () => (
    <View style={[styles.trHeader, { width: entryTableWidth }]}>
      {ENTRY_COLS.map((c) => (
        <Text key={c.key} style={[styles.thCell, { width: c.width }]}>{c.label}</Text>
      ))}
    </View>
  );

  const EntryTableRow = ({ item, index }: { item: any; index: number }) => {
    const hasRes = !!item.result;
    const isPass = hasRes && item.result.isPass;
    return (
      <View style={[styles.tr, { width: entryTableWidth }, index % 2 === 1 && styles.trStripe]}>
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

  // Fixed subtitle logic — matches web's `{classInfo ? '<className> - <division>' : 'Loading class...'}`
  // for the success path exactly, but no longer gets stuck forever if the
  // class-info request genuinely fails.
  const headerSubtitle = classInfo
    ? `${classInfo.className || ''}${classInfo.division ? ` - ${classInfo.division}` : ''}`.trim()
    : loading
      ? 'Loading class...'
      : (classInfoFailed ? 'Class unavailable — pull to retry' : 'Loading class...');

  return (
    <SafeAreaView style={styles.container}>
      {/* Header — back icon removed. Breadcrumb pill matches the web app's
          "Examinations & Grading / Class Results" category trail. */}
      <View style={styles.header}>
        <View style={styles.breadcrumbRow}>
          <View style={styles.breadcrumbBadge}>
            <Text style={styles.breadcrumbBadgeText}>EXAMINATIONS & GRADING</Text>
          </View>
          <Text style={styles.breadcrumbSep}>/</Text>
          <Text style={styles.breadcrumbCurrent}>Class Results</Text>
        </View>

        <View style={styles.headerRow}>
          <View style={styles.headerIconBadge}>
            <Feather name="bar-chart-2" size={22} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Class Results & Marksheets</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{headerSubtitle}</Text>
          </View>
          <TouchableOpacity style={styles.headerRefreshBtn} onPress={() => fetchResults(authToken, true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="refresh-ccw" size={17} color={C.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <AlertBanner />

      {/* Academic Session selector + tabs */}
      <View style={styles.filterSection}>
        {academicYears.length > 0 && (
          <View style={{ marginBottom: 14, zIndex: 20 }}>
            {renderInlineDropdown(
              'academicYear',
              'ACADEMIC SESSION',
              academicYears.map((ay) => ({ label: `Session: ${ay.name}${ay.isActive ? '  ★' : ''}`, value: ay._id })),
              selectedAcademicYearId,
              onSelectAcademicYear,
              'No academic sessions found',
              '— Select session —',
            )}
          </View>
        )}

        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, tab === 'annual' && styles.tabBtnActive]} onPress={() => setTab('annual')} activeOpacity={0.85}>
            <Text style={[styles.tabText, tab === 'annual' && styles.tabTextActive]}>Annual Matrix</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'entry' && styles.tabBtnActive]} onPress={() => setTab('entry')} activeOpacity={0.85}>
            <Text style={[styles.tabText, tab === 'entry' && styles.tabTextActive]}>Marks Entry / Excel</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ------------------ ANNUAL MATRIX TAB ------------------ */}
      {tab === 'annual' && (
        <>
          <View style={styles.actionBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
              <TouchableOpacity style={styles.actionBtnOutline} onPress={handleCompute} disabled={computing} activeOpacity={0.85}>
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
                  <TouchableOpacity style={styles.actionBtnWarningOutline} onPress={() => handleFinalize(true)} disabled={finalizing} activeOpacity={0.85}>
                    {finalizing ? <ActivityIndicator color={C.amber} size="small" /> : <><Feather name="unlock" size={16} color={C.amber} /><Text style={styles.actionBtnWarningOutlineText}>Unlock to Draft</Text></>}
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.actionBtnSolid} onPress={() => handleFinalize(false)} disabled={finalizing} activeOpacity={0.85}>
                  {finalizing ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="lock" size={16} color="#fff" /><Text style={styles.actionBtnSolidText}>Finalize & Lock (Make Live)</Text></>}
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.actionBtnNeutral} onPress={() => navigation.navigate('ClassExams', { classId })} activeOpacity={0.85}>
                <Feather name="pen-tool" size={16} color={C.textMuted} /><Text style={styles.actionBtnNeutralText}>Class Exams</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={C.primary} />
            </View>
          ) : results.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="trending-up" size={36} color={C.primary} style={{ opacity: 0.45 }} />
              </View>
              <Text style={styles.emptyTitle}>No Computed Results Found</Text>
              <Text style={styles.emptySubtitle}>Enter marks via Marks Entry tab or Class Exams, then compute annual results.</Text>
              <TouchableOpacity style={[styles.actionBtnSolid, { marginTop: 20 }]} onPress={handleCompute} disabled={computing} activeOpacity={0.85}>
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
                    renderItem={({ item, index }) => <AnnualTableRow item={item} index={index} />}
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
              <TouchableOpacity style={[styles.entryActionBtn, { backgroundColor: C.surface, borderColor: C.green }]} disabled={!selectedExamId} onPress={handleDownloadFormat} activeOpacity={0.85}>
                <Feather name="download-cloud" size={16} color={C.green} /><Text style={[styles.entryActionText, { color: C.green }]}>Format</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.entryActionBtn, { backgroundColor: C.surface, borderColor: C.blue }]} disabled={!selectedExamId || uploading} onPress={handleExcelUpload} activeOpacity={0.85}>
                {uploading ? <ActivityIndicator size="small" color={C.blue} /> : <><Feather name="upload-cloud" size={16} color={C.blue} /><Text style={[styles.entryActionText, { color: C.blue }]}>Upload Excel</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.entryActionBtn, { backgroundColor: C.primary, borderColor: C.primary }]} disabled={!selectedExamId || publishing} onPress={handlePublish} activeOpacity={0.85}>
                {publishing ? <ActivityIndicator size="small" color="#fff" /> : <><Feather name="send" size={16} color="#fff" /><Text style={[styles.entryActionText, { color: '#fff' }]}>Publish</Text></>}
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={C.primary} />
            </View>
          ) : !selectedExamId ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="inbox" size={36} color={C.textFaint} />
              </View>
              <Text style={styles.emptyTitle}>Select an Exam</Text>
              <Text style={styles.emptySubtitle}>Select an exam to view / upload marks. Schedule exams from Class Exams page.</Text>
            </View>
          ) : examResults.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="file-text" size={36} color={C.textFaint} />
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
                  renderItem={({ item, index }) => <EntryTableRow item={item} index={index} />}
                />
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* Universal Excel batch progress / validation-error modal — mirrors
          web's <ExcelBatchProgressModal>: shows upload progress normally,
          or column diagnostics + a "Get Template" shortcut when the sheet's
          headers don't match what the backend expects. */}
      <Modal visible={batchModalOpen} transparent animationType="fade" onRequestClose={closeBatchModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {validationError ? (
              <>
                <View style={[styles.modalIconCircle, { backgroundColor: C.primarySoft }]}>
                  <Feather name="alert-triangle" size={22} color={C.primary} />
                </View>
                <Text style={styles.modalTitle}>Excel Format Issue</Text>
                <Text style={styles.modalFileName} numberOfLines={1}>{batchFileName}</Text>
                <View style={styles.diagnosticsBox}>
                  {(validationError.diagnostics || []).map((d: string, i: number) => (
                    <Text key={i} style={styles.diagnosticText}>• {d}</Text>
                  ))}
                </View>
                <View style={styles.editModalActions}>
                  <TouchableOpacity style={styles.editCancelBtn} onPress={closeBatchModal} activeOpacity={0.85}>
                    <Text style={styles.editCancelBtnText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editSaveBtn} onPress={() => { closeBatchModal(); handleDownloadFormat(); }} activeOpacity={0.85}>
                    <Feather name="download-cloud" size={15} color="#fff" />
                    <Text style={styles.editSaveBtnText}>Get Template</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.modalIconCircle}>
                  <Feather name="upload-cloud" size={22} color={C.primary} />
                </View>
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
              </>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { paddingHorizontal: 20, paddingVertical: 16, paddingTop: Platform.OS === 'android' ? 40 : 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },

  breadcrumbRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  breadcrumbBadge: { backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  breadcrumbBadgeText: { fontSize: 9.5, fontWeight: '800', color: C.primary, letterSpacing: 0.5 },
  breadcrumbSep: { fontSize: 12, color: C.textFaint },
  breadcrumbCurrent: { fontSize: 12, fontWeight: '600', color: C.textMuted },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerIconBadge: { width: 50, height: 50, borderRadius: 18, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F7C9C9' },
  headerRefreshBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 19, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: C.textMuted, marginTop: 3, fontWeight: '600' },

  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, overflow: 'hidden' },
  alertAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  alertText: { fontSize: 13, fontWeight: '700', flex: 1 },

  globalBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  globalBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  filterSection: { paddingHorizontal: 16, paddingTop: 16, backgroundColor: C.bg },
  tabContainer: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 4, borderRadius: 16, gap: 4 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  tabBtnActive: { backgroundColor: C.primary, shadowColor: C.primaryDark, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  tabText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  tabTextActive: { color: '#fff' },

  actionBar: { paddingVertical: 16, backgroundColor: C.bg },
  actionBtnOutline: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, gap: 8, shadowColor: C.slate, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  actionBtnOutlineText: { color: C.text, fontSize: 13, fontWeight: '700' },
  actionBtnSolid: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, gap: 8, shadowColor: C.primaryDark, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 6, elevation: 4 },
  actionBtnSolidText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionBtnSuccess: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.green, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, gap: 8, shadowColor: C.green, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 2 },
  actionBtnWarningOutline: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.amber, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, gap: 8 },
  actionBtnWarningOutlineText: { color: C.amber, fontSize: 13, fontWeight: '700' },
  actionBtnNeutral: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, gap: 8 },
  actionBtnNeutralText: { color: C.textMuted, fontSize: 13, fontWeight: '700' },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyStateSmall: { alignItems: 'center', paddingVertical: 30 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 18, shadowColor: C.slate, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: C.border },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  emptySubtitle: { fontSize: 14, color: C.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 },

  // Results table header (search / filter / pagesize / summary)
  tableHeaderCard: { backgroundColor: C.surface, borderRadius: 22, padding: 18, marginHorizontal: 16, marginTop: 4, marginBottom: 12, borderWidth: 1, borderColor: C.border, shadowColor: C.slate, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  tableHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  tableHeaderTitle: { fontSize: 15, fontWeight: '800', color: C.text },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surfaceSoft, borderRadius: 13, paddingHorizontal: 14, height: 46, marginBottom: 14 },
  searchInput: { flex: 1, fontSize: 14, color: C.text, fontWeight: '500' },

  filterChipsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  filterChipTextActive: { color: '#fff' },

  pageSizeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  pageSizeLabel: { fontSize: 10, fontWeight: '800', color: C.textFaint, letterSpacing: 0.6 },
  pageSizeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.surfaceSoft },
  pageSizeChipActive: { backgroundColor: C.slate },
  pageSizeChipText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  pageSizeChipTextActive: { color: '#fff' },

  resultCountText: { fontSize: 11, color: C.textFaint, fontWeight: '600' },

  paginationBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surface, borderRadius: 18, padding: 10, marginHorizontal: 16, marginTop: 8, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  pageNavBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  pageNavBtnDisabled: { opacity: 0.4 },
  pageNavBtnText: { fontSize: 13, fontWeight: '700', color: C.primary },
  pageNavCenterPill: { backgroundColor: C.surfaceSoft, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  pageNavCenterText: { fontSize: 12, fontWeight: '700', color: C.textMuted },

  // Table (mirrors web's <table> markup 1:1, with subtle row striping)
  tableWrap: { marginHorizontal: 16, marginBottom: 16, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  trHeader: { flexDirection: 'row', backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 12 },
  thCell: { fontSize: 11, fontWeight: '800', color: C.textFaint, textTransform: 'uppercase', paddingHorizontal: 10, letterSpacing: 0.3 },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: C.surfaceSoft, paddingVertical: 13 },
  trStripe: { backgroundColor: '#FBFBFE' },
  tdCell: { fontSize: 13, color: C.text, paddingHorizontal: 10 },
  tdBold: { fontWeight: '800' },

  // Marks Entry
  entryConfigBar: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  entryActionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  entryActionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, height: 46, borderRadius: 24, gap: 8 },
  entryActionText: { fontSize: 13, fontWeight: '700' },

  smallBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  smallBadgeText: { fontSize: 11, fontWeight: '800' },
  subjBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  subjBadgeText: { fontSize: 11, fontWeight: '800' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  inputWrapper: { marginBottom: 0 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textFaint, marginBottom: 8, marginLeft: 2, letterSpacing: 0.5 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingHorizontal: 16, height: 52, backgroundColor: C.surface },
  dropdownHeaderActive: { borderColor: C.primary, shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 5 },
  dropdownChevronWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center' },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 78, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 10 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.surfaceSoft },
  dropdownItemText: { fontSize: 14, color: C.text, fontWeight: '600' },
  textBrand: { color: C.primary, fontWeight: '800' },

  // Excel batch progress / validation modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,17,32,0.6)', justifyContent: 'center', alignItems: 'center', padding: 26 },
  modalCard: { width: '100%', backgroundColor: C.surface, borderRadius: 24, padding: 26, alignItems: 'center' },
  modalIconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 4, textAlign: 'center' },
  modalFileName: { fontSize: 12, color: C.textMuted, fontWeight: '600', marginBottom: 16, maxWidth: '100%' },
  progressBarTrack: { width: '100%', height: 8, borderRadius: 4, backgroundColor: C.surfaceSoft, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: C.primary, borderRadius: 5 },
  progressText: { fontSize: 12, color: C.textMuted, fontWeight: '700', marginTop: 9 },

  diagnosticsBox: { width: '100%', backgroundColor: C.surfaceSoft, borderRadius: 14, padding: 14, marginBottom: 4 },
  diagnosticText: { fontSize: 12.5, color: C.textMuted, fontWeight: '600', lineHeight: 19 },
  editModalActions: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
  editCancelBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center' },
  editCancelBtnText: { fontSize: 14, fontWeight: '700', color: C.textMuted },
  editSaveBtn: { flex: 1.4, flexDirection: 'row', gap: 8, height: 48, borderRadius: 15, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', shadowColor: C.primaryDark, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  editSaveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});