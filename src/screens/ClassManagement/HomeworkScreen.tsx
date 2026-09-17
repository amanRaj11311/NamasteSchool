import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import DocumentPicker from '@react-native-documents/picker';
import axios from 'axios';
import { API_BASE } from '../../network/api';
import { COLORS } from '../../constants/theme';


const C = {
  bg: '#F6F6F9',
  surface: '#FFFFFF',
  surfaceSoft: '#FBFBFD',
  surfaceSunken: '#F1F2F6',
  border: '#E8E9EF',
  borderStrong: '#DBDDE6',

  text: '#14161F',
  textMuted: '#6B7280',
  textFaint: '#9AA0AC',

  // Brand red — used sparingly now, as an accent rather than a wash.
  primary: '#B3122A',
  primaryBright: '#D2263F',
  primaryDeep: '#7A0C1D',
  primarySoft: '#FBEEEF',
  primaryTint: '#F3D6D9',

  // Ink — the new anchor surface (header, dark buttons, active states).
  ink: '#0D0F16',
  inkSoft: '#181B24',
  inkFaint: 'rgba(255,255,255,0.62)',

  gold: '#C7A466',
  goldSoft: 'rgba(199,164,102,0.14)',

  blue: '#0EA5E9',
  blueSoft: '#E7F6FE',
  green: '#0F9D6B',
  greenSoft: '#E6F8F1',
  slate: '#475467',
  slateSoft: '#F1F3F7',
};

type Option = { label: string; value: string };

export default function ClassHomeworkScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [homeworks, setHomeworks] = useState<any[]>([]);

  const [filterClassId, setFilterClassId] = useState('');
  const [filterSubjectId, setFilterSubjectId] = useState('');
  const [searchTitle, setSearchTitle] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modals & Form
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isFormVisible, setFormVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [isSubmitModalVisible, setSubmitModalVisible] = useState(false);
  const [submitFor, setSubmitFor] = useState<any>(null);
  const [submitForm, setSubmitForm] = useState({ studentName: '', rollNo: '', studentId: '', notes: '' });
  const [submitFile, setSubmitFile] = useState<any>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradingMarks, setGradingMarks] = useState('');

  const emptyForm = {
    title: '', description: '', classId: '', division: '', subjectId: '',
    dueDate: new Date(), dueTime: '', maxMarks: '10', allowLate: true,
  };
  const [formData, setFormData] = useState(emptyForm);
  const [file, setFile] = useState<any>(null);

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

  const authHeaders = (token: string | null, extra?: any) => ({ headers: { Authorization: `Bearer ${token}`, ...extra } });

  const fetchDependencies = async (token: string | null) => {
    setLoading(true);
    try {
      const [clsRes, subRes] = await Promise.all([
        axios.get(`${API_BASE}/classes`, authHeaders(token)),
        axios.get(`${API_BASE}/subjects`, authHeaders(token)),
      ]);
      setClasses(clsRes.data?.data || []);
      setSubjects(subRes.data?.data || []);
      fetchHomeworks(token);
    } catch (e) { console.error(e); setLoading(false); }
  };

  const fetchHomeworks = async (token: string | null, isRefresh = false, opts?: { classId?: string; subjectId?: string; search?: string }) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const classId = opts?.classId !== undefined ? opts.classId : filterClassId;
      const subjectId = opts?.subjectId !== undefined ? opts.subjectId : filterSubjectId;
      const search = opts?.search !== undefined ? opts.search : searchTitle;
      const params: string[] = [];
      if (classId) params.push(`classId=${classId}`);
      if (subjectId) params.push(`subjectId=${subjectId}`);
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      const res = await axios.get(`${API_BASE}/homework${params.length ? `?${params.join('&')}` : ''}`, authHeaders(token));
      setHomeworks(res.data?.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'homework' && p.action === action);
  }, [permissions, isSuperAdmin]);

  // ---- Create / Edit ----
  const openCreateForm = () => { setEditingId(null); setFormData(emptyForm); setFile(null); setFormVisible(true); };

  const openEditForm = (hw: any) => {
    setEditingId(hw._id);
    setFormData({
      title: hw.title || '',
      description: hw.description || '',
      classId: hw.classId?._id || hw.classId || '',
      division: hw.division || '',
      subjectId: hw.subjectId?._id || hw.subjectId || '',
      dueDate: hw.dueDate ? new Date(hw.dueDate) : new Date(),
      dueTime: hw.dueTime || '',
      maxMarks: String(hw.maxMarks ?? '10'),
      allowLate: hw.allowLate ?? true,
    });
    setFile(null);
    setFormVisible(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.classId) { Alert.alert('Missing info', 'Title and Class are required.'); return; }
    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('classId', formData.classId);
      if (formData.division) payload.append('division', formData.division);
      payload.append('subjectId', formData.subjectId);
      payload.append('title', formData.title);
      payload.append('description', formData.description);
      payload.append('dueDate', formData.dueDate.toISOString());
      if (formData.dueTime) payload.append('dueTime', formData.dueTime);
      payload.append('maxMarks', formData.maxMarks);
      payload.append('allowLate', String(formData.allowLate));
      if (file) payload.append('attachment', { uri: file.uri, type: file.type, name: file.name } as any);

      if (editingId) {
        await axios.put(`${API_BASE}/homework/${editingId}`, payload, authHeaders(authToken, { 'Content-Type': 'multipart/form-data' }));
        Alert.alert('Updated', 'Homework updated successfully.');
      } else {
        await axios.post(`${API_BASE}/homework`, payload, authHeaders(authToken, { 'Content-Type': 'multipart/form-data' }));
        Alert.alert('Success', 'Homework assigned.');
      }
      setFormVisible(false);
      fetchHomeworks(authToken, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to assign.');
    } finally { setSaving(false); }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Homework', 'This homework and its submissions will be removed. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/homework/${id}`, authHeaders(authToken));
            setHomeworks(prev => prev.filter(h => h._id !== id));
            if (expandedId === id) setExpandedId(null);
          } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to delete.'); }
        },
      },
    ]);
  };

  // ---- Expand card -> load submissions ----
  const toggleExpand = async (hw: any) => {
    if (expandedId === hw._id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(hw._id);
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/homework/${hw._id}/submissions`, authHeaders(authToken));
      setDetail({ homework: hw, submissions: res.data?.data || [] });
    } catch (e) {
      setDetail({ homework: hw, submissions: [] });
    } finally { setDetailLoading(false); }
  };

  // ---- Submit homework (student-side simulation) ----
  const openSubmitModal = (hw: any) => {
    setSubmitFor(hw);
    setSubmitForm({ studentName: '', rollNo: '', studentId: '', notes: '' });
    setSubmitFile(null);
    setSubmitModalVisible(true);
  };

  const handleSubmitHomework = async () => {
    if (!submitForm.studentName.trim()) { Alert.alert('Missing info', 'Student name is required.'); return; }
    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('studentName', submitForm.studentName);
      if (submitForm.rollNo) payload.append('rollNo', submitForm.rollNo);
      if (submitForm.studentId) payload.append('studentId', submitForm.studentId);
      payload.append('notes', submitForm.notes);
      if (submitFile) payload.append('attachment', { uri: submitFile.uri, type: submitFile.type, name: submitFile.name } as any);

      await axios.post(`${API_BASE}/homework/${submitFor._id}/submissions`, payload, authHeaders(authToken, { 'Content-Type': 'multipart/form-data' }));
      Alert.alert('Submitted', 'Homework submission recorded.');
      setSubmitModalVisible(false);
      fetchHomeworks(authToken, true);
      if (expandedId === submitFor._id) toggleExpand({ _id: '__reload__' }), toggleExpand(submitFor);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to submit.');
    } finally { setSaving(false); }
  };

  // ---- Grade a submission ----
  const handleGrade = async (submissionId: string) => {
    if (!gradingMarks) return;
    try {
      await axios.put(`${API_BASE}/homework/submissions/${submissionId}`, { marks: Number(gradingMarks), status: 'Checked' }, authHeaders(authToken));
      setGradingId(null);
      setGradingMarks('');
      if (detail?.homework) toggleExpand({ _id: '__reload__' }), toggleExpand(detail.homework);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save marks.');
    }
  };

  const renderInlineDropdown = (fieldKey: string, label: string, options: Option[], value: string, onSelect: (v: string) => void, placeholder = 'Select...', showLabel = true) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 60 : 1 }]}>
        {showLabel && !!label && <Text style={styles.inputLabel}>{label}</Text>}
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || placeholder}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 190 }}>
              {options.map(opt => (
                <TouchableOpacity key={opt.value || 'all'} style={styles.dropdownItem} onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}>
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

  const classOptions: Option[] = [{ label: 'All Classes', value: '' }, ...classes.map(c => ({ label: `${c.className}${c.division ? ` - ${c.division}` : ''}`, value: c._id }))];
  const subjectFilterOptions: Option[] = [{ label: 'All Subjects', value: '' }, ...subjects.map(s => ({ label: s.name, value: s._id }))];
  const formClassOptions: Option[] = classes.map(c => ({ label: `${c.className}${c.division ? ` - ${c.division}` : ''}`, value: c._id }));
  const subjectOptions: Option[] = subjects.map(s => ({ label: s.name, value: s._id }));

  const checkedCount = (hw: any) => hw.checkedCount ?? hw.submissions?.filter((s: any) => s.status === 'Checked').length ?? 0;
  const subCount = (hw: any) => hw.submissionCount ?? hw.submissions?.length ?? 0;
  const isOverdue = (hw: any) => hw.dueDate && new Date(hw.dueDate).getTime() < Date.now();

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={homeworks}
        keyExtractor={item => item._id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchHomeworks(authToken, true)} colors={[C.primary]} />}
        ListHeaderComponent={
          <View>
            <View style={styles.headerCard}>
              <View style={styles.headerRow}>
                <View style={styles.headerIconBadge}><Feather name="edit-3" size={20} color={C.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Homework</Text>
                  <Text style={styles.subtitle}>Teachers can assign homework • Students can submit • Teachers can check</Text>
                </View>
              </View>
              {hasPermission('create') && (
                <TouchableOpacity style={styles.addBtn} onPress={openCreateForm} activeOpacity={0.9}>
                  <Feather name="plus" size={15} color="#fff" />
                  <Text style={styles.addBtnText}>Assign Homework</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <View style={styles.kpiRow}>
                  <View style={[styles.iconCircle, { backgroundColor: C.blueSoft }]}><Feather name="file-text" size={15} color={C.blue} /></View>
                  <Text style={styles.kpiValue}>{homeworks.length}</Text>
                </View>
                <Text style={styles.kpiLabel}>TOTAL ASSIGNMENTS</Text>
              </View>
              <View style={styles.kpiCard}>
                <View style={styles.kpiRow}>
                  <View style={[styles.iconCircle, { backgroundColor: C.greenSoft }]}><Feather name="check-circle" size={15} color={C.green} /></View>
                  <Text style={styles.kpiValue}>{homeworks.reduce((a, h) => a + checkedCount(h), 0)}</Text>
                </View>
                <Text style={styles.kpiLabel}>CHECKED</Text>
              </View>
            </View>

            <View style={styles.filterCard}>
              <View style={styles.filterGrid}>
                <View style={{ flex: 1, zIndex: 40 }}>{renderInlineDropdown('classFilter', '', classOptions, filterClassId, (v) => { setFilterClassId(v); fetchHomeworks(authToken, true, { classId: v }); }, 'All Classes', false)}</View>
                <View style={{ flex: 1, zIndex: 30 }}>{renderInlineDropdown('subjectFilter', '', subjectFilterOptions, filterSubjectId, (v) => { setFilterSubjectId(v); fetchHomeworks(authToken, true, { subjectId: v }); }, 'All Subjects', false)}</View>
              </View>
              <View style={styles.searchRow}>
                <View style={styles.searchBox}>
                  <Feather name="search" size={14} color={C.textFaint} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search title..."
                    placeholderTextColor={C.textFaint}
                    value={searchTitle}
                    onChangeText={setSearchTitle}
                    onSubmitEditing={() => fetchHomeworks(authToken, true)}
                    returnKeyType="search"
                  />
                </View>
                <TouchableOpacity style={styles.refreshBtn} onPress={() => fetchHomeworks(authToken, true)}>
                  <Feather name="refresh-ccw" size={15} color={C.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {loading && <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>}
          </View>
        }
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyState}>
            <Feather name="folder-minus" size={38} color={C.textFaint} />
            <Text style={styles.emptyTitle}>No homework assigned yet</Text>
            <Text style={styles.emptySubtitle}>Tap "Assign Homework" to create the first one.</Text>
          </View>
        ) : null}
        renderItem={({ item }) => {
          const expanded = expandedId === item._id;
          const overdue = isOverdue(item);
          return (
            <View style={[styles.card, expanded && styles.cardExpanded]}>
              <TouchableOpacity onPress={() => toggleExpand(item)} activeOpacity={0.85}>
                <View style={[styles.cardHeaderRow, expanded && styles.cardHeaderRowExpanded]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, expanded && { color: '#fff' }]}>{item.title}</Text>
                    <View style={styles.tagRow}>
                      <View style={[styles.tagChip, expanded && styles.tagChipExpanded]}>
                        <Feather name="book-open" size={10} color={expanded ? '#fff' : C.textMuted} />
                        <Text style={[styles.tagChipText, expanded && { color: '#fff' }]}>{item.classId?.className || item.className || '—'}</Text>
                      </View>
                      <View style={[styles.tagChip, expanded && styles.tagChipExpanded]}>
                        <Text style={[styles.tagChipText, expanded && { color: '#fff' }]}>{item.subjectId?.name || item.subject || '—'}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.badgeCol}>
                    <View style={[styles.countBadge, expanded && styles.countBadgeExpanded]}><Text style={[styles.countBadgeText, expanded && { color: '#fff' }]}>{subCount(item)} sub</Text></View>
                    <View style={[styles.checkedBadge, expanded && styles.checkedBadgeExpanded]}><Text style={[styles.checkedBadgeText, expanded && { color: '#fff' }]}>{checkedCount(item)} checked</Text></View>
                  </View>
                </View>

                {!!item.dueDate && (
                  <View style={styles.dueRow}>
                    <Feather name="clock" size={12} color={overdue ? '#DC2626' : C.textMuted} />
                    <Text style={[styles.dueText, overdue && styles.dueTextOverdue]}>
                      Due: {new Date(item.dueDate).toLocaleDateString()}{item.dueTime ? ` ${item.dueTime}` : ''}{overdue ? ' (Overdue)' : ''}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {expanded && (
                <View style={styles.detailPane}>
                  <Text style={styles.detailMeta}>Max Marks: {item.maxMarks ?? '—'} {item.allowLate ? '• Late allowed' : ''}</Text>
                  {!!item.description && <Text style={styles.detailDesc}>{item.description}</Text>}

                  {!!item.attachment && (
                    <View style={styles.attachmentRow}>
                      <Text style={styles.detailSectionLabel}>ATTACHMENTS</Text>
                      <View style={styles.attachmentChip}>
                        <Feather name="paperclip" size={12} color={C.textMuted} />
                        <Text style={styles.attachmentChipText} numberOfLines={1}>{item.attachment.split('/').pop()}</Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.submissionsHeaderRow}>
                    <Text style={styles.detailSectionLabel}>SUBMISSIONS ({detail?.submissions?.length ?? 0})</Text>
                    <TouchableOpacity style={styles.submitSmallBtn} onPress={() => openSubmitModal(item)}>
                      <Feather name="upload" size={12} color="#fff" />
                      <Text style={styles.submitSmallBtnText}>Submit</Text>
                    </TouchableOpacity>
                  </View>

                  {detailLoading ? (
                    <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} />
                  ) : (detail?.submissions?.length ?? 0) === 0 ? (
                    <Text style={styles.noSubmissionsText}>No submissions yet.</Text>
                  ) : (
                    detail.submissions.map((sub: any) => (
                      <View key={sub._id} style={styles.submissionRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.submissionName}>{sub.studentName}</Text>
                          <Text style={styles.submissionMeta}>Roll {sub.rollNo ?? '—'} • {sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : ''}</Text>
                        </View>
                        <View style={[styles.statusPill, { backgroundColor: sub.status === 'Checked' ? C.greenSoft : '#FEF3C7' }]}>
                          <Text style={[styles.statusPillText, { color: sub.status === 'Checked' ? C.green : '#B45309' }]}>{sub.status || 'Pending'}</Text>
                        </View>
                        {gradingId === sub._id ? (
                          <View style={styles.gradeInputRow}>
                            <TextInput style={styles.gradeInput} keyboardType="numeric" autoFocus value={gradingMarks} onChangeText={setGradingMarks} placeholder="0" />
                            <TouchableOpacity onPress={() => handleGrade(sub._id)}><Feather name="check" size={16} color={C.green} /></TouchableOpacity>
                            <TouchableOpacity onPress={() => { setGradingId(null); setGradingMarks(''); }}><Feather name="x" size={16} color={C.primary} /></TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity style={styles.marksTag} onPress={() => { setGradingId(sub._id); setGradingMarks(sub.marks != null ? String(sub.marks) : ''); }}>
                            <Text style={styles.marksTagText}>{sub.marks != null ? `${sub.marks}/${item.maxMarks}` : 'Grade'}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  )}
                </View>
              )}

              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.outlineBtn} onPress={() => toggleExpand(item)}>
                  <Feather name="users" size={14} color={C.blue} />
                  <Text style={[styles.outlineBtnText, { color: C.blue }]}>{expanded ? 'Hide Details' : 'View Submissions'}</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {hasPermission('update') && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditForm(item)}><Feather name="edit-2" size={14} color={C.green} /></TouchableOpacity>}
                  {hasPermission('delete') && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(item._id)}><Feather name="trash-2" size={14} color={C.primary} /></TouchableOpacity>}
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* Assign Homework Modal */}
      <Modal visible={isFormVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingId ? 'Edit Homework' : 'Assign Homework'}</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Title *</Text>
                <TextInput style={styles.input} placeholder="e.g. Chapter 4 Exercises" placeholderTextColor={C.textFaint} value={formData.title} onChangeText={t => setFormData({ ...formData, title: t })} />
              </View>

              {renderInlineDropdown('formClass', 'Class *', formClassOptions, formData.classId, (v) => setFormData({ ...formData, classId: v }))}
              {renderInlineDropdown('formSubject', 'Subject', subjectOptions, formData.subjectId, (v) => setFormData({ ...formData, subjectId: v }))}

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Due Date *</Text>
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.datePickerText}>{formData.dueDate.toLocaleDateString()}</Text>
                    <Feather name="calendar" size={15} color={C.textMuted} />
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker value={formData.dueDate} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if (d) setFormData({ ...formData, dueDate: d }); }} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Due Time</Text>
                  <TextInput style={styles.input} placeholder="02:59 PM" placeholderTextColor={C.textFaint} value={formData.dueTime} onChangeText={t => setFormData({ ...formData, dueTime: t })} />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput style={[styles.input, { height: 90, textAlignVertical: 'top' }]} multiline placeholder="Instructions..." placeholderTextColor={C.textFaint} value={formData.description} onChangeText={t => setFormData({ ...formData, description: t })} />
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Max Marks</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.maxMarks} onChangeText={t => setFormData({ ...formData, maxMarks: t })} />
                </View>
                <TouchableOpacity style={styles.allowLateRow} onPress={() => setFormData({ ...formData, allowLate: !formData.allowLate })}>
                  <View style={[styles.checkbox, formData.allowLate && styles.checkboxChecked]}>
                    {formData.allowLate && <Feather name="check" size={12} color="#fff" />}
                  </View>
                  <Text style={styles.checkboxLabel}>Allow late submission</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Attachment (Optional)</Text>
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={async () => {
                  try {
                    const res = await DocumentPicker.pick({ type: [DocumentPicker.types.allFiles] });
                    setFile(res[0]);
                  } catch (e) { /* user cancelled */ }
                }}
              >
                <Feather name="paperclip" size={16} color={C.textMuted} />
                <Text style={{ fontSize: 13, color: C.textMuted, flex: 1 }} numberOfLines={1}>{file ? file.name : 'Choose File'}</Text>
                {!!file && <TouchableOpacity onPress={() => setFile(null)}><Feather name="x" size={14} color={C.primary} /></TouchableOpacity>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave} disabled={saving} activeOpacity={0.9}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingId ? 'Save Changes' : 'Assign to Class'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Submit Homework Modal */}
      <Modal visible={isSubmitModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>Submit Homework</Text>
                {!!submitFor && <Text style={styles.formSubtitle}>Submitting for: {submitFor.title}</Text>}
              </View>
              <TouchableOpacity onPress={() => setSubmitModalVisible(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Student Name *</Text>
                <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={C.textFaint} value={submitForm.studentName} onChangeText={t => setSubmitForm({ ...submitForm, studentName: t })} />
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Roll No</Text>
                  <TextInput style={styles.input} value={submitForm.rollNo} onChangeText={t => setSubmitForm({ ...submitForm, rollNo: t })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Student ID</Text>
                  <TextInput style={styles.input} value={submitForm.studentId} onChangeText={t => setSubmitForm({ ...submitForm, studentId: t })} />
                </View>
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Answer / Notes</Text>
                <TextInput style={[styles.input, { height: 90, textAlignVertical: 'top' }]} multiline value={submitForm.notes} onChangeText={t => setSubmitForm({ ...submitForm, notes: t })} />
              </View>
              <Text style={styles.inputLabel}>Attach Files</Text>
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={async () => {
                  try {
                    const res = await DocumentPicker.pick({ type: [DocumentPicker.types.allFiles] });
                    setSubmitFile(res[0]);
                  } catch (e) { /* cancelled */ }
                }}
              >
                <Feather name="paperclip" size={16} color={C.textMuted} />
                <Text style={{ fontSize: 13, color: C.textMuted, flex: 1 }} numberOfLines={1}>{submitFile ? submitFile.name : 'Choose File'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.saveBtnFull, { backgroundColor: C.green, shadowColor: C.green }]} onPress={handleSubmitHomework} disabled={saving} activeOpacity={0.9}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Submit Homework</Text>}
              </TouchableOpacity>
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

  headerCard: { backgroundColor: C.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 14, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 3, lineHeight: 16 },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, paddingVertical: 13, borderRadius: 14, gap: 8, shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  kpiGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  kpiCard: { flex: 1, backgroundColor: C.surface, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: C.border },
  kpiRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  iconCircle: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 18, fontWeight: '800', color: C.text },
  kpiLabel: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5 },

  filterCard: { backgroundColor: C.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 16, zIndex: 50 },
  filterGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 44, backgroundColor: C.surfaceSoft },
  searchInput: { flex: 1, fontSize: 13.5, color: C.text },
  refreshBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', backgroundColor: C.surfaceSoft },

  emptyState: { alignItems: 'center', padding: 36, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  card: { backgroundColor: C.surface, borderRadius: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden', shadowColor: '#0F172A', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  cardExpanded: { borderColor: C.primary },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 15 },
  cardHeaderRowExpanded: { backgroundColor: C.primary },
  cardTitle: { fontSize: 16.5, fontWeight: '800', color: C.text, marginBottom: 6 },
  tagRow: { flexDirection: 'row', gap: 7 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagChipExpanded: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.3)' },
  tagChipText: { fontSize: 10.5, fontWeight: '700', color: '#14161F' },

  badgeCol: { alignItems: 'flex-end', gap: 6 },
  countBadge: { backgroundColor: C.blueSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  countBadgeExpanded: { backgroundColor: 'rgba(255,255,255,0.2)' },
  countBadgeText: { fontSize: 10, fontWeight: '800', color: C.blue },
  checkedBadge: { backgroundColor: C.greenSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  checkedBadgeExpanded: { backgroundColor: 'rgba(255,255,255,0.2)' },
  checkedBadgeText: { fontSize: 10, fontWeight: '800', color: C.green },

  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, paddingBottom: 15 },
  dueText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  dueTextOverdue: { color: COLORS.primary },

  detailPane: { padding: 15, borderTopWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSoft },
  detailMeta: { fontSize: 12, fontWeight: '700', color: C.textMuted, marginBottom: 8 },
  detailDesc: { fontSize: 13, color: '#14161F', lineHeight: 19, marginBottom: 12 },
  detailSectionLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5 },

  attachmentRow: { marginBottom: 12 },
  attachmentChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, marginTop: 6, alignSelf: 'flex-start' },
  attachmentChipText: { fontSize: 12, color: C.text, fontWeight: '600', maxWidth: 200 },

  submissionsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  submitSmallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.green, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  submitSmallBtnText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  noSubmissionsText: { fontSize: 12.5, color: C.textFaint, fontStyle: 'italic', paddingVertical: 10 },

  submissionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, marginBottom: 8 },
  submissionName: { fontSize: 13, fontWeight: '700', color: C.text },
  submissionMeta: { fontSize: 10.5, color: C.textMuted, marginTop: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 10, fontWeight: '800' },
  marksTag: { backgroundColor: C.primarySoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  marksTagText: { fontSize: 11, fontWeight: '800', color: C.primary },
  gradeInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gradeInput: { width: 44, height: 30, borderWidth: 1, borderColor: C.border, borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: '700', backgroundColor: C.surfaceSoft },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderTopWidth: 1, borderColor: C.border },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.blueSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 6 },
  outlineBtnText: { fontWeight: '700', fontSize: 12 },
  iconBtnEdit: { padding: 9, backgroundColor: C.surfaceSoft, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  iconBtnDelete: { padding: 9, backgroundColor: '#FEF2F2', borderRadius: 10, borderWidth: 1, borderColor: '#FEE2E2' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 22, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.primary },
  formTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  formSubtitle: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  closeBtnIcon: { padding: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20 },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#14161F', marginBottom: 6, marginLeft: 2 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16, zIndex: 2 },

  allowLateRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 48 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: C.border, justifyContent: 'center', alignItems: 'center', backgroundColor: C.surfaceSoft },
  checkboxChecked: { backgroundColor: C.primary, borderColor: C.primary },
  checkboxLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600' },

  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 13.5, color: C.text },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 13.5, color: C.text, fontWeight: '500' },
  dropdownPlaceholder: { fontSize: 13.5, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 72, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 14, color:  '#14161F', fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },

  uploadBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', borderRadius: 12, padding: 14, backgroundColor: C.surfaceSoft, gap: 8, marginTop: 6, marginBottom: 16 },

  saveBtnFull: { backgroundColor: C.primary, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 6, shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});