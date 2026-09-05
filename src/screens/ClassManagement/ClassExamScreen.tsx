import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { API_BASE } from '../../network/api';


const C = {
  bg: '#F4F6F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#101828', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#E11D2E', primaryDark: '#B91424', primarySoft: '#FEECEC',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
  pink: '#DB2777', pinkSoft: '#FCE7F3',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Scheduled: { bg: C.blueSoft, fg: C.blue },
  Completed: { bg: C.greenSoft, fg: C.green },
  Cancelled: { bg: '#FEE2E2', fg: '#DC2626' },
};

type Option = { label: string; value: string };

const EXAM_STATUSES = ['Scheduled', 'Completed', 'Cancelled'];
const TERMS = ['Term 1', 'Term 2', 'Term 3', 'Annual'];

// --- Safe Time Formatters ---
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

export default function ClassExamsScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [examCategories, setExamCategories] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
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

  // Date/Time Picker States
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const emptyForm = {
    categoryId: '', subjectId: '', title: '', date: new Date(),
    startTime: new Date(new Date().setHours(9, 0, 0, 0)),
    endTime: new Date(new Date().setHours(12, 0, 0, 0)),
    room: '', invigilator: '', maxMarks: '100', passMarks: '33', status: 'Scheduled', remarks: '',
  };
  const [formData, setFormData] = useState(emptyForm);

  const emptyCatForm = { name: '', term: 'Term 1', weightage: '20', defaultMax: '100', defaultPass: '33', description: '' };
  const [catFormData, setCatFormData] = useState(emptyCatForm);

  const [marksDraft, setMarksDraft] = useState<Record<string, string>>({});
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

      // Filter staff list to strictly Teachers
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

  const fetchStudentsForClass = async (classId: string) => {
    try {
      const res = await axios.get(`${API_BASE}/students?classId=${classId}`, authHeaders(authToken));
      setStudents(res.data?.data || []);
    } catch (e) { setStudents([]); }
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
    Alert.alert('Delete Category', 'This will remove the exam category. Continue?', [
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
    setEditingExamId(null);
    setFormData({
      ...emptyForm,
      categoryId: cat?._id || '',
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
    if (!formData.categoryId || !formData.subjectId) { Alert.alert('Missing info', 'Category and Subject are required.'); return; }
    const category = examCategories.find(c => c._id === formData.categoryId);
    const subject = subjects.find(s => s._id === formData.subjectId);
    const autoTitle = formData.title || `${category?.name || ''} - ${subject?.name || ''}`;
    setSaving(true);
    try {
      const formattedTime = `${formatTime24(formData.startTime)} - ${formatTime24(formData.endTime)}`;
      const payload = {
        masterExamId: formData.categoryId,
        examName: category?.name,
        term: category?.term,
        subject: subject?.name,
        subjectId: formData.subjectId,
        classId: selectedClassId,
        title: autoTitle,
        date: formData.date.toISOString().split('T')[0],
        time: formattedTime,
        room: formData.room,
        invigilator: formData.invigilator, // We store the teacher name string
        maxMarks: Number(formData.maxMarks) || 0,
        passMarks: Number(formData.passMarks) || 0,
        status: formData.status,
        remarks: formData.remarks,
      };

      if (editingExamId) {
        await axios.put(`${API_BASE}/exams/${editingExamId}`, payload, authHeaders(authToken));
        Alert.alert('Updated', 'Exam slot updated successfully.');
      } else {
        await axios.post(`${API_BASE}/exams`, payload, authHeaders(authToken));
        Alert.alert('Success', 'Exam scheduled successfully.');
      }
      setFormVisible(false);
      fetchExams(authToken, selectedClassId, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to schedule exam.');
    } finally { setSaving(false); }
  };

  const handleDeleteExam = (id: string) => {
    Alert.alert('Delete Exam', 'This exam slot will be permanently removed. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/exams/${id}`, authHeaders(authToken));
            setExams(prev => prev.filter(e => e._id !== id));
          } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to delete exam.'); }
        },
      },
    ]);
  };

  const openMarksModal = async (exam: any) => {
    setActiveExam(exam);
    const draft: Record<string, string> = {};
    (exam.marks || []).forEach((m: any) => { draft[m.studentId] = String(m.obtained ?? ''); });
    setMarksDraft(draft);
    setMarksModalVisible(true);
    await fetchStudentsForClass(selectedClassId);
  };

  const handleSaveMarks = async () => {
    if (!activeExam) return;
    setMarksSaving(true);
    try {
      const marks = Object.entries(marksDraft)
        .filter(([, v]) => v !== '')
        .map(([studentId, obtained]) => ({ studentId, obtained: Number(obtained) }));
      await axios.post(`${API_BASE}/exams/${activeExam._id}/marks`, { marks }, authHeaders(authToken));
      Alert.alert('Saved', 'Marks recorded successfully.');
      setMarksModalVisible(false);
      fetchExams(authToken, selectedClassId, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save marks.');
    } finally { setMarksSaving(false); }
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
                  {value === opt.value && <Feather name="check" size={14} color={C.primary} />}
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
  const teacherOptions: Option[] = teachers.map(t => ({ label: t.name, value: t.name })); // Use name as value to match backend string field
  const statusOptions: Option[] = EXAM_STATUSES.map(s => ({ label: s, value: s }));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        stickyHeaderIndices={undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchExams(authToken, selectedClassId, true)} colors={[C.primary]} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerIconBadge}><Feather name="award" size={20} color={C.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Class Exams</Text>
            <Text style={styles.subtitle}>Examination schedules, categories &amp; grading matrices.</Text>
          </View>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: C.pinkSoft }]}><Feather name="file-text" size={16} color={C.pink} /></View>
              <Text style={styles.kpiValue}>{exams.length}</Text>
            </View>
            <Text style={styles.kpiLabel}>TOTAL EXAMS</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: C.amberSoft }]}><Feather name="tag" size={16} color={C.amber} /></View>
              <Text style={styles.kpiValue}>{examCategories.length}</Text>
            </View>
            <Text style={styles.kpiLabel}>CATEGORIES</Text>
          </View>
        </View>

        {/* Master Categories Horizontal Scroll (Modern UI replacing bulky rows) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <Feather name="folder" size={15} color={C.primary} />
              <Text style={styles.sectionTitle}>Master Exam Categories</Text>
            </View>
            {hasPermission('create') && (
              <TouchableOpacity onPress={() => setCategoryModalVisible(true)}>
                <Text style={styles.linkAction}>+ Create</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {examCategories.length === 0 ? (
            <Text style={styles.mutedText}>No categories yet. Create one to schedule exams.</Text>
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
                     <Text style={styles.categoryScrollMax}>Max: {cat.defaultMaxMarks ?? '-'}</Text>
                     <Text style={styles.categoryScrollMax}>Pass: {cat.defaultPassMarks ?? '-'}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.inputLabel}>Select Target Class</Text>
          {renderInlineDropdown('classFilter', '', classOptions, selectedClassId, (v) => { setSelectedClassId(v); fetchExams(authToken, v); }, 'Choose a class')}
          {selectedClass && (
            <View style={[styles.chipWrap, { marginTop: 4 }]}>
              <View style={styles.classPill}><Text style={styles.classPillText}>{selectedClass.className}{selectedClass.division ? ` - Div ${selectedClass.division}` : ''}</Text></View>
              <View style={styles.syllabusPill}><Text style={styles.syllabusPillText}>Syllabus: {selectedClass.syllabus || 'CBSE'}</Text></View>
              <View style={styles.neutralPill}><Text style={styles.neutralPillText}>Evaluation: Marks &amp; Grades</Text></View>
            </View>
          )}
        </View>

        {/* Timetable List */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.checkBadge}><Feather name="check" size={12} color="#fff" /></View>
              <Text style={styles.sectionTitle}>Exam Timetable{selectedClass ? ` (${selectedClass.className})` : ''}</Text>
            </View>
          </View>

          {hasPermission('create') && (
            <TouchableOpacity style={styles.addBtn} onPress={openCreateForm} activeOpacity={0.9}>
              <Feather name="calendar" size={15} color="#fff" />
              <Text style={styles.addBtnText}>Schedule Exam Slot</Text>
            </TouchableOpacity>
          )}

          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
          ) : exams.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="calendar" size={36} color={C.textFaint} />
              <Text style={styles.emptyTitle}>No exams scheduled</Text>
              <Text style={styles.emptySubtitle}>Schedule the first exam slot for this class.</Text>
            </View>
          ) : (
            exams.map(item => {
              const statusStyle = STATUS_STYLE[item.status] || STATUS_STYLE.Scheduled;
              return (
                <View key={item._id} style={styles.examCard}>
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
                      <Text style={styles.detailLbl}>DATE &amp; SLOT</Text>
                      <Text style={styles.detailVal}>{item.date ? new Date(item.date).toLocaleDateString() : '—'}{item.time ? ` • ${item.time}` : ''}</Text>
                    </View>
                    <View style={styles.detailBox}>
                      <Text style={styles.detailLbl}>ROOM</Text>
                      <Text style={styles.detailVal}>{item.room || 'N/A'}</Text>
                    </View>
                    <View style={styles.detailBox}>
                      <Text style={styles.detailLbl}>MAX / PASS</Text>
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
                    <TouchableOpacity style={styles.outlineBtn} onPress={() => openMarksModal(item)}>
                      <Feather name="check-square" size={14} color={C.green} />
                      <Text style={[styles.outlineBtnText, { color: C.green }]}>Marks</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {hasPermission('update') && (
                        <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditForm(item)}>
                          <Feather name="edit-2" size={14} color={C.green} />
                        </TouchableOpacity>
                      )}
                      {hasPermission('delete') && (
                        <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDeleteExam(item._id)}>
                          <Feather name="trash-2" size={14} color={C.primary} />
                        </TouchableOpacity>
                      )}
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
              <Text style={styles.formTitle}>{editingExamId ? 'Edit Exam Slot' : 'Schedule Exam Slot'}</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              {renderInlineDropdown('categoryId', 'Master Exam Category *', categoryOptions, formData.categoryId, (v) => setFormData({ ...formData, categoryId: v }))}
              
              <View style={{ zIndex: 40, marginBottom: 4 }}>
                {renderInlineDropdown('subjectId', 'Subject *', subjectOptions, formData.subjectId, (v) => setFormData({ ...formData, subjectId: v }))}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Exam Slot Title</Text>
                <TextInput style={styles.input} placeholder="Auto-generated from category + subject" placeholderTextColor={C.textFaint} value={formData.title} onChangeText={t => setFormData({ ...formData, title: t })} />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Exam Date *</Text>
                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.datePickerText}>{formData.date.toLocaleDateString()}</Text>
                  <Feather name="calendar" size={16} color={C.textMuted} />
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker value={formData.date} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if (d) setFormData({ ...formData, date: d }); }} />
                )}
              </View>

              {/* 24-Hour Time Pickers */}
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10, zIndex: 1 }}>
                  <Text style={styles.inputLabel}>Start Time (24h)</Text>
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowStartTimePicker(true)}>
                    <Text style={styles.datePickerText}>{formatTime24(formData.startTime)}</Text>
                    <Feather name="clock" size={16} color={C.textMuted} />
                  </TouchableOpacity>
                  {showStartTimePicker && (
                    <DateTimePicker value={formData.startTime} mode="time" is24Hour={true} display="default" onChange={(e, d) => { setShowStartTimePicker(Platform.OS === 'ios'); if (d) setFormData({ ...formData, startTime: d }); }} />
                  )}
                </View>
                <View style={{ flex: 1, zIndex: 1 }}>
                  <Text style={styles.inputLabel}>End Time (24h)</Text>
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowEndTimePicker(true)}>
                    <Text style={styles.datePickerText}>{formatTime24(formData.endTime)}</Text>
                    <Feather name="clock" size={16} color={C.textMuted} />
                  </TouchableOpacity>
                  {showEndTimePicker && (
                    <DateTimePicker value={formData.endTime} mode="time" is24Hour={true} display="default" onChange={(e, d) => { setShowEndTimePicker(Platform.OS === 'ios'); if (d) setFormData({ ...formData, endTime: d }); }} />
                  )}
                </View>
              </View>

              <View style={[styles.row, { zIndex: 30 }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Exam Room / Hall</Text>
                  <TextInput style={styles.input} placeholder="Main Hall" placeholderTextColor={C.textFaint} value={formData.room} onChangeText={t => setFormData({ ...formData, room: t })} />
                </View>
                <View style={{ flex: 1 }}>
                  {renderInlineDropdown('invigilator', 'Invigilator (Teacher)', teacherOptions, formData.invigilator, (v) => setFormData({ ...formData, invigilator: v }), 'Select Teacher')}
                </View>
              </View>

              <View style={[styles.row, { zIndex: 10 }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Max Marks *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.maxMarks} onChangeText={t => setFormData({ ...formData, maxMarks: t })} />
                </View>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Passing Marks *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.passMarks} onChangeText={t => setFormData({ ...formData, passMarks: t })} />
                </View>
              </View>

              <View style={{ zIndex: 20, marginBottom: 8 }}>
                {renderInlineDropdown('status', 'Status', statusOptions, formData.status, (v) => setFormData({ ...formData, status: v }))}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Remarks / Syllabus Chapters</Text>
                <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} multiline placeholder="Enter syllabus details or instructions..." placeholderTextColor={C.textFaint} value={formData.remarks} onChangeText={t => setFormData({ ...formData, remarks: t })} />
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveExam} disabled={saving} activeOpacity={0.9}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingExamId ? 'Save Changes' : 'Save & Schedule Slot'}</Text>}
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
              <Text style={styles.formTitle}>Add Master Exam Category</Text>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.inputWrapper}><Text style={styles.inputLabel}>Exam Category Name *</Text><TextInput style={styles.input} placeholder="e.g. Unit Test 1" placeholderTextColor={C.textFaint} value={catFormData.name} onChangeText={t => setCatFormData({ ...catFormData, name: t })} /></View>

              <View style={{ zIndex: 30, marginBottom: 16 }}>
                {renderInlineDropdown('term', 'Term / Period', TERMS.map(t => ({ label: t, value: t })), catFormData.term, (v) => setCatFormData({ ...catFormData, term: v }))}
              </View>

              <View style={styles.inputWrapper}><Text style={styles.inputLabel}>Weightage (%)</Text><TextInput style={styles.input} keyboardType="numeric" value={catFormData.weightage} onChangeText={t => setCatFormData({ ...catFormData, weightage: t })} /></View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}><Text style={styles.inputLabel}>Default Max Marks</Text><TextInput style={styles.input} keyboardType="numeric" value={catFormData.defaultMax} onChangeText={t => setCatFormData({ ...catFormData, defaultMax: t })} /></View>
                <View style={{ flex: 1 }}><Text style={styles.inputLabel}>Default Pass Marks</Text><TextInput style={styles.input} keyboardType="numeric" value={catFormData.defaultPass} onChangeText={t => setCatFormData({ ...catFormData, defaultPass: t })} /></View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Description / Notes</Text>
                <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} multiline placeholder="Optional category guidelines..." placeholderTextColor={C.textFaint} value={catFormData.description} onChangeText={t => setCatFormData({ ...catFormData, description: t })} />
              </View>

              <View style={styles.row}>
                <TouchableOpacity style={[styles.saveBtnFull, styles.cancelBtn, { flex: 1, marginRight: 10 }]} onPress={() => setCategoryModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtnFull, { flex: 1 }]} onPress={handleCreateCategory} disabled={saving} activeOpacity={0.9}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Create Category</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Marks Modal */}
      <Modal visible={isMarksModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>Enter Marks</Text>
                {!!activeExam && <Text style={styles.formSubtitle}>{activeExam.title} • Max {activeExam.maxMarks}</Text>}
              </View>
              <TouchableOpacity onPress={() => setMarksModalVisible(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              {students.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="users" size={30} color={C.textFaint} />
                  <Text style={styles.emptyTitle}>No students found</Text>
                  <Text style={styles.emptySubtitle}>There are no students linked to this class yet.</Text>
                </View>
              ) : students.map(st => (
                <View key={st._id} style={styles.marksRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.marksStudentName}>{st.name}</Text>
                    <Text style={styles.marksStudentRoll}>Roll No: {st.rollNo ?? '—'}</Text>
                  </View>
                  <TextInput
                    style={styles.marksInput}
                    keyboardType="numeric"
                    placeholder="—"
                    placeholderTextColor={C.textFaint}
                    value={marksDraft[st._id] ?? ''}
                    onChangeText={t => setMarksDraft({ ...marksDraft, [st._id]: t })}
                  />
                </View>
              ))}

              {students.length > 0 && (
                <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveMarks} disabled={marksSaving} activeOpacity={0.9}>
                  {marksSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Save Marks</Text>}
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
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 23, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 3, lineHeight: 17 },

  kpiGrid: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  kpiCard: { flex: 1, backgroundColor: C.surface, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: C.border, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  kpiRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 20, fontWeight: '800', color: C.text },
  kpiLabel: { fontSize: 9.5, fontWeight: '800', color: C.textMuted, letterSpacing: 0.6 },

  sectionCard: { backgroundColor: C.surface, margin: 16, marginBottom: 0, marginTop: 16, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.border, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  linkAction: { color: C.primary, fontWeight: '700', fontSize: 12.5 },
  mutedText: { color: C.textMuted, fontSize: 12.5, fontStyle: 'italic' },

  checkBadge: { width: 20, height: 20, borderRadius: 6, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },

  // Master Categories Horizontal Scroll Styles
  categoryScrollCard: { width: 140, backgroundColor: C.surfaceSoft, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border },
  termPill: { backgroundColor: C.primarySoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  termPillText: { fontSize: 9, fontWeight: '800', color: C.primary, textTransform: 'uppercase' },
  categoryScrollName: { fontSize: 13, fontWeight: '800', color: C.text, marginVertical: 8 },
  categoryScrollMax: { fontSize: 10, fontWeight: '700', color: C.textMuted },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classPill: { backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  classPillText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  syllabusPill: { backgroundColor: C.blueSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  syllabusPillText: { color: C.blue, fontWeight: '700', fontSize: 12 },
  neutralPill: { backgroundColor: C.slateSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  neutralPillText: { color: C.slate, fontWeight: '700', fontSize: 12 },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, paddingVertical: 13, borderRadius: 14, gap: 8, marginBottom: 16, shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  examCard: { backgroundColor: C.surfaceSoft, borderRadius: 16, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  catBadge: { backgroundColor: C.pinkSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7 },
  catBadgeText: { fontSize: 11, fontWeight: '800', color: C.pink },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  subjectName: { fontSize: 18, fontWeight: '800', color: C.text },
  slotTitle: { fontSize: 12.5, color: C.textMuted, marginTop: 2, marginBottom: 12 },

  detailsGrid: { flexDirection: 'row', backgroundColor: C.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  detailBox: { flex: 1 },
  detailLbl: { fontSize: 9, color: C.textMuted, fontWeight: '800', marginBottom: 4, letterSpacing: 0.4 },
  detailVal: { fontSize: 12.5, color: C.text, fontWeight: '700' },

  invigilatorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  invigilatorText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.greenSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 6 },
  outlineBtnText: { fontWeight: '700', fontSize: 12 },
  iconBtnEdit: { padding: 9, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  iconBtnDelete: { padding: 9, backgroundColor: '#FEF2F2', borderRadius: 10, borderWidth: 1, borderColor: '#FEE2E2' },

  emptyState: { alignItems: 'center', padding: 32, backgroundColor: C.surfaceSoft, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 10 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 22, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.primary },
  formTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  formSubtitle: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  closeBtnIcon: { padding: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20 },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#4B5563', marginBottom: 6, marginLeft: 2 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  row: { flexDirection: 'row', marginBottom: 16, zIndex: 2 },

  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 14, color: C.text },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '500' },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 76, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  dropdownEmptyText: { padding: 14, color: C.textFaint, fontSize: 13 },
  textBrand: { color: C.primary, fontWeight: '700' },

  saveBtnFull: { backgroundColor: C.primary, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 6, shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: { backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, shadowOpacity: 0 },
  cancelBtnText: { color: C.textMuted, fontSize: 15, fontWeight: '800' },

  marksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border },
  marksStudentName: { fontSize: 14, fontWeight: '700', color: C.text },
  marksStudentRoll: { fontSize: 11.5, color: C.textMuted, marginTop: 2 },
  marksInput: { width: 70, height: 41, borderWidth: 1, borderColor: C.border, borderRadius: 10, textAlign: 'center', fontWeight: '700', color: C.text, backgroundColor: C.surfaceSoft },
});