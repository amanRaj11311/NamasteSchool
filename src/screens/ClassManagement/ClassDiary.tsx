import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { API_BASE } from '../../network/api';

const C = {
  bg: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceSoft: '#FAFBFC',
  border: '#E9ECF2',
  borderStrong: '#DDE1EA',
  text: '#12172B', textMuted: '#5D6478', textFaint: '#9AA0B4',
  primary: '#B3122A',
  primaryDark: '#C5221F',
  primarySoft: '#FDE8E8',
  primarySoftBorder: '#FECDD3',
  success: '#059669',
  successSoft: '#ECFDF5',
  info: '#2563EB',
  infoSoft: '#EFF6FF',
  shadowColor: '#0F172A',
};

const shadowSm = {
  shadowColor: C.shadowColor,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 2,
};

const shadowMd = {
  shadowColor: C.shadowColor,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 16,
  elevation: 6,
};

const shadowLg = {
  shadowColor: C.shadowColor,
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.16,
  shadowRadius: 28,
  elevation: 12,
};

type EntryType = 'Homework' | 'Notice' | 'Holiday' | 'Event' | 'Remark';

const TYPE_META: Record<EntryType, { icon: string; bg: string; fg: string; border: string }> = {
  Homework: { icon: 'book', bg: '#EFF6FF', fg: '#2563EB', border: '#BFDBFE' },
  Notice: { icon: 'bell', bg: '#FFF1F3', fg: '#E11D48', border: '#FECDD3' },
  Holiday: { icon: 'sun', bg: '#ECFDF5', fg: '#059669', border: '#A7F3D0' },
  Event: { icon: 'star', bg: '#FFFBEB', fg: '#D97706', border: '#FDE68A' },
  Remark: { icon: 'message-square', bg: '#F3F4F6', fg: '#4B5563', border: '#E5E7EB' },
};

const TYPES: EntryType[] = ['Homework', 'Notice', 'Holiday', 'Event', 'Remark'];

// --- STRICT DATE PARSERS (Guarantees valid Date object to prevent crashes) ---
const parseSafeDateObj = (dateInput: any): Date => {
  if (!dateInput) return new Date();
  const d = new Date(dateInput);
  return isNaN(d.getTime()) ? new Date() : d;
};

const formatToYMD = (dateInput: Date): string => {
  const d = parseSafeDateObj(dateInput);
  return d.toISOString().split('T')[0]; // Format required by the API
};

const formatDisplayDate = (ymd: string): string => {
  if (!ymd) return '';
  const d = parseSafeDateObj(ymd);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const emptyForm = {
  type: 'Homework' as EntryType,
  date: '',
  classId: '',
  division: '',
  subjectId: '',
  dueDate: '',
  title: '',
  description: '',
};

export default function ClassDiaryScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [diaryEntries, setDiaryEntries] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<string>('');
  const [filterClassId, setFilterClassId] = useState<string>('');
  const [filterDate, setFilterDate] = useState<Date>(new Date());

  // Date Picker States
  const [showFilterDatePicker, setShowFilterDatePicker] = useState(false);
  const [showEntryDatePicker, setShowEntryDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isFormVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState(emptyForm);

  // ---------------------------------------------------------------------
  // BUG FIX: formData mirrored into a ref that is ALWAYS current.
  // Root cause of "date shows on screen but Save says it's required":
  // handleSave was reading `formData` from the closure captured at the
  // last render. On Android, when a DateTimePicker sits inside another
  // Modal, the confirm event and the following button tap can land in
  // quick succession before React has committed/re-rendered with the new
  // state, so handleSave validated against a one-render-old (empty) date.
  // Reading from a ref that's updated synchronously via useEffect right
  // after every state change eliminates that race entirely.
  // ---------------------------------------------------------------------
  const formDataRef = useRef(formData);
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  // Synchronous re-entry guard. `saving` (React state) is NOT enough on its
  // own: state updates are asynchronous, so two taps that land close
  // together can both start handleSave before either update has been
  // committed/re-rendered. A ref updates immediately, in the same tick,
  // so the second call sees the guard instantly and bails out — this is
  // what stops one call reading a stale formData while another (correct)
  // call is already in flight.
  const isSubmittingRef = useRef(false);

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

  const fetchDependencies = async (token: string | null) => {
    setLoading(true);
    try {
      const [clsRes, subRes] = await Promise.all([
        axios.get(`${API_BASE}/classes`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/subjects`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setClasses(clsRes.data?.data || []);
      setSubjects(subRes.data?.data || []);
      fetchDiary(token);
    } catch (e) { console.error(e); setLoading(false); }
  };

  const fetchDiary = async (token: string | null = authToken, isRefresh = false, opts?: any) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const type = opts?.type !== undefined ? opts.type : filterType;
      const classId = opts?.classId !== undefined ? opts.classId : filterClassId;
      const d = opts?.date || filterDate;

      let query = `?entryDate=${formatToYMD(d)}`;
      if (type) query += `&type=${encodeURIComponent(type)}`;
      if (classId) query += `&classId=${classId}`;

      const res = await axios.get(`${API_BASE}/diary${query}`, { headers: { Authorization: `Bearer ${token}` } });
      setDiaryEntries(res.data?.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'diary' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const openAddForm = () => {
    setEditingId(null);
    setFormData({ ...emptyForm });
    setShowEntryDatePicker(false);
    setShowDueDatePicker(false);
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const openEditForm = (item: any) => {
    setEditingId(item._id);

    setFormData({
      type: item.type as EntryType,
      date: item.date ? formatToYMD(parseSafeDateObj(item.date)) : '',
      classId: typeof item.classId === 'object' ? item.classId?._id || '' : item.classId || '',
      division: item.division || '',
      subjectId: typeof item.subjectId === 'object' ? item.subjectId?._id || '' : item.subjectId || '',
      dueDate: item.dueDate ? formatToYMD(parseSafeDateObj(item.dueDate)) : '',
      title: item.title || '',
      description: item.description || '',
    });

    setShowEntryDatePicker(false);
    setShowDueDatePicker(false);
    setActiveDropdown(null);
    setFormVisible(true);
  };

  // Small helper so every field update goes through the functional form.
  // This avoids a second, independent race: two fields updated in quick
  // succession (e.g. picking Type then immediately picking a date) could
  // otherwise both read the same stale `formData` and one update would
  // silently overwrite the other.
  const updateForm = (patch: Partial<typeof emptyForm>) => {
    setFormData(prev => ({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    // Block any overlapping call the instant a save starts — synchronous,
    // so a rapid double-tap can never sneak a second call in.
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSaving(true);

    // Always validate against the ref — guaranteed to be the latest value,
    // never a stale render closure.
    const current = formDataRef.current;

    const entryDate = (current.date || '').toString().trim();
    if (!entryDate) {
      Alert.alert('Error', 'Entry date is required. Please select a date.');
      isSubmittingRef.current = false;
      setSaving(false);
      return;
    }

    if (current.type === 'Homework') {
      const dueDate = (current.dueDate || '').toString().trim();
      if (!dueDate) {
        Alert.alert('Error', 'Due date is required. Please select a due date.');
        isSubmittingRef.current = false;
        setSaving(false);
        return;
      }
      if (!current.classId || !current.subjectId || !current.description.trim()) {
        Alert.alert('Error', 'Class, Subject, and Description are required for Homework.');
        isSubmittingRef.current = false;
        setSaving(false);
        return;
      }
    } else if (!current.title.trim()) {
      Alert.alert('Error', 'Title is required.');
      isSubmittingRef.current = false;
      setSaving(false);
      return;
    }

    try {
      // Payload keys must match the API contract exactly — the backend
      // expects `entryDate` (not `date`), and expects remarkType/rollNo/
      // studentId/studentName to be present even when empty. For Homework
      // entries the backend derives the title itself, so we send an empty
      // string rather than building one client-side.
      const payload: any = {
        type: current.type,
        entryDate: current.date,
        classId: current.classId || undefined,
        division: current.division,
        title: current.type === 'Homework' ? '' : current.title,
        description: current.description,
        remarkType: 'General',
        rollNo: '',
        studentId: '',
        studentName: '',
      };

      if (current.type === 'Homework') {
        payload.subjectId = current.subjectId;
        payload.dueDate = current.dueDate;
      }

      if (editingId) {
        await axios.put(`${API_BASE}/diary/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        Alert.alert('Success', 'Diary entry updated.');
      } else {
        await axios.post(`${API_BASE}/diary`, payload, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        Alert.alert('Success', 'Diary entry added.');
      }

      setFormVisible(false);
      fetchDiary(authToken, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save entry.');
    } finally {
      isSubmittingRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Entry', 'This diary entry will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/diary/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            fetchDiary(authToken, true);
          } catch (e) { Alert.alert('Error', 'Failed to delete.'); }
        }
      },
    ]);
  };

  const renderInlineDropdown = (
    fieldKey: string,
    label: string,
    options: { label: string, value: string }[],
    value: string,
    onSelect: (v: string) => void,
  ) => {
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
            {selectedObj?.label || 'Select...'}
          </Text>
          <View style={[styles.chevronBadge, isOpen && styles.chevronBadgeActive]}>
            <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={isOpen ? '#fff' : C.textMuted} />
          </View>
        </TouchableOpacity>
        {isOpen && (
          <View style={[styles.dropdownListContainer, shadowMd]}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
              {options.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={styles.dropdownItem}
                  onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}
                >
                  <Text style={[styles.dropdownItemText, value === opt.value && styles.dropdownItemTextActive]}>
                    {opt.label}
                  </Text>
                  {value === opt.value && <Feather name="check" size={14} color={C.primary} />}
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
      {/* HEADER */}
      <View style={[styles.headerCard, shadowSm]}>
        <View style={styles.headerRow}>
          <View style={styles.headerIconBadge}>
            <Feather name="book-open" size={22} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Class Diary & Notices</Text>
            <Text style={styles.subtitle}>Homework, notices, holidays, events & remarks — all in one place.</Text>
          </View>
        </View>
      </View>

      {/* FILTERS */}
      <View style={[styles.filterCard, shadowSm]}>
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 10, zIndex: 40 }}>
            {renderInlineDropdown('fType', 'TYPE', [{ label: 'All Types', value: '' }, ...TYPES.map(t => ({ label: t, value: t }))], filterType, (v) => { setFilterType(v); fetchDiary(authToken, true, { type: v }); })}
          </View>
          <View style={{ flex: 1, marginRight: 10, zIndex: 30 }}>
            {renderInlineDropdown('fClass', 'CLASS', [{ label: 'All Classes', value: '' }, ...classes.map(c => ({ label: c.className, value: c._id }))], filterClassId, (v) => { setFilterClassId(v); fetchDiary(authToken, true, { classId: v }); })}
          </View>
          <View style={{ flex: 1, zIndex: 10 }}>
            <Text style={styles.inputLabel}>DATE</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowFilterDatePicker(true)} activeOpacity={0.85}>
              <Text style={styles.datePickerText} numberOfLines={1}>{filterDate.toLocaleDateString('en-GB')}</Text>
              <Feather name="calendar" size={14} color={C.primary} />
            </TouchableOpacity>
            {showFilterDatePicker && (
              <DateTimePicker
                value={filterDate}
                mode="date"
                display="default"
                onChange={(e, d) => {
                  setShowFilterDatePicker(Platform.OS === 'ios');
                  if (e.type === 'set' && d) { setFilterDate(d); fetchDiary(authToken, true, { date: d }); }
                  if (Platform.OS === 'android') setShowFilterDatePicker(false);
                }}
              />
            )}
          </View>
        </View>

        {hasPermission('create') && (
          <TouchableOpacity style={[styles.addBtnFull, shadowMd]} onPress={openAddForm} activeOpacity={0.9}>
            <Feather name="plus-circle" size={16} color="#fff" />
            <Text style={styles.addBtnTextFull}>Add Diary Entry</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* LIST */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingText}>Loading entries…</Text>
        </View>
      ) : (
        <FlatList
          data={diaryEntries}
          keyExtractor={item => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchDiary(authToken, true)} colors={[C.primary]} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Feather name="book" size={36} color={C.textFaint} />
              </View>
              <Text style={styles.emptyTitle}>No Entries Found</Text>
              <Text style={styles.emptySubtitle}>No diary entries match your selected date or filters.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = TYPE_META[(item.type as EntryType) || 'Notice'] || TYPE_META.Remark;
            const clsName = typeof item.classId === 'object' ? item.classId?.className : 'All Classes';
            const subName = typeof item.subjectId === 'object' ? item.subjectId?.name : item.subjectId;

            return (
              <View style={[styles.card, shadowSm, { borderLeftColor: meta.fg }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.typeBadge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                    <Feather name={meta.icon as any} size={12} color={meta.fg} />
                    <Text style={[styles.typeBadgeText, { color: meta.fg }]}>{item.type}</Text>
                  </View>
                  <View style={styles.dateBadge}>
                    <Feather name="calendar" size={10} color={C.textMuted} />
                    <Text style={styles.dateText}>{formatDisplayDate(formatToYMD(parseSafeDateObj(item.date)))}</Text>
                  </View>
                </View>

                <Text style={styles.cardTitle}>{item.title}</Text>

                <View style={styles.tagRow}>
                  {!!clsName && (
                    <View style={styles.tagChip}>
                      <Feather name="monitor" size={10} color="#4B5563" />
                      <Text style={styles.tagChipText}>{clsName} {item.division ? `(${item.division})` : ''}</Text>
                    </View>
                  )}
                  {!!subName && (
                    <View style={[styles.tagChip, { backgroundColor: C.infoSoft, borderColor: '#BFDBFE' }]}>
                      <Feather name="book" size={10} color={C.info} />
                      <Text style={[styles.tagChipText, { color: '#1D4ED8' }]}>{subName}</Text>
                    </View>
                  )}
                </View>

                {item.type === 'Homework' && item.dueDate && (
                  <View style={styles.dueRow}>
                    <Feather name="clock" size={12} color={C.primaryDark} />
                    <Text style={styles.dueText}>
                      Due: <Text style={{ fontWeight: '800' }}>{formatDisplayDate(formatToYMD(parseSafeDateObj(item.dueDate)))}</Text>
                    </Text>
                  </View>
                )}

                {!!item.description && (
                  <View style={styles.descBox}>
                    <Text style={styles.cardDesc}>{item.description}</Text>
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <View style={styles.authorRow}>
                    <View style={styles.authorAvatar}>
                      <Feather name="user" size={11} color={C.primary} />
                    </View>
                    <Text style={styles.authorText}>{item.createdBy?.name || 'Admin'}</Text>
                    <View style={styles.seenBadge}>
                      <Feather name="check" size={10} color={C.success} />
                      <Text style={styles.seenText}>1 seen</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {hasPermission('update') && (
                      <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditForm(item)} activeOpacity={0.8}>
                        <Feather name="edit-2" size={13} color={C.success} />
                      </TouchableOpacity>
                    )}
                    {hasPermission('delete') && (
                      <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(item._id)} activeOpacity={0.8}>
                        <Feather name="trash-2" size={13} color={C.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ADD / EDIT MODAL */}
      <Modal visible={isFormVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.compactModalContainer, shadowLg]}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderLeft}>
                <View style={styles.formHeaderIconBadge}>
                  <Feather name="book-open" size={18} color="#fff" />
                </View>
                <View>
                  <Text style={styles.formTitle}>{editingId ? 'Edit Diary Entry' : 'New Diary Entry'}</Text>
                  <Text style={styles.formSubtitle}>{editingId ? 'Update the details below' : 'Fill in the details below'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon} activeOpacity={0.8}>
              <Text style={{ fontSize: 22, color: '#fff', fontWeight: '600' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              <View style={[styles.row, { zIndex: 30 }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  {renderInlineDropdown('formType', 'Type *', TYPES.map(t => ({ label: t, value: t })), formData.type, (v) => updateForm({ type: v as EntryType }))}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Date of Entry *</Text>
                  <TouchableOpacity
                    style={styles.datePickerBtnForm}
                    activeOpacity={0.85}
                    onPress={() => { setShowDueDatePicker(false); setShowEntryDatePicker(true); }}
                  >
                    <Text style={[styles.datePickerText, !formData.date && styles.datePlaceholder]} numberOfLines={1}>
                      {formData.date ? formatDisplayDate(formData.date) : 'Select a date'}
                    </Text>
                    <Feather name="calendar" size={14} color={C.primary} />
                  </TouchableOpacity>
                  {showEntryDatePicker && (
                    <DateTimePicker
                      value={formData.date ? parseSafeDateObj(formData.date) : new Date()}
                      mode="date"
                      display="default"
                      onChange={(event, selectedDate) => {
                        setShowEntryDatePicker(false);
                        if (event.type === 'set' && selectedDate) {
                          updateForm({ date: formatToYMD(selectedDate) });
                        }
                      }}
                    />
                  )}
                </View>
              </View>

              <View style={[styles.row, { zIndex: 20 }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  {renderInlineDropdown('formClass', 'Class *', classes.map(c => ({ label: c.className, value: c._id })), formData.classId, (v) => updateForm({ classId: v }))}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Section / Division</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. A, B"
                    placeholderTextColor={C.textFaint}
                    value={formData.division}
                    onChangeText={t => updateForm({ division: t })}
                  />
                </View>
              </View>

              {formData.type === 'Homework' ? (
                <>
                  <View style={[styles.row, { zIndex: 10 }]}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      {renderInlineDropdown('formSubject', 'Subject *', subjects.map(s => ({ label: s.name, value: s._id })), formData.subjectId, (v) => updateForm({ subjectId: v }))}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Due Date *</Text>
                      <TouchableOpacity
                        style={styles.datePickerBtnForm}
                        activeOpacity={0.85}
                        onPress={() => { setShowEntryDatePicker(false); setShowDueDatePicker(true); }}
                      >
                        <Text style={[styles.datePickerText, !formData.dueDate && styles.datePlaceholder]} numberOfLines={1}>
                          {formData.dueDate ? formatDisplayDate(formData.dueDate) : 'Select a date'}
                        </Text>
                        <Feather name="calendar" size={14} color={C.primary} />
                      </TouchableOpacity>
                      {showDueDatePicker && (
                        <DateTimePicker
                          value={formData.dueDate ? parseSafeDateObj(formData.dueDate) : new Date()}
                          mode="date"
                          display="default"
                          onChange={(event, selectedDate) => {
                            setShowDueDatePicker(false);
                            if (event.type === 'set' && selectedDate) {
                              updateForm({ dueDate: formatToYMD(selectedDate) });
                            }
                          }}
                        />
                      )}
                    </View>
                  </View>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Homework Description *</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      multiline
                      placeholder="Write details here..."
                      placeholderTextColor={C.textFaint}
                      value={formData.description}
                      onChangeText={t => updateForm({ description: t })}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Title *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={`e.g. ${formData.type} title`}
                      placeholderTextColor={C.textFaint}
                      value={formData.title}
                      onChangeText={t => updateForm({ title: t })}
                    />
                  </View>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Remarks / Notes</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      multiline
                      placeholder="Additional notes..."
                      placeholderTextColor={C.textFaint}
                      value={formData.description}
                      onChangeText={t => updateForm({ description: t })}
                    />
                  </View>
                </>
              )}

              <View style={styles.formFooter}>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setFormVisible(false)} activeOpacity={0.8}>
                  <Text style={styles.ghostBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtnFull, shadowMd, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving} activeOpacity={0.9}>
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Feather name={editingId ? 'check' : 'plus'} size={15} color="#fff" />
                      <Text style={styles.saveBtnFullText}>{editingId ? 'Update Entry' : 'Create Entry'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, padding: 30, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 13, color: C.textMuted, fontWeight: '600' },

  headerCard: { backgroundColor: C.surface, paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderColor: C.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerIconBadge: { width: 46, height: 46, borderRadius: 14, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primarySoftBorder, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 3, lineHeight: 17 },

  filterCard: { backgroundColor: C.surface, padding: 16, borderBottomWidth: 1, borderColor: C.border, zIndex: 50 },
  row: { flexDirection: 'row' },

  addBtnFull: { backgroundColor: C.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 13, borderRadius: 12, marginTop: 14 },
  addBtnTextFull: { color: '#fff', fontWeight: '800', fontSize: 14 },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 30 },
  emptyIconWrap: { width: 76, height: 76, borderRadius: 38, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 14 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center', lineHeight: 18 },

  card: { backgroundColor: C.surface, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  typeBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surfaceSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, borderWidth: 1, borderColor: C.border },
  dateText: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  cardTitle: { fontSize: 16.5, fontWeight: '800', color: C.text, marginBottom: 10, lineHeight: 22 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  tagChipText: { fontSize: 11, fontWeight: '700', color: '#4B5563' },

  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primarySoftBorder, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, marginBottom: 12, alignSelf: 'flex-start' },
  dueText: { fontSize: 11.5, color: C.primaryDark, fontWeight: '600' },

  descBox: { backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 13, marginBottom: 14 },
  cardDesc: { fontSize: 13, color: '#374151', lineHeight: 20 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  authorAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  authorText: { fontSize: 12, fontWeight: '700', color: C.text },
  seenBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.successSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, marginLeft: 4 },
  seenText: { fontSize: 10, fontWeight: '800', color: C.success },

  iconBtnEdit: { padding: 8, backgroundColor: C.successSoft, borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' },
  iconBtnDelete: { padding: 8, backgroundColor: C.primarySoft, borderRadius: 8, borderWidth: 1, borderColor: C.primarySoftBorder },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 18 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 24, maxHeight: '90%', overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18, backgroundColor: C.primary },
  formHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  formHeaderIconBadge: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  formTitle: { fontSize: 16.5, fontWeight: '800', color: '#fff' },
  formSubtitle: { fontSize: 11.5, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  closeBtnIcon: { padding: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8 },
  formScroll: { padding: 20 },
  formFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: '#4B5563', marginBottom: 7, marginLeft: 2, letterSpacing: 0.2 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 46, backgroundColor: C.surfaceSoft, fontSize: 13.5, color: C.text },
  textArea: { height: 96, paddingTop: 12, textAlignVertical: 'top' },

  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 11, height: 42, backgroundColor: '#fff' },
  datePickerBtnForm: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 13, height: 46, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 13.5, color: C.text, fontWeight: '600', flexShrink: 1 },
  datePlaceholder: { color: C.textFaint, fontWeight: '400' },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 13, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary, backgroundColor: '#fff' },
  dropdownSelectedText: { fontSize: 13.5, color: C.text, fontWeight: '600', flexShrink: 1 },
  dropdownPlaceholder: { fontSize: 13.5, color: C.textFaint },
  chevronBadge: { width: 24, height: 24, borderRadius: 6, backgroundColor: C.border, justifyContent: 'center', alignItems: 'center' },
  chevronBadgeActive: { backgroundColor: C.primary },
  dropdownListContainer: { position: 'absolute', top: 52, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13.5, color: '#374151', fontWeight: '500' },
  dropdownItemTextActive: { color: C.primary, fontWeight: '700' },

  ghostBtn: { paddingVertical: 12, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 12 },
  ghostBtnText: { color: C.textMuted, fontSize: 14, fontWeight: '700' },
  saveBtnFull: { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 12, justifyContent: 'center' },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnFullText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});