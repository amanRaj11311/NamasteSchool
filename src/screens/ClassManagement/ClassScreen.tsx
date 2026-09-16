import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';
import { useNavigation } from '@react-navigation/native';
import { COLORS, RADIUS, SPACING, FONT, SHADOW, TOUCH_TARGET, isSmallDevice } from '../../constants/theme';


// --- Types ---
interface Permission {
  module: string;
  action: string;
}

interface School {
  _id: string;
  name: string;
  board: string;
  marksGradesMode: string;
  city: string;
  state: string;
  code: string;
  schoolTimeIn: string;
  schoolTimeOut: string;
  workingDays: string;
}

interface Staff {
  _id: string;
  name: string;
  staffType: string;
  staffId: string;
  primaryMobile?: string;
  photo?: string;
}

interface ClassObj {
  _id?: string;
  id?: string;
  schoolId: any;
  className: string;
  division: string;
  classTeacher: any;
  syllabus: string;
  evaluationType: string;
  description: string;
  capacity?: number;
  studentCount?: number;
  boysCount?: number;
  girlsCount?: number;
}

interface AttendanceSummary {
  present: number;
  total: number;
}

const initialFormState = {
  schoolId: '',
  className: '',
  division: '',
  classTeacher: '',
  description: '',
  syllabus: '',
  evaluationType: '',
  capacity: '35',
};

type ViewMode = 'card' | 'list';
type AlertState = { type: 'success' | 'danger' | ''; message: string };

const PAGE_LIMIT = 10;

export default function ClassesScreen() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const isTablet = width >= 700;

  // Data States
  const [classes, setClasses] = useState<ClassObj[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Today's attendance summary, keyed by classId — mirrors the web dashboard's
  // "Present / Total" indicator on each class card.
  const [todayAttendanceMap, setTodayAttendanceMap] = useState<Record<string, AttendanceSummary>>({});

  // View mode: card grid (default) or a compact list row, matching the web
  // Grid View / List View toggle.
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  // Inline dismissible banner (mirrors the web page's alert banner, in
  // addition to native Alert.alert confirmations for destructive actions).
  const [alertState, setAlertState] = useState<AlertState>({ type: '', message: '' });

  // Filters & server-side pagination (matches the web page's page/limit/search params)
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form Modals & State
  const [isFormVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<typeof initialFormState>(initialFormState);
  const [errors, setErrors] = useState<Partial<typeof initialFormState>>({});

  // Inline Dropdown Tracker
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // View Modal
  const [isViewVisible, setViewVisible] = useState(false);
  const [viewingClass, setViewingClass] = useState<ClassObj | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  // Reset to page 1 whenever the search term (debounced) or view mode changes,
  // then refetch — same behaviour as the web page's useEffect on [search, viewMode].
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!authToken) return;
    setCurrentPage(1);
    fetchClasses(authToken, 1, debouncedSearch);
  }, [debouncedSearch, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authToken) return;
    fetchClasses(authToken, currentPage, debouncedSearch);
  }, [currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');

    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);

    await Promise.all([fetchClasses(token, 1, ''), fetchSchools(token), fetchStaff(token), fetchTodayAttendance(token)]);
    setLoading(false);
  };

  const fetchClasses = async (token: string | null, page: number, search: string, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await axios.get(`${API_BASE}/classes`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { page, limit: PAGE_LIMIT, search: search || undefined },
      });
      if (res.data?.success) {
        setClasses(res.data.data || []);
        const pagination = res.data.pagination;
        if (pagination) {
          setTotalPages(pagination.totalPages || 1);
          setTotalItems(pagination.total ?? (res.data.data || []).length);
        } else {
          setTotalPages(1);
          setTotalItems((res.data.data || []).length);
        }
      }
    } catch (error) {
      console.error(error);
      setAlertState({ type: 'danger', message: 'Could not load classes. Pull down to try again.' });
    } finally {
      setRefreshing(false);
    }
  };

  const fetchSchools = async (token: string | null) => {
    try {
      const res = await axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) setSchools(res.data.data || []);
    } catch (error) {
      console.error('Failed to load schools:', error);
    }
  };

  const fetchStaff = async (token: string | null) => {
    try {
      const res = await axios.get(`${API_BASE}/staff`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) setStaffList(res.data.data || []);
    } catch (error) {
      console.error('Failed to load staff:', error);
    }
  };

  // Mirrors the web page's fetchTodayAttendance: pulls this month's class
  // attendance and rolls up a present/total count per class for "today".
  const fetchTodayAttendance = async (token: string | null) => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const monthStr = todayStr.substring(0, 7);
      const res = await axios.get(`${API_BASE}/attendance/class`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { month: monthStr },
      });
      if (res.data?.data) {
        const map: Record<string, AttendanceSummary> = {};
        res.data.data.forEach((rec: any) => {
          if (rec.date === todayStr && rec.classId) {
            const cid = typeof rec.classId === 'object' ? rec.classId._id : rec.classId;
            if (!map[cid]) map[cid] = { present: 0, total: 0 };
            map[cid].total += 1;
            if (rec.status === 'Present') map[cid].present += 1;
          }
        });
        setTodayAttendanceMap(map);
      }
    } catch (error) {
      console.error('Failed to fetch today attendance summary:', error);
    }
  };

  const onRefresh = useCallback(() => {
    fetchClasses(authToken, currentPage, debouncedSearch, true);
    fetchTodayAttendance(authToken);
  }, [authToken, currentPage, debouncedSearch]);

  // RBAC Checker
  const hasPermission = useCallback(
    (action: string) => {
      if (isSuperAdmin) return true;
      return permissions.some((p) => p.module === 'classes' && p.action === action);
    },
    [permissions, isSuperAdmin]
  );

  // --- Derived Overview Stats ---
  const totalClasses = totalItems || classes.length;
  const totalDivisions = classes.filter((c) => c.division).length;
  const assignedTeachers = new Set(
    classes.filter((c) => c.classTeacher).map((c) => (typeof c.classTeacher === 'object' ? c.classTeacher._id : c.classTeacher))
  ).size;

  const filteredClasses = classes; // filtering now happens server-side via debouncedSearch

  // --- Actions ---
  const openAddForm = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setErrors({});
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const openEditForm = (cls: ClassObj) => {
    setEditingId(cls._id || cls.id || null);
    setFormData({
      schoolId: typeof cls.schoolId === 'object' ? cls.schoolId._id : cls.schoolId,
      className: cls.className,
      division: cls.division || '',
      classTeacher: typeof cls.classTeacher === 'object' ? cls.classTeacher._id : cls.classTeacher || '',
      description: cls.description || '',
      syllabus: cls.syllabus || '',
      evaluationType: cls.evaluationType || '',
      capacity: cls.capacity != null ? String(cls.capacity) : '35',
    });
    setErrors({});
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const closeForm = () => {
    setActiveDropdown(null);
    setFormVisible(false);
  };

  const handleDelete = (id?: string) => {
    if (!id) return;
    Alert.alert('Delete Class', 'Are you sure you want to delete this class? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/classes/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            setAlertState({ type: 'success', message: 'Class deleted successfully.' });
            fetchClasses(authToken, currentPage, debouncedSearch, true);
          } catch (error) {
            setAlertState({ type: 'danger', message: 'Failed to delete class.' });
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    let newErrors: any = {};
    if (!formData.schoolId) newErrors.schoolId = 'School Branch is required';
    if (!formData.className.trim()) newErrors.className = 'Class Name is required';
    const capacityNum = Number(formData.capacity);
    if (!formData.capacity || Number.isNaN(capacityNum) || capacityNum < 1 || capacityNum > 100) {
      newErrors.capacity = 'Enter a capacity between 1 and 100';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setSaving(true);
      const payload = { ...formData, capacity: capacityNum };
      if (editingId) {
        await axios.put(`${API_BASE}/classes/${editingId}`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        setAlertState({ type: 'success', message: 'Class updated successfully.' });
      } else {
        await axios.post(`${API_BASE}/classes`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        setAlertState({ type: 'success', message: 'Class created successfully.' });
      }
      closeForm();
      setCurrentPage(1);
      fetchClasses(authToken, 1, debouncedSearch, true);
    } catch (e: any) {
      setAlertState({ type: 'danger', message: e.response?.data?.message || 'Failed to save class.' });
    } finally {
      setSaving(false);
    }
  };

  // --- Inline Dropdown Handlers ---
  const toggleDropdown = (field: string) => setActiveDropdown(activeDropdown === field ? null : field);

  const handleSchoolSelect = (schoolId: string) => {
    const school = schools.find((s) => s._id === schoolId);
    setFormData({
      ...formData,
      schoolId,
      syllabus: school?.board || '',
      evaluationType: school?.marksGradesMode || '',
    });
    setErrors({ ...errors, schoolId: undefined });
    setActiveDropdown(null);
  };

  // Floating (absolute) dropdown so it overlays content instead of pushing
  // the layout around and fighting the parent ScrollView for touches.
  const renderInlineDropdown = (fieldKey: string, label: string, options: { label: string; value: string }[]) => {
    const isOpen = activeDropdown === fieldKey;
    const currentValue = formData[fieldKey as keyof typeof formData];
    const selectedObj = options.find((o) => o.value === currentValue);
    const hasError = !!errors[fieldKey as keyof typeof errors];

    return (
      <View style={[styles.inputWrapper, isOpen && { zIndex: 50 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive, hasError && styles.inputError]}
          onPress={() => toggleDropdown(fieldKey)}
          activeOpacity={0.75}
        >
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selectedObj?.label || 'Select...'}
          </Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.muted} />
        </TouchableOpacity>

        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={styles.dropdownScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {options.length === 0 ? (
                <View style={styles.dropdownEmpty}>
                  <Text style={styles.dropdownEmptyText}>No options available</Text>
                </View>
              ) : (
                options.map((opt, index) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.dropdownItem,
                      index !== options.length - 1 && styles.dropdownItemBorder,
                      currentValue === opt.value && styles.dropdownItemActive,
                    ]}
                    onPress={() => {
                      if (fieldKey === 'schoolId') handleSchoolSelect(opt.value);
                      else {
                        setFormData({ ...formData, [fieldKey]: opt.value });
                        setActiveDropdown(null);
                      }
                    }}
                  >
                    <Text style={[styles.dropdownItemText, currentValue === opt.value && styles.dropdownItemTextActive]} numberOfLines={1}>
                      {opt.label}
                    </Text>
                    {currentValue === opt.value && <Feather name="check" size={16} color={COLORS.primary} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        )}
        {hasError && <Text style={styles.errorText}>{errors[fieldKey as keyof typeof errors]}</Text>}
      </View>
    );
  };

  const teacherOptions = useMemo(
    () => [
      { label: 'Unassigned', value: '' },
      ...staffList
        .filter((s) => (s.staffType || '').toLowerCase() === 'teacher')
        .map((s) => ({ label: `${s.name} (${s.staffId})`, value: s._id })),
    ],
    [staffList]
  );

  const evaluationOptions = [
    { label: 'Marks', value: 'Marks' },
    { label: 'Grades', value: 'Grades' },
    { label: 'Both', value: 'Both' },
  ];

  const goToTeacherAttendance = (teacherObj: any) => {
    const staffId = typeof teacherObj === 'object' ? teacherObj?._id : teacherObj;
    if (!staffId) return;
    navigation.navigate('Staff Attendance', { staffId });
  };

  const attendanceLabel = (classId?: string) => {
    const summary = classId ? todayAttendanceMap[classId] : undefined;
    if (!summary) return { text: 'Not Marked Today', tone: 'warning' as const };
    const pct = Math.round((summary.present / Math.max(1, summary.total)) * 100);
    return { text: `${summary.present}/${summary.total} Present (${pct}%)`, tone: 'success' as const };
  };

  // --- Render Card (Grid mode) ---
  const renderCard = ({ item }: { item: ClassObj }) => {
    const classId = item._id || item.id;
    const teacherIsPopulated = typeof item.classTeacher === 'object' && item.classTeacher;
    const teacherName = teacherIsPopulated ? item.classTeacher.name : item.classTeacher ? 'Assigned' : 'Unassigned';
    const teacherId = teacherIsPopulated ? item.classTeacher.staffId : '';
    const att = attendanceLabel(classId);

    return (
      <View style={[styles.card, isTablet && styles.cardTablet]}>
        {/* Top accent strip — mirrors the web card's gradient header line */}
        <View style={styles.accentStrip}>
          <View style={[styles.accentSegment, { backgroundColor: COLORS.primary }]} />
          <View style={[styles.accentSegment, { backgroundColor: COLORS.ink }]} />
          <View style={[styles.accentSegment, { backgroundColor: COLORS.info }]} />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.primaryBadge}>
                <Text style={styles.primaryBadgeText}>{item.className}</Text>
              </View>
              {item.division ? (
                <View style={styles.darkBadge}>
                  <Text style={styles.darkBadgeText}>DIV {item.division}</Text>
                </View>
              ) : null}
              <View style={styles.syllabusBadge}>
                <Feather name="book-open" size={12} color={COLORS.secondary} />
                <Text style={styles.syllabusBadgeText} numberOfLines={1}>
                  {item.syllabus || 'N/A'}
                </Text>
              </View>
            </View>

            {/* Quick action icons — matches the web card's top-right icon cluster */}
            <View style={styles.quickIconGroup}>
              {hasPermission('read') && (
                <TouchableOpacity
                  style={styles.quickIconBtn}
                  accessibilityLabel="View class details"
                  onPress={() => {
                    setViewingClass(item);
                    setViewVisible(true);
                  }}
                >
                  <Feather name="eye" size={13} color={COLORS.info} />
                </TouchableOpacity>
              )}
              {hasPermission('update') && (
                <TouchableOpacity style={styles.quickIconBtn} accessibilityLabel="Edit class" onPress={() => openEditForm(item)}>
                  <Feather name="edit-2" size={13} color={COLORS.secondary} />
                </TouchableOpacity>
              )}
              {hasPermission('delete') && (
                <TouchableOpacity style={styles.quickIconBtn} accessibilityLabel="Delete class" onPress={() => handleDelete(classId)}>
                  <Feather name="trash-2" size={13} color={COLORS.primary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.teacherSection}>
            <View style={styles.teacherLeft}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(teacherName || 'U').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.metaLabel}>CLASS TEACHER</Text>
                <Text style={styles.teacherName} numberOfLines={1}>
                  {teacherName}
                </Text>
                {teacherId ? <Text style={styles.teacherId}>{teacherId}</Text> : null}
              </View>
            </View>
            {teacherIsPopulated && (
              <TouchableOpacity style={styles.teacherAttBtn} onPress={() => goToTeacherAttendance(item.classTeacher)}>
                <Feather name="user-check" size={12} color={COLORS.primary} />
                <Text style={styles.teacherAttBtnText}>Teacher Att.</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.metricsList}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Evaluation Scheme</Text>
              <View style={styles.secondaryPillBadge}>
                <Text style={styles.secondaryPillText}>{item.evaluationType || 'Marks & Grades'}</Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>
                <Feather name="calendar" size={11} color={COLORS.success} />  Today's Attendance
              </Text>
              <View style={att.tone === 'success' ? styles.successPillBadge : styles.warningPillBadge}>
                <Text style={att.tone === 'success' ? styles.successPillText : styles.warningPillText}>{att.text}</Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>
                <Feather name="users" size={11} color={COLORS.primary} />  Total Students
              </Text>
              <View style={styles.redOutlineBadge}>
                <Text style={styles.redOutlineBadgeText}>{item.studentCount || 0} Students</Text>
              </View>
            </View>

            <View style={[styles.metricRow, { justifyContent: 'flex-start', gap: SPACING.sm }]}>
              <View style={styles.blueBadge}>
                <Feather name="user" size={10} color={COLORS.info} />
                <Text style={styles.blueBadgeText}>Boys: {item.boysCount || 0}</Text>
              </View>
              <View style={styles.pinkLightBadge}>
                <Feather name="user" size={10} color={COLORS.pink} />
                <Text style={styles.pinkLightBadgeText}>Girls: {item.girlsCount || 0}</Text>
              </View>
            </View>
          </View>

          {/* Structured action grid — mirrors the web card's Students /
              Attendance / Results / Timetable buttons */}
          <View style={styles.cardActionsGrid}>
            <View style={styles.actionGridRow}>
              <TouchableOpacity
                style={[styles.gridBtn, styles.gridBtnPrimary]}
                activeOpacity={0.9}
                onPress={() =>
                  navigation.navigate('Students', {
                    classId,
                    className: item.className,
                    division: item.division,
                  })
                }
              >
                <Feather name="user-plus" size={13} color="#fff" />
                <Text style={styles.gridBtnTextLight} numberOfLines={1}>
                  Students ({item.studentCount || 0})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.gridBtn, styles.gridBtnSuccess]}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('ClassAttendance', { classId })}
              >
                <Feather name="clipboard" size={13} color="#fff" />
                <Text style={styles.gridBtnTextLight} numberOfLines={1}>
                  Attendance
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionGridRow}>
              <TouchableOpacity
                style={styles.resultsIconBtn}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('ClassResults', { classId })}
                accessibilityLabel="results"
              >
                <Feather name="bar-chart-2" size={15} color={COLORS.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.gridBtn, styles.gridBtnOutline, { flex: 1 }]}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('ClassTimetable', { classId })}
              >
                <Feather name="calendar" size={13} color={COLORS.secondary} />
                <Text style={styles.gridBtnTextDark} numberOfLines={1}>
                  Class Timetable & Schedule
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // --- Render Row (compact List mode) ---
  const renderRow = ({ item }: { item: ClassObj }) => {
    const classId = item._id || item.id;
    const teacherIsPopulated = typeof item.classTeacher === 'object' && item.classTeacher;
    const teacherName = teacherIsPopulated ? item.classTeacher.name : item.classTeacher ? 'Assigned' : 'Unassigned';
    const att = attendanceLabel(classId);

    return (
      <View style={styles.rowCard}>
        <View style={styles.rowTop}>
          <View style={styles.rowTitleGroup}>
            <View style={styles.primaryBadgeSm}>
              <Text style={styles.primaryBadgeSmText}>{item.className}</Text>
            </View>
            {item.division ? (
              <View style={styles.darkBadgeSm}>
                <Text style={styles.darkBadgeSmText}>{item.division}</Text>
              </View>
            ) : null}
            <Text style={styles.rowTeacherText} numberOfLines={1}>
              {teacherName}
            </Text>
          </View>
          <View style={styles.rowIconGroup}>
            {hasPermission('read') && (
              <TouchableOpacity style={styles.quickIconBtn} onPress={() => { setViewingClass(item); setViewVisible(true); }}>
                <Feather name="eye" size={13} color={COLORS.info} />
              </TouchableOpacity>
            )}
            {hasPermission('update') && (
              <TouchableOpacity style={styles.quickIconBtn} onPress={() => openEditForm(item)}>
                <Feather name="edit-2" size={13} color={COLORS.secondary} />
              </TouchableOpacity>
            )}
            {hasPermission('delete') && (
              <TouchableOpacity style={styles.quickIconBtn} onPress={() => handleDelete(classId)}>
                <Feather name="trash-2" size={13} color={COLORS.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.rowMetaLine}>
          <Text style={styles.rowMetaText}>
            <Feather name="users" size={11} /> {item.studentCount || 0} students
          </Text>
          <Text style={styles.rowMetaText}>
            <Feather name="book-open" size={11} /> {item.syllabus || 'N/A'}
          </Text>
          <View style={att.tone === 'success' ? styles.successPillBadgeSm : styles.warningPillBadgeSm}>
            <Text style={att.tone === 'success' ? styles.successPillTextSm : styles.warningPillTextSm} numberOfLines={1}>
              {att.text}
            </Text>
          </View>
        </View>

        <View style={styles.rowActionBar}>
          <TouchableOpacity style={styles.rowActionBtn} onPress={() => navigation.navigate('ClassStudent', { classId, className: item.className, division: item.division })}>
            <Text style={styles.rowActionBtnText}>Students</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rowActionBtn} onPress={() => navigation.navigate('ClassAttendance', { classId })}>
            <Text style={styles.rowActionBtnText}>Attendance</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rowActionBtn} onPress={() => navigation.navigate('ClassResults', { classId })}>
            <Text style={styles.rowActionBtnText}>Results</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rowActionBtn} onPress={() => navigation.navigate('ClassTimetable', { classId })
}>
            <Text style={styles.rowActionBtnText}>Timetable</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          <Feather name="book" size={20} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            School Classes
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Manage sections, teachers & rosters
          </Text>
        </View>

        {/* View mode toggle — Grid / List, matches the web page's toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'card' && styles.viewToggleBtnActive]}
            onPress={() => setViewMode('card')}
            accessibilityLabel="Grid view"
          >
            <Feather name="grid" size={14} color={viewMode === 'card' ? '#fff' : COLORS.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
            onPress={() => setViewMode('list')}
            accessibilityLabel="List view"
          >
            <Feather name="list" size={14} color={viewMode === 'list' ? '#fff' : COLORS.muted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* No School banner — mirrors the web page's "No School Branch" warning */}
      {!loading && schools.length === 0 && (
        <View style={styles.warningBanner}>
          <Feather name="alert-triangle" size={18} color={COLORS.warning} />
          <View style={{ flex: 1, marginLeft: SPACING.sm }}>
            <Text style={styles.warningTitle}>No School Created</Text>
            <Text style={styles.warningSub}>Please create a school before adding classes.</Text>
          </View>
          <TouchableOpacity style={styles.warningBtn} onPress={() => navigation.navigate('Create School')}>
            <Text style={styles.warningBtnText}>Create</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Inline dismissible alert */}
      {alertState.message ? (
        <View style={[styles.inlineAlert, alertState.type === 'success' ? styles.inlineAlertSuccess : styles.inlineAlertDanger]}>
          <Text style={[styles.inlineAlertText, alertState.type === 'success' ? styles.inlineAlertTextSuccess : styles.inlineAlertTextDanger]} numberOfLines={2}>
            {alertState.message}
          </Text>
          <TouchableOpacity onPress={() => setAlertState({ type: '', message: '' })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={16} color={alertState.type === 'success' ? COLORS.success : COLORS.primary} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Overview Cards (Scrollable horizontally) */}
      {/* Overview Cards — premium 2x2 grid, fixed-height, no layout shift */}
<View style={styles.overviewGrid}>
  <View style={[styles.kpiCard, isTablet && styles.kpiCardTablet]}>
    <View style={styles.kpiTopRow}>
      <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.secondarySoft }]}>
        <Feather name="grid" size={15} color={COLORS.secondary} />
      </View>
      <View style={styles.kpiTrendDot} />
    </View>
    <Text style={styles.kpiLabel} numberOfLines={1}>TOTAL CLASSES</Text>
    <Text
      style={styles.kpiValue}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
    >
      {loading ? '—' : totalClasses}
    </Text>
  </View>

  <View style={[styles.kpiCard, isTablet && styles.kpiCardTablet]}>
    <View style={styles.kpiTopRow}>
      <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.primarySoft }]}>
        <Feather name="layers" size={15} color={COLORS.primary} />
      </View>
      <View style={styles.kpiTrendDot} />
    </View>
    <Text style={styles.kpiLabel} numberOfLines={1}>DIVISIONS</Text>
    <Text
      style={styles.kpiValue}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
    >
      {loading ? '—' : totalDivisions}
    </Text>
  </View>

  <View style={[styles.kpiCard, isTablet && styles.kpiCardTablet]}>
    <View style={styles.kpiTopRow}>
      <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.successSoft }]}>
        <Feather name="user-check" size={15} color={COLORS.success} />
      </View>
      <View style={styles.kpiTrendDot} />
    </View>
    <Text style={styles.kpiLabel} numberOfLines={1}>ASSIGNED TEACHERS</Text>
    <Text
      style={styles.kpiValue}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
    >
      {loading ? '—' : assignedTeachers}
    </Text>
  </View>

  <View style={[styles.kpiCard, isTablet && styles.kpiCardTablet]}>
    <View style={styles.kpiTopRow}>
      <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.warningSoft }]}>
        <Feather name="zap" size={15} color={COLORS.warning} />
      </View>
      <View style={styles.kpiTrendDot} />
    </View>
    <Text style={styles.kpiLabel} numberOfLines={1}>SYLLABUS ENGINE</Text>
    <Text
      style={styles.kpiValueText}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
    >
      Auto-Detected
    </Text>
  </View>
</View>

      {/* Action Bar */}
      <View style={[styles.actionBar, compact && styles.actionBarCompact]}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={COLORS.faint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search classes by name, division, syllabus..."
            placeholderTextColor={COLORS.faint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Clear search">
              <Feather name="x-circle" size={16} color={COLORS.faint} />
            </TouchableOpacity>
          )}
        </View>
        {hasPermission('create') && (
          <TouchableOpacity
            style={[styles.addBtn, compact && styles.addBtnCompact, schools.length === 0 && styles.addBtnDisabled]}
            onPress={openAddForm}
            activeOpacity={0.9}
            disabled={schools.length === 0}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>Add New Class</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.showingText}>
        Showing {filteredClasses.length} of {totalClasses} class records
      </Text>

      {/* Class List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading classes…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredClasses}
          keyExtractor={(item, idx) => item._id || item.id || idx.toString()}
          renderItem={viewMode === 'card' ? renderCard : renderRow}
          numColumns={viewMode === 'card' && isTablet ? 2 : 1}
          key={`${viewMode}-${viewMode === 'card' && isTablet ? 'tablet' : 'phone'}`}
          columnWrapperStyle={viewMode === 'card' && isTablet ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.paginationBar}>
                <TouchableOpacity
                  style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
                  disabled={currentPage === 1}
                  onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <Feather name="chevron-left" size={16} color={currentPage === 1 ? COLORS.faint : COLORS.primary} />
                </TouchableOpacity>
                <Text style={styles.pageText}>
                  Page {currentPage} of {totalPages}
                </Text>
                <TouchableOpacity
                  style={[styles.pageBtn, currentPage === totalPages && styles.pageBtnDisabled]}
                  disabled={currentPage === totalPages}
                  onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  <Feather name="chevron-right" size={16} color={currentPage === totalPages ? COLORS.faint : COLORS.primary} />
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Feather name="inbox" size={26} color={COLORS.faint} />
              </View>
              <Text style={styles.emptyTitle}>No classes found</Text>
              <Text style={styles.emptySub}>Try a different search, or add your first class.</Text>
              {searchQuery.length > 0 && (
                <TouchableOpacity style={styles.emptyClearBtn} onPress={() => setSearchQuery('')}>
                  <Text style={styles.emptyClearBtnText}>Clear search</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* --- ADD/EDIT FORM MODAL --- */}
      <Modal visible={isFormVisible} transparent animationType="fade" onRequestClose={closeForm}>
        <View style={styles.formOverlay}>
          <View style={[styles.formModalContainer, isTablet && styles.formModalContainerTablet]}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderLeft}>
                <View style={styles.formHeaderIconWrap}>
                  <Feather name={editingId ? 'edit-2' : 'plus'} size={16} color={COLORS.primary} />
                </View>
                <Text style={styles.formTitle}>{editingId ? 'Edit Class Details' : 'Add New Class'}</Text>
              </View>
              <TouchableOpacity onPress={closeForm} style={styles.closeBtnIcon} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={COLORS.body} />
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Backdrop to close any open dropdown when tapping elsewhere in the form */}
                {activeDropdown && (
                  <Pressable style={styles.dropdownBackdrop} onPress={() => setActiveDropdown(null)} />
                )}

                <View style={styles.formCard}>
                  <Text style={styles.sectionTitle}>Class Details</Text>
                  <Text style={styles.sectionSub}>Only Class Name and School Branch are mandatory</Text>

                  {formData.syllabus ? (
                    <View style={styles.autoSyllabusBadge}>
                      <Feather name="check-circle" size={14} color={COLORS.success} />
                      <Text style={styles.autoSyllabusText}>Auto-Syllabus Active ({formData.syllabus})</Text>
                    </View>
                  ) : null}

                  {renderInlineDropdown(
                    'schoolId',
                    'School Branch *',
                    schools.map((s) => ({ label: s.name, value: s._id }))
                  )}

                  <View style={[styles.row, compact && styles.rowCompact]}>
                    <View style={[styles.inputWrapper, compact ? styles.rowCompactItem : { flex: 1, marginRight: SPACING.md }]}>
                      <Text style={styles.inputLabel}>
                        Class Name <Text style={styles.asterisk}>*</Text>
                      </Text>
                      <TextInput
                        style={[styles.input, errors.className && styles.inputError]}
                        placeholder="e.g. Class 10 or LKG"
                        placeholderTextColor={COLORS.faint}
                        value={formData.className}
                        onChangeText={(t) => {
                          setFormData({ ...formData, className: t });
                          setErrors({ ...errors, className: undefined });
                        }}
                      />
                      {errors.className && <Text style={styles.errorText}>{errors.className}</Text>}
                    </View>

                    <View style={[styles.inputWrapper, compact ? styles.rowCompactItem : { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Division (Optional)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. A, B, C"
                        placeholderTextColor={COLORS.faint}
                        value={formData.division}
                        onChangeText={(t) => setFormData({ ...formData, division: t })}
                        autoCapitalize="characters"
                      />
                    </View>
                  </View>

                  {/* Max Section Capacity — matches the web edit modal's capacity field */}
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>
                      Max Section Capacity <Text style={styles.asterisk}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.input, errors.capacity && styles.inputError]}
                      placeholder="35"
                      placeholderTextColor={COLORS.faint}
                      keyboardType="number-pad"
                      value={formData.capacity}
                      onChangeText={(t) => {
                        setFormData({ ...formData, capacity: t.replace(/[^0-9]/g, '') });
                        setErrors({ ...errors, capacity: undefined });
                      }}
                    />
                    <Text style={styles.helperText}>Max students allowed before section auto-overflows.</Text>
                    {errors.capacity && <Text style={styles.errorText}>{errors.capacity}</Text>}
                  </View>

                  {renderInlineDropdown('classTeacher', 'Class Teacher (Optional)', teacherOptions)}
                  {renderInlineDropdown('evaluationType', 'Evaluation Mode (Optional)', evaluationOptions)}

                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Class Description & Notes (Optional)</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="Enter optional description or notes..."
                      placeholderTextColor={COLORS.faint}
                      multiline
                      value={formData.description}
                      onChangeText={(t) => setFormData({ ...formData, description: t })}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.saveBtnFull, saving && styles.saveBtnFullDisabled]}
                  onPress={handleSave}
                  activeOpacity={0.9}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="check" size={16} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.saveBtnFullText}>{editingId ? 'Save Changes' : 'Submit Class'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>

      {/* --- VIEW FULL SPECIFICATION MODAL --- */}
      <Modal visible={isViewVisible} transparent animationType="fade" onRequestClose={() => setViewVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.viewModalContainer, isTablet && styles.formModalContainerTablet]}>
            <View style={styles.viewHeaderRed}>
              <Text style={styles.viewTitle}>Class Full Specification</Text>
              <TouchableOpacity onPress={() => setViewVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: SPACING.xl }} showsVerticalScrollIndicator={false}>
              <Text style={styles.viewSub}>OVERVIEW</Text>
              <View style={styles.viewOverviewRow}>
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>{viewingClass?.className}</Text>
                </View>
                {viewingClass?.division ? (
                  <View style={styles.darkBadge}>
                    <Text style={styles.darkBadgeText}>Division {viewingClass.division}</Text>
                  </View>
                ) : null}
                <View style={[styles.syllabusBadge, { marginLeft: 'auto' }]}>
                  <Feather name="book-open" size={12} color={COLORS.secondary} />
                  <Text style={styles.syllabusBadgeText}>Syllabus: {viewingClass?.syllabus || 'N/A'}</Text>
                </View>
              </View>

              <Text style={styles.sectionHeaderRed}>SCHOOL & AFFILIATION</Text>
              <View style={styles.viewDetailsBox}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewLabel}>School Name</Text>
                    <Text style={styles.viewVal}>{typeof viewingClass?.schoolId === 'object' ? viewingClass?.schoolId.name : 'N/A'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewLabel}>School Code</Text>
                    <Text style={styles.viewVal}>{typeof viewingClass?.schoolId === 'object' ? viewingClass?.schoolId.code : 'N/A'}</Text>
                  </View>
                </View>
                <View style={[styles.row, { marginTop: SPACING.md }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewLabel}>Location</Text>
                    <Text style={styles.viewVal}>
                      {typeof viewingClass?.schoolId === 'object' ? `${viewingClass?.schoolId.city}, ${viewingClass?.schoolId.state}` : 'N/A'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewLabel}>School Schedule</Text>
                    <Text style={styles.viewVal}>
                      {typeof viewingClass?.schoolId === 'object'
                        ? `${viewingClass?.schoolId.schoolTimeIn} - ${viewingClass?.schoolId.schoolTimeOut}`
                        : 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.row, compact && styles.rowCompact]}>
                <View style={compact ? styles.rowCompactItem : { flex: 1, marginRight: SPACING.sm }}>
                  <Text style={styles.sectionHeaderRed}>TEACHER</Text>
                  <View style={styles.viewDetailsBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[styles.avatar, { width: 40, height: 40, borderRadius: 20 }]}>
                        <Text style={styles.avatarText}>
                          {typeof viewingClass?.classTeacher === 'object' ? viewingClass?.classTeacher?.name?.charAt(0)?.toUpperCase() : 'U'}
                        </Text>
                      </View>
                      <View style={{ marginLeft: SPACING.sm, flex: 1, minWidth: 0 }}>
                        <Text style={styles.viewVal} numberOfLines={1}>
                          {typeof viewingClass?.classTeacher === 'object' ? viewingClass?.classTeacher?.name : 'Unassigned'}
                        </Text>
                        {typeof viewingClass?.classTeacher === 'object' && <Text style={styles.viewLabel}>{viewingClass?.classTeacher?.staffId}</Text>}
                      </View>
                    </View>
                    {typeof viewingClass?.classTeacher === 'object' && viewingClass?.classTeacher && (
                      <TouchableOpacity style={[styles.teacherAttBtn, { marginTop: SPACING.sm, alignSelf: 'flex-start' }]} onPress={() => goToTeacherAttendance(viewingClass.classTeacher)}>
                        <Feather name="user-check" size={12} color={COLORS.primary} />
                        <Text style={styles.teacherAttBtnText}>Teacher Att.</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={compact ? styles.rowCompactItem : { flex: 1, marginLeft: SPACING.sm }}>
                  <Text style={styles.sectionHeaderRed}>EVALUATION</Text>
                  <View style={styles.viewDetailsBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Feather name="check-circle" size={16} color={COLORS.success} />
                      <Text style={[styles.viewVal, { marginLeft: 8 }]}>{viewingClass?.evaluationType || 'N/A'}</Text>
                    </View>
                    <Text style={styles.viewLabel}>Standard Grading Scheme</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.sectionHeaderRed}>TODAY'S ATTENDANCE</Text>
              <View style={[styles.viewDetailsBox]}>
                {(() => {
                  const att = attendanceLabel(viewingClass?._id || viewingClass?.id);
                  return (
                    <View style={att.tone === 'success' ? styles.successPillBadge : styles.warningPillBadge}>
                      <Text style={att.tone === 'success' ? styles.successPillText : styles.warningPillText}>{att.text}</Text>
                    </View>
                  );
                })()}
              </View>

              <Text style={styles.sectionHeaderRed}>DESCRIPTION & NOTES</Text>
              <View style={[styles.viewDetailsBox, { marginBottom: SPACING.md }]}>
                <Text style={styles.viewText}>{viewingClass?.description || 'No description provided.'}</Text>
              </View>

              {hasPermission('update') && (
                <TouchableOpacity
                  style={[styles.saveBtnFull, { marginBottom: SPACING.xl }]}
                  onPress={() => {
                    const target = viewingClass;
                    setViewVisible(false);
                    if (target) openEditForm(target);
                  }}
                >
                  <Feather name="edit-2" size={16} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.saveBtnFullText}>Edit Class</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.xl,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  title: { fontSize: FONT.h1, fontWeight: '800', color: COLORS.ink },
  subtitle: { fontSize: FONT.tiny, color: COLORS.faint, marginTop: 2 },

  viewToggle: { flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: RADIUS.pill, padding: 3, borderWidth: 1, borderColor: COLORS.borderSoft, marginLeft: SPACING.sm },
  viewToggleBtn: { width: 30, height: 30, borderRadius: RADIUS.pill, justifyContent: 'center', alignItems: 'center' },
  viewToggleBtnActive: { backgroundColor: COLORS.primary },

  warningBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.lg, marginTop: SPACING.lg, padding: SPACING.md, backgroundColor: COLORS.warningSoft, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#F5D98F' },
  warningTitle: { fontSize: FONT.small, fontWeight: '800', color: COLORS.ink },
  warningSub: { fontSize: FONT.tiny, color: COLORS.muted, marginTop: 2 },
  warningBtn: { backgroundColor: COLORS.warning, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill },
  warningBtnText: { fontSize: FONT.tiny, fontWeight: '800', color: '#fff' },

  inlineAlert: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1 },
  inlineAlertSuccess: { backgroundColor: COLORS.successSoft, borderColor: COLORS.successSoftBorder },
  inlineAlertDanger: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primarySoftBorder },
  inlineAlertText: { flex: 1, fontSize: FONT.small, fontWeight: '700', marginRight: SPACING.sm },
  inlineAlertTextSuccess: { color: '#065F46' },
  inlineAlertTextDanger: { color: COLORS.primary },

 overviewGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  paddingHorizontal: SPACING.lg,
  paddingTop: SPACING.lg,
  paddingBottom: SPACING.sm,
  gap: SPACING.md,
},
kpiCard: {
  flexBasis: '47%',
  flexGrow: 1,
  height: 100,              // fixed height — kills the "jump then settle" bug
  backgroundColor: COLORS.surface,
  borderRadius: RADIUS.lg,
  borderWidth: 1,
  borderColor: COLORS.borderFaint,
  padding: SPACING.md,
  justifyContent: 'space-between',
  overflow: 'hidden',
  ...SHADOW.card,
},
kpiCardTablet: {
  flexBasis: '23%',
  height: 108,
},
kpiTopRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
},
kpiIconWrap: {
  width: 28,
  height: 28,
  borderRadius: RADIUS.xs,
  justifyContent: 'center',
  alignItems: 'center',
},
kpiTrendDot: {
  width: 6,
  height: 6,
  borderRadius: 3,
  backgroundColor: COLORS.borderSoft,
},
kpiLabel: {
  fontSize: FONT.micro,
  fontWeight: '800',
  color: COLORS.muted,
  letterSpacing: 0.6,
  marginTop: SPACING.sm,
},
kpiValue: {
  fontSize: 24,
  fontWeight: '800',
  color: COLORS.ink,
  includeFontPadding: false,   // Android: stops icon-font style clipping/offset
},
kpiValueText: {
  fontSize: FONT.h3,
  fontWeight: '800',
  color: COLORS.success,
  includeFontPadding: false,
},
  actionBar: { flexDirection: 'row', paddingHorizontal: SPACING.lg, alignItems: 'center', gap: SPACING.md, zIndex: 10 },
  actionBarCompact: { flexDirection: 'column', alignItems: 'stretch' },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    height: TOUCH_TARGET,
    gap: SPACING.sm,
    ...SHADOW.card,
  },
  searchInput: { flex: 1, fontSize: FONT.body, color: COLORS.ink },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    height: TOUCH_TARGET,
    borderRadius: RADIUS.sm,
    gap: SPACING.xs,
    ...SHADOW.button,
  },
  addBtnCompact: { marginTop: SPACING.sm },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: '#fff', fontSize: FONT.small, fontWeight: '700' },
  showingText: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, fontSize: FONT.tiny, color: COLORS.muted, fontWeight: '500', textAlign: 'right' },

  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl, paddingTop: SPACING.sm },
  columnWrapper: { gap: SPACING.lg },

  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderSoft, overflow: 'hidden', ...SHADOW.card },
  cardTablet: { flex: 1, maxWidth: '49%' },
  accentStrip: { flexDirection: 'row', height: 4, width: '100%' },
  accentSegment: { flex: 1 },
  cardBody: { padding: SPACING.lg },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.lg, gap: SPACING.sm, flexWrap: 'wrap' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1, gap: SPACING.sm },
  primaryBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.pill },
  primaryBadgeText: { color: '#fff', fontSize: FONT.small, fontWeight: '800' },
  darkBadge: { backgroundColor: COLORS.ink, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill },
  darkBadgeText: { color: '#fff', fontSize: FONT.tiny, fontWeight: '700' },
  syllabusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.xs, gap: 4, maxWidth: 150 },
  syllabusBadgeText: { color: COLORS.secondary, fontSize: FONT.tiny, fontWeight: '800' },

  quickIconGroup: { flexDirection: 'row', gap: 6, backgroundColor: COLORS.background, padding: 3, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.borderSoft },
  quickIconBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', ...SHADOW.card },

  teacherSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  teacherLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  avatarText: { fontSize: FONT.h2, fontWeight: '800', color: '#fff' },
  metaLabel: { fontSize: FONT.micro, fontWeight: '800', color: COLORS.faint, marginBottom: 2, letterSpacing: 0.3 },
  teacherName: { fontSize: FONT.h3, fontWeight: '800', color: COLORS.ink },
  teacherId: { fontSize: FONT.tiny, color: COLORS.muted, fontWeight: '500' },
  teacherAttBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.primarySoftBorder, backgroundColor: COLORS.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill },
  teacherAttBtnText: { fontSize: FONT.tiny, fontWeight: '800', color: COLORS.primary },

  metricsList: { gap: SPACING.sm, marginBottom: SPACING.lg },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricLabel: { fontSize: FONT.small, color: COLORS.muted, fontWeight: '600' },
  secondaryPillBadge: { backgroundColor: COLORS.borderSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.xs },
  secondaryPillText: { fontSize: FONT.tiny, fontWeight: '700', color: COLORS.body },
  successPillBadge: { backgroundColor: COLORS.successSoft, borderWidth: 1, borderColor: COLORS.successSoftBorder, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.xs },
  successPillText: { fontSize: FONT.tiny, fontWeight: '800', color: '#065F46' },
  warningPillBadge: { backgroundColor: COLORS.warningSoft, borderWidth: 1, borderColor: '#F5D98F', paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.xs },
  warningPillText: { fontSize: FONT.tiny, fontWeight: '800', color: '#92650A' },
  redOutlineBadge: { backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: COLORS.primarySoftBorder, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.xs },
  redOutlineBadgeText: { color: COLORS.primary, fontSize: FONT.tiny, fontWeight: '700' },
  blueBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.infoSoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: RADIUS.xs, gap: 4 },
  blueBadgeText: { color: COLORS.info, fontSize: FONT.tiny, fontWeight: '700' },
  pinkLightBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.pinkSoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: RADIUS.xs, gap: 4 },
  pinkLightBadgeText: { color: COLORS.pink, fontSize: FONT.tiny, fontWeight: '700' },

  cardActionsGrid: { borderTopWidth: 1, borderTopColor: COLORS.borderSoft, paddingTop: SPACING.md, gap: SPACING.sm },
  actionGridRow: { flexDirection: 'row', gap: SPACING.sm },
  gridBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, gap: 6 },
  gridBtnPrimary: { backgroundColor: COLORS.primary },
  gridBtnSuccess: { backgroundColor: COLORS.success },
  gridBtnOutline: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  gridBtnTextLight: { color: '#fff', fontSize: FONT.tiny, fontWeight: '800' },
  gridBtnTextDark: { color: COLORS.secondary, fontSize: FONT.tiny, fontWeight: '800' },
  resultsIconBtn: { width: TOUCH_TARGET - 8, height: TOUCH_TARGET - 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.primarySoftBorder, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center' },

  // Compact List row (List view)
  rowCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft, ...SHADOW.card },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1, minWidth: 0 },
  primaryBadgeSm: { backgroundColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  primaryBadgeSmText: { color: '#fff', fontSize: FONT.tiny, fontWeight: '800' },
  darkBadgeSm: { backgroundColor: COLORS.ink, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill },
  darkBadgeSmText: { color: '#fff', fontSize: FONT.micro, fontWeight: '700' },
  rowTeacherText: { fontSize: FONT.small, color: COLORS.muted, fontWeight: '600', flexShrink: 1 },
  rowIconGroup: { flexDirection: 'row', gap: 6 },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  rowMetaText: { fontSize: FONT.tiny, color: COLORS.muted, fontWeight: '600' },
  successPillBadgeSm: { backgroundColor: COLORS.successSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.xs },
  successPillTextSm: { fontSize: FONT.micro, fontWeight: '800', color: '#065F46' },
  warningPillBadgeSm: { backgroundColor: COLORS.warningSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.xs },
  warningPillTextSm: { fontSize: FONT.micro, fontWeight: '800', color: '#92650A' },
  rowActionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderSoft },
  rowActionBtn: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  rowActionBtnText: { fontSize: FONT.tiny, fontWeight: '700', color: COLORS.body },

  paginationBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, paddingVertical: SPACING.lg },
  pageBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  pageBtnDisabled: { opacity: 0.4 },
  pageText: { fontSize: FONT.small, fontWeight: '700', color: COLORS.body },

  emptyState: { alignItems: 'center', padding: SPACING.xxl, marginTop: SPACING.lg },
  emptyIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft },
  emptyTitle: { fontSize: FONT.h3, fontWeight: '800', color: COLORS.ink },
  emptySub: { fontSize: FONT.small, color: COLORS.muted, marginTop: 4, textAlign: 'center' },
  emptyClearBtn: { marginTop: SPACING.lg, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, backgroundColor: COLORS.primarySoft },
  emptyClearBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: FONT.small },

  // Form Modal
  formOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  formModalContainer: { width: '100%', maxWidth: 650, height: '85%', backgroundColor: COLORS.background, borderRadius: RADIUS.xl, overflow: 'hidden', ...SHADOW.raised },
  formModalContainerTablet: { maxWidth: 720, height: '80%' },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  formHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  formHeaderIconWrap: { width: 32, height: 32, borderRadius: RADIUS.xs, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center' },
  formTitle: { fontSize: FONT.h2, fontWeight: '800', color: COLORS.ink },
  closeBtnIcon: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.borderSoft, borderRadius: 18 },
  formScroll: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  dropdownBackdrop: { ...StyleSheet.absoluteFillObject, zIndex: 5 },
  formCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card },
  sectionTitle: { fontSize: FONT.h2, fontWeight: '800', color: COLORS.ink },
  sectionSub: { fontSize: FONT.small, color: COLORS.muted, marginBottom: SPACING.lg, marginTop: 2 },

  autoSyllabusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.successSoft, padding: SPACING.md, borderRadius: RADIUS.sm, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.successSoftBorder, gap: SPACING.sm },
  autoSyllabusText: { color: '#065F46', fontSize: FONT.small, fontWeight: '700' },

  inputWrapper: { marginBottom: SPACING.lg, position: 'relative' },
  inputLabel: { fontSize: FONT.small, fontWeight: '700', color: COLORS.body, marginBottom: 6, marginLeft: 2 },
  helperText: { fontSize: FONT.tiny, color: COLORS.muted, marginTop: 4, marginLeft: 2 },
  asterisk: { color: COLORS.primary },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: TOUCH_TARGET + 4, backgroundColor: COLORS.background, fontSize: FONT.body, color: COLORS.ink },
  textArea: { height: 84, paddingTop: 12, textAlignVertical: 'top' },
  inputError: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  errorText: { color: COLORS.primary, fontSize: FONT.tiny, marginTop: 4, fontWeight: '500' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowCompact: { flexDirection: 'column' },
  rowCompactItem: { width: '100%' },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: TOUCH_TARGET + 4, backgroundColor: COLORS.background },
  dropdownHeaderActive: { borderColor: COLORS.primary },
  dropdownSelectedText: { color: COLORS.ink, fontSize: FONT.body, fontWeight: '500' },
  dropdownPlaceholder: { color: COLORS.faint, fontSize: FONT.body },
  // Floats above surrounding fields instead of pushing the layout down,
  // which is what caused the overlap / stuck-touch glitches before.
  dropdownListContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    zIndex: 100,
    elevation: 12,
    ...SHADOW.raised,
  },
  dropdownScroll: { maxHeight: 220 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md, paddingHorizontal: SPACING.md },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  dropdownItemActive: { backgroundColor: COLORS.primarySoft },
  dropdownItemText: { fontSize: FONT.body, color: COLORS.body, fontWeight: '500', flexShrink: 1, marginRight: SPACING.sm },
  dropdownItemTextActive: { color: COLORS.primary, fontWeight: '700' },
  dropdownEmpty: { padding: SPACING.lg, alignItems: 'center' },
  dropdownEmptyText: { color: COLORS.faint, fontSize: FONT.small },

  saveBtnFull: { flexDirection: 'row', backgroundColor: COLORS.primary, height: 56, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xs, ...SHADOW.button },
  saveBtnFullDisabled: { opacity: 0.7 },
  saveBtnFullText: { color: '#fff', fontSize: FONT.h3, fontWeight: '800' },

  // View Full Spec Modal
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  viewModalContainer: { backgroundColor: COLORS.background, width: '100%', maxWidth: 650, borderRadius: RADIUS.xl, maxHeight: '85%', overflow: 'hidden', ...SHADOW.raised },
  viewHeaderRed: { backgroundColor: COLORS.primary, padding: SPACING.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewTitle: { color: '#fff', fontSize: FONT.h2, fontWeight: '800', letterSpacing: 0.3 },
  viewOverviewRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xl, flexWrap: 'wrap' },
  viewSub: { fontSize: FONT.tiny, color: COLORS.muted, fontWeight: '700', marginBottom: SPACING.sm, letterSpacing: 1 },

  sectionHeaderRed: { fontSize: FONT.tiny, fontWeight: '800', color: COLORS.primary, marginTop: SPACING.md, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  viewDetailsBox: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  viewLabel: { fontSize: FONT.tiny, color: COLORS.faint, fontWeight: '700', marginBottom: 4 },
  viewVal: { fontSize: FONT.body, color: COLORS.ink, fontWeight: '700' },
  viewText: { fontSize: FONT.body, color: COLORS.body, lineHeight: 23, fontWeight: '500' },
})