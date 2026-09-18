import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl,
  useWindowDimensions, LayoutAnimation, UIManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE } from '../../network/api';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CLASS_ATTENDANCE_URL = `${API_BASE}/attendance/class`;
const BULK_ATTENDANCE_URL = `${API_BASE}/attendance/class/bulk`;

const C = {
  bg: '#F6F6F9', surface: '#FFFFFF', surfaceSoft: '#FBFBFD', surfaceSunken: '#F1F2F6', border: '#E7E9F2',
  text: '#12172B', textMuted: '#5D6478', textFaint: '#9AA0B4',
  primary: '#B3122A', primaryDark: '#C5221F', primarySoft: '#FDE8E8',
  blue: '#0369A1', blueSoft: '#E0F2FE',
  green: '#059669', greenSoft: '#DCFCE9',
  amber: '#B45309', amberSoft: '#FEF3C7',
  slate: '#64748B', slateSoft: '#F1F5F9',
  purple: '#8B5CF6', purpleSoft: '#EDE9FE',
  todayTint: '#FFF7ED', todayBorder: '#FDBA74',
  futureBg: '#F8F9FB',
  overlay: 'rgba(13,15,22,0.48)',
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
  fab: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 14, elevation: 8,
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

// Builds the nested { studentKey: { dateStr: status } } matrix from the flat
// records array returned by the API / stored in cache. This is only called
// on a full fetch (network or cache) — single-cell edits patch the map
// directly instead of rebuilding it, which is what keeps taps fast.
const buildAttendanceMap = (records: any[]): Record<string, Record<string, string>> => {
  const map: Record<string, Record<string, string>> = {};
  records.forEach(record => {
    const d = record.date.split('T')[0];
    const key = record.rollNo?.toString() || record.studentName;
    if (key) {
      if (!map[key]) map[key] = {};
      map[key][d] = record.status;
    }
  });
  return map;
};

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

const buildAttendanceItem = (student: any, status: string) => ({
  rollNo: student.rollNo?.toString() || '',
  studentName: student.name || '',
  photo: student.photo || '/default-avatar.png',
  status: status && VALID_STATUSES.includes(status) ? status : 'Absent',
});

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
  onCellLongPress: (student: any, dateStr: string) => void;
};

const StudentRow = memo(
  ({ student, year, month, daysArray, attendanceForStudent, canEdit, pct, todayStr, dayCellWidth, stickyColWidth, onCellPress, onCellLongPress }: StudentRowProps) => {
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
              onLongPress={() => canPress && onCellLongPress(student, dateStr)}
              delayLongPress={350}
              disabled={!canPress}
            >
              {isFuture ? (
                <Feather name="lock" size={11} color={C.textFaint} />
              ) : status === 'Present' ? (
                // Present — filled checkbox (this is the normal tap target)
                <View style={styles.cellCheckboxActive}>
                  <Feather name="check" size={13} color="#fff" />
                </View>
              ) : meta && status !== 'Absent' ? (
                // Leave / Half-Day / Holiday — set via long-press, shown as a
                // small status pill so it stays visually distinct from a
                // plain present/absent checkbox.
                <View style={[styles.statusPill, { backgroundColor: meta.bg, borderColor: meta.color + '33' }]}>
                  <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.abbr}</Text>
                </View>
              ) : isSun ? (
                <View style={[styles.statusPill, { backgroundColor: C.slateSoft }]}>
                  <Text style={[styles.statusPillText, { color: C.slate }]}>H</Text>
                </View>
              ) : (
                // Absent or not yet marked — empty checkbox (default state)
                <View style={styles.cellCheckboxEmpty} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }
);

const SkeletonRow = ({ delay = 0 }: { delay?: number }) => (
  <View style={[styles.skeletonRow, { opacity: 1 - Math.min(delay * 0.06, 0.4) }]}>
    <View style={styles.skeletonAvatar} />
    <View style={{ flex: 1, marginLeft: 12 }}>
      <View style={styles.skeletonLineWide} />
      <View style={styles.skeletonLineNarrow} />
    </View>
    <View style={styles.skeletonPillGroup}>
      {[0, 1, 2, 3, 4, 5].map(i => <View key={i} style={styles.skeletonPill} />)}
    </View>
  </View>
);

export default function ClassAttendanceScreen() {
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();
  const isTablet = winWidth >= 768;
  const isCompactPhone = winWidth < 360;
  const dayCellWidth = isTablet ? 54 : isCompactPhone ? 40 : 44;
  const stickyColWidth = isTablet ? 226 : isCompactPhone ? 154 : 172;

  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);

  const [attendanceMap, setAttendanceMap] = useState<Record<string, Record<string, string>>>({});

  // Selection States
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 250);

  const [selectedStatDate, setSelectedStatDate] = useState<string | null>(null);

  const todayStr = useMemo(() => formatToYMD(new Date()), []);
  const isFutureDateStr = useCallback((dateStr: string) => dateStr > todayStr, [todayStr]);

  const selectedSchoolId = useMemo(() => {
    const cls = classes.find((c: any) => c._id === selectedClassId);
    const sid = cls?.schoolId;
    if (!sid) return null;
    return typeof sid === 'string' ? sid : sid?._id || null;
  }, [classes, selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find((c: any) => c._id === selectedClassId),
    [classes, selectedClassId]
  );

  // UI States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Modals
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [isDailyModalVisible, setDailyModalVisible] = useState(false);
  const [isSingleEditModalVisible, setSingleEditModalVisible] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);

  // Floating action button (Excel actions) — collapsed by default so the
  // filter bar + student list stay the whole screen; teacher expands this
  // only when they actually need to import/export.
  const [fabOpen, setFabOpen] = useState(false);
  const toggleFab = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFabOpen(o => !o);
  }, []);
  const closeFab = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFabOpen(false);
  }, []);

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

  // Cache key per class + month, so switching back to a class/month you've
  // already opened this session shows the matrix instantly.
  const gridCacheKey = (classId: string, year: number, month: string) => `attendance_grid_cache_${classId}_${year}-${month}`;

  const fetchGridData = async (token: string | null, classId: string, monthDate: Date, isRefresh = false) => {
    setSelectedStatDate(null); // reset KPI drill-down whenever the underlying data changes
    const year = monthDate.getFullYear();
    const month = String(monthDate.getMonth() + 1).padStart(2, '0');
    const cacheKey = gridCacheKey(classId, year, month);

    // Cache-first: paint the last known matrix immediately (if any) so
    // students never sit on a blank/spinner screen while we go fetch the
    // latest data in the background. Pull-to-refresh always skips this.
    let paintedFromCache = false;
    if (!isRefresh) {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          setStudents(parsed.students || []);
          setAttendanceMap(buildAttendanceMap(parsed.attendanceRecords || []));
          setLoading(false);
          paintedFromCache = true;
        }
      } catch (e) { /* ignore corrupt cache, fall through to network */ }
    }

    if (isRefresh) setRefreshing(true);
    else if (!paintedFromCache) setLoading(true);
    else setSyncing(true);

    try {
      const [stuRes, attRes] = await Promise.all([
        axios.get(`${API_BASE}/students?classId=${classId}&limit=500`, authHeaders(token)),
        axios.get(`${API_BASE}/attendance?classId=${classId}&month=${year}-${month}`, authHeaders(token)),
      ]);

      const freshStudents = stuRes.data?.data || [];
      const freshAttendance = attRes.data?.data || [];

      setStudents(freshStudents);
      setAttendanceMap(buildAttendanceMap(freshAttendance));

      AsyncStorage.setItem(cacheKey, JSON.stringify({ students: freshStudents, attendanceRecords: freshAttendance })).catch(() => { });
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); setSyncing(false); }
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

  const scopedStats = useMemo(() => {
    const counts: Record<string, number> = { Present: 0, Absent: 0, Leave: 0, 'Half-Day': 0, Holiday: 0 };
    if (!selectedStatDate) return counts;
    students.forEach(s => {
      const key = s.rollNo?.toString() || s.name;
      const status = attendanceMap[key]?.[selectedStatDate];
      if (status && counts[status] !== undefined) counts[status] += 1;
    });
    return counts;
  }, [students, attendanceMap, selectedStatDate]);

  const daysInMonth = getDaysInMonth(selectedMonth.getFullYear(), selectedMonth.getMonth());
  const daysArray = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const isSunday = (year: number, month: number, day: number) => {
    return new Date(year, month, day, 12, 0, 0).getDay() === 0;
  };

  const getStudentDayStatus = useCallback((student: any, day: number): string | null => {
    const key = student.rollNo?.toString() || student.name;
    const dateStr = formatToYMD(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day, 12, 0, 0));
    return attendanceMap[key]?.[dateStr] || null;
  }, [attendanceMap, selectedMonth]);

  const downloadSampleAttendanceTemplate = async () => {
    try {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth();

      const headers = [
        'S.No', 'Roll No', 'Student Name', 'Photo URL',
        ...daysArray.map(d => (isSunday(year, month, d) ? `Day ${d} (SUN)` : `Day ${d}`)),
      ];
      const sampleRow1Days = daysArray.map(d => (isSunday(year, month, d) ? 'H' : 'P'));
      const sampleRow2Days = daysArray.map(d => (isSunday(year, month, d) ? 'H' : d % 7 === 0 ? 'A' : 'P'));

      const rows = [
        headers,
        [1, '101', 'Student 1', '', ...sampleRow1Days],
        [2, '102', 'Student 2', '', ...sampleRow2Days],
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 22 }, { wch: 20 }, ...daysArray.map(() => ({ wch: 10 }))];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Template');
      const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

      const fileName = `${selectedClass?.className || 'Class'}_Attendance_Sample_Template.xlsx`;
      const filePath = `${RNFS.CachesDirectoryPath}/${fileName}`;
      await RNFS.writeFile(filePath, wbout, 'base64');

      await Share.open({
        url: `file://${filePath}`,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: fileName,
        failOnCancel: false,
      });
    } catch (e: any) {
      if (e?.message && !String(e.message).includes('User did not share')) {
        console.error('Template export failed:', e);
        Alert.alert('Export failed', 'Could not generate the template file.');
      }
    }
  };

  const downloadFormattedMonthlyExcel = async () => {
    if (!selectedClass) {
      Alert.alert('No class selected', 'Please select a class first to export Excel.');
      return;
    }
    if (students.length === 0) {
      Alert.alert('Nothing to export', 'There are no students in this class.');
      return;
    }

    setExporting(true);
    try {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth();
      const workingDaysCount = Math.max(1, daysArray.length - daysArray.filter(d => isSunday(year, month, d)).length);

      const headers = [
        'S.No', 'Roll No', 'Student Name', 'Photo URL',
        ...daysArray.map(d => (isSunday(year, month, d) ? `Day ${d} (SUN)` : `Day ${d}`)),
        'Present (P)', 'Absent (A)', 'Leave (L)', 'Holiday (H)', 'Attendance %',
      ];
      const rows: any[][] = [headers];

      students.forEach((s, idx) => {
        let pCount = 0, aCount = 0, lCount = 0, hCount = 0;
        const dayCells = daysArray.map(d => {
          const isSun = isSunday(year, month, d);
          const st = getStudentDayStatus(s, d) || (isSun ? 'Holiday' : null);
          if (st === 'Present') { pCount++; return 'P'; }
          if (st === 'Absent') { aCount++; return 'A'; }
          if (st === 'Leave') { lCount++; return 'L'; }
          if (st === 'Half-Day') { pCount += 0.5; return 'HD'; }
          if (st === 'Holiday' || isSun) { hCount++; return 'H'; }
          return '-';
        });

        const pct = ((pCount / workingDaysCount) * 100).toFixed(1);

        rows.push([
          idx + 1,
          s.rollNo || 'N/A',
          s.name,
          s.photo || '',
          ...dayCells,
          pCount, aCount, lCount, hCount,
          `${pct}%`,
        ]);
      });

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 8 }, { wch: 12 }, { wch: 22 }, { wch: 20 },
        ...daysArray.map(() => ({ wch: 10 })),
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Matrix');
      const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

      const monthLabel = `${year}-${String(month + 1).padStart(2, '0')}`;
      const fileName = `${selectedClass?.className || 'Class'}_Monthly_Attendance_${monthLabel}.xlsx`;
      const filePath = `${RNFS.CachesDirectoryPath}/${fileName}`;
      await RNFS.writeFile(filePath, wbout, 'base64');

      await Share.open({
        url: `file://${filePath}`,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: fileName,
        failOnCancel: false,
      });
    } catch (e: any) {
      if (e?.message && !String(e.message).includes('User did not share')) {
        console.error('Monthly export failed:', e);
        Alert.alert('Export failed', 'Could not generate the Excel file.');
      }
    } finally {
      setExporting(false);
    }
  };

  // ---------------------------------------------------------------------
  // EXCEL — Upload Excel (bulk import a filled monthly matrix)
  // Mirrors the web page's handleFileUpload(): reads Roll No / Student Name
  // / Photo URL / Day N columns per row and posts to the same bulk endpoint.
  // ---------------------------------------------------------------------
  const handleUploadExcel = async () => {
    let picked;
    try {
      [picked] = await pick({ type: [types.xlsx, types.xls, types.csv] });
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      console.error('File pick failed:', err);
      Alert.alert('Could not open file picker', 'Please try again.');
      return;
    }

    if (!selectedClassId) {
      Alert.alert('No class selected', 'Please select a class first.');
      return;
    }

    setUploading(true);
    try {
      const base64 = await RNFS.readFile(picked.uri, 'base64');
      const workbook = XLSX.read(base64, { type: 'base64' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet);

      const matrixData: any[] = [];
      jsonRows.forEach(row => {
        const rollNo = String(row['Roll No'] ?? row['rollNo'] ?? row['Roll'] ?? '').trim();
        const studentName = String(row['Student Name'] ?? row['studentName'] ?? row['Name'] ?? '').trim();
        const photo = String(row['Photo URL'] ?? row['photo'] ?? '').trim() || '/default-avatar.png';

        if (!studentName && !rollNo) return;

        const daysObj: Record<string, string> = {};
        daysArray.forEach(d => {
          const val = row[`Day ${d}`] ?? row[`Day${d}`] ?? row[d];
          if (val) daysObj[d] = String(val).trim().toUpperCase();
        });

        matrixData.push({ rollNo, studentName, photo, days: daysObj });
      });

      if (matrixData.length === 0) {
        Alert.alert('No data found', 'No valid attendance rows were found in the selected file.');
        return;
      }

      const year = selectedMonth.getFullYear();
      const month = String(selectedMonth.getMonth() + 1).padStart(2, '0');

      const res = await axios.post(
        BULK_ATTENDANCE_URL,
        { classId: selectedClassId, month: `${year}-${month}`, matrixData },
        authHeaders(authToken)
      );

      if (res.data?.success) {
        Alert.alert('Success', 'Monthly attendance matrix imported successfully!');
        setShowUploadModal(false);
        fetchGridData(authToken, selectedClassId, selectedMonth, true);
      }
    } catch (err: any) {
      console.error('Upload failed:', err?.response?.data || err?.message);
      Alert.alert('Import failed', err?.response?.data?.message || err?.response?.data?.error || 'Failed to parse or import the attendance file.');
    } finally {
      setUploading(false);
    }
  };

  // --- Actions ---
  const openDailyModal = () => {
    setDailyDate(new Date());
    setDailySearch('');
    // Default everyone to Absent — the teacher ticks a student to mark them
    // Present, which is faster than unticking a room full of present kids.
    const draft: Record<string, string> = {};
    students.forEach(s => { draft[s._id] = 'Absent'; });
    setDailyDraft(draft);
    setDailyModalVisible(true);
  };

  const toggleDailyPresent = useCallback((studentId: string) => {
    setDailyDraft(prev => ({ ...prev, [studentId]: (prev[studentId] || 'Absent') === 'Present' ? 'Absent' : 'Present' }));
  }, []);

  const markAllDaily = useCallback((status: 'Present' | 'Absent') => {
    setDailyDraft(() => {
      const draft: Record<string, string> = {};
      students.forEach(s => { draft[s._id] = status; });
      return draft;
    });
  }, [students]);

  const toggleStatDate = useCallback((dateStr: string) => {
    setSelectedStatDate(prev => (prev === dateStr ? null : dateStr));
  }, []);


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
    const attendanceList = students.map(s => buildAttendanceItem(s, dailyDraft[s._id] || 'Absent'));

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

  // Tapping a day cell now behaves like a plain checkbox: Present <-> Absent,
  // saved immediately — no picker, no modal. Long-press still opens the full
  // status editor for the rarer Leave / Half-Day / Holiday cases.
  const [pendingCellKeys, setPendingCellKeys] = useState<Set<string>>(new Set());

  const onCellPress = useCallback(async (student: any, dateStr: string) => {
    if (isFutureDateStr(dateStr)) return; // defensive — cell is already disabled for future dates
    if (!selectedClassId || !selectedSchoolId) {
      Alert.alert('Missing info', 'Could not determine the school for this class. Try reselecting the class.');
      return;
    }

    const key = student.rollNo?.toString() || student.name;
    const cellKey = `${key}__${dateStr}`;
    if (pendingCellKeys.has(cellKey)) return; // ignore double taps while saving

    const existing = attendanceMap[key]?.[dateStr];
    const nextStatus = existing === 'Present' ? 'Absent' : 'Present';
    const attendanceList = [buildAttendanceItem(student, nextStatus)];

    const errors = validateAttendancePayload(selectedClassId, selectedSchoolId, dateStr, attendanceList);
    if (errors.length > 0) {
      Alert.alert('Cannot update status', errors.slice(0, 5).join('\n'));
      return;
    }

    // Optimistic update so the checkbox flips instantly — only this one
    // student's inner object gets a new reference, everyone else's stays
    // identical, so the rest of the visible rows don't re-render at all.
    setAttendanceMap(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [dateStr]: nextStatus },
    }));

    setPendingCellKeys(prev => new Set(prev).add(cellKey));
    try {
      const payload = { classId: selectedClassId, schoolId: selectedSchoolId, date: dateStr, attendanceList };
      await axios.post(CLASS_ATTENDANCE_URL, payload, authHeaders(authToken));
    } catch (error: any) {
      // Revert by re-pulling from the server if the save failed.
      Alert.alert('Error', error.response?.data?.message || error.response?.data?.error || 'Failed to update status.');
      fetchGridData(authToken, selectedClassId, selectedMonth, true);
    } finally {
      setPendingCellKeys(prev => { const next = new Set(prev); next.delete(cellKey); return next; });
    }
  }, [attendanceMap, isFutureDateStr, selectedClassId, selectedSchoolId, authToken, selectedMonth, pendingCellKeys]);

  const onCellLongPress = useCallback((student: any, dateStr: string) => {
    if (isFutureDateStr(dateStr)) return;
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
        onCellLongPress={onCellLongPress}
      />
    );
  }, [selectedMonth, daysArray, attendanceMap, canEditCells, studentPctMap, todayStr, dayCellWidth, stickyColWidth, onCellPress, onCellLongPress]);

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
      {/* Compact header — brand + context only, no filters here so it stays short */}
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="check-square" size={18} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Class Attendance</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {selectedClass?.className ? `${selectedClass.className} · ` : ''}
            {selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
        {syncing && (
          <View style={styles.syncPulse}>
            <ActivityIndicator size="small" color={C.primary} />
          </View>
        )}
        <View style={styles.headerCountBadge}>
          <Feather name="users" size={12} color={C.primary} />
          <Text style={styles.headerCountText}>{students.length}</Text>
        </View>
        <TouchableOpacity style={styles.headerInfoBtn} onPress={() => setShowLegendModal(true)} activeOpacity={0.7}>
          <Feather name="info" size={16} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterSection}>
        <View style={{ flexDirection: 'row', gap: 10, zIndex: 10 }}>
          <View style={{ flex: 1.3 }}>
            {renderInlineDropdown('classFilter', 'CLASS', classes.map(c => ({ label: c.className, value: c._id })), selectedClassId, (v) => { setSelectedClassId(v); fetchGridData(authToken, v, selectedMonth); })}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>MONTH</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowMonthPicker(true)} activeOpacity={0.85}>
              <Text style={styles.datePickerText} numberOfLines={1}>{selectedMonth.toLocaleString('default', { month: 'short', year: 'numeric' })}</Text>
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
            <TextInput style={styles.searchInput} placeholder="Search name or roll no..." placeholderTextColor={C.textFaint} value={searchQuery} onChangeText={setSearchQuery} />
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

      {/* Matrix Data Area — opens immediately under the filter bar */}
      {loading ? (
        <View style={styles.skeletonContainer}>
          {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} delay={i} />)}
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
                  tap a day to open the stats sheet scoped to just that day. */}
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
                contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchGridData(authToken, selectedClassId, selectedMonth, true)} colors={[C.primary]} />}
                initialNumToRender={16}
                maxToRenderPerBatch={16}
                windowSize={9}
                removeClippedSubviews={false}
                updateCellsBatchingPeriod={50}
              />
            </View>
          </ScrollView>
        </View>
      )}

      {/* Floating action button — Excel actions live here so they never take
          up permanent header space. Tap to expand the speed-dial. */}
      {!loading && fabOpen && (
        <TouchableOpacity style={styles.fabBackdrop} activeOpacity={1} onPress={closeFab} />
      )}

      {!loading && (
        <View style={[styles.fabWrap, { bottom: 22 + insets.bottom }]} pointerEvents="box-none">
          {fabOpen && (
            <View style={styles.fabActions}>
              <TouchableOpacity
                style={styles.fabActionRow}
                activeOpacity={0.85}
                onPress={() => { closeFab(); setShowUploadModal(true); }}
              >
                <View style={styles.fabLabelChip}><Text style={styles.fabLabelText}>Upload Excel</Text></View>
                <View style={[styles.fabMini, { backgroundColor: C.primary }]}>
                  <Feather name="upload" size={17} color="#fff" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.fabActionRow}
                activeOpacity={0.85}
                disabled={exporting || students.length === 0}
                onPress={() => { closeFab(); downloadFormattedMonthlyExcel(); }}
              >
                <View style={styles.fabLabelChip}><Text style={styles.fabLabelText}>{exporting ? 'Exporting…' : 'Full Month Excel'}</Text></View>
                <View style={[styles.fabMini, { backgroundColor: C.green }]}>
                  {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="file-text" size={17} color="#fff" />}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.fabActionRow}
                activeOpacity={0.85}
                onPress={() => { closeFab(); downloadSampleAttendanceTemplate(); }}
              >
                <View style={styles.fabLabelChip}><Text style={styles.fabLabelText}>Download Format</Text></View>
                <View style={[styles.fabMini, { backgroundColor: C.blue }]}>
                  <Feather name="download" size={17} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.fabMain} onPress={toggleFab} activeOpacity={0.9}>
            {fabOpen ? (
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 28 }}>×</Text>
            ) : (
              <Feather name="grid" size={22} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* BOTTOM SHEET: Day stats — appears only when a day is tapped in the
          matrix header, so it never eats permanent screen space. */}
      <Modal visible={!!selectedStatDate} animationType="slide" transparent onRequestClose={() => setSelectedStatDate(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setSelectedStatDate(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheetCard, { paddingBottom: 26 + insets.bottom }]} onPress={() => { }}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.statsScopeChip}>
                <Feather name="calendar" size={12} color={C.primary} />
                <Text style={styles.statsScopeText}>{selectedStatDate ? formatPretty(selectedStatDate) : ''}</Text>
              </View>
              <TouchableOpacity style={styles.statsClearBtn} onPress={() => setSelectedStatDate(null)} activeOpacity={0.7}>
                <Feather name="x" size={16} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              <View style={[styles.statCard, SHADOW.card, { borderColor: C.border }]}>
                <Text style={styles.statValue}>{scopedPct !== null ? `${scopedPct}%` : '—'}</Text>
                <Text style={styles.statLabel}>Present %</Text>
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
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* MODAL: Legend / help — colour codes + gestures, opened from the info icon */}
      <Modal visible={showLegendModal} animationType="fade" transparent onRequestClose={() => setShowLegendModal(false)}>
        <TouchableOpacity style={styles.modalOverlayCenter} activeOpacity={1} onPress={() => setShowLegendModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.editModalCard, SHADOW.raised]} onPress={() => { }}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>How marking works</Text>
              <TouchableOpacity onPress={() => setShowLegendModal(false)}><Feather name="x" size={18} color={C.textMuted} /></TouchableOpacity>
            </View>

            <View style={styles.legendModalRow}>
              <View style={styles.cellCheckboxActive}><Feather name="check" size={9} color="#fff" /></View>
              <Text style={styles.legendModalText}>Present — tap once</Text>
            </View>
            <View style={styles.legendModalRow}>
              <View style={styles.cellCheckboxEmpty} />
              <Text style={styles.legendModalText}>Absent / not yet marked</Text>
            </View>
            {STATUS_ORDER.filter(st => st === 'Leave' || st === 'Half-Day').map(st => {
              const meta = STATUS_META[st];
              return (
                <View key={st} style={styles.legendModalRow}>
                  <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                  <Text style={styles.legendModalText}>{meta.abbr} — {meta.label}</Text>
                </View>
              );
            })}
            <Text style={styles.legendHintText}>Tap a day cell to toggle Present/Absent. Hold it down to set Leave, Half-Day or Holiday. Tap a date in the calendar header to see that day's totals.</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* MODAL: Mark Daily Attendance */}
      <Modal visible={isDailyModalVisible} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fullModalContainer}>
            <View style={styles.formHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Feather name="check-circle" size={18} color="#fff" /><Text style={styles.formTitle}>Mark Daily Attendance</Text></View>
              <TouchableOpacity onPress={() => setDailyModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 22, color: '#fff', fontWeight: '600' }}>✕</Text>
              </TouchableOpacity>            </View>

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
                <Text style={styles.inputLabel}>QUICK ACTIONS</Text>
                <View style={styles.quickActionsRow}>
                  <TouchableOpacity
                    style={[styles.quickActionBtn, { backgroundColor: C.greenSoft, borderColor: C.green + '40' }]}
                    onPress={() => markAllDaily('Present')}
                    activeOpacity={0.85}
                  >
                    <Feather name="check-circle" size={14} color={C.green} />
                    <Text style={[styles.quickActionText, { color: C.green }]}>All Present</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.quickActionBtn, { backgroundColor: C.primarySoft, borderColor: C.primary + '40' }]}
                    onPress={() => markAllDaily('Absent')}
                    activeOpacity={0.85}
                  >
                    <Feather name="x-circle" size={14} color={C.primary} />
                    <Text style={[styles.quickActionText, { color: C.primary }]}>All Absent</Text>
                  </TouchableOpacity>
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
                const isPresent = (dailyDraft[item._id] || 'Absent') === 'Present';
                return (
                  <TouchableOpacity
                    style={styles.dailyStudentRow}
                    activeOpacity={0.7}
                    onPress={() => toggleDailyPresent(item._id)}
                  >
                    <View style={[styles.dailyAvatar, { backgroundColor: isPresent ? C.greenSoft : C.surfaceSoft, borderColor: isPresent ? C.green + '55' : C.border }]}>
                      <Text style={[styles.dailyAvatarText, { color: isPresent ? C.green : C.textFaint }]}>{getInitials(item.name)}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.marksStudentName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.marksStudentRoll}>Roll {item.rollNo || 'N/A'}</Text>
                    </View>
                    <View style={styles.presentCheckboxWrap}>
                      <Text style={[styles.presentCheckboxLabel, { color: isPresent ? C.green : C.textFaint }]}>
                        {isPresent ? 'Present' : 'Absent'}
                      </Text>
                      <View style={[styles.checkboxBox, isPresent && styles.checkboxBoxActive]}>
                        {isPresent && <Feather name="check" size={14} color="#fff" />}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            <View style={[styles.modalFooter, { paddingBottom: 16 + insets.bottom }]}>
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

      {/* MODAL: Upload Monthly Excel — parity with the web page's upload modal */}
      <Modal visible={showUploadModal} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.editModalCard, SHADOW.raised]}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Upload Monthly Attendance</Text>
              <TouchableOpacity onPress={() => setShowUploadModal(false)}><Feather name="x" size={18} color={C.textMuted} /></TouchableOpacity>
            </View>

            <Text style={styles.uploadInfoText}>
              Upload an Excel file with the monthly attendance for{' '}
              <Text style={{ fontWeight: '800', color: C.text }}>{selectedClass?.className || 'this class'}</Text>
              {' '}({selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}). Use "Download Format" first if you need a blank template.
            </Text>

            <View style={styles.uploadDropZone}>
              <Feather name="upload-cloud" size={30} color={C.primary} />
              <Text style={styles.uploadDropTitle}>Select Excel / CSV File</Text>
              <Text style={styles.uploadDropSubtitle}>.xlsx, .xls, .csv supported</Text>
              <TouchableOpacity style={styles.uploadChooseBtn} onPress={handleUploadExcel} disabled={uploading} activeOpacity={0.85}>
                {uploading ? <ActivityIndicator size="small" color={C.primary} /> : <Text style={styles.uploadChooseBtnText}>Choose File</Text>}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.excelActionBtn, styles.excelActionBtnOutline, { borderColor: C.green, alignSelf: 'center', marginBottom: 10 }]}
              onPress={downloadSampleAttendanceTemplate}
              activeOpacity={0.85}
            >
              <Feather name="download" size={13} color={C.green} />
              <Text style={[styles.excelActionText, { color: C.green }]}>Download blank format</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowUploadModal(false)}>
              <Text style={styles.ghostBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 12.5, color: C.textMuted, fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, ...SHADOW.soft,
  },
  headerIconBadge: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.primary + '22' },
  title: { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: 0.1 },
  subtitle: { fontSize: 11.5, color: C.textMuted, marginTop: 1 },
  headerCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.primary + '22' },
  headerCountText: { fontSize: 12, fontWeight: '800', color: C.primary },
  headerInfoBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  syncPulse: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  // Skeleton loading state — shown briefly on a first-ever visit while
  // cached data (see gridCacheKey) isn't yet available, so the screen never
  // sits on a blank spinner.
  skeletonContainer: { flex: 1, backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 14 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT, borderBottomWidth: 1, borderColor: C.border },
  skeletonAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.surfaceSoft },
  skeletonLineWide: { width: '55%', height: 10, borderRadius: 5, backgroundColor: C.surfaceSoft, marginBottom: 8 },
  skeletonLineNarrow: { width: '30%', height: 8, borderRadius: 4, backgroundColor: C.surfaceSoft },
  skeletonPillGroup: { flexDirection: 'row', gap: 6 },
  skeletonPill: { width: 20, height: 20, borderRadius: 6, backgroundColor: C.surfaceSoft },

  filterSection: {
    backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    borderBottomWidth: 1, borderColor: C.border, ...SHADOW.soft, zIndex: 50,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, zIndex: 1 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13, color: C.text },
  markBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 16, height: 46, borderRadius: 12, gap: 6, ...SHADOW.card },
  markBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },

  excelActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 20, ...SHADOW.soft },
  excelActionBtnOutline: { backgroundColor: C.surface, borderWidth: 1.4 },
  excelActionText: { fontSize: 11.5, fontWeight: '800' },

  // Floating action button (speed dial) for Excel actions
  fabBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(13,15,22,0.28)' },
  fabWrap: { position: 'absolute', right: 18, alignItems: 'flex-end' },
  fabMain: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', ...SHADOW.fab },
  fabActions: { marginBottom: 14, gap: 12, alignItems: 'flex-end' },
  fabActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fabLabelChip: { backgroundColor: C.text, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, ...SHADOW.soft },
  fabLabelText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  fabMini: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', ...SHADOW.card },

  // Bottom sheet (day stats)
  sheetOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  sheetCard: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 26, ...SHADOW.raised },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 14 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  statsScopeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statsScopeText: { fontSize: 12, fontWeight: '800', color: C.primaryDark },
  statsClearBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center' },

  statCard: { minWidth: 92, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'flex-start' },
  statCardTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statValue: { fontSize: 17, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 10.5, color: C.textMuted, fontWeight: '700', marginTop: 3, letterSpacing: 0.2 },

  legendModalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  legendModalText: { fontSize: 13, color: C.text, fontWeight: '600' },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendHintText: { fontSize: 11.5, color: C.textMuted, lineHeight: 17, marginTop: 6, fontWeight: '500' },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  // Matrix Styles
  matrixContainer: { flex: 1, backgroundColor: C.surface },
  matrixHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSoft },
  matrixHeaderCell: { padding: 12, justifyContent: 'center', borderRightWidth: 1, borderColor: C.border },
  matrixStickyCol: {},
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
  cellCheckboxActive: { width: 22, height: 22, borderRadius: 7, backgroundColor: C.green, justifyContent: 'center', alignItems: 'center' },
  cellCheckboxEmpty: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.6, borderColor: C.border, backgroundColor: C.surfaceSoft },

  // Modals & Forms
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)' },
  fullModalContainer: { flex: 1, backgroundColor: C.surface, marginTop: 40, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', ...SHADOW.raised },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.primary },
  formTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  closeBtnIcon: { padding: 4 },

  dailyConfigBar: { flexDirection: 'row', padding: 16, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderColor: C.border },
  quickActionsRow: { flexDirection: 'row', gap: 8, height: 44 },
  quickActionBtn: { flex: 1, flexDirection: 'row', gap: 6, borderRadius: 11, borderWidth: 1.2, justifyContent: 'center', alignItems: 'center' },
  quickActionText: { fontSize: 11.5, fontWeight: '800' },
  helperText: { fontSize: 10, color: C.textFaint, marginTop: 5, fontWeight: '600' },

  dailySearchWrap: { paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  dailyCountText: { fontSize: 11.5, color: C.textMuted, fontWeight: '700' },

  dailyStudentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: C.border },
  dailyAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.4, justifyContent: 'center', alignItems: 'center' },
  dailyAvatarText: { fontSize: 13.5, fontWeight: '800' },
  marksStudentName: { fontSize: 14, fontWeight: '700', color: C.text, maxWidth: 160 },
  marksStudentRoll: { fontSize: 11.5, color: C.textMuted, marginTop: 2 },
  presentCheckboxWrap: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  presentCheckboxLabel: { fontSize: 11.5, fontWeight: '800', minWidth: 48, textAlign: 'right' },
  checkboxBox: { width: 25, height: 25, borderRadius: 8, borderWidth: 1.6, borderColor: C.border, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center' },
  checkboxBoxActive: { backgroundColor: C.green, borderColor: C.green },

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

  // Upload Modal
  uploadInfoText: { fontSize: 11.5, color: C.textMuted, lineHeight: 18, marginBottom: 16 },
  uploadDropZone: { alignItems: 'center', borderWidth: 1.4, borderStyle: 'dashed', borderColor: C.border, borderRadius: 16, paddingVertical: 26, backgroundColor: C.surfaceSoft, marginBottom: 16 },
  uploadDropTitle: { fontSize: 13.5, fontWeight: '800', color: C.text, marginTop: 8 },
  uploadDropSubtitle: { fontSize: 11, color: C.textFaint, marginTop: 3, marginBottom: 14 },
  uploadChooseBtn: { borderWidth: 1.4, borderColor: C.primary, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 9, minWidth: 120, alignItems: 'center' },
  uploadChooseBtnText: { fontSize: 12.5, fontWeight: '800', color: C.primary },


  inputWrapper: { marginBottom: 0 },
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