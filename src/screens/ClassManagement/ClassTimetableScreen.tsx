import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import DocumentPicker from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import * as XLSX from 'xlsx';
import { API_BASE } from '../../network/api';
import { COLORS, RADIUS, SPACING, FONT, SHADOW, TOUCH_TARGET, isSmallDevice } from '../../constants/theme';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIOD_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const BRAND = COLORS.primary;

// --- Types ---
interface Permission {
  module: string;
  action: string;
}

interface ClassObj {
  _id: string;
  className: string;
  division?: string;
  syllabus?: string;
  classTeacher?: { _id: string; name: string };
}

interface Staff {
  _id: string;
  name: string;
  staffType: string;
}

interface Subject {
  _id: string;
  name: string;
}

interface TimetablePeriod {
  _id: string;
  periodNumber: number;
  day: string;
  className: string;
  startTime: string;
  endTime: string;
  roomNumber: string;
  subjectName: string;
  staffId?: { _id: string; name: string };
}

interface FormData {
  day: string;
  periodNumber: string;
  subjectName: string;
  staffId: string;
  roomNumber: string;
  startTime: string;
  endTime: string;
}

const initialFormState: FormData = {
  day: 'Monday',
  periodNumber: '',
  subjectName: '',
  staffId: '',
  roomNumber: '',
  startTime: '',
  endTime: '',
};

export default function ClassTimetableScreen({ route }: any) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const twoCol = width >= 480; // period cards go two-up on larger phones

  // Data States
  const [classes, setClasses] = useState<ClassObj[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [timetableData, setTimetableData] = useState<TimetablePeriod[]>([]);

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('Monday');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  // Form Modals
  const [isFormVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormState);

  // Unified Inline Dropdown State
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const initialStaffId = route?.params?.staffId || null;

  useEffect(() => {
    initialize();
  }, []);

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
    try {
      setLoading(true);
      const [classesRes, staffRes, subjectsRes] = await Promise.all([
        axios.get(`${API_BASE}/classes`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/staff`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/subjects`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const fetchedClasses = classesRes.data?.data || [];
      setClasses(fetchedClasses);
      setStaffList(staffRes.data?.data || []);
      setSubjects(subjectsRes.data?.data || []);

      if (fetchedClasses.length > 0) {
        setSelectedClassId(fetchedClasses[0]._id);
        fetchTimetable(token, fetchedClasses[0]._id);
      } else {
        setLoading(false);
      }
    } catch (e) {
      setLoading(false);
    }
  };

  const fetchTimetable = async (token: string | null, classId: string, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await axios.get(`${API_BASE}/timetable/class?classId=${classId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data?.success) {
        setTimetableData(res.data.data || []);
      } else {
        setTimetableData([]);
      }
    } catch (error) {
      setTimetableData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    if (selectedClassId) fetchTimetable(authToken, selectedClassId, true);
  }, [authToken, selectedClassId]);

  const handleClassSelect = (classId: string) => {
    setSelectedClassId(classId);
    setActiveDropdown(null);
    fetchTimetable(authToken, classId);
  };

  const hasPermission = useCallback(
    (action: string) => {
      if (isSuperAdmin) return true;
      return permissions.some((p) => p.module === 'timetable' && p.action === action);
    },
    [permissions, isSuperAdmin]
  );

  // --- CRUD Actions ---
  const openAddForm = () => {
    if (!selectedClassId) {
      Alert.alert('Notice', 'Please select a class first.');
      return;
    }
    setEditingId(null);
    setFormData({ ...initialFormState, day: selectedDay });
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const openEditForm = (period: TimetablePeriod) => {
    setEditingId(period._id);
    setFormData({
      day: period.day,
      periodNumber: period.periodNumber.toString(),
      subjectName: period.subjectName || '',
      staffId: period.staffId?._id || '',
      roomNumber: period.roomNumber || '',
      startTime: period.startTime || '',
      endTime: period.endTime || '',
    });
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Period', 'Are you sure you want to delete this class period?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/timetable/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            onRefresh();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete period.');
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!formData.day || !formData.periodNumber || !formData.subjectName) {
      Alert.alert('Validation Error', 'Day, Period Number, and Subject Name are required.');
      return;
    }
    try {
      const payload = { ...formData, classId: selectedClassId };
      if (editingId) {
        await axios.put(`${API_BASE}/timetable/${editingId}`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert('Success', 'Period updated successfully.');
      } else {
        await axios.post(`${API_BASE}/timetable/class`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert('Success', 'Period added successfully.');
      }
      setFormVisible(false);
      onRefresh();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save period.');
    }
  };

  // --- Excel Format Download & Export ---
  // Built entirely client-side from data already in memory (`timetableData`,
  // already fetched via GET /timetable/class) using `xlsx` — no export/format
  // API exists on the backend, so nothing shows up in a network tab.
  const writeAndShareWorkbook = async (rows: any[][], fileName: string) => {
    try {
      setBusyLabel('Preparing Excel file...');
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Timetable');

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const destPath = `${RNFS.CachesDirectoryPath}/${fileName}`;
      await RNFS.writeFile(destPath, base64, 'base64');

      setBusyLabel(null);
      await Share.open({
        url: `file://${destPath}`,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        failOnCancel: false,
      });
    } catch (error: any) {
      setBusyLabel(null);
      if (error?.message !== 'User did not share') {
        Alert.alert('Error', 'Could not generate the Excel file.');
      }
    }
  };

  const handleDownloadFormat = () => {
    if (!selectedClassId) {
      Alert.alert('Notice', 'Please select a class first.');
      return;
    }
    const clsName = (activeClassDetails?.className || 'Class').replace(/\s+/g, '_');
    const header = ['Day', 'Period Number', 'Subject Name', 'Start Time', 'End Time', 'Room Number', 'Teacher Name'];
    const sampleRow = ['Monday', 1, 'Mathematics', '08:00 AM', '08:45 AM', 'Room 101', 'John Doe'];
    writeAndShareWorkbook([header, sampleRow], `${clsName}_Timetable_Format.xlsx`);
  };

  const handleExportExcel = () => {
    if (!selectedClassId) {
      Alert.alert('Notice', 'Please select a class first.');
      return;
    }
    const clsName = (activeClassDetails?.className || 'Class').replace(/\s+/g, '_');
    const maxPeriod = timetableData.reduce((m, p) => Math.max(m, p.periodNumber || 0), 8);
    const periodCols = Array.from({ length: maxPeriod }, (_, i) => i + 1);

    const header = ['Day / Period', ...periodCols.map((n) => `Period ${n}`)];
    const rows = DAYS_OF_WEEK.map((day) => {
      const cells = periodCols.map((pnum) => {
        const p = timetableData.find((x) => x.day === day && x.periodNumber === pnum);
        if (!p) return '-';
        const teacherPart = p.staffId?.name ? ` (${p.staffId.name}${p.roomNumber ? ` [Rm ${p.roomNumber}]` : ''})` : '';
        return `${p.subjectName}${teacherPart}`;
      });
      return [day, ...cells];
    });

    writeAndShareWorkbook([header, ...rows], `${clsName}_Weekly_Timetable.xlsx`);
  };

  const handleUploadExcel = async () => {
    if (!selectedClassId) {
      Alert.alert('Notice', 'Please select a class first.');
      return;
    }
    try {
      const res = await DocumentPicker.pick({ type: [DocumentPicker.types.csv, DocumentPicker.types.xls, DocumentPicker.types.xlsx] });
      setIsUploading(true);

      const uploadData = new FormData();
      uploadData.append('file', { uri: res[0].uri, type: res[0].type, name: res[0].name } as any);
      uploadData.append('classId', selectedClassId);

      await axios.post(`${API_BASE}/timetable/bulk`, uploadData, {
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'multipart/form-data' },
      });

      Alert.alert('Success', 'Timetable slots uploaded successfully!');
      onRefresh();
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) Alert.alert('Upload Error', err.response?.data?.message || 'Failed to upload.');
    } finally {
      setIsUploading(false);
    }
  };

  // --- Inline Dropdown UI ---
  const toggleDropdown = (field: string) => setActiveDropdown(activeDropdown === field ? null : field);

  const renderInlineDropdown = (
    fieldKey: keyof FormData | 'classSelector',
    label: string,
    options: { label: string; value: string }[],
    isMainFilter = false
  ) => {
    const isOpen = activeDropdown === fieldKey;
    const currentValue = isMainFilter ? selectedClassId : formData[fieldKey as keyof FormData];
    const selectedObj = options.find((o) => o.value === currentValue);

    return (
      <View style={[styles.inputWrapper, isMainFilter && { marginBottom: 0, zIndex: isOpen ? 50 : 1 }]}>
        {!isMainFilter && <Text style={styles.inputLabel}>{label}</Text>}
        <TouchableOpacity
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive, isMainFilter && styles.dropdownHeaderMain]}
          onPress={() => toggleDropdown(fieldKey as string)}
          activeOpacity={0.75}
        >
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selectedObj?.label || `Select ${label.replace('*', '').trim()}`}
          </Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
        </TouchableOpacity>

        {isOpen && (
          <View style={[styles.dropdownListContainer, isMainFilter && { position: 'absolute', top: 54, left: 0, right: 0 }]}>
            <ScrollView nestedScrollEnabled style={styles.dropdownScroll} showsVerticalScrollIndicator={false}>
              {options.map((opt, index) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.dropdownItem, index !== options.length - 1 && styles.dropdownItemBorder, currentValue === opt.value && styles.dropdownItemActive]}
                  onPress={() => {
                    if (isMainFilter) handleClassSelect(opt.value);
                    else setFormData({ ...formData, [fieldKey]: opt.value });
                    setActiveDropdown(null);
                  }}
                >
                  <Text style={[styles.dropdownItemText, currentValue === opt.value && styles.dropdownItemTextActive]}>{opt.label}</Text>
                  {currentValue === opt.value && <Feather name="check" size={16} color={BRAND} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const activeClassDetails = classes.find((c) => c._id === selectedClassId);
  const filteredPeriods = timetableData.filter((p) => p.day === selectedDay).sort((a, b) => a.periodNumber - b.periodNumber);

  const teachersOnlyOptions = [
    { label: 'Unassigned', value: '' },
    ...staffList.filter((s) => s.staffType && s.staffType.toLowerCase() === 'teacher').map((s) => ({ label: s.name, value: s._id })),
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* --- HEADER --- */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerIconWrap}>
            <Feather name="calendar" size={20} color={BRAND} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>
              Class Schedule Matrix
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              Weekly timetable, organised by class
            </Text>
          </View>
        </View>
      </View>

      {/* --- ACTION GRID --- */}
      <View style={styles.actionGrid}>
        <TouchableOpacity style={styles.actionCard} onPress={handleDownloadFormat} activeOpacity={0.85}>
          <View style={[styles.actionIconWrap, { backgroundColor: COLORS.successSoft }]}>
            <Feather name="download" size={18} color={COLORS.success} />
          </View>
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionCardTitle} numberOfLines={1}>
              Download Format
            </Text>
            <Text style={styles.actionCardSub} numberOfLines={1}>
              Blank Excel template
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={handleExportExcel} activeOpacity={0.85}>
          <View style={[styles.actionIconWrap, { backgroundColor: COLORS.successSoft }]}>
            <Feather name="file-text" size={18} color={COLORS.success} />
          </View>
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionCardTitle} numberOfLines={1}>
              Export Excel
            </Text>
            <Text style={styles.actionCardSub} numberOfLines={1}>
              Full class timetable
            </Text>
          </View>
        </TouchableOpacity>

        {hasPermission('create') && (
          <TouchableOpacity style={styles.actionCard} onPress={handleUploadExcel} disabled={isUploading} activeOpacity={0.85}>
            <View style={[styles.actionIconWrap, { backgroundColor: COLORS.primarySoft }]}>
              {isUploading ? <ActivityIndicator size="small" color={BRAND} /> : <Feather name="upload" size={18} color={BRAND} />}
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={styles.actionCardTitle} numberOfLines={1}>
                Upload Excel
              </Text>
              <Text style={styles.actionCardSub} numberOfLines={1}>
                Bulk import slots
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {hasPermission('create') && (
          <TouchableOpacity style={[styles.actionCard, styles.actionCardPrimary]} onPress={openAddForm} activeOpacity={0.9}>
            <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Feather name="plus" size={18} color="#fff" />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={[styles.actionCardTitle, { color: '#fff' }]} numberOfLines={1}>
                Add Period Slot
              </Text>
              <Text style={[styles.actionCardSub, { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>
                New class period
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={{ flex: 1, zIndex: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BRAND]} tintColor={BRAND} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Class Selection Card */}
        <View style={styles.classSelectionCard}>
          <View style={styles.classCardHeaderRow}>
            <View style={styles.classCardIconWrap}>
              <Feather name="layers" size={14} color={BRAND} />
            </View>
            <Text style={styles.sectionHeading}>SELECT TARGET CLASS</Text>
          </View>

          {renderInlineDropdown(
            'classSelector',
            'Class',
            classes.map((c) => ({ label: `${c.className} ${c.division ? `(${c.division})` : ''}`, value: c._id })),
            true
          )}

          {activeClassDetails && (
            <View style={styles.classMetaRow}>
              <View style={styles.metaBadge}>
                <View style={styles.metaIconWrap}>
                  <Feather name="user" size={12} color={COLORS.secondary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.metaLabel}>CLASS TEACHER</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>
                    {activeClassDetails.classTeacher?.name || 'Unassigned'}
                  </Text>
                </View>
              </View>
              <View style={styles.metaBadge}>
                <View style={styles.metaIconWrap}>
                  <Feather name="book-open" size={12} color={COLORS.secondary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.metaLabel}>SYLLABUS</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>
                    {activeClassDetails.syllabus || 'N/A'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={BRAND} />
            <Text style={styles.loadingText}>Loading timetable…</Text>
          </View>
        ) : (
          <View style={styles.timetableBoard}>
            {/* Days Tabs */}
            <View style={styles.tabsWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}>
                {DAYS_OF_WEEK.map((day) => {
                  const count = timetableData.filter((d) => d.day === day).length;
                  const isActive = selectedDay === day;
                  return (
                    <TouchableOpacity key={day} style={[styles.dayTab, isActive && styles.dayTabActive]} onPress={() => setSelectedDay(day)} activeOpacity={0.85}>
                      <Text style={[styles.dayTabText, isActive && styles.dayTabTextActive]}>{day.slice(0, 3)}</Text>
                      <View style={[styles.dayTabBadge, isActive && styles.dayTabBadgeActive]}>
                        <Text style={[styles.dayTabBadgeText, isActive && styles.dayTabBadgeTextActive]}>{count}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Periods Grid */}
            <View style={styles.periodsContainer}>
              {filteredPeriods.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconWrap}>
                    <Feather name="calendar" size={26} color={COLORS.faint} />
                  </View>
                  <Text style={styles.emptyTitle}>No Periods Scheduled</Text>
                  <Text style={styles.emptySub}>There are no classes assigned to {selectedDay}.</Text>
                  {hasPermission('create') && (
                    <TouchableOpacity style={styles.addPeriodOutlineBtn} onPress={openAddForm} activeOpacity={0.85}>
                      <Feather name="plus" size={16} color={BRAND} />
                      <Text style={styles.addPeriodOutlineBtnText}>Add Period Slot</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.periodGrid}>
                  {filteredPeriods.map((period) => (
                    <View key={period._id} style={[styles.periodCard, twoCol && { width: '48.5%' }]}>
                      <View style={styles.periodCardAccent} />
                      <View style={styles.periodCardBody}>
                        <View style={styles.periodHeader}>
                          <View style={styles.periodBadge}>
                            <Text style={styles.periodBadgeText}>Period {period.periodNumber}</Text>
                          </View>
                          {(period.startTime || period.endTime) && (
                            <View style={styles.periodTimeWrap}>
                              <Feather name="clock" size={12} color={COLORS.secondary} />
                              <Text style={styles.periodTime} numberOfLines={1}>
                                {period.startTime} - {period.endTime}
                              </Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.subjectName} numberOfLines={2}>
                          {period.subjectName}
                        </Text>

                        <View style={styles.periodDetails}>
                          <View style={styles.detailRow}>
                            <View style={styles.avatarMini}>
                              <Text style={styles.avatarMiniText}>{period.staffId?.name.charAt(0) || 'U'}</Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.detailSubLabel}>TEACHER</Text>
                              <Text style={styles.teacherName} numberOfLines={1}>
                                {period.staffId?.name || 'Unassigned'}
                              </Text>
                            </View>
                          </View>

                          {period.roomNumber ? (
                            <View style={styles.roomBadge}>
                              <Feather name="map-pin" size={12} color={COLORS.muted} />
                              <Text style={styles.roomText} numberOfLines={1}>
                                {period.roomNumber}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.cardActions}>
                          {hasPermission('update') && (
                            <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditForm(period)} activeOpacity={0.8}>
                              <Feather name="edit-2" size={14} color={BRAND} />
                              <Text style={styles.iconBtnText}>Edit</Text>
                            </TouchableOpacity>
                          )}
                          {hasPermission('delete') && (
                            <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(period._id)} activeOpacity={0.8}>
                              <Feather name="trash-2" size={14} color={BRAND} />
                              <Text style={styles.iconBtnText}>Delete</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* --- ADD/EDIT COMPACT MODAL --- */}
      <Modal visible={isFormVisible} animationType="fade" transparent={true} onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderLeft}>
                <View style={styles.formHeaderIconWrap}>
                  <Feather name={editingId ? 'edit-2' : 'plus'} size={16} color={BRAND} />
                </View>
                <Text style={styles.formTitle}>{editingId ? 'Edit Period Slot' : 'Add Period Slot'}</Text>
              </View>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={COLORS.body} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: SPACING.md }}>{renderInlineDropdown('day', 'Day of Week *', DAYS_OF_WEEK.map((d) => ({ label: d, value: d })))}</View>
                <View style={{ flex: 1 }}>{renderInlineDropdown('periodNumber', 'Period No. *', PERIOD_NUMBERS.map((p) => ({ label: `Period ${p}`, value: p })))}</View>
              </View>

              {renderInlineDropdown(
                'subjectName',
                'Subject Name *',
                subjects.map((s) => ({ label: s.name, value: s.name }))
              )}

              {renderInlineDropdown('staffId', 'Assigned Teacher (Optional)', teachersOnlyOptions)}

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Room Number / Lab (Optional)</Text>
                <View style={styles.inputIconRow}>
                  <Feather name="map-pin" size={15} color={COLORS.faint} style={styles.inputLeadingIcon} />
                  <TextInput
                    style={styles.inputWithIcon}
                    placeholder="e.g. Room 101"
                    placeholderTextColor={COLORS.faint}
                    value={formData.roomNumber}
                    onChangeText={(t) => setFormData({ ...formData, roomNumber: t })}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputWrapper, { flex: 1, marginRight: SPACING.md }]}>
                  <Text style={styles.inputLabel}>Start Time</Text>
                  <View style={styles.inputIconRow}>
                    <Feather name="clock" size={15} color={COLORS.faint} style={styles.inputLeadingIcon} />
                    <TextInput
                      style={styles.inputWithIcon}
                      placeholder="08:00 AM"
                      placeholderTextColor={COLORS.faint}
                      value={formData.startTime}
                      onChangeText={(t) => setFormData({ ...formData, startTime: t })}
                    />
                  </View>
                </View>
                <View style={[styles.inputWrapper, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>End Time</Text>
                  <View style={styles.inputIconRow}>
                    <Feather name="clock" size={15} color={COLORS.faint} style={styles.inputLeadingIcon} />
                    <TextInput
                      style={styles.inputWithIcon}
                      placeholder="08:45 AM"
                      placeholderTextColor={COLORS.faint}
                      value={formData.endTime}
                      onChangeText={(t) => setFormData({ ...formData, endTime: t })}
                    />
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave} activeOpacity={0.9}>
                <Feather name="check" size={16} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.saveBtnFullText}>{editingId ? 'Update & Close' : 'Save & Close'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Busy Overlay */}
      <Modal visible={!!busyLabel} transparent animationType="fade">
        <View style={styles.busyOverlay}>
          <View style={styles.busyCard}>
            <ActivityIndicator size="large" color={BRAND} />
            <Text style={styles.busyText}>{busyLabel}</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: SPACING.md, color: COLORS.muted, fontSize: FONT.small, fontWeight: '600' },

  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, paddingBottom: SPACING.md, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerIconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  title: { fontSize: FONT.h1, fontWeight: '800', color: COLORS.ink },
  subtitle: { fontSize: FONT.tiny, color: COLORS.faint, marginTop: 2 },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xs, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  actionCard: { width: '48%', flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderFaint, minHeight: TOUCH_TARGET + 16 },
  actionCardPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, ...SHADOW.button },
  actionIconWrap: { width: 36, height: 36, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  actionTextWrap: { flex: 1, minWidth: 0 },
  actionCardTitle: { fontSize: FONT.small, fontWeight: '700', color: COLORS.ink },
  actionCardSub: { fontSize: FONT.micro, color: COLORS.faint, marginTop: 1 },

  classSelectionCard: { backgroundColor: COLORS.surface, marginHorizontal: SPACING.lg, marginTop: SPACING.lg, marginBottom: SPACING.xs, padding: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderFaint, ...SHADOW.card, zIndex: 50 },
  classCardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md, gap: SPACING.sm },
  classCardIconWrap: { width: 24, height: 24, borderRadius: RADIUS.xs, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center' },
  sectionHeading: { fontSize: FONT.tiny, fontWeight: '800', color: BRAND, letterSpacing: 0.6 },

  classMetaRow: { flexDirection: 'row', marginTop: SPACING.lg, gap: SPACING.sm, zIndex: -1 },
  metaBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderFaint, gap: SPACING.sm },
  metaIconWrap: { width: 26, height: 26, borderRadius: RADIUS.xs, backgroundColor: COLORS.secondarySoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  metaLabel: { fontSize: FONT.micro, color: COLORS.faint, fontWeight: '800', letterSpacing: 0.4, marginBottom: 2 },
  metaValue: { fontSize: FONT.small, color: COLORS.ink, fontWeight: '700' },

  timetableBoard: { marginTop: SPACING.xs, zIndex: -1 },
  tabsWrapper: { backgroundColor: 'transparent' },
  dayTab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderFaint, marginRight: SPACING.sm, gap: 6, minHeight: TOUCH_TARGET - 8 },
  dayTabActive: { backgroundColor: BRAND, borderColor: BRAND, ...SHADOW.button },
  dayTabText: { fontSize: FONT.small, fontWeight: '700', color: COLORS.muted },
  dayTabTextActive: { color: '#fff' },
  dayTabBadge: { backgroundColor: COLORS.borderSoft, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, minWidth: 18, alignItems: 'center' },
  dayTabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  dayTabBadgeText: { fontSize: FONT.tiny, fontWeight: '800', color: COLORS.body },
  dayTabBadgeTextActive: { color: '#fff' },

  periodsContainer: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  periodGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },

  periodCard: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: SPACING.lg, width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: COLORS.borderFaint, ...SHADOW.card },
  periodCardAccent: { width: 5, backgroundColor: BRAND },
  periodCardBody: { flex: 1, padding: SPACING.lg },
  periodHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  periodBadge: { backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.xs, paddingHorizontal: 9, paddingVertical: 4 },
  periodBadgeText: { color: BRAND, fontSize: FONT.tiny, fontWeight: '800' },
  periodTimeWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  periodTime: { fontSize: FONT.small, color: COLORS.secondary, fontWeight: '700' },
  subjectName: { fontSize: FONT.h1, fontWeight: '800', color: COLORS.ink, marginBottom: SPACING.md },

  periodDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.background, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderSoft, marginBottom: SPACING.md, gap: SPACING.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  avatarMini: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.secondarySoft, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm, flexShrink: 0 },
  avatarMiniText: { color: COLORS.secondary, fontSize: FONT.small, fontWeight: '800' },
  detailSubLabel: { fontSize: FONT.micro, color: COLORS.faint, fontWeight: '800', letterSpacing: 0.3 },
  teacherName: { fontSize: FONT.small, color: COLORS.ink, fontWeight: '700', marginTop: 1 },
  roomBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.border, gap: 4, flexShrink: 0 },
  roomText: { fontSize: FONT.tiny, color: COLORS.body, fontWeight: '700' },

  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: COLORS.borderSoft, paddingTop: SPACING.md, gap: SPACING.sm },
  iconBtnEdit: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.xs, gap: 6 },
  iconBtnDelete: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.xs, gap: 6 },
  iconBtnText: { fontSize: FONT.small, fontWeight: '700', color: BRAND },

  emptyState: { alignItems: 'center', padding: SPACING.xxl, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.borderFaint, borderStyle: 'dashed' },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: FONT.h3, fontWeight: '800', color: COLORS.ink, marginTop: SPACING.md },
  emptySub: { fontSize: FONT.small, color: COLORS.muted, textAlign: 'center', marginTop: 4, marginBottom: SPACING.lg },
  addPeriodOutlineBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primarySoft, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, gap: 6, minHeight: TOUCH_TARGET },
  addPeriodOutlineBtnText: { color: BRAND, fontWeight: '700', fontSize: FONT.small },

  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', padding: SPACING.md },
  compactModalContainer: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, maxHeight: '90%', overflow: 'hidden', ...SHADOW.raised },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, paddingHorizontal: SPACING.xl, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  formHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  formHeaderIconWrap: { width: 32, height: 32, borderRadius: RADIUS.xs, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center' },
  formTitle: { fontSize: FONT.h2, fontWeight: '800', color: COLORS.ink },
  closeBtnIcon: { padding: 6, backgroundColor: COLORS.borderSoft, borderRadius: 20 },
  formScroll: { padding: SPACING.xl },

  inputWrapper: { marginBottom: SPACING.lg, zIndex: 1 },
  inputLabel: { fontSize: FONT.small, fontWeight: '700', color: COLORS.body, marginBottom: 6, marginLeft: 2 },
  inputIconRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, backgroundColor: COLORS.background, height: TOUCH_TARGET + 2, paddingHorizontal: SPACING.md },
  inputLeadingIcon: { marginRight: SPACING.sm },
  inputWithIcon: { flex: 1, fontSize: FONT.body, color: COLORS.ink, height: '100%' },
  row: { flexDirection: 'row', justifyContent: 'space-between', zIndex: 2 },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: TOUCH_TARGET + 2, backgroundColor: COLORS.background },
  dropdownHeaderActive: { borderColor: BRAND, backgroundColor: COLORS.primarySoft },
  dropdownHeaderMain: { height: TOUCH_TARGET + 4, backgroundColor: COLORS.surface, borderColor: COLORS.border },
  dropdownSelectedText: { color: COLORS.ink, fontSize: FONT.body, fontWeight: '600' },
  dropdownPlaceholder: { color: COLORS.faint, fontSize: FONT.body },
  dropdownListContainer: { position: 'absolute', top: 76, left: 0, right: 0, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, overflow: 'hidden', ...SHADOW.raised, zIndex: 100 },
  dropdownScroll: { maxHeight: 170 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md, paddingHorizontal: SPACING.md },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  dropdownItemActive: { backgroundColor: COLORS.primarySoft },
  dropdownItemText: { fontSize: FONT.body, color: COLORS.body, fontWeight: '500' },
  dropdownItemTextActive: { color: BRAND, fontWeight: '700' },

  saveBtnFull: { flexDirection: 'row', backgroundColor: BRAND, height: 52, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xs, ...SHADOW.button },
  saveBtnFullText: { color: '#fff', fontSize: FONT.h3, fontWeight: '800' },

  busyOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  busyCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, paddingVertical: SPACING.xxl, paddingHorizontal: SPACING.xl, alignItems: 'center', minWidth: 220, ...SHADOW.raised },
  busyText: { fontSize: FONT.small, fontWeight: '600', color: COLORS.body, textAlign: 'center', marginTop: SPACING.md },
});