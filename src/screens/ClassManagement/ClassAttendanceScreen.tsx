import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { API_BASE } from '../../network/api';
const CLASS_ATTENDANCE_URL = `${API_BASE}/attendance/class`;

const C = {
  bg: '#F4F6F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#101828', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#E11D2E', primaryDark: '#B91424', primarySoft: '#FEECEC',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
  slate: '#64748B', slateSoft: '#F1F5F9',
  purple: '#8B5CF6', purpleSoft: '#EDE9FE',
  todayTint: '#FFF7ED', todayBorder: '#FDBA74',
  futureBg: '#F8F9FB',
};

const SHADOW = {
  card: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  raised: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 18, elevation: 6,
  },
  soft: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; abbr: string; icon: string }> = {
  Present: { label: 'Present', color: C.green, bg: C.greenSoft, abbr: 'P', icon: 'check-circle' },
  Absent: { label: 'Absent', color: C.primary, bg: C.primarySoft, abbr: 'A', icon: 'x-circle' },
  Leave: { label: 'Leave', color: C.amber, bg: C.amberSoft, abbr: 'L', icon: 'clock' },
  'Half-Day': { label: 'Half-Day', color: C.blue, bg: C.blueSoft, abbr: 'HD', icon: 'sunrise' },
  Holiday: { label: 'Holiday', color: C.slate, bg: C.slateSoft, abbr: 'H', icon: 'coffee' },
};
const STATUS_ORDER = ['Present', 'Absent', 'Leave', 'Half-Day', 'Holiday'];

// Fixed row height — required for FlatList.getItemLayout, which lets the list
// skip measuring every row and jump-scroll instantly even with 500+ students.
const ROW_HEIGHT = 64;
const EMPTY_ATTENDANCE: Record<string, string> = {};

// Valid attendance statuses — used to validate payloads before they're sent.
const VALID_STATUSES = ['Present', 'Absent', 'Leave', 'Half-Day', 'Holiday'];

type Option = { label: string; value: string };

// --- Safe Date Utilities ---
const formatToYMD = (d: Date): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};
const formatPretty = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
};
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getInitials = (name: string) => (name || '?').trim().charAt(0).toUpperCase();

// Debounce hook — keeps search filtering from re-running on every keystroke
// when the student list is large.
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Attendance payload helpers
// ---------------------------------------------------------------------------

// Builds a single attendanceList entry. Defaults status to 'Present' only
// when nothing valid was selected — never sends an empty/undefined status.
const buildAttendanceItem = (student: any, status: string) => ({
  rollNo: student.rollNo?.toString() || '',
  studentName: student.name || '',
  photo: student.photo || '/default-avatar.png',
  status: status && VALID_STATUSES.includes(status) ? status : 'Present',
});

// Validates the pieces of an attendance payload before it's sent to the API.
// Returns an array of human-readable error strings; empty array = valid.
const validateAttendancePayload = (
  classId: string,
  schoolId: string,
  dateStr: string,
  attendanceList: any[]
): string[] => {
  const errors: string[] = [];

  if (!classId) errors.push('Class is missing.');
  if (!schoolId) errors.push('School could not be determined for this class.');
  if (!dateStr) errors.push('Attendance date is missing.');

  if (!attendanceList || attendanceList.length === 0) {
    errors.push('No students to mark.');
  } else {
    attendanceList.forEach((item, idx) => {
      if (!item.rollNo) errors.push(`Row ${idx + 1}: missing rollNo.`);
      if (!item.studentName) errors.push(`Row ${idx + 1}: missing studentName.`);
      if (!item.status || !VALID_STATUSES.includes(item.status)) {
        errors.push(`Row ${idx + 1}: missing or invalid status.`);
      }
    });
  }

  return errors;
};

// ---------------------------------------------------------------------------
// StudentRow — memoized so scrolling/marking one student never re-renders
// every other row in a large class.
// ---------------------------------------------------------------------------
type StudentRowProps = {
  student: any;
  year: number;
  month: number;
  daysArray: number[];
  attendanceForStudent: Record<string, string>;
  canEdit: boolean;
  pct: number | null;
  todayStr: string;
  dayCellWidth: number;
  stickyColWidth: number;
  onCellPress: (student: any, dateStr: string) => void;
};

const StudentRow = memo(
  ({ student, year, month, daysArray, attendanceForStudent, canEdit, pct, todayStr, dayCellWidth, stickyColWidth, onCellPress }: StudentRowProps) => {
    const pctColor = pct === null ? C.textFaint : pct >= 85 ? C.green : pct >= 60 ? C.amber : C.primary;
    return (
      <View style={styles.matrixDataRow}>
        <View style={[styles.matrixDataCell, styles.matrixStickyCol, { width: stickyColWidth, borderLeftWidth: 3, borderLeftColor: pctColor }]}>
          <View style={styles.studentInfo}>
            <View style={[styles.avatar, { backgroundColor: pctColor + '22' }]}>
              <Text style={[styles.avatarText, { color: pctColor }]}>{getInitials(student.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.studentName} numberOfLines={1}>{student.name}</Text>
              <View style={styles.studentMetaRow}>
                <Text style={styles.studentRoll}>Roll {student.rollNo || 'N/A'}</Text>
                {pct !== null && (
                  <View style={[styles.pctBadge, { backgroundColor: pctColor + '18' }]}>
                    <Text style={[styles.studentPct, { color: pctColor }]}>{pct}%</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {daysArray.map(day => {
          const dateStr = formatToYMD(new Date(year, month, day, 12, 0, 0));
          const status = attendanceForStudent[dateStr] || null;
          const isSun = new Date(year, month, day, 12, 0, 0).getDay() === 0;
          const isToday = dateStr === todayStr;
          const isFuture = dateStr > todayStr;
          const canPress = canEdit && !isFuture;
          const meta = status ? STATUS_META[status] : null;

          return (
            <TouchableOpacity
              key={day}
              style={[
                styles.matrixDayDataCell,
                { width: dayCellWidth },
                isSun && !isFuture && styles.matrixSunBg,
                isToday && styles.matrixTodayBg,
                isFuture && styles.matrixFutureBg,
              ]}
              activeOpacity={canPress ? 0.6 : 1}
              onPress={() => canPress && onCellPress(student, dateStr)}
              disabled={!canPress}
            >
              {isFuture ? (
                <Feather name="lock" size={11} color={C.textFaint} />
              ) : meta ? (
                <View style={[styles.statusPill, { backgroundColor: meta.bg, borderColor: meta.color + '33' }]}>
                  <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.abbr}</Text>
                </View>
              ) : isSun ? (
                <View style={[styles.statusPill, { backgroundColor: C.slateSoft }]}>
                  <Text style={[styles.statusPillText, { color: C.slate }]}>H</Text>
                </View>
              ) : (
                <Text style={styles.unmarkedText}>·</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }
);

export default function ClassAttendanceScreen() {
  const { width: winWidth } = useWindowDimensions();
  const isTablet = winWidth >= 768;
  const dayCellWidth = isTablet ? 54 : 44;
  const stickyColWidth = isTablet ? 226 : 172;

  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);

  // Selection States
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 250);

  // KPI drill-down: null = whole-month totals, otherwise a single YYYY-MM-DD
  // the user tapped on in the matrix header — stats bar then scopes to it.
  const [selectedStatDate, setSelectedStatDate] = useState<string | null>(null);

  // Today, locked once per mount — attendance can only be marked for this
  // date or earlier, never for a date in the future.
  const todayStr = useMemo(() => formatToYMD(new Date()), []);
  const isFutureDateStr = useCallback((dateStr: string) => dateStr > todayStr, [todayStr]);

  // The classes API already returns each class's schoolId (as an object
  // { _id, name, code, city } or sometimes a plain string) — read it from
  // the currently selected class instead of relying on storage.
  const selectedSchoolId = useMemo(() => {
    const cls = classes.find((c: any) => c._id === selectedClassId);
    const sid = cls?.schoolId;
    if (!sid) return null;
    return typeof sid === 'string' ? sid : sid?._id || null;
  }, [classes, selectedClassId]);

  // UI States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Modals
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [isDailyModalVisible, setDailyModalVisible] = useState(false);
  const [isSingleEditModalVisible, setSingleEditModalVisible] = useState(false);

  // Daily Attendance Form
  const [dailyDate, setDailyDate] = useState<Date>(new Date());
  const [showDailyDatePicker, setShowDailyDatePicker] = useState(false);
  const [dailyDraft, setDailyDraft] = useState<Record<string, string>>({});
  const [dailySearch, setDailySearch] = useState('');

  // Single Edit Form
  const [singleEditData, setSingleEditData] = useState<{ student: any; dateStr: string; status: string } | null>(null);

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
      const clsRes = await axios.get(`${API_BASE}/classes`, authHeaders(token));
      const fetchedClasses = clsRes.data?.data || [];
      setClasses(fetchedClasses);

      if (fetchedClasses.length > 0) {
        setSelectedClassId(fetchedClasses[0]._id);
        fetchGridData(token, fetchedClasses[0]._id, selectedMonth);
      } else {
        setLoading(false);
      }
    } catch (e) { console.error(e); setLoading(false); }
  };

  const fetchGridData = async (token: string | null, classId: string, monthDate: Date, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setSelectedStatDate(null); // reset KPI drill-down whenever the underlying data changes
    try {
      const year = monthDate.getFullYear();
      const month = String(monthDate.getMonth() + 1).padStart(2, '0');

      const [stuRes, attRes] = await Promise.all([
        axios.get(`${API_BASE}/students?classId=${classId}&limit=500`, authHeaders(token)),
        axios.get(`${API_BASE}/attendance?classId=${classId}&month=${year}-${month}`, authHeaders(token)),
      ]);

      setStudents(stuRes.data?.data || []);
      setAttendanceRecords(attRes.data?.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'attendance' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const canEditCells = hasPermission('update');

  // --- Matrix Data Processing ---
  const filteredStudents = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    if (!q) return students;
    return students.filter(s => s.name?.toLowerCase().includes(q) || s.rollNo?.toString().includes(q));
  }, [students, debouncedSearch]);

  const dailyFilteredStudents = useMemo(() => {
    const q = dailySearch.toLowerCase();
    if (!q) return students;
    return students.filter(s => s.name?.toLowerCase().includes(q) || s.rollNo?.toString().includes(q));
  }, [students, dailySearch]);

  // Map backend flat records to a nested structure linked by RollNo
  const attendanceMap = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    attendanceRecords.forEach(record => {
      const d = record.date.split('T')[0];
      const key = record.rollNo?.toString() || record.studentName;
      if (key) {
        if (!map[key]) map[key] = {};
        map[key][d] = record.status;
      }
    });
    return map;
  }, [attendanceRecords]);

  // Per-student monthly attendance percentage — shown as a small badge in
  // the sticky column and used to color-code the row.
  const studentPctMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    students.forEach(s => {
      const key = s.rollNo?.toString() || s.name;
      const entries = Object.values(attendanceMap[key] || {});
      const relevant = entries.filter(st => st !== 'Holiday');
      if (relevant.length === 0) { map[key] = null; return; }
      const presentLike = relevant.filter(st => st === 'Present' || st === 'Half-Day').length;
      map[key] = Math.round((presentLike / relevant.length) * 100);
    });
    return map;
  }, [students, attendanceMap]);

  // KPI scope — either the whole month, or a single day the user tapped on
  // in the matrix header (selectedStatDate). Everything the stats bar reads
  // comes from this single source so the two modes never drift apart.
  const statsScopeRecords = useMemo(() => {
    if (!selectedStatDate) return attendanceRecords;
    return attendanceRecords.filter(r => r.date.split('T')[0] === selectedStatDate);
  }, [attendanceRecords, selectedStatDate]);

  const scopedStats = useMemo(() => {
    const counts: Record<string, number> = { Present: 0, Absent: 0, Leave: 0, 'Half-Day': 0, Holiday: 0 };
    statsScopeRecords.forEach(r => { if (counts[r.status] !== undefined) counts[r.status] += 1; });
    return counts;
  }, [statsScopeRecords]);

  const daysInMonth = getDaysInMonth(selectedMonth.getFullYear(), selectedMonth.getMonth());
  const daysArray = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const isSunday = (year: number, month: number, day: number) => {
    return new Date(year, month, day, 12, 0, 0).getDay() === 0;
  };

  // --- Actions ---
  const openDailyModal = () => {
    setDailyDate(new Date());
    setDailySearch('');
    const draft: Record<string, string> = {};
    students.forEach(s => { draft[s._id] = 'Present'; });
    setDailyDraft(draft);
    setDailyModalVisible(true);
  };

  const toggleStatDate = useCallback((dateStr: string) => {
    setSelectedStatDate(prev => (prev === dateStr ? null : dateStr));
  }, []);

  // ---------------------------------------------------------------------
  // handleSaveDaily — FIXED
  //
  // ROOT CAUSE (confirmed from routes/controller/service/model): the app
  // was posting to POST /api/attendance, which is routed to
  // `saveAttendance` -> `saveAttendanceRecord`. That service does
  // `Attendance.create(data)` directly off the top-level body and never
  // reads `attendanceList` at all — it's the STAFF single-record endpoint,
  // built for { staff, date, status, ... }. Since our body has no
  // top-level `status`, Mongoose's schema-level `required: true` on
  // `status` rejected it with "status: Path `status` is required.",
  // regardless of what was correctly inside `attendanceList`.
  //
  // The correct endpoint for classId + date + attendanceList[] is
  // POST /api/attendance/class -> `markClassDailyAttendance`, which loops
  // `attendanceList`, upserts one record per rollNo, and only defaults
  // status to 'Present' when the item's own status is missing — exactly
  // the behavior we want. Fix: point at CLASS_ATTENDANCE_URL and keep the
  // original single grouped payload; no per-item flattening or looped
  // requests are needed once the endpoint is correct.
  //
  // 1. attendanceList is built first, in its own variable, via
  //    buildAttendanceItem (guarantees a valid, non-empty status per item).
  // 2. The date is checked against today (see isFutureDateStr) before
  //    anything else — attendance can never be marked ahead of today.
  // 3. Everything is validated with validateAttendancePayload BEFORE the
  //    payload object or the API call is made. Validation failures show a
  //    clear Alert and stop — nothing fails silently.
  // 4. The final payload is logged in full right before it's sent.
  // 5. On error, the full backend error body is logged and the backend's
  //    actual message/error is shown to the user.
  // ---------------------------------------------------------------------
  const handleSaveDaily = async () => {
    if (!selectedClassId || !selectedSchoolId) {
      Alert.alert('Missing info', 'Could not determine the school for this class. Try reselecting the class.');
      return;
    }

    const dateStr = formatToYMD(dailyDate);

    if (isFutureDateStr(dateStr)) {
      Alert.alert('Invalid date', 'Attendance cannot be marked for a future date. Please pick today or an earlier date.');
      return;
    }

    // Build attendanceList first, in its own variable.
    const attendanceList = students.map(s => buildAttendanceItem(s, dailyDraft[s._id] || 'Present'));

    // Validate everything before calling the API.
    const errors = validateAttendancePayload(selectedClassId, selectedSchoolId, dateStr, attendanceList);
    if (errors.length > 0) {
      Alert.alert('Cannot save attendance', errors.slice(0, 5).join('\n'));
      return;
    }

    setSaving(true);
    try {
      // Only build the final payload once validation has passed.
      const payload = {
        classId: selectedClassId,
        schoolId: selectedSchoolId,
        date: dateStr,
        attendanceList,
      };

      console.log('FINAL ATTENDANCE PAYLOAD:', JSON.stringify(payload, null, 2));

      await axios.post(CLASS_ATTENDANCE_URL, payload, authHeaders(authToken));
      Alert.alert('Success', 'Attendance marked successfully.');
      setDailyModalVisible(false);
      fetchGridData(authToken, selectedClassId, selectedMonth, true);
    } catch (error: any) {
      console.log('ATTENDANCE SAVE ERROR:', JSON.stringify(error.response?.data || error.message, null, 2));
      Alert.alert(
        'Error',
        error.response?.data?.message ||
          error.response?.data?.error ||
          'Failed to save attendance.'
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------
  // handleSaveSingleEdit — FIXED (same defensive pattern as handleSaveDaily,
  // also pointed at CLASS_ATTENDANCE_URL for the same reason, and blocks
  // future dates the same way.)
  // ---------------------------------------------------------------------
  const handleSaveSingleEdit = async () => {
    if (!singleEditData) return;

    if (!selectedClassId || !selectedSchoolId) {
      Alert.alert('Missing info', 'Could not determine the school for this class. Try reselecting the class.');
      return;
    }

    const dateStr = singleEditData.dateStr;

    if (isFutureDateStr(dateStr)) {
      Alert.alert('Invalid date', 'Attendance cannot be marked for a future date.');
      return;
    }

    // Build attendanceList first, in its own variable.
    const attendanceList = [buildAttendanceItem(singleEditData.student, singleEditData.status || 'Present')];

    // Validate everything before calling the API.
    const errors = validateAttendancePayload(selectedClassId, selectedSchoolId, dateStr, attendanceList);
    if (errors.length > 0) {
      Alert.alert('Cannot update status', errors.slice(0, 5).join('\n'));
      return;
    }

    setSaving(true);
    try {
      // Only build the final payload once validation has passed.
      const payload = {
        classId: selectedClassId,
        schoolId: selectedSchoolId,
        date: dateStr,
        attendanceList,
      };

      console.log('FINAL ATTENDANCE PAYLOAD:', JSON.stringify(payload, null, 2));

      await axios.post(CLASS_ATTENDANCE_URL, payload, authHeaders(authToken));
      setSingleEditModalVisible(false);
      fetchGridData(authToken, selectedClassId, selectedMonth, true);
    } catch (error: any) {
      console.log('ATTENDANCE SAVE ERROR:', JSON.stringify(error.response?.data || error.message, null, 2));
      Alert.alert(
        'Error',
        error.response?.data?.message ||
          error.response?.data?.error ||
          'Failed to update status.'
      );
    } finally {
      setSaving(false);
    }
  };

  const onCellPress = useCallback((student: any, dateStr: string) => {
    if (isFutureDateStr(dateStr)) return; // defensive — cell is already disabled for future dates
    const key = student.rollNo?.toString() || student.name;
    const existing = attendanceMap[key]?.[dateStr] || 'Present';
    setSingleEditData({ student, dateStr, status: existing });
    setSingleEditModalVisible(true);
  }, [attendanceMap, isFutureDateStr]);

  const keyExtractor = useCallback((item: any) => item._id, []);

  const getItemLayout = useCallback((_: any, index: number) => (
    { length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index }
  ), []);

  const renderStudentRow = useCallback(({ item: student }: { item: any }) => {
    const key = student.rollNo?.toString() || student.name;
    return (
      <StudentRow
        student={student}
        year={selectedMonth.getFullYear()}
        month={selectedMonth.getMonth()}
        daysArray={daysArray}
        attendanceForStudent={attendanceMap[key] || EMPTY_ATTENDANCE}
        canEdit={canEditCells}
        pct={studentPctMap[key] ?? null}
        todayStr={todayStr}
        dayCellWidth={dayCellWidth}
        stickyColWidth={stickyColWidth}
        onCellPress={onCellPress}
      />
    );
  }, [selectedMonth, daysArray, attendanceMap, canEditCells, studentPctMap, todayStr, dayCellWidth, stickyColWidth, onCellPress]);

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
            <ScrollView nestedScrollEnabled style={{ maxHeight: 190 }}>
              {options.map(opt => (
                <TouchableOpacity key={opt.value} style={styles.dropdownItem} onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}>
                  <Text style={[styles.dropdownItemText, value === opt.value && styles.textBrand]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const totalMarkedInScope = scopedStats.Present + scopedStats.Absent + scopedStats.Leave + scopedStats['Half-Day'];
  const scopedPct = totalMarkedInScope > 0
    ? Math.round(((scopedStats.Present + scopedStats['Half-Day']) / totalMarkedInScope) * 100)
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="check-square" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Class Attendance</Text>
          <Text style={styles.subtitle}>Interactive monthly matrix and daily marking</Text>
        </View>
        <View style={styles.headerCountBadge}>
          <Feather name="users" size={12} color={C.primary} />
          <Text style={styles.headerCountText}>{students.length}</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={{ flexDirection: 'row', gap: 10, zIndex: 10 }}>
          <View style={{ flex: 1 }}>
            {renderInlineDropdown('classFilter', 'SELECT CLASS', classes.map(c => ({ label: c.className, value: c._id })), selectedClassId, (v) => { setSelectedClassId(v); fetchGridData(authToken, v, selectedMonth); })}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>SELECT MONTH</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowMonthPicker(true)} activeOpacity={0.85}>
              <Text style={styles.datePickerText}>{selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</Text>
              <Feather name="calendar" size={14} color={C.textMuted} />
            </TouchableOpacity>
            {showMonthPicker && (
              <DateTimePicker
                value={selectedMonth}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={(e, d) => {
                  setShowMonthPicker(Platform.OS === 'ios');
                  if (d) { setSelectedMonth(d); fetchGridData(authToken, selectedClassId, d); }
                }}
              />
            )}
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Feather name="search" size={16} color={C.textFaint} />
            <TextInput style={styles.searchInput} placeholder="Search student by name or roll no..." placeholderTextColor={C.textFaint} value={searchQuery} onChangeText={setSearchQuery} />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x-circle" size={15} color={C.textFaint} />
              </TouchableOpacity>
            )}
          </View>
          {hasPermission('create') && (
            <TouchableOpacity style={styles.markBtn} onPress={openDailyModal} activeOpacity={0.9}>
              <Feather name="edit" size={14} color="#fff" />
              <Text style={styles.markBtnText}>Mark Daily</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Summary / KPI Bar — defaults to whole-month totals; tapping a day
          in the matrix header (below) scopes every card to just that day. */}
      {!loading && students.length > 0 && (
        <View style={styles.statsSection}>
          <View style={styles.statsScopeRow}>
            <View style={styles.statsScopeChip}>
              <Feather name={selectedStatDate ? 'calendar' : 'bar-chart-2'} size={12} color={C.primary} />
              <Text style={styles.statsScopeText}>
                {selectedStatDate ? formatPretty(selectedStatDate) : `${selectedMonth.toLocaleString('default', { month: 'long' })} overview`}
              </Text>
            </View>
            {selectedStatDate && (
              <TouchableOpacity style={styles.statsClearBtn} onPress={() => setSelectedStatDate(null)} activeOpacity={0.7}>
                <Feather name="x" size={11} color={C.textMuted} />
                <Text style={styles.statsClearText}>Back to month</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
            <View style={[styles.statCard, SHADOW.card, { borderColor: C.border }]}>
              <Text style={styles.statValue}>{scopedPct !== null ? `${scopedPct}%` : '—'}</Text>
              <Text style={styles.statLabel}>Overall</Text>
            </View>
            {STATUS_ORDER.filter(s => s !== 'Holiday').map(st => {
              const meta = STATUS_META[st];
              return (
                <View key={st} style={[styles.statCard, SHADOW.card, { borderLeftWidth: 3, borderLeftColor: meta.color }]}>
                  <View style={styles.statCardTop}>
                    <Feather name={meta.icon as any} size={12} color={meta.color} />
                    <Text style={[styles.statValue, { color: meta.color }]}>{scopedStats[st]}</Text>
                  </View>
                  <Text style={styles.statLabel}>{meta.label}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Matrix Data Area */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingText}>Loading attendance...</Text>
        </View>
      ) : filteredStudents.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="users" size={40} color={C.textFaint} />
          <Text style={styles.emptyTitle}>{searchQuery ? 'No matches found' : 'No Students Found'}</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery ? 'Try a different name or roll number.' : 'There are no students linked to this class.'}
          </Text>
        </View>
      ) : (
        <View style={styles.matrixContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={true} bounces={false} style={{ flex: 1 }}>
            {/* flex:1 here is what keeps the FlatList's height bounded so it
                can virtualize properly instead of rendering every student row
                at once — this is the main fix for lag with large classes. */}
            <View style={{ flex: 1 }}>
              {/* Matrix Header Row — each day cell doubles as a KPI filter:
                  tap a day to scope the stats bar above to just that day. */}
              <View style={styles.matrixHeaderRow}>
                <View style={[styles.matrixHeaderCell, styles.matrixStickyCol, { width: stickyColWidth }]}>
                  <Text style={styles.matrixHeaderTitle}>STUDENT PROFILE</Text>
                </View>
                {daysArray.map(day => {
                  const dateStr = formatToYMD(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day, 12, 0, 0));
                  const isToday = dateStr === todayStr;
                  const isFuture = dateStr > todayStr;
                  const isSelected = selectedStatDate === dateStr;
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.matrixHeaderDayCell,
                        { width: dayCellWidth },
                        isToday && styles.matrixHeaderTodayCell,
                        isSelected && styles.matrixHeaderSelectedCell,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => toggleStatDate(dateStr)}
                    >
                      <Text style={[styles.matrixDayText, isSelected && styles.matrixDayTextSelected]}>{day}</Text>
                      {isSunday(selectedMonth.getFullYear(), selectedMonth.getMonth(), day) && (
                        <Text style={styles.matrixSunText}>SUN</Text>
                      )}
                      {isToday && <View style={styles.todayDot} />}
                      {isFuture && <Feather name="lock" size={8} color={C.textFaint} style={{ marginTop: 2 }} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Matrix Body Rows — virtualized */}
              <FlatList
                data={filteredStudents}
                keyExtractor={keyExtractor}
                renderItem={renderStudentRow}
                getItemLayout={getItemLayout}
                showsVerticalScrollIndicator={true}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchGridData(authToken, selectedClassId, selectedMonth, true)} colors={[C.primary]} />}
                initialNumToRender={14}
                maxToRenderPerBatch={14}
                windowSize={7}
                removeClippedSubviews={Platform.OS === 'android'}
                updateCellsBatchingPeriod={50}
              />
            </View>
          </ScrollView>
        </View>
      )}

      {/* MODAL: Mark Daily Attendance */}
      <Modal visible={isDailyModalVisible} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fullModalContainer}>
            <View style={styles.formHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Feather name="check-circle" size={18} color="#fff" /><Text style={styles.formTitle}>Mark Daily Attendance</Text></View>
              <TouchableOpacity onPress={() => setDailyModalVisible(false)} style={styles.closeBtnIcon}><Feather name="x" size={18} color="#fff" /></TouchableOpacity>
            </View>

            <View style={styles.dailyConfigBar}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={styles.inputLabel}>ATTENDANCE DATE *</Text>
                <TouchableOpacity style={styles.datePickerBtnForm} onPress={() => setShowDailyDatePicker(true)}>
                  <Text style={styles.datePickerText}>{formatToYMD(dailyDate)}</Text>
                  <Feather name="calendar" size={14} color={C.textMuted} />
                </TouchableOpacity>
                <Text style={styles.helperText}>Future dates can't be selected</Text>
                {showDailyDatePicker && (
                  <DateTimePicker
                    value={dailyDate}
                    mode="date"
                    display="default"
                    maximumDate={new Date()}
                    onChange={(e, d) => {
                      setShowDailyDatePicker(Platform.OS === 'ios');
                      if (d) {
                        // Belt-and-braces: clamp to today even if a platform
                        // picker somehow returns a later date.
                        const clamped = formatToYMD(d) > todayStr ? new Date() : d;
                        setDailyDate(clamped);
                      }
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>DEFAULT STATUS</Text>
                <View style={styles.defaultStatusRow}>
                  <TouchableOpacity style={[styles.defBtn, { backgroundColor: C.greenSoft }]} onPress={() => { const draft = { ...dailyDraft }; students.forEach(s => draft[s._id] = 'Present'); setDailyDraft(draft); }}><Text style={[styles.defBtnText, { color: C.green }]}>P</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.defBtn, { backgroundColor: C.primarySoft }]} onPress={() => { const draft = { ...dailyDraft }; students.forEach(s => draft[s._id] = 'Absent'); setDailyDraft(draft); }}><Text style={[styles.defBtnText, { color: C.primary }]}>A</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.defBtn, { backgroundColor: C.primarySoft }]} onPress={() => { const draft = { ...dailyDraft }; students.forEach(s => draft[s._id] = 'Leave'); setDailyDraft(draft); }}><Text style={[styles.defBtnText, { color: C.slate}]}>L</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.defBtn, { backgroundColor: C.primarySoft }]} onPress={() => { const draft = { ...dailyDraft }; students.forEach(s => draft[s._id] = 'Half-Day'); setDailyDraft(draft); }}><Text style={[styles.defBtnText, { color: C.blue }]}>HD</Text></TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.dailySearchWrap}>
              <View style={styles.searchContainer}>
                <Feather name="search" size={16} color={C.textFaint} />
                <TextInput style={styles.searchInput} placeholder="Find a student to mark..." placeholderTextColor={C.textFaint} value={dailySearch} onChangeText={setDailySearch} />
              </View>
              <Text style={styles.dailyCountText}>
                {Object.values(dailyDraft).filter(v => v === 'Present').length} / {students.length} marked Present
              </Text>
            </View>

            <FlatList
              data={dailyFilteredStudents}
              keyExtractor={item => item._id}
              contentContainerStyle={{ padding: 16, paddingTop: 4 }}
              initialNumToRender={16}
              maxToRenderPerBatch={16}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
              renderItem={({ item }) => {
                const currentStatus = dailyDraft[item._id] || 'Present';
                return (
                  <View style={styles.dailyStudentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.marksStudentName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.marksStudentRoll}>Roll: {item.rollNo || 'N/A'}</Text>
                    </View>
                    <View style={styles.statusToggleGroup}>
                      {['Present', 'Absent', 'Leave', 'Half-Day'].map(st => {
                        const meta = STATUS_META[st];
                        const isActive = currentStatus === st;
                        return (
                          <TouchableOpacity
                            key={st}
                            style={[styles.statusToggleBtn, isActive && { backgroundColor: meta.color, borderColor: meta.color }]}
                            onPress={() => setDailyDraft({ ...dailyDraft, [item._id]: st })}
                          >
                            <Text style={[styles.statusToggleText, isActive && { color: '#fff' }]}>{meta.abbr}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              }}
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setDailyModalVisible(false)}><Text style={styles.ghostBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveDaily} disabled={saving} activeOpacity={0.9}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnFullText}>Save Attendance</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* MODAL: Edit Single Status */}
      <Modal visible={isSingleEditModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.editModalCard, SHADOW.raised]}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Edit Attendance</Text>
              <TouchableOpacity onPress={() => setSingleEditModalVisible(false)}><Feather name="x" size={18} color={C.textMuted} /></TouchableOpacity>
            </View>

            {singleEditData && (
              <>
                <View style={styles.editModalInfo}>
                  <View style={[styles.avatar, { backgroundColor: C.primarySoft }]}>
                    <Text style={[styles.avatarText, { color: C.primary }]}>{getInitials(singleEditData.student.name)}</Text>
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.editModalName}>{singleEditData.student.name}</Text>
                    <Text style={styles.editModalDate}>{formatPretty(singleEditData.dateStr)} · Roll {singleEditData.student.rollNo || 'N/A'}</Text>
                  </View>
                </View>

                <View style={styles.editStatusGrid}>
                  {Object.keys(STATUS_META).map(st => {
                    const meta = STATUS_META[st];
                    const isActive = singleEditData.status === st;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[styles.editStatusBtn, isActive && { backgroundColor: meta.bg, borderColor: meta.color }]}
                        onPress={() => setSingleEditData({ ...singleEditData, status: st })}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.editStatusDot, { backgroundColor: meta.color }]} />
                        <Text style={[styles.editStatusText, isActive && { color: meta.color, fontWeight: '800' }]}>{meta.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveSingleEdit} disabled={saving} activeOpacity={0.9}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnFullText}>Update Status</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 12.5, color: C.textMuted, fontWeight: '600' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, ...SHADOW.soft },
  headerIconBadge: { width: 46, height: 46, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.primary + '22' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: 0.2 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  headerCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.primarySoft, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.primary + '22' },
  headerCountText: { fontSize: 12.5, fontWeight: '800', color: C.primary },

  filterSection: { backgroundColor: C.surface, padding: 16, borderBottomWidth: 1, borderColor: C.border, zIndex: 50 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, zIndex: 1 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13, color: C.text },
  markBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 18, height: 46, borderRadius: 12, gap: 6, ...SHADOW.card },
  markBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  statsSection: { backgroundColor: C.bg, paddingTop: 12, paddingBottom: 4 },
  statsScopeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  statsScopeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statsScopeText: { fontSize: 11.5, fontWeight: '800', color: C.primaryDark },
  statsClearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5 },
  statsClearText: { fontSize: 11, fontWeight: '700', color: C.textMuted },

  statCard: { minWidth: 92, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'flex-start' },
  statCardTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statValue: { fontSize: 17, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 10.5, color: C.textMuted, fontWeight: '700', marginTop: 3, letterSpacing: 0.2 },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  // Matrix Styles
  matrixContainer: { flex: 1, backgroundColor: C.surface },
  matrixHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSoft },
  matrixHeaderCell: { padding: 12, justifyContent: 'center', borderRightWidth: 1, borderColor: C.border },
  matrixStickyCol: { },
  matrixHeaderTitle: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5 },
  matrixHeaderDayCell: { padding: 8, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: C.border },
  matrixHeaderTodayCell: { backgroundColor: C.todayTint },
  matrixHeaderSelectedCell: { backgroundColor: C.primary },
  matrixDayText: { fontSize: 12, fontWeight: '800', color: C.text },
  matrixDayTextSelected: { color: '#fff' },
  matrixSunText: { fontSize: 8, fontWeight: '800', color: C.primary, marginTop: 2 },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.primary, marginTop: 3 },

  matrixDataRow: { flexDirection: 'row', height: ROW_HEIGHT, borderBottomWidth: 1, borderColor: C.border },
  matrixDataCell: { paddingHorizontal: 12, justifyContent: 'center', borderRightWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  studentInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 13, fontWeight: '800' },
  studentName: { fontSize: 12.5, fontWeight: '700', color: C.text },
  studentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  studentRoll: { fontSize: 10, color: C.textMuted },
  pctBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  studentPct: { fontSize: 10, fontWeight: '800' },

  matrixDayDataCell: { alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  matrixSunBg: { backgroundColor: C.slateSoft },
  matrixTodayBg: { backgroundColor: C.todayTint },
  matrixFutureBg: { backgroundColor: C.futureBg },
  statusPill: { width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  statusPillText: { fontSize: 10, fontWeight: '800' },
  unmarkedText: { color: C.textFaint, fontWeight: '800' },

  // Modals & Forms
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)' },
  fullModalContainer: { flex: 1, backgroundColor: C.surface, marginTop: 40, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', ...SHADOW.raised },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.primary },
  formTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  closeBtnIcon: { padding: 4 },

  dailyConfigBar: { flexDirection: 'row', padding: 16, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderColor: C.border },
  defaultStatusRow: { flexDirection: 'row', gap: 8, height: 44, alignItems: 'center' },
  defBtn: { flex: 1, height: 36, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  defBtnText: { fontSize: 12, fontWeight: '800' },
  helperText: { fontSize: 10, color: C.textFaint, marginTop: 5, fontWeight: '600' },

  dailySearchWrap: { paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  dailyCountText: { fontSize: 11.5, color: C.textMuted, fontWeight: '700' },

  dailyStudentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderColor: C.border },
  marksStudentName: { fontSize: 14, fontWeight: '700', color: C.text, maxWidth: 140 },
  marksStudentRoll: { fontSize: 11.5, color: C.textMuted, marginTop: 2 },
  statusToggleGroup: { flexDirection: 'row', gap: 6 },
  statusToggleBtn: { width: 36, height: 36, borderRadius: 9, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', backgroundColor: C.surfaceSoft },
  statusToggleText: { fontSize: 11, fontWeight: '800', color: C.textMuted },

  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, padding: 16, borderTopWidth: 1, borderColor: C.border, backgroundColor: C.surface },

  // Single Edit Modal
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 20 },
  editModalCard: { backgroundColor: C.surface, borderRadius: 22, padding: 20 },
  editModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  editModalTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  editModalInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  editModalName: { fontSize: 15, fontWeight: '800', color: C.text },
  editModalDate: { fontSize: 11.5, color: C.textMuted, marginTop: 2, fontWeight: '600' },
  editStatusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  editStatusBtn: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSoft },
  editStatusDot: { width: 10, height: 10, borderRadius: 5 },
  editStatusText: { fontSize: 13, fontWeight: '600', color: C.textMuted },

  // Form Base
  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, marginBottom: 6, letterSpacing: 0.5 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 13, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 13, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 70, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },

  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  datePickerBtnForm: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 46, backgroundColor: C.surface },
  datePickerText: { fontSize: 13, color: C.text, fontWeight: '600' },

  ghostBtn: { paddingVertical: 10, paddingHorizontal: 16, justifyContent: 'center' },
  ghostBtnText: { color: C.textMuted, fontSize: 14, fontWeight: '700' },
  saveBtnFull: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 12, justifyContent: 'center', alignItems: 'center', ...SHADOW.card },
  saveBtnFullText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});