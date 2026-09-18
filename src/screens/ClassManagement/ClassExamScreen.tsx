import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { API_BASE } from '../../network/api';

import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import XLSX from 'xlsx';
const C = {
  bg: '#F6F4F1',
  surface: '#FFFFFF',
  surfaceSoft: '#FBF9F6',
  border: '#EAE6DF',
  borderStrong: '#DCD6CB',
  text: '#1C1917',
  textMuted: '#78716C',
  textFaint: '#A8A29E',

  garnet: '#B3122B',
  garnetDeep: '#7F0C1F',
  garnetSoft: '#FCE9EB',

  blue: '#1D6FA5',
  blueSoft: '#E4F0F8',
  green: '#1D7A4C',
  greenSoft: '#E3F5EA',
  amber: '#B7791F',
  amberSoft: '#FBF0DD',
  slate: '#5B5751',
  slateSoft: '#EFEBE4',
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Scheduled: { bg: C.blueSoft, fg: C.blue },
  Completed: { bg: C.greenSoft, fg: C.green },
  Cancelled: { bg: '#FBE7E7', fg: '#B3122B' },
};

const GRADE_STYLE: Record<string, { bg: string; fg: string }> = {
  'A+': { bg: C.greenSoft, fg: C.green },
  'A': { bg: C.greenSoft, fg: C.green },
  'B': { bg: C.blueSoft, fg: C.blue },
  'C': { bg: C.amberSoft, fg: C.amber },
  'D': { bg: C.amberSoft, fg: C.amber },
  'F': { bg: '#FBE7E7', fg: C.garnetDeep },
};

type Option = { label: string; value: string };

const EXAM_STATUSES = ['Scheduled', 'Completed', 'Cancelled'];
const TERMS = ['Term 1', 'Term 2', 'Term 3', 'Annual'];

// --- Time helpers (kept from source; web stores a single free-text slot) ---
const formatTime24 = (d: Date) => {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
};

const parseTime24 = (timeStr: string) => {
  if (!timeStr) return new Date(new Date().setHours(9, 0, 0, 0));
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(hours || 9, minutes || 0, 0, 0);
  return d;
};

const gradeForPercent = (pct: number) => {
  if (pct >= 90) return 'A+';
  if (pct >= 75) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 45) return 'C';
  if (pct >= 33) return 'D';
  return 'F';
};

const initialsFor = (name: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

type MarksRow = {
  studentId: string | null;
  rollNo: string;
  studentName: string;
  marksObtained: string; // kept as string for controlled TextInput
  grade: string;
  remarks: string;
  resultId?: string;
};

export default function ClassExamsScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [examCategories, setExamCategories] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isFormVisible, setFormVisible] = useState(false);
  const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);
  const [isMarksModalVisible, setMarksModalVisible] = useState(false);
  const [activeExam, setActiveExam] = useState<any>(null);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const emptyForm = {
    categoryId: '', subjectId: '', subjectName: '', title: '', date: new Date(),
    startTime: new Date(new Date().setHours(9, 0, 0, 0)),
    endTime: new Date(new Date().setHours(12, 0, 0, 0)),
    room: '', invigilator: '', maxMarks: '100', passMarks: '33', status: 'Scheduled', remarks: '',
  };
  const [formData, setFormData] = useState(emptyForm);

  const emptyCatForm = { name: '', term: 'Term 1', weightage: '20', defaultMax: '100', defaultPass: '33', description: '' };
  const [catFormData, setCatFormData] = useState(emptyCatForm);

  // --- Marks entry state (rebuilt to mirror the web Results workflow) ---
  const [marksRows, setMarksRows] = useState<MarksRow[]>([]);
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksSaving, setMarksSaving] = useState(false);

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
      const [clsRes, subRes, catRes, staffRes] = await Promise.all([
        axios.get(`${API_BASE}/classes`, authHeaders(token)),
        axios.get(`${API_BASE}/subjects`, authHeaders(token)),
        axios.get(`${API_BASE}/exams/master`, authHeaders(token)),
        axios.get(`${API_BASE}/staff?limit=500`, authHeaders(token)),
      ]);
      const fetchedClasses = clsRes.data?.data || [];
      setClasses(fetchedClasses);
      setSubjects(subRes.data?.data || []);
      setExamCategories(catRes.data?.data || []);

      const allStaff = staffRes.data?.data || [];
      const filteredTeachers = allStaff.filter((s: any) => s.roleId?.name === 'Teacher' || s.staffType === 'Teacher');
      setTeachers(filteredTeachers);

      if (fetchedClasses.length > 0) {
        setSelectedClassId(fetchedClasses[0]._id);
        fetchExams(token, fetchedClasses[0]._id);
      } else {
        setLoading(false);
      }
    } catch (e) { console.error(e); setLoading(false); }
  };

  const fetchExams = async (token: string | null, classId: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/exams?classId=${classId}`, authHeaders(token));
      setExams(res.data?.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'exams' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const selectedClass = useMemo(() => classes.find(c => c._id === selectedClassId), [classes, selectedClassId]);

  // ---- Category CRUD ----
  const handleCreateCategory = async () => {
    if (!catFormData.name.trim()) { Alert.alert('Missing info', 'Category name is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: catFormData.name.trim(),
        term: catFormData.term,
        weightage: Number(catFormData.weightage) || 0,
        defaultMaxMarks: Number(catFormData.defaultMax) || 0,
        defaultPassMarks: Number(catFormData.defaultPass) || 0,
        remarks: catFormData.description,
      };
      const res = await axios.post(`${API_BASE}/exams/master`, payload, authHeaders(authToken));
      const created = res.data?.data;
      if (created) setExamCategories(prev => [created, ...prev]);
      setCatFormData(emptyCatForm);
      setCategoryModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to create category.');
    } finally { setSaving(false); }
  };

  const handleDeleteCategory = (id: string) => {
    Alert.alert('Delete category', 'This removes the exam category. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/exams/master/${id}`, authHeaders(authToken));
            setExamCategories(prev => prev.filter(c => c._id !== id));
          } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to delete category.'); }
        },
      },
    ]);
  };

  // ---- Exam Slot CRUD ----
  const openCreateForm = () => {
    const cat = examCategories[0];
    const sub = subjects[0];
    setEditingExamId(null);
    setFormData({
      ...emptyForm,
      categoryId: cat?._id || '',
      subjectId: sub?._id || '',
      subjectName: sub?.name || '',
      date: new Date(),
      startTime: parseTime24('09:00'),
      endTime: parseTime24('12:00'),
      maxMarks: cat?.defaultMaxMarks ? String(cat.defaultMaxMarks) : '100',
      passMarks: cat?.defaultPassMarks ? String(cat.defaultPassMarks) : '33',
    });
    setFormVisible(true);
  };

  const openEditForm = (exam: any) => {
    setEditingExamId(exam._id);
    const [startStr, endStr] = (exam.time || '').split(' - ');
    setFormData({
      categoryId: exam.masterExamId?._id || exam.masterExamId || '',
      subjectId: exam.subjectId?._id || exam.subjectId || '',
      subjectName: exam.subject || '',
      title: exam.title || '',
      date: exam.date ? new Date(exam.date) : new Date(),
      startTime: parseTime24(startStr?.trim() || '09:00'),
      endTime: parseTime24(endStr?.trim() || '12:00'),
      room: exam.room || '', invigilator: exam.invigilator || '',
      maxMarks: String(exam.maxMarks ?? '100'),
      passMarks: String(exam.passMarks ?? '33'),
      status: exam.status || 'Scheduled',
      remarks: exam.remarks || '',
    });
    setFormVisible(true);
  };

  const handleSaveExam = async () => {
    if (!formData.categoryId && !formData.title) {
      Alert.alert('Missing info', 'Choose a category or enter a title.');
      return;
    }
    if (!formData.subjectId) { Alert.alert('Missing info', 'Subject is required.'); return; }

    const category = examCategories.find(c => c._id === formData.categoryId);
    const subject = subjects.find(s => s._id === formData.subjectId);
    const autoTitle = formData.title || `${category?.name || ''} - ${subject?.name || ''}`;
    setSaving(true);
    try {
      const formattedTime = `${formatTime24(formData.startTime)} - ${formatTime24(formData.endTime)}`;
      const payload: any = {
        examName: category?.name,
        term: category?.term || 'Term 1',
        subject: subject?.name,
        subjectId: formData.subjectId,
        classId: selectedClassId,
        title: autoTitle,
        date: formData.date.toISOString().split('T')[0],
        time: formattedTime,
        room: formData.room,
        invigilator: formData.invigilator,
        maxMarks: Number(formData.maxMarks) || 0,
        passMarks: Number(formData.passMarks) || 0,
        status: formData.status,
        remarks: formData.remarks,
      };
      if (formData.categoryId) payload.masterExamId = formData.categoryId;

      if (editingExamId) {
        await axios.put(`${API_BASE}/exams/${editingExamId}`, payload, authHeaders(authToken));
        Alert.alert('Updated', 'Exam slot updated.');
      } else {
        await axios.post(`${API_BASE}/exams`, payload, authHeaders(authToken));
        Alert.alert('Scheduled', 'Exam slot scheduled.');
      }
      setFormVisible(false);
      fetchExams(authToken, selectedClassId, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save exam slot.');
    } finally { setSaving(false); }
  };

  const handleDeleteExam = (id: string) => {
    Alert.alert('Delete exam slot', 'This scheduled exam slot will be permanently removed. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/exams/${id}`, authHeaders(authToken));
            setExams(prev => prev.filter(e => e._id !== id));
          } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to delete exam slot.'); }
        },
      },
    ]);
  };

  // ---------------------------------------------------------------------
  // Marks entry — rebuilt to match the web app's real source of truth:
  // the /results (ExamResult) module, not the legacy embedded exam.marks.
  // Same two-step merge as web: class roster first, then existing results
  // layered on top, with grade auto-computed from percentage.
  // ---------------------------------------------------------------------
  const openMarksModal = async (exam: any) => {
    setActiveExam(exam);
    setMarksModalVisible(true);
    setMarksLoading(true);
    try {
      const studentMap: Record<string, MarksRow> = {};

      try {
        const stuRes = await axios.get(`${API_BASE}/students`, {
          ...authHeaders(authToken),
          params: { classId: selectedClassId, limit: 500 },
        });
        const list = stuRes.data?.data || stuRes.data?.students || [];
        (Array.isArray(list) ? list : []).forEach((s: any) => {
          const key = String(s._id || s.id);
          studentMap[key] = {
            studentId: s._id || s.id,
            rollNo: s.rollNo || '',
            studentName: s.name || '',
            marksObtained: '',
            grade: '',
            remarks: '',
          };
        });
      } catch {
        // fallback: attendance roster, same as web
        try {
          const attRes = await axios.get(`${API_BASE}/attendance/class`, {
            ...authHeaders(authToken),
            params: { classId: selectedClassId, month: new Date().toISOString().substring(0, 7) },
          });
          (attRes.data?.data || []).forEach((rec: any) => {
            const key = rec.rollNo || rec.studentName || 'Student';
            if (!studentMap[key]) {
              studentMap[key] = {
                studentId: rec.studentId || null,
                rollNo: rec.rollNo || key,
                studentName: rec.studentName || key,
                marksObtained: '',
                grade: '',
                remarks: '',
              };
            }
          });
        } catch {}
      }

      try {
        const resRes = await axios.get(`${API_BASE}/results`, {
          ...authHeaders(authToken),
          params: { examId: exam._id || exam.id, classId: selectedClassId, limit: 500 },
        });
        const rows = resRes.data?.data || [];
        rows.forEach((r: any) => {
          const sid = r.studentId?._id || r.studentId || null;
          const key = sid ? String(sid) : (r.rollNo || r.studentName);
          const base: MarksRow = studentMap[key] || {
            studentId: sid,
            rollNo: r.rollNo || '',
            studentName: r.studentName || r.studentId?.name || '',
            marksObtained: '',
            grade: '',
            remarks: '',
          };
          base.marksObtained = r.marksObtained != null ? String(r.marksObtained) : '';
          base.grade = r.grade || '';
          base.remarks = r.remarks || '';
          base.resultId = r._id || r.id;
          studentMap[key] = base;
        });
      } catch {
        // legacy embedded marks
        (exam.marks || []).forEach((m: any) => {
          const key = m.studentId || m.rollNo || m.studentName;
          if (studentMap[key]) {
            studentMap[key].marksObtained = m.marksObtained != null ? String(m.marksObtained) : '';
            studentMap[key].grade = m.grade || '';
            studentMap[key].remarks = m.remarks || '';
          } else {
            studentMap[key] = { ...m, marksObtained: m.marksObtained != null ? String(m.marksObtained) : '' };
          }
        });
      }

      const list = Object.values(studentMap).sort((a, b) =>
        String(a.rollNo).localeCompare(String(b.rollNo), undefined, { numeric: true })
      );
      setMarksRows(list);
    } catch (e) {
      Alert.alert('Error', 'Could not load the student list for marks entry.');
    } finally {
      setMarksLoading(false);
    }
  };

  const updateMarksRow = (idx: number, field: 'marksObtained' | 'remarks', value: string) => {
    setMarksRows(prev => {
      const next = [...prev];
      const row = { ...next[idx], [field]: value };
      if (field === 'marksObtained') {
        const max = activeExam?.maxMarks || 100;
        const num = parseFloat(value);
        row.grade = value === '' || Number.isNaN(num) ? '' : gradeForPercent((num / max) * 100);
      }
      next[idx] = row;
      return next;
    });
  };

  const handleSaveMarks = async () => {
    if (!activeExam) return;
    setMarksSaving(true);
    try {
      const payload = {
        classId: selectedClassId,
        examId: activeExam._id || activeExam.id,
        subject: activeExam.subject,
        maxMarks: activeExam.maxMarks || 100,
        passMarks: activeExam.passMarks || 33,
        status: 'Draft',
        results: marksRows.map((m) => ({
          studentId: m.studentId || undefined,
          rollNo: m.rollNo,
          studentName: m.studentName,
          marksObtained: Number(m.marksObtained) || 0,
          grade: m.grade || undefined,
          remarks: m.remarks || '',
        })),
      };

      let res;
      try {
        res = await axios.post(`${API_BASE}/results/bulk`, payload, authHeaders(authToken));
      } catch {
        res = await axios.post(`${API_BASE}/exams/${activeExam._id}/marks`, { marks: marksRows }, authHeaders(authToken));
      }

      const saved = res.data?.summary?.saved;
      Alert.alert('Saved', saved != null ? `Marks saved for ${saved} students.` : 'Exam marks saved.');
      setMarksModalVisible(false);
      fetchExams(authToken, selectedClassId, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save exam marks.');
    } finally { setMarksSaving(false); }
  };

  const handleDownloadResultFormat = async () => {
    if (!activeExam || !selectedClassId) return;
    try {
      const url = `${API_BASE}/results/format?classId=${selectedClassId}&subject=${encodeURIComponent(activeExam.subject || '')}&maxMarks=${activeExam.maxMarks || 100}`;
      const fileName = `result_format_${(activeExam.subject || 'exam').replace(/\s+/g, '_')}.xlsx`;
      const destPath = `${RNFS.CachesDirectoryPath}/${fileName}`;

      const { promise } = RNFS.downloadFile({
        fromUrl: url,
        toFile: destPath,
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });
      const result = await promise;

      if (result.statusCode && result.statusCode >= 200 && result.statusCode < 300) {
        await Share.open({
          url: Platform.OS === 'android' ? `file://${destPath}` : destPath,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          filename: fileName,
          failOnCancel: false,
        });
      } else {
        Alert.alert('Error', 'Failed to download the result format.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to download the result format.');
    }
  };

  const handleUploadExcel = async () => {
    if (!activeExam || !selectedClassId) return;
    try {
      const [file] = await pick({
        type: [types.xlsx, types.xls, types.csv],
      });

      const form = new FormData();
      // @ts-ignore — React Native FormData file shape
      form.append('file', { uri: file.uri, name: file.name || 'marks.xlsx', type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      form.append('classId', selectedClassId);
      form.append('examId', activeExam._id || activeExam.id);
      form.append('subject', activeExam.subject || '');
      form.append('maxMarks', String(activeExam.maxMarks || 100));
      form.append('passMarks', String(activeExam.passMarks || 33));
      form.append('status', 'Draft');

      setMarksSaving(true);
      const res = await axios.post(`${API_BASE}/results/bulk-excel`, form, {
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'multipart/form-data' },
      });
      const s = res.data?.summary;
      Alert.alert('Upload complete', s ? `${s.saved} saved, ${s.failed} failed.` : 'Excel marks uploaded.');
      await openMarksModal(activeExam);
      fetchExams(authToken, selectedClassId, true);
    } catch (e: any) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return;
      Alert.alert('Error', e.response?.data?.message || 'Excel upload failed.');
    } finally { setMarksSaving(false); }
  };

  // Client-side timetable export — mirrors the web app's downloadExamScheduleExcel,
  // which builds the workbook in the browser with xlsx-js-style rather than
  // calling the server. Same column set and styling intent, done with RNFS + Share.
  const handleExportTimetable = async () => {
    if (exams.length === 0) {
      Alert.alert('Nothing to export', 'There are no scheduled exams for this class yet.');
      return;
    }
    try {
      const headers = ['S.No', 'Exam Category', 'Exam Title', 'Subject', 'Term', 'Date', 'Time', 'Room', 'Invigilator', 'Max Marks', 'Passing Marks', 'Status', 'Remarks'];
      const rows = [headers, ...exams.map((ex, idx) => [
        idx + 1,
        ex.examName || ex.masterExamId?.name || 'General Exam',
        ex.title,
        ex.subject,
        ex.term || 'Term 1',
        ex.date ? new Date(ex.date).toLocaleDateString() : '',
        ex.time,
        ex.room || 'Main Hall',
        ex.invigilator || '-',
        ex.maxMarks,
        ex.passMarks,
        ex.status,
        ex.remarks || '',
      ])];

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = [8, 20, 25, 18, 12, 15, 22, 15, 20, 12, 15, 15, 25].map(wch => ({ wch }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Exam Timetable');
      const wbout: string = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });

      const fileName = `${selectedClass?.className || 'Class'}_Exam_Timetable.xlsx`;
      const destPath = `${RNFS.CachesDirectoryPath}/${fileName}`;
      await RNFS.writeFile(destPath, wbout, 'base64');

      await Share.open({
        url: Platform.OS === 'android' ? `file://${destPath}` : destPath,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: fileName,
        failOnCancel: false,
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to export the exam timetable.');
    }
  };

  // ---- Dropdown ----
  const renderInlineDropdown = (fieldKey: string, label: string, options: Option[], value: string, onSelect: (v: string) => void, placeholder?: string) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 60 : 1 }]}>
        {!!label && <Text style={styles.inputLabel}>{label}</Text>}
        <TouchableOpacity
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]}
          onPress={() => setActiveDropdown(isOpen ? null : fieldKey)}
          activeOpacity={0.85}
        >
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selectedObj?.label || placeholder || 'Select...'}
          </Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 190 }}>
              {options.length === 0 && <Text style={styles.dropdownEmptyText}>No options available</Text>}
              {options.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={styles.dropdownItem}
                  onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}
                >
                  <Text style={[styles.dropdownItemText, value === opt.value && styles.textBrand]}>{opt.label}</Text>
                  {value === opt.value && <Feather name="check" size={14} color={C.garnet} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const classOptions: Option[] = classes.map(c => ({ label: `${c.className}${c.division ? ` (Div ${c.division})` : ''}`, value: c._id }));
  const subjectOptions: Option[] = subjects.map(s => ({ label: s.name, value: s._id }));
  const categoryOptions: Option[] = examCategories.map(c => ({ label: `${c.name} (${c.term})`, value: c._id }));
  const teacherOptions: Option[] = teachers.map(t => ({ label: t.name, value: t.name }));
  const statusOptions: Option[] = EXAM_STATUSES.map(s => ({ label: s, value: s }));

  const completedCount = exams.filter(e => e.status === 'Completed').length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchExams(authToken, selectedClassId, true)} colors={[C.garnet]} tintColor={C.garnet} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerIconBadge}><Feather name="award" size={20} color={C.garnet} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Class Exams</Text>
            <Text style={styles.subtitle}>Schedules, categories and grading for this class.</Text>
          </View>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={[styles.iconCircle, { backgroundColor: C.garnetSoft }]}><Feather name="file-text" size={15} color={C.garnet} /></View>
            <Text style={styles.kpiValue}>{exams.length}</Text>
            <Text style={styles.kpiLabel}>Total exams</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.iconCircle, { backgroundColor: C.amberSoft }]}><Feather name="tag" size={15} color={C.amber} /></View>
            <Text style={styles.kpiValue}>{examCategories.length}</Text>
            <Text style={styles.kpiLabel}>Categories</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.iconCircle, { backgroundColor: C.greenSoft }]}><Feather name="check-circle" size={15} color={C.green} /></View>
            <Text style={styles.kpiValue}>{completedCount}</Text>
            <Text style={styles.kpiLabel}>Completed</Text>
          </View>
        </View>

        {/* Master Categories */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <Feather name="folder" size={15} color={C.garnet} />
              <Text style={styles.sectionTitle}>Master exam categories</Text>
            </View>
            {hasPermission('create') && (
              <TouchableOpacity onPress={() => setCategoryModalVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.linkAction}>+ Create</Text>
              </TouchableOpacity>
            )}
          </View>

          {examCategories.length === 0 ? (
            <Text style={styles.mutedText}>No categories yet — create one to schedule exams against it.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
              {examCategories.map(cat => (
                <View key={cat._id} style={styles.categoryScrollCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={styles.termPill}><Text style={styles.termPillText}>{cat.term}</Text></View>
                    {hasPermission('delete') && (
                      <TouchableOpacity onPress={() => handleDeleteCategory(cat._id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Feather name="x" size={14} color={C.textFaint} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.categoryScrollName} numberOfLines={1}>{cat.name}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.categoryScrollMax}>Max {cat.defaultMaxMarks ?? '-'}</Text>
                    <Text style={styles.categoryScrollMax}>Pass {cat.defaultPassMarks ?? '-'}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.inputLabel}>Class</Text>
          {renderInlineDropdown('classFilter', '', classOptions, selectedClassId, (v) => { setSelectedClassId(v); fetchExams(authToken, v); }, 'Choose a class')}
          {selectedClass && (
            <View style={[styles.chipWrap, { marginTop: 4 }]}>
              <View style={styles.classPill}><Text style={styles.classPillText}>{selectedClass.className}{selectedClass.division ? ` · Div ${selectedClass.division}` : ''}</Text></View>
              <View style={styles.syllabusPill}><Text style={styles.syllabusPillText}>{selectedClass.syllabus || 'CBSE'}</Text></View>
              <View style={styles.neutralPill}><Text style={styles.neutralPillText}>Marks & grades</Text></View>
            </View>
          )}
        </View>

        {/* Timetable */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <Feather name="calendar" size={15} color={C.garnet} />
              <Text style={styles.sectionTitle}>Exam timetable{selectedClass ? ` · ${selectedClass.className}` : ''}</Text>
            </View>
            {exams.length > 0 && (
              <TouchableOpacity onPress={handleExportTimetable} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.exportLink}>
                <Feather name="file-text" size={13} color={C.green} />
                <Text style={styles.exportLinkText}>Export</Text>
              </TouchableOpacity>
            )}
          </View>

          {hasPermission('create') && (
            <TouchableOpacity style={styles.addBtn} onPress={openCreateForm} activeOpacity={0.9}>
              <Feather name="calendar" size={15} color="#fff" />
              <Text style={styles.addBtnText}>Schedule exam slot</Text>
            </TouchableOpacity>
          )}

          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={C.garnet} /></View>
          ) : exams.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="calendar" size={32} color={C.textFaint} />
              <Text style={styles.emptyTitle}>No exams scheduled</Text>
              <Text style={styles.emptySubtitle}>Schedule the first exam slot for this class to see it here.</Text>
            </View>
          ) : (
            exams.map(item => {
              const statusStyle = STATUS_STYLE[item.status] || STATUS_STYLE.Scheduled;
              return (
                <View key={item._id} style={styles.examCard}>
                  <View style={styles.examCardAccent} />
                  <View style={styles.examCardBody}>
                    <View style={styles.cardHeader}>
                      <View style={styles.catBadge}><Text style={styles.catBadgeText}>{item.examName || item.masterExamId?.name || 'Exam'}</Text></View>
                      <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.statusText, { color: statusStyle.fg }]}>{item.status || 'Scheduled'}</Text>
                      </View>
                    </View>
                    <Text style={styles.subjectName}>{item.subject}</Text>
                    <Text style={styles.slotTitle}>{item.title}</Text>

                    <View style={styles.detailsGrid}>
                      <View style={styles.detailBox}>
                        <Text style={styles.detailLbl}>Date & slot</Text>
                        <Text style={styles.detailVal}>{item.date ? new Date(item.date).toLocaleDateString() : '—'}{item.time ? ` · ${item.time}` : ''}</Text>
                      </View>
                      <View style={styles.detailBox}>
                        <Text style={styles.detailLbl}>Room</Text>
                        <Text style={styles.detailVal}>{item.room || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailBox}>
                        <Text style={styles.detailLbl}>Max / pass</Text>
                        <Text style={styles.detailVal}>{item.maxMarks ?? '-'} / {item.passMarks ?? '-'}</Text>
                      </View>
                    </View>

                    {!!item.invigilator && (
                      <View style={styles.invigilatorRow}>
                        <Feather name="user-check" size={12} color={C.textMuted} />
                        <Text style={styles.invigilatorText}>Invigilator: {item.invigilator}</Text>
                      </View>
                    )}

                    <View style={styles.cardActions}>
                      <TouchableOpacity style={styles.outlineBtn} onPress={() => openMarksModal(item)} activeOpacity={0.85}>
                        <Feather name="check-square" size={14} color={C.green} />
                        <Text style={[styles.outlineBtnText, { color: C.green }]}>Marks</Text>
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        {hasPermission('update') && (
                          <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditForm(item)}>
                            <Feather name="edit-2" size={14} color={C.blue} />
                          </TouchableOpacity>
                        )}
                        {hasPermission('delete') && (
                          <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDeleteExam(item._id)}>
                            <Feather name="trash-2" size={14} color={C.garnet} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Schedule Exam Slot Modal */}
      <Modal visible={isFormVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingExamId ? 'Edit exam slot' : 'Schedule exam slot'}</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}><Text style={{ fontSize: 18, color: '#fff' }}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>

              {renderInlineDropdown('categoryId', 'Master exam category', categoryOptions, formData.categoryId, (v) => {
                const cat = examCategories.find(c => c._id === v);
                setFormData({
                  ...formData,
                  categoryId: v,
                  maxMarks: cat?.defaultMaxMarks ? String(cat.defaultMaxMarks) : formData.maxMarks,
                  passMarks: cat?.defaultPassMarks ? String(cat.defaultPassMarks) : formData.passMarks,
                });
              }, '-- Custom category --')}

              <View style={{ zIndex: 40, marginBottom: 4 }}>
                {renderInlineDropdown('subjectId', 'Subject *', subjectOptions, formData.subjectId, (v) => setFormData({ ...formData, subjectId: v }))}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Exam slot title</Text>
                <TextInput style={styles.input} placeholder="Auto-generated from category + subject" placeholderTextColor={C.textFaint} value={formData.title} onChangeText={t => setFormData({ ...formData, title: t })} />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Exam date *</Text>
                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.datePickerText}>{formData.date.toLocaleDateString()}</Text>
                  <Feather name="calendar" size={16} color={C.textMuted} />
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker value={formData.date} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if (d) setFormData({ ...formData, date: d }); }} />
                )}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10, zIndex: 1 }}>
                  <Text style={styles.inputLabel}>Start time (24h)</Text>
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowStartTimePicker(true)}>
                    <Text style={styles.datePickerText}>{formatTime24(formData.startTime)}</Text>
                    <Feather name="clock" size={16} color={C.textMuted} />
                  </TouchableOpacity>
                  {showStartTimePicker && (
                    <DateTimePicker value={formData.startTime} mode="time" is24Hour display="default" onChange={(e, d) => { setShowStartTimePicker(Platform.OS === 'ios'); if (d) setFormData({ ...formData, startTime: d }); }} />
                  )}
                </View>
                <View style={{ flex: 1, zIndex: 1 }}>
                  <Text style={styles.inputLabel}>End time (24h)</Text>
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowEndTimePicker(true)}>
                    <Text style={styles.datePickerText}>{formatTime24(formData.endTime)}</Text>
                    <Feather name="clock" size={16} color={C.textMuted} />
                  </TouchableOpacity>
                  {showEndTimePicker && (
                    <DateTimePicker value={formData.endTime} mode="time" is24Hour display="default" onChange={(e, d) => { setShowEndTimePicker(Platform.OS === 'ios'); if (d) setFormData({ ...formData, endTime: d }); }} />
                  )}
                </View>
              </View>

              <View style={[styles.row, { zIndex: 30 }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Room / hall</Text>
                  <TextInput style={styles.input} placeholder="Main Hall" placeholderTextColor={C.textFaint} value={formData.room} onChangeText={t => setFormData({ ...formData, room: t })} />
                </View>
                <View style={{ flex: 1 }}>
                  {renderInlineDropdown('invigilator', 'Invigilator', teacherOptions, formData.invigilator, (v) => setFormData({ ...formData, invigilator: v }), 'Select teacher')}
                </View>
              </View>

              <View style={[styles.row, { zIndex: 10 }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Max marks *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.maxMarks} onChangeText={t => setFormData({ ...formData, maxMarks: t })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Passing marks *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.passMarks} onChangeText={t => setFormData({ ...formData, passMarks: t })} />
                </View>
              </View>

              <View style={{ zIndex: 20, marginBottom: 8 }}>
                {renderInlineDropdown('status', 'Status', statusOptions, formData.status, (v) => setFormData({ ...formData, status: v }))}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Remarks / syllabus chapters</Text>
                <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} multiline placeholder="Syllabus details or instructions..." placeholderTextColor={C.textFaint} value={formData.remarks} onChangeText={t => setFormData({ ...formData, remarks: t })} />
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveExam} disabled={saving} activeOpacity={0.9}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingExamId ? 'Save changes' : 'Save & schedule slot'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create Category Modal */}
      <Modal visible={isCategoryModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Add master exam category</Text>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)} style={styles.closeBtnIcon}><Text style={{ fontSize: 18, color: '#fff' }}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Exam category name *</Text>
                <TextInput style={styles.input} placeholder="e.g. Unit Test 1" placeholderTextColor={C.textFaint} value={catFormData.name} onChangeText={t => setCatFormData({ ...catFormData, name: t })} />
              </View>

              <View style={{ zIndex: 30, marginBottom: 16 }}>
                {renderInlineDropdown('term', 'Term / period', TERMS.map(t => ({ label: t, value: t })), catFormData.term, (v) => setCatFormData({ ...catFormData, term: v }))}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Weightage (%)</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={catFormData.weightage} onChangeText={t => setCatFormData({ ...catFormData, weightage: t })} />
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Default max marks</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={catFormData.defaultMax} onChangeText={t => setCatFormData({ ...catFormData, defaultMax: t })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Default pass marks</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={catFormData.defaultPass} onChangeText={t => setCatFormData({ ...catFormData, defaultPass: t })} />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Description / notes</Text>
                <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} multiline placeholder="Optional category guidelines..." placeholderTextColor={C.textFaint} value={catFormData.description} onChangeText={t => setCatFormData({ ...catFormData, description: t })} />
              </View>

              <View style={styles.row}>
                <TouchableOpacity style={[styles.saveBtnFull, styles.cancelBtn, { flex: 1, marginRight: 10 }]} onPress={() => setCategoryModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtnFull, { flex: 1 }]} onPress={handleCreateCategory} disabled={saving} activeOpacity={0.9}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Create category</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Marks Entry Modal — Results-module workflow, matching web */}
      <Modal visible={isMarksModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>Marks entry</Text>
                {!!activeExam && (
                  <Text style={styles.formSubtitle}>
                    {activeExam.title} · Max {activeExam.maxMarks} · Pass {activeExam.passMarks}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setMarksModalVisible(false)} style={styles.closeBtnIcon}><Text style={{ fontSize: 18, color: '#fff' }}>✕</Text></TouchableOpacity>
            </View>

            <View style={styles.marksToolbar}>
              <TouchableOpacity style={styles.toolbarBtn} onPress={handleDownloadResultFormat} activeOpacity={0.85}>
                <Feather name="download" size={14} color={C.green} />
                <Text style={[styles.toolbarBtnText, { color: C.green }]}>Download format</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolbarBtn} onPress={handleUploadExcel} activeOpacity={0.85}>
                <Feather name="upload" size={14} color={C.blue} />
                <Text style={[styles.toolbarBtnText, { color: C.blue }]}>Upload Excel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              {marksLoading ? (
                <View style={styles.center}><ActivityIndicator size="large" color={C.garnet} /></View>
              ) : marksRows.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="users" size={30} color={C.textFaint} />
                  <Text style={styles.emptyTitle}>No students found</Text>
                  <Text style={styles.emptySubtitle}>There are no students linked to this class yet.</Text>
                </View>
              ) : (
                marksRows.map((m, idx) => {
                  const gradeStyle = GRADE_STYLE[m.grade] || { bg: C.slateSoft, fg: C.slate };
                  return (
                    <View key={m.studentId || m.rollNo || idx} style={styles.marksRow}>
                      <View style={styles.marksTopRow}>
                        <View style={styles.avatarCircle}><Text style={styles.avatarText}>{initialsFor(m.studentName)}</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.marksStudentName}>{m.studentName}</Text>
                          <Text style={styles.marksStudentRoll}>Roll No: {m.rollNo || '—'}</Text>
                        </View>
                        <TextInput
                          style={styles.marksInput}
                          keyboardType="numeric"
                          placeholder="—"
                          placeholderTextColor={C.textFaint}
                          value={m.marksObtained}
                          onChangeText={t => updateMarksRow(idx, 'marksObtained', t)}
                        />
                        <View style={[styles.gradePill, { backgroundColor: gradeStyle.bg }]}>
                          <Text style={[styles.gradePillText, { color: gradeStyle.fg }]}>{m.grade || '—'}</Text>
                        </View>
                      </View>
                      <TextInput
                        style={styles.marksRemarksInput}
                        placeholder="Remarks (optional)"
                        placeholderTextColor={C.textFaint}
                        value={m.remarks}
                        onChangeText={t => updateMarksRow(idx, 'remarks', t)}
                      />
                    </View>
                  );
                })
              )}

              {marksRows.length > 0 && (
                <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveMarks} disabled={marksSaving} activeOpacity={0.9}>
                  {marksSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Save exam marks</Text>}
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { padding: 30, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, paddingBottom: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.garnetSoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 23, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 3, lineHeight: 17 },

  kpiGrid: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  kpiCard: { flex: 1, backgroundColor: C.surface, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: C.border, gap: 6, shadowColor: '#1C1917', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  iconCircle: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 21, fontWeight: '800', color: C.text },
  kpiLabel: { fontSize: 11.5, fontWeight: '600', color: C.textMuted },

  sectionCard: { backgroundColor: C.surface, margin: 16, marginBottom: 0, marginTop: 16, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.border, shadowColor: '#1C1917', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  linkAction: { color: C.garnet, fontWeight: '700', fontSize: 12.5 },
  exportLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  exportLinkText: { color: C.green, fontWeight: '700', fontSize: 12.5 },
  mutedText: { color: C.textMuted, fontSize: 12.5, fontStyle: 'italic' },

  categoryScrollCard: { width: 144, backgroundColor: C.surfaceSoft, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border },
  termPill: { backgroundColor: C.garnetSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, alignSelf: 'flex-start' },
  termPillText: { fontSize: 10, fontWeight: '700', color: C.garnet },
  categoryScrollName: { fontSize: 13.5, fontWeight: '800', color: C.text, marginVertical: 8 },
  categoryScrollMax: { fontSize: 11, fontWeight: '600', color: C.textMuted },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classPill: { backgroundColor: C.garnet, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  classPillText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  syllabusPill: { backgroundColor: C.blueSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  syllabusPillText: { color: C.blue, fontWeight: '700', fontSize: 12 },
  neutralPill: { backgroundColor: C.slateSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  neutralPillText: { color: C.slate, fontWeight: '700', fontSize: 12 },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.garnet, paddingVertical: 13, borderRadius: 14, gap: 8, marginBottom: 16, shadowColor: C.garnet, shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  examCard: { flexDirection: 'row', backgroundColor: C.surfaceSoft, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  examCardAccent: { width: 4, backgroundColor: C.garnet },
  examCardBody: { flex: 1, padding: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  catBadge: { backgroundColor: C.amberSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7 },
  catBadgeText: { fontSize: 11, fontWeight: '700', color: C.amber },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7 },
  statusText: { fontSize: 11, fontWeight: '700' },
  subjectName: { fontSize: 18, fontWeight: '800', color: C.text },
  slotTitle: { fontSize: 12.5, color: C.textMuted, marginTop: 2, marginBottom: 12 },

  detailsGrid: { flexDirection: 'row', backgroundColor: C.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  detailBox: { flex: 1 },
  detailLbl: { fontSize: 10.5, color: C.textMuted, fontWeight: '600', marginBottom: 4 },
  detailVal: { fontSize: 12.5, color: C.text, fontWeight: '700' },

  invigilatorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  invigilatorText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.greenSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 6 },
  outlineBtnText: { fontWeight: '700', fontSize: 12 },
  iconBtnEdit: { padding: 9, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  iconBtnDelete: { padding: 9, backgroundColor: '#FBE7E7', borderRadius: 10, borderWidth: 1, borderColor: '#F5D3D3' },

  emptyState: { alignItems: 'center', padding: 32, backgroundColor: C.surfaceSoft, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 10 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(28,25,23,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 22, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.garnet },
  formTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  formSubtitle: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  closeBtnIcon: { padding: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20 },
  formScroll: { padding: 20 },

  marksToolbar: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14 },
  toolbarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSoft },
  toolbarBtnText: { fontSize: 12, fontWeight: '700' },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#4B5563', marginBottom: 6, marginLeft: 2 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  row: { flexDirection: 'row', marginBottom: 16, zIndex: 2 },

  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 14, color: C.text },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.garnet },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '500' },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 76, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  dropdownEmptyText: { padding: 14, color: C.textFaint, fontSize: 13 },
  textBrand: { color: C.garnet, fontWeight: '700' },

  saveBtnFull: { backgroundColor: C.garnet, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 6, shadowColor: C.garnet, shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: { backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, shadowOpacity: 0 },
  cancelBtnText: { color: C.textMuted, fontSize: 15, fontWeight: '800' },

  marksRow: { paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border, gap: 8 },
  marksTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.garnetSoft, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 12, fontWeight: '800', color: C.garnetDeep },
  marksStudentName: { fontSize: 14, fontWeight: '700', color: C.text },
  marksStudentRoll: { fontSize: 11.5, color: C.textMuted, marginTop: 2 },
  marksInput: { width: 60, height: 40, borderWidth: 1, borderColor: C.border, borderRadius: 10, textAlign: 'center', fontWeight: '700', color: C.text, backgroundColor: C.surfaceSoft },
  gradePill: { minWidth: 40, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  gradePillText: { fontSize: 12, fontWeight: '800' },
  marksRemarksInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 38, backgroundColor: C.surfaceSoft, fontSize: 12.5, color: C.text, marginLeft: 44 },
});