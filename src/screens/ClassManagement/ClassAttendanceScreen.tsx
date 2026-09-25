import React, {
  useState, useEffect, useCallback, useMemo, useRef, memo, useSyncExternalStore,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl,
  useWindowDimensions, LayoutAnimation, UIManager, Animated, AppState, Image,
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

/* ────────────────────────────── Config ────────────────────────────── */

const CLASSES_URL = `${API_BASE}/classes`;
const STUDENTS_URL = `${API_BASE}/students`;
const CLASS_ATTENDANCE_URL = `${API_BASE}/attendance/class`; // GET (scoped) + POST, same endpoint as web
const BULK_ATTENDANCE_URL = `${API_BASE}/attendance/class/bulk`;

const DEFAULT_AVATAR = '/default-avatar.png';

// v3: page-scoped cache. v2 (whole-grid) keys are left untouched on disk and simply
// never read again — AsyncStorage entries expire naturally / can be swept by a
// maintenance task; we don't need to migrate them since v3 fully supersedes them.
const CACHE_PREFIX = 'attendance_grid_v3_';
const USER_DATA_KEY = 'userData';

const ALLOW_FUTURE_DATES = false;
const FLUSH_DELAY_MS = 400;
const UPLOAD_BATCH_SIZE = 20;

const ROW_HEIGHT = 64;
const HEADER_HEIGHT = 56;
const SUMMARY_COL_W = 36;
const SUMMARY_PCT_W = 60;
const SUMMARY_TOTAL_W = SUMMARY_COL_W * 4 + SUMMARY_PCT_W;

const PAGE_SIZE = 30; // students per page — see Section E for the backend contract

// Dev-only render profiling switch. Leave false for any real build — flip to
// true locally with React DevTools / a physical device to confirm AttendanceRow
// only re-renders for the row that actually changed. `__DEV__` makes this a
// no-op (dead code eliminated) in production bundles either way.
const DEBUG_LOG_ROW_RENDERS = false;

/* ────────────────────────────── Theme ────────────────────────────── */

const C = {
  bg: '#F6F6F9', surface: '#FFFFFF', surfaceSoft: '#FBFBFD', surfaceSunken: '#F1F2F6', border: '#E7E9F2',
  text: '#12172B', textMuted: '#5D6478', textFaint: '#9AA0B4',
  primary: '#B3122A', primaryDark: '#C5221F', primarySoft: '#FDE8E8',
  blue: '#0369A1', blueSoft: '#E0F2FE',
  green: '#059669', greenSoft: '#DCFCE9',
  amber: '#B45309', amberSoft: '#FEF3C7',
  slate: '#64748B', slateSoft: '#F1F5F9',
  todayTint: '#FFF7ED', futureBg: '#F8F9FB',
  overlay: 'rgba(13,15,22,0.48)',
};

const SHADOW = {
  card: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  raised: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 18, elevation: 6 },
  soft: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  fab: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 14, elevation: 8 },
};

/* ────────────────────────────── Types ────────────────────────────── */

type Status = 'Present' | 'Absent' | 'Leave' | 'Half-Day' | 'Holiday';
type Row = { key: string; studentId?: string; rollNo: string; name: string; photo: string };
type RowAttendance = Record<string, Status>; // dateStr -> status
type AttendanceMap = Record<string, RowAttendance>; // rowKey -> RowAttendance
type DayMeta = { day: number; dateStr: string; isSun: boolean; isToday: boolean; isFuture: boolean };
type PendingEdit = {
  cellKey: string; classId: string; schoolId?: string; rowKey: string; row: Row;
  dateStr: string; status: Status; revertTo: Status | null; ownerKey: string;
};
type Notice = { type: 'success' | 'error' | 'info'; message: string } | null;

const STATUS_META: Record<Status, { label: string; color: string; bg: string; abbr: string; icon: string }> = {
  Present: { label: 'Present', color: C.green, bg: C.greenSoft, abbr: 'P', icon: 'check-circle' },
  Absent: { label: 'Absent', color: C.primary, bg: C.primarySoft, abbr: 'A', icon: 'x-circle' },
  Leave: { label: 'Leave', color: C.amber, bg: C.amberSoft, abbr: 'L', icon: 'clock' },
  'Half-Day': { label: 'Half-Day', color: C.blue, bg: C.blueSoft, abbr: 'HD', icon: 'sunrise' },
  Holiday: { label: 'Holiday', color: C.slate, bg: C.slateSoft, abbr: 'H', icon: 'coffee' },
};
const STATUS_ORDER: Status[] = ['Present', 'Absent', 'Leave', 'Half-Day', 'Holiday'];
const VALID_STATUSES: string[] = STATUS_ORDER;
const EMPTY_ROW_ATT: RowAttendance = Object.freeze({}) as RowAttendance;

/* ────────────────────────────── Utilities ────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0');
const formatToYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const getDaysInMonth = (year: number, monthIdx: number) => new Date(year, monthIdx + 1, 0).getDate();
const getInitials = (name: string) => (name || '?').trim().charAt(0).toUpperCase();
const formatPretty = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
};
const monthLabel = (month: string, style: 'long' | 'short' = 'long') => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('default', { month: style, year: 'numeric' });
};
const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const errMsg = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.response?.data?.error || (e?.message === 'Network Error' ? 'No internet connection.' : fallback);

const naturalCompare = (a: string, b: string) => {
  const re = /(\d+)|(\D+)/g;
  const pa = a.match(re) || [];
  const pb = b.match(re) || [];
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i];
    if (/^\d/.test(x) && /^\d/.test(y)) {
      const d = parseInt(x, 10) - parseInt(y, 10);
      if (d) return d;
    } else {
      const c = x.toLowerCase().localeCompare(y.toLowerCase());
      if (c) return c;
    }
  }
  return pa.length - pb.length;
};
const sortClassesNaturally = (list: any[]) =>
  [...list].sort((a, b) => naturalCompare(String(a.className || ''), String(b.className || '')));

function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ── Network: shared instance + retry with exponential backoff ── */

const http = axios.create({ timeout: 20000 });
const isRetryable = (e: any) => !e?.response || e.response.status >= 500;
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || !isRetryable(e)) throw e;
      attempt += 1;
      await new Promise(r => setTimeout(r, 400 * 2 ** (attempt - 1)));
    }
  }
}

/* ── Grid building: mirrors the web `studentMap` merge exactly ── */

const buildGrid = (students: any[], records: any[]): { rows: Row[]; map: AttendanceMap } => {
  const rows: Row[] = [];
  const byId = new Map<string, Row>();
  const byRoll = new Map<string, Row>();
  const byName = new Map<string, Row>();

  const register = (row: Row) => {
    rows.push(row);
    byId.set(row.key, row);
    if (row.studentId) byId.set(String(row.studentId), row);
    if (row.rollNo && row.rollNo !== 'N/A' && !byRoll.has(row.rollNo)) byRoll.set(row.rollNo, row);
    const n = row.name.trim().toLowerCase();
    if (n && !byName.has(n)) byName.set(n, row);
  };

  students.forEach(st => {
    const id = String(st._id);
    register({
      key: id,
      studentId: id,
      rollNo: String(st.rollNo || st.admissionNo || 'N/A'),
      name: st.name || 'Student',
      photo: st.photo || '',
    });
  });

  const map: AttendanceMap = {};
  records.forEach(rec => {
    const sid = rec.studentId?._id || rec.studentId;
    const sidStr = sid && typeof sid !== 'object' ? String(sid) : undefined;
    const roll = rec.rollNo != null ? String(rec.rollNo) : '';
    const nameKey = String(rec.studentName || '').trim().toLowerCase();

    let row =
      (sidStr && byId.get(sidStr)) ||
      (roll && roll !== 'N/A' && byRoll.get(roll)) ||
      (nameKey && byName.get(nameKey)) ||
      undefined;

    if (!row) {
      row = {
        key: `ext:${sidStr || roll || nameKey || rows.length}`,
        studentId: sidStr,
        rollNo: roll || 'N/A',
        name: rec.studentName || 'Student',
        photo: rec.photo || '',
      };
      register(row);
    }

    const dateStr = String(rec.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !VALID_STATUSES.includes(rec.status)) return;
    if (!map[row.key]) map[row.key] = {};
    map[row.key][dateStr] = rec.status as Status;
  });

  return { rows, map };
};

const applyCellToRow = (row: RowAttendance | undefined, dateStr: string, status: Status | null): RowAttendance => {
  const next = { ...(row || {}) };
  if (status === null) delete next[dateStr];
  else next[dateStr] = status;
  return next;
};

const computeStats = (att: RowAttendance, dayMetas: DayMeta[], workingDays: number) => {
  let p = 0, a = 0, l = 0, h = 0;
  for (const m of dayMetas) {
    const st = att[m.dateStr];
    if (st === 'Present') p += 1;
    else if (st === 'Absent') a += 1;
    else if (st === 'Leave') l += 1;
    else if (st === 'Half-Day') p += 0.5;
    else if (st === 'Holiday') h += 1;
    else if (m.isSun) h += 1;
  }
  const pct = Math.min(100, Math.round((p / workingDays) * 100));
  return { p, a, l, h, pct, hasData: Object.keys(att).length > 0 };
};
const fmtCount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const toAttendanceItem = (row: Row, status: Status) => ({
  studentId: row.studentId,
  rollNo: row.rollNo,
  studentName: row.name,
  photo: row.photo || DEFAULT_AVATAR,
  status,
});


type Listener = () => void;

function createAttendanceStore(initial: AttendanceMap = {}) {
  let data: AttendanceMap = initial;
  const rowListeners = new Map<string, Set<Listener>>();
  const globalListeners = new Set<Listener>();

  const statsCache = new Map<string, StatsResult>();

  const notifyRow = (key: string) => { statsCache.delete(key); rowListeners.get(key)?.forEach(l => l()); };
  const notifyGlobal = () => globalListeners.forEach(l => l());

  return {
    getRow: (key: string): RowAttendance => data[key] || EMPTY_ROW_ATT,
    getAll: (): AttendanceMap => data,

    /** Cached computeStats() — recomputed only when this row's attendance
     *  actually changed since the last call (see notifyRow above). */
    getStats(key: string, dayMetas: DayMeta[], workingDays: number): StatsResult {
      const hit = statsCache.get(key);
      if (hit) return hit;
      const computed = computeStats(data[key] || EMPTY_ROW_ATT, dayMetas, workingDays);
      statsCache.set(key, computed);
      return computed;
    },

    /** Replace the whole map (initial load / refresh / silent resync). */
    reset(next: AttendanceMap) {
      const prev = data;
      data = next;
      statsCache.clear(); // month/grid identity changed — nothing is still valid
      const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
      keys.forEach(notifyRow);
      notifyGlobal();
    },

    /** Add rows for a newly-loaded page without touching existing rows. */
    mergeRows(partial: AttendanceMap) {
      if (Object.keys(partial).length === 0) return;
      data = { ...data, ...partial };
      Object.keys(partial).forEach(notifyRow); // new keys only — existing cache entries untouched
      notifyGlobal();
    },

    /** Instant single-cell update (checkbox tap / single edit). */
    applyCell(rowKey: string, dateStr: string, status: Status | null) {
      data = { ...data, [rowKey]: applyCellToRow(data[rowKey], dateStr, status) };
      notifyRow(rowKey);
      notifyGlobal();
    },

    /** Merge several fully-resolved rows at once (daily-mark bulk save). */
    setRows(entries: AttendanceMap) {
      data = { ...data, ...entries };
      Object.keys(entries).forEach(notifyRow);
      notifyGlobal();
    },

    subscribeRow(key: string, cb: Listener) {
      let set = rowListeners.get(key);
      if (!set) { set = new Set(); rowListeners.set(key, set); }
      set.add(cb);
      return () => { set!.delete(cb); if (set!.size === 0) rowListeners.delete(key); };
    },
    subscribeGlobal(cb: Listener) {
      globalListeners.add(cb);
      return () => globalListeners.delete(cb);
    },
  };
}
type AttendanceStore = ReturnType<typeof createAttendanceStore>;
type StatsResult = ReturnType<typeof computeStats>;

function useRowAttendance(store: AttendanceStore, rowKey: string): RowAttendance {
  const subscribe = useCallback((cb: Listener) => store.subscribeRow(rowKey, cb), [store, rowKey]);
  const getSnapshot = useCallback(() => store.getRow(rowKey), [store, rowKey]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

function useAttendanceSnapshot(store: AttendanceStore): AttendanceMap {
  const subscribe = useCallback((cb: Listener) => store.subscribeGlobal(cb), [store]);
  const getSnapshot = useCallback(() => store.getAll(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/* ────────────────────────────── Small components ────────────────────────────── */

const StudentAvatar = memo(({ photo, name, size = 34, tint = C.primary }: { photo?: string; name: string; size?: number; tint?: string }) => {
  const [failed, setFailed] = useState(false);
  const valid = !!photo && /^https?:\/\//i.test(photo) && !failed;
  if (valid) {
    return (
      <Image
        source={{ uri: photo }}
        onError={() => setFailed(true)}
        // Fixed dimensions declared up front so layout never shifts after load.
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surfaceSunken }}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint + '22', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: size * 0.38, fontWeight: '800', color: tint }}>{getInitials(name)}</Text>
    </View>
  );
});

type DayCellProps = {
  rowKey: string; meta: DayMeta; status: Status | undefined; width: number; canEdit: boolean;
  onToggle: (rowKey: string, dateStr: string) => void;
  onLongPress: (rowKey: string, dateStr: string) => void;
};

const DayCell = memo(({ rowKey, meta, status, width, canEdit, onToggle, onLongPress }: DayCellProps) => {
  const locked = !ALLOW_FUTURE_DATES && meta.isFuture;
  const interactive = canEdit && !locked;
  const sMeta = status ? STATUS_META[status] : null;

  // This only re-runs when the memoized component actually re-renders (i.e. when
  // one of these specific values changes for THIS cell) — DayCell is already
  // memo'd, so we're not fighting unnecessary renders here, just avoiding a
  // fresh style array being built each time this one cell legitimately updates.
  const cellStyle = useMemo(() => [
    styles.dayCell,
    { width },
    meta.isSun && !meta.isFuture && styles.sunBg,
    meta.isToday && styles.todayBg,
    locked && styles.futureBg,
  ], [width, meta.isSun, meta.isFuture, meta.isToday, locked]);

  let content: React.ReactNode;
  if (locked) {
    content = <Feather name="lock" size={11} color={C.textFaint} />;
  } else if (status === 'Present') {
    content = (
      <View style={styles.cellBoxActive}>
        <Feather name="check" size={14} color="#fff" />
      </View>
    );
  } else if (sMeta && status !== 'Absent') {
    content = (
      <View style={[styles.statusPill, { backgroundColor: sMeta.bg, borderColor: sMeta.color + '33' }]}>
        <Text style={[styles.statusPillText, { color: sMeta.color }]}>{sMeta.abbr}</Text>
      </View>
    );
  } else if (meta.isSun && !status) {
    content = (
      <View style={styles.cellBoxSun}>
        <Text style={styles.cellBoxSunText}>SUN</Text>
      </View>
    );
  } else {
    content = <View style={[styles.cellBoxEmpty, status === 'Absent' && styles.cellBoxAbsent]} />;
  }

  return (
    <Pressable
      disabled={!interactive}
      onPress={() => onToggle(rowKey, meta.dateStr)}
      onLongPress={() => onLongPress(rowKey, meta.dateStr)}
      delayLongPress={350}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: status === 'Present', disabled: !interactive }}
      style={({ pressed }) => [...cellStyle, pressed && interactive && { opacity: 0.55 }]}
    >
      {content}
    </Pressable>
  );
});

type RowProps = {
  row: Row; store: AttendanceStore; dayMetas: DayMeta[]; workingDays: number;
  dayCellWidth: number; stickyColWidth: number; scrollX: Animated.Value; canEdit: boolean;
  onToggle: (rowKey: string, dateStr: string) => void;
  onLongPress: (rowKey: string, dateStr: string) => void;
};

const AttendanceRow = memo(({ row, store, dayMetas, workingDays, dayCellWidth, stickyColWidth, scrollX, canEdit, onToggle, onLongPress }: RowProps) => {
  if (__DEV__ && DEBUG_LOG_ROW_RENDERS) console.log(`[render] AttendanceRow ${row.rollNo}`);

  // Subscribes ONLY to this row's key. A tap on another student never runs this
  // hook's callback and never re-renders this component.
  const att = useRowAttendance(store, row.key);
  // Cached in the store, not recomputed on every mount — see createAttendanceStore.
  const stats = store.getStats(row.key, dayMetas, workingDays);
  const pctColor = !stats.hasData ? C.textFaint : stats.pct >= 75 ? C.green : stats.pct >= 50 ? C.amber : C.primary;

  return (
    <View style={styles.dataRow}>
      <Animated.View
        style={[styles.stickyCell, { width: stickyColWidth, borderLeftColor: pctColor, transform: [{ translateX: scrollX }] }]}
      >
        <StudentAvatar photo={row.photo} name={row.name} size={34} tint={pctColor} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.studentName} numberOfLines={1}>{row.name}</Text>
          <View style={styles.studentMetaRow}>
            <Text style={styles.studentRoll} numberOfLines={1}>Roll {row.rollNo}</Text>
            <View style={[styles.pctBadge, { backgroundColor: pctColor + '18' }]}>
              <Text style={[styles.studentPct, { color: pctColor }]}>{stats.hasData ? `${stats.pct}%` : '—'}</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {dayMetas.map(m => (
        <DayCell
          key={m.day}
          rowKey={row.key}
          meta={m}
          status={att[m.dateStr]}
          width={dayCellWidth}
          canEdit={canEdit}
          onToggle={onToggle}
          onLongPress={onLongPress}
        />
      ))}

      <View style={[styles.sumCell, { width: SUMMARY_COL_W, backgroundColor: C.greenSoft + '80' }]}><Text style={[styles.sumText, { color: C.green }]}>{fmtCount(stats.p)}</Text></View>
      <View style={[styles.sumCell, { width: SUMMARY_COL_W, backgroundColor: C.primarySoft + '80' }]}><Text style={[styles.sumText, { color: C.primary }]}>{stats.a}</Text></View>
      <View style={[styles.sumCell, { width: SUMMARY_COL_W, backgroundColor: C.amberSoft + '80' }]}><Text style={[styles.sumText, { color: C.amber }]}>{stats.l}</Text></View>
      <View style={[styles.sumCell, { width: SUMMARY_COL_W, backgroundColor: C.slateSoft }]}><Text style={[styles.sumText, { color: C.slate }]}>{stats.h}</Text></View>
      <View style={[styles.sumCell, { width: SUMMARY_PCT_W }]}>
        <View style={[styles.pctBadge, { backgroundColor: pctColor + '18' }]}>
          <Text style={[styles.studentPct, { color: pctColor }]}>{stats.pct}%</Text>
        </View>
      </View>
    </View>
  );
});

const SkeletonRow = ({ index }: { index: number }) => (
  <View style={[styles.skeletonRow, { opacity: 1 - Math.min(index * 0.07, 0.45) }]}>
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

const FooterLoader = () => (
  <View style={styles.footerLoader}>
    <ActivityIndicator size="small" color={C.primary} />
    <Text style={styles.footerLoaderText}>Loading more students…</Text>
  </View>
);

/* ────────────────────────────── Screen ────────────────────────────── */

export default function ClassAttendanceScreen() {
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();
  const isTablet = winWidth >= 768;
  const isCompactPhone = winWidth < 360;
  const dayCellWidth = isTablet ? 54 : isCompactPhone ? 40 : 44;
  const stickyColWidth = isTablet ? 226 : isCompactPhone ? 154 : 172;

  /* Session */
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [teacherClassIds, setTeacherClassIds] = useState<string[] | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const authHeaders = useCallback(() => ({ headers: { Authorization: `Bearer ${authTokenRef.current}` } }), []);

  /* Data */
  const [classes, setClasses] = useState<any[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const attendanceStoreRef = useRef<AttendanceStore>(createAttendanceStore());
  const attendanceStore = attendanceStoreRef.current;
  const rowIndexRef = useRef<Map<string, Row>>(new Map());
  const gridOwnerRef = useRef<string>(''); // `${classId}|${month}` the current grid belongs to
  const requestIdRef = useRef(0);

  /* Pagination */
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchedPagesRef = useRef<Set<number>>(new Set());
  const fetchingPageRef = useRef<number | null>(null);

  /* Selection */
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => formatToYMD(new Date()).slice(0, 7));
  const [todayStr, setTodayStr] = useState(() => formatToYMD(new Date()));
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [selectedStatDate, setSelectedStatDate] = useState<string | null>(null);

  /* UI state */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const noticeTimerRef = useRef<any>(null);

  const [showClassSheet, setShowClassSheet] = useState(false);
  const [isDailyModalVisible, setDailyModalVisible] = useState(false);
  const [isSingleEditModalVisible, setSingleEditModalVisible] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

  const [dailyDate, setDailyDate] = useState<Date>(new Date());
  const [showDailyDatePicker, setShowDailyDatePicker] = useState(false);
  const [dailyDraft, setDailyDraft] = useState<Record<string, Status>>({});
  const [dailySearch, setDailySearch] = useState('');
  const [singleEditData, setSingleEditData] = useState<{ row: Row; dateStr: string; status: Status } | null>(null);

  /* Derived */
  const hasPermission = useCallback(
    (action: string) => isSuperAdmin || permissions.some(p => p.module === 'attendance' && p.action === action),
    [permissions, isSuperAdmin]
  );
  const canEditCells = hasPermission('update');

  const availableClasses = useMemo(() => {
    const sorted = sortClassesNaturally(classes);
    return teacherClassIds && teacherClassIds.length > 0
      ? sorted.filter(c => teacherClassIds.includes(String(c._id || c.id)))
      : sorted;
  }, [classes, teacherClassIds]);

  const selectedClass = useMemo(() => classes.find(c => c._id === selectedClassId), [classes, selectedClassId]);
  const selectedSchoolId: string | undefined = useMemo(() => {
    const sid = selectedClass?.schoolId;
    return (typeof sid === 'string' ? sid : sid?._id) || undefined;
  }, [selectedClass]);

  const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
  const dayMetas: DayMeta[] = useMemo(() => {
    const n = getDaysInMonth(yearNum, monthNum - 1);
    return Array.from({ length: n }, (_, i) => {
      const day = i + 1;
      const dateStr = `${selectedMonth}-${pad(day)}`;
      return {
        day, dateStr,
        isSun: new Date(yearNum, monthNum - 1, day, 12).getDay() === 0,
        isToday: dateStr === todayStr,
        isFuture: dateStr > todayStr,
      };
    });
  }, [selectedMonth, yearNum, monthNum, todayStr]);
  const workingDays = useMemo(() => Math.max(1, dayMetas.length - dayMetas.filter(m => m.isSun).length), [dayMetas]);
  const totalWidth = stickyColWidth + dayMetas.length * dayCellWidth + SUMMARY_TOTAL_W;

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.rollNo.toLowerCase().includes(q));
  }, [rows, debouncedSearch]);


  const dailyFilteredRows = useMemo(() => {
    const q = dailySearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.rollNo.toLowerCase().includes(q));
  }, [rows, dailySearch]);

  const attendanceSnapshot = useAttendanceSnapshot(attendanceStore);

  const scopedStats = useMemo(() => {
    const counts: Record<Status, number> = { Present: 0, Absent: 0, Leave: 0, 'Half-Day': 0, Holiday: 0 };
    if (!selectedStatDate) return counts;
    rows.forEach(r => {
      const st = attendanceSnapshot[r.key]?.[selectedStatDate];
      if (st) counts[st] += 1;
    });
    return counts;
  }, [rows, attendanceSnapshot, selectedStatDate]);
  const totalMarkedInScope = scopedStats.Present + scopedStats.Absent + scopedStats.Leave + scopedStats['Half-Day'];
  const scopedPct = totalMarkedInScope > 0
    ? Math.round(((scopedStats.Present + scopedStats['Half-Day'] * 0.5) / totalMarkedInScope) * 100)
    : null;

  /* Context refs so handlers can stay referentially stable (critical for memo'd cells) */
  const ctxRef = useRef({ classId: '', schoolId: undefined as string | undefined, month: selectedMonth, today: todayStr });
  ctxRef.current = { classId: selectedClassId, schoolId: selectedSchoolId, month: selectedMonth, today: todayStr };

  const showNotice = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    clearTimeout(noticeTimerRef.current);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setNotice({ type, message });
    noticeTimerRef.current = setTimeout(() => setNotice(null), type === 'error' ? 4500 : 2600);
  }, []);

  /* ────────── Write-behind save queue (unchanged behavior; reads/writes the store) ────────── */

  const pendingRef = useRef<Map<string, PendingEdit>>(new Map());
  const inFlightRef = useRef<Map<string, PendingEdit>>(new Map());
  const flushPromiseRef = useRef<Promise<void> | null>(null);
  const flushTimerRef = useRef<any>(null);

  const sendBatch = useCallback(async (): Promise<number> => {
    const batch = pendingRef.current;
    pendingRef.current = new Map();
    inFlightRef.current = batch;

    const groups = new Map<string, { classId: string; schoolId?: string; dateStr: string; items: PendingEdit[] }>();
    batch.forEach(e => {
      const gk = `${e.classId}|${e.dateStr}`;
      if (!groups.has(gk)) groups.set(gk, { classId: e.classId, schoolId: e.schoolId, dateStr: e.dateStr, items: [] });
      groups.get(gk)!.items.push(e);
    });

    const results = await Promise.all(
      Array.from(groups.values()).map(async g => {
        try {
          await withRetry(() =>
            http.post(
              CLASS_ATTENDANCE_URL,
              {
                classId: g.classId,
                schoolId: g.schoolId,
                date: g.dateStr,
                attendanceList: g.items.map(e => toAttendanceItem(e.row, e.status)),
              },
              authHeaders()
            )
          );
          return { g, ok: true as const, err: null };
        } catch (err) {
          return { g, ok: false as const, err };
        }
      })
    );

    inFlightRef.current = new Map();
    let failed = 0;
    let lastErr: any = null;

    results.forEach(({ g, ok, err }) => {
      g.items.forEach(e => {
        const newer = pendingRef.current.get(e.cellKey); // user tapped again while we were saving
        if (ok) {
          if (newer) newer.revertTo = e.status; // this value is now confirmed on the server
        } else {
          failed += 1;
          lastErr = err;
          if (newer) newer.revertTo = e.revertTo;
          else if (e.ownerKey === gridOwnerRef.current) {
            attendanceStore.applyCell(e.rowKey, e.dateStr, e.revertTo); // revert ONLY this cell
          }
        }
      });
    });

    if (failed > 0) showNotice('error', `${failed} change${failed > 1 ? 's' : ''} could not be saved. ${errMsg(lastErr, 'Please try again.')}`);
    return failed;
  }, [authHeaders, attendanceStore, showNotice]);

  const flush = useCallback((): Promise<void> => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    if (pendingRef.current.size === 0) return Promise.resolve();
    const p = (async () => {
      let failed = 0;
      try {
        while (pendingRef.current.size > 0) failed += await sendBatch();
      } finally {
        flushPromiseRef.current = null;
        setSaveState(failed > 0 ? 'error' : 'idle');
      }
    })();
    flushPromiseRef.current = p;
    return p;
  }, [sendBatch]);

  const scheduleFlush = useCallback((delay = FLUSH_DELAY_MS) => {
    clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => { flush(); }, delay);
  }, [flush]);

  const flushNow = useCallback(async () => {
    clearTimeout(flushTimerRef.current);
    while (flushPromiseRef.current || pendingRef.current.size > 0) {
      await flush();
    }
  }, [flush]);

  const queueCellChange = useCallback((rowKey: string, dateStr: string, status: Status) => {
    const { classId, schoolId, today } = ctxRef.current;
    const row = rowIndexRef.current.get(rowKey);
    if (!row || !classId) return;
    if (!ALLOW_FUTURE_DATES && dateStr > today) return;

    const prev = attendanceStore.getRow(rowKey)[dateStr] ?? null;
    if (prev === status) return;

    attendanceStore.applyCell(rowKey, dateStr, status); // instant UI — only this row re-renders

    const cellKey = `${classId}|${rowKey}|${dateStr}`;
    const existing = pendingRef.current.get(cellKey);
    pendingRef.current.set(cellKey, {
      cellKey, classId, schoolId, rowKey, row, dateStr, status,
      revertTo: existing ? existing.revertTo : prev,
      ownerKey: `${classId}|${dateStr.slice(0, 7)}`,
    });
    setSaveState('saving');
    scheduleFlush();
  }, [attendanceStore, scheduleFlush]);

  const toggleCell = useCallback((rowKey: string, dateStr: string) => {
    const cur = attendanceStore.getRow(rowKey)[dateStr] ?? null;
    queueCellChange(rowKey, dateStr, cur === 'Present' ? 'Absent' : 'Present'); // same toggle rule as web
  }, [attendanceStore, queueCellChange]);

  const openSingleEdit = useCallback((rowKey: string, dateStr: string) => {
    const row = rowIndexRef.current.get(rowKey);
    if (!row) return;
    if (!ALLOW_FUTURE_DATES && dateStr > ctxRef.current.today) return;
    setSingleEditData({ row, dateStr, status: attendanceStore.getRow(rowKey)[dateStr] || 'Present' });
    setSingleEditModalVisible(true);
  }, [attendanceStore]);

  /* ────────── Pagination-aware loading ────────── */

  const overlayPending = useCallback((map: AttendanceMap, ownerKey: string): AttendanceMap => {
    const out = { ...map };
    const apply = (e: PendingEdit) => {
      if (e.ownerKey !== ownerKey) return;
      out[e.rowKey] = { ...(out[e.rowKey] || {}), [e.dateStr]: e.status };
    };
    inFlightRef.current.forEach(apply);
    pendingRef.current.forEach(apply);
    return out;
  }, []);

  const applyFirstPage = useCallback((ownerKey: string, nextRows: Row[], map: AttendanceMap, meta: { hasNextPage: boolean; totalCount: number }) => {
    gridOwnerRef.current = ownerKey;
    rowIndexRef.current = new Map(nextRows.map(r => [r.key, r]));
    fetchedPagesRef.current = new Set([1]);
    setRows(nextRows);
    attendanceStore.reset(map);
    setPage(1);
    setHasNextPage(meta.hasNextPage);
    setTotalCount(meta.totalCount);
  }, [attendanceStore]);

  /** Reads cached pages 1..N sequentially for `ownerKey`, stopping at the first miss. */
  const hydrateFromCache = useCallback(async (ownerKey: string): Promise<boolean> => {
    try {
      const metaRaw = await AsyncStorage.getItem(`${CACHE_PREFIX}meta|${ownerKey}`);
      if (!metaRaw) return false;
      const meta = JSON.parse(metaRaw);
      const lastPage: number = meta.lastPage || 1;

      const allRows: Row[] = [];
      const allMap: AttendanceMap = {};
      for (let p = 1; p <= lastPage; p++) {
        const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${ownerKey}|page${p}`);
        if (!raw) return false; // gap in cache — treat as a full cache miss, fetch from network
        const cached = JSON.parse(raw);
        if (!Array.isArray(cached.rows) || !cached.map) return false;
        allRows.push(...cached.rows);
        Object.assign(allMap, cached.map);
        fetchedPagesRef.current.add(p);
      }

      gridOwnerRef.current = ownerKey;
      rowIndexRef.current = new Map(allRows.map(r => [r.key, r]));
      setRows(allRows);
      attendanceStore.reset(allMap);
      setPage(lastPage);
      setHasNextPage(Boolean(meta.hasNextPage));
      setTotalCount(meta.totalCount || allRows.length);
      return true;
    } catch {
      return false;
    }
  }, [attendanceStore]);

  const loadGrid = useCallback(async (classId: string, month: string, mode: 'initial' | 'refresh' | 'silent') => {
    if (!classId) return;
    const reqId = ++requestIdRef.current;
    const ownerKey = `${classId}|${month}`;
    let hydrated = false;
    setLoadError(null);
    fetchedPagesRef.current = new Set();

    if (mode === 'initial') {
      hydrated = await hydrateFromCache(ownerKey);
      if (reqId !== requestIdRef.current) return;
      if (hydrated) {
        setLoading(false);
        setSyncing(true);
      } else {
        setRows([]);
        attendanceStore.reset({});
        setLoading(true);
      }
    } else if (mode === 'refresh') setRefreshing(true);
    else setSyncing(true);

    try {
      // Page 1 of students, then attendance scoped to exactly those students —
      // see Section E for the endpoint contract this assumes.
      const stuRes = await withRetry(() => http.get(STUDENTS_URL, { ...authHeaders(), params: { classId, page: 1, limit: PAGE_SIZE } }));
      if (reqId !== requestIdRef.current) return;

      const students = stuRes.data?.data || [];
      const studentIds = students.map((s: any) => String(s._id));
      const respMeta = stuRes.data || {};

      const attRes = studentIds.length
        ? await withRetry(() => http.get(CLASS_ATTENDANCE_URL, { ...authHeaders(), params: { classId, month, studentIds: studentIds.join(',') } }))
        : { data: { data: [] } };
      if (reqId !== requestIdRef.current) return;

      const { rows: nextRows, map } = buildGrid(students, attRes.data?.data || []);
      const hasNext = typeof respMeta.hasNextPage === 'boolean'
        ? respMeta.hasNextPage
        : respMeta.totalPages
          ? 1 < respMeta.totalPages
          : students.length === PAGE_SIZE; // conservative fallback if backend omits paging meta

      applyFirstPage(ownerKey, nextRows, overlayPending(map, ownerKey), {
        hasNextPage: hasNext,
        totalCount: respMeta.totalCount ?? students.length,
      });
    } catch (e: any) {
      if (reqId !== requestIdRef.current) return;
      const msg = errMsg(e, 'Failed to load attendance.');
      if (!hydrated && mode !== 'silent') setLoadError(msg);
      else showNotice('error', msg);
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        setSyncing(false);
      }
    }
  }, [applyFirstPage, authHeaders, attendanceStore, hydrateFromCache, overlayPending, showNotice]);

  /** Prefetches the next page a little before the user hits the bottom. Guarded
   *  against duplicate/overlapping requests via `fetchingPageRef`. */
  const loadNextPage = useCallback(async () => {
    const { classId, month } = ctxRef.current;
    if (!classId || !hasNextPage || fetchingPageRef.current !== null) return;
    const nextPage = page + 1;
    if (fetchedPagesRef.current.has(nextPage)) return;

    fetchingPageRef.current = nextPage;
    setLoadingMore(true);
    try {
      const stuRes = await withRetry(() => http.get(STUDENTS_URL, { ...authHeaders(), params: { classId, page: nextPage, limit: PAGE_SIZE } }));
      const students = stuRes.data?.data || [];
      const respMeta = stuRes.data || {};
      const studentIds = students.map((s: any) => String(s._id));

      const attRes = studentIds.length
        ? await withRetry(() => http.get(CLASS_ATTENDANCE_URL, { ...authHeaders(), params: { classId, month, studentIds: studentIds.join(',') } }))
        : { data: { data: [] } };

      const { rows: newRows, map: newMap } = buildGrid(students, attRes.data?.data || []);
      fetchedPagesRef.current.add(nextPage);

      // Append-only, de-duplicated by student key; existing rows are never replaced.
      setRows(prev => {
        const seen = new Set(prev.map(r => r.key));
        const merged = prev.slice();
        newRows.forEach(r => {
          if (!seen.has(r.key)) {
            merged.push(r);
            rowIndexRef.current.set(r.key, r);
            seen.add(r.key);
          }
        });
        return merged;
      });
      attendanceStore.mergeRows(overlayPending(newMap, gridOwnerRef.current));

      const hasNext = typeof respMeta.hasNextPage === 'boolean'
        ? respMeta.hasNextPage
        : respMeta.totalPages
          ? nextPage < respMeta.totalPages
          : students.length === PAGE_SIZE;

      setPage(nextPage);
      setHasNextPage(hasNext);
      if (respMeta.totalCount != null) setTotalCount(respMeta.totalCount);

      AsyncStorage.setItem(
        `${CACHE_PREFIX}${gridOwnerRef.current}|page${nextPage}`,
        JSON.stringify({ rows: newRows, map: newMap, ts: Date.now() })
      ).catch(() => {});
      AsyncStorage.setItem(
        `${CACHE_PREFIX}meta|${gridOwnerRef.current}`,
        JSON.stringify({ lastPage: nextPage, hasNextPage: hasNext, totalCount: respMeta.totalCount ?? totalCount, ts: Date.now() })
      ).catch(() => {});
    } catch (e: any) {
      showNotice('error', errMsg(e, 'Could not load more students.'));
    } finally {
      fetchingPageRef.current = null;
      setLoadingMore(false);
    }
  }, [attendanceStore, authHeaders, hasNextPage, overlayPending, page, showNotice, totalCount]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [token, permsRaw, superRaw, userRaw] = await Promise.all([
        AsyncStorage.getItem('userToken'),
        AsyncStorage.getItem('userPermissions'),
        AsyncStorage.getItem('isSuperAdmin'),
        AsyncStorage.getItem(USER_DATA_KEY),
      ]);
      authTokenRef.current = token;
      try { if (permsRaw) setPermissions(JSON.parse(permsRaw)); } catch { /* ignore */ }
      const superAdmin = superRaw === 'true';
      setIsSuperAdmin(superAdmin);

      try {
        const user = userRaw ? JSON.parse(userRaw) : null;
        const assigned = user?.assignedClasses || user?.staff?.assignedClasses || [];
        const isTeacher = !superAdmin && (
          user?.roleId?.name === 'Teacher' || user?.staff?.staffType === 'Teacher' || assigned.length > 0
        );
        setTeacherClassIds(isTeacher && assigned.length > 0
          ? assigned.map((c: any) => (typeof c === 'object' ? String(c._id || c.id) : String(c)))
          : null);
      } catch { setTeacherClassIds(null); }

      const res = await withRetry(() => http.get(CLASSES_URL, authHeaders()));
      const list = res.data?.data || [];
      setClasses(list);
      if (list.length === 0) setLoading(false);
    } catch (e: any) {
      setLoadError(errMsg(e, 'Failed to load school classes.'));
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    if (availableClasses.length === 0) return;
    if (!availableClasses.some(c => c._id === selectedClassId)) setSelectedClassId(availableClasses[0]._id);
  }, [availableClasses, selectedClassId]);

  useEffect(() => {
    if (selectedClassId) loadGrid(selectedClassId, selectedMonth, 'initial');
  }, [selectedClassId, selectedMonth, loadGrid]);

  // Persist derived grid to cache (debounced, page-scoped, only when nothing unsaved).
  useEffect(() => {
    if (loading || !gridOwnerRef.current) return;
    const t = setTimeout(() => {
      if (pendingRef.current.size > 0 || inFlightRef.current.size > 0) return;
      const ownerKey = gridOwnerRef.current;
      const snapshot = attendanceStore.getAll();
      for (let p = 1; p <= page; p++) {
        const slice = rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
        if (slice.length === 0) continue;
        const map: AttendanceMap = {};
        slice.forEach(r => { map[r.key] = snapshot[r.key] || {}; });
        AsyncStorage.setItem(`${CACHE_PREFIX}${ownerKey}|page${p}`, JSON.stringify({ rows: slice, map, ts: Date.now() })).catch(() => {});
      }
      AsyncStorage.setItem(`${CACHE_PREFIX}meta|${ownerKey}`, JSON.stringify({ lastPage: page, hasNextPage, totalCount, ts: Date.now() })).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [rows, page, hasNextPage, totalCount, loading, attendanceStore, attendanceSnapshot]);

  // Foreground → silent refresh (page 1 only, cheap); background → flush unsaved taps.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        setTodayStr(formatToYMD(new Date()));
        const { classId, month } = ctxRef.current;
        if (classId) loadGrid(classId, month, 'silent');
      } else {
        flush();
      }
    });
    return () => sub.remove();
  }, [loadGrid, flush]);

  useEffect(() => () => {
    clearTimeout(flushTimerRef.current);
    clearTimeout(noticeTimerRef.current);
    flush();
  }, [flush]);

  /* ────────── Actions ────────── */

  const selectClass = (id: string) => {
    setShowClassSheet(false);
    if (id === selectedClassId) return;
    flush();
    setSelectedStatDate(null);
    setSelectedClassId(id);
  };

  const changeMonth = (delta: number) => {
    const next = shiftMonth(selectedMonth, delta);
    if (!ALLOW_FUTURE_DATES && next > todayStr.slice(0, 7)) return;
    flush();
    setSelectedStatDate(null);
    setSelectedMonth(next);
  };

  const toggleFab = () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setFabOpen(o => !o); };
  const closeFab = () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setFabOpen(false); };

  /* Daily attendance — reads/writes the store's snapshot directly (event-driven, no subscription needed) */
  const buildDraft = useCallback((dateStr: string) => {
    const snapshot = attendanceStore.getAll();
    const draft: Record<string, Status> = {};
    rows.forEach(r => {
      const ex = snapshot[r.key]?.[dateStr];
      draft[r.key] = ex || 'Present';
    });
    return draft;
  }, [rows, attendanceStore]);

  const openDailyModal = () => {
    const d = new Date();
    setDailyDate(d);
    setDailySearch('');
    setDailyDraft(buildDraft(formatToYMD(d)));
    setDailyModalVisible(true);
  };

  const toggleDailyPresent = useCallback((key: string) => {
    setDailyDraft(prev => ({ ...prev, [key]: prev[key] === 'Present' ? 'Absent' : 'Present' }));
  }, []);

  const markAllDaily = useCallback((status: Status) => {
    setDailyDraft(() => {
      const d: Record<string, Status> = {};
      rows.forEach(r => { d[r.key] = status; });
      return d;
    });
  }, [rows]);

  const handleSaveDaily = async () => {
    if (!selectedClassId) return;
    const dateStr = formatToYMD(dailyDate);
    if (!ALLOW_FUTURE_DATES && dateStr > todayStr) {
      Alert.alert('Invalid date', 'Attendance cannot be marked for a future date.');
      return;
    }
    if (rows.length === 0) {
      Alert.alert('No students', 'There are no students to mark.');
      return;
    }

    setSaving(true);
    try {
      await flushNow(); // never race a pending cell edit
      const attendanceList = rows.map(r => toAttendanceItem(r, dailyDraft[r.key] || 'Present'));
      await withRetry(() =>
        http.post(CLASS_ATTENDANCE_URL, { classId: selectedClassId, schoolId: selectedSchoolId, date: dateStr, attendanceList }, authHeaders())
      );

      if (dateStr.startsWith(selectedMonth)) {
        const entries: AttendanceMap = {};
        rows.forEach(r => {
          entries[r.key] = { ...attendanceStore.getRow(r.key), [dateStr]: dailyDraft[r.key] || 'Present' };
        });
        attendanceStore.setRows(entries);
      }
      setDailyModalVisible(false);
      showNotice('success', `Attendance for ${formatPretty(dateStr)} saved.`);
      loadGrid(selectedClassId, selectedMonth, 'silent');
    } catch (e: any) {
      Alert.alert('Error', errMsg(e, 'Failed to save attendance.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSingleEdit = () => {
    if (!singleEditData) return;
    queueCellChange(singleEditData.row.key, singleEditData.dateStr, singleEditData.status);
    setSingleEditModalVisible(false);
  };

  /* Excel ─ export / template / import */

  const shareWorkbook = async (workbook: any, fileName: string) => {
    const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const filePath = `${RNFS.CachesDirectoryPath}/${fileName}`;
    await RNFS.writeFile(filePath, wbout, 'base64');
    await Share.open({
      url: `file://${filePath}`,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: fileName,
      failOnCancel: false,
    });
  };

  const dayHeaders = () => dayMetas.map(m => (m.isSun ? `Day ${m.day} (SUN)` : `Day ${m.day}`));

  const downloadSampleAttendanceTemplate = async () => {
    try {
      const rowsAoa = [
        ['S.No', 'Roll No', 'Student Name', 'Photo URL', ...dayHeaders()],
        [1, '101', 'Student 1', DEFAULT_AVATAR, ...dayMetas.map(m => (m.isSun ? 'H' : 'P'))],
        [2, '102', 'Student 2', DEFAULT_AVATAR, ...dayMetas.map(m => (m.isSun ? 'H' : m.day % 7 === 0 ? 'A' : 'P'))],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rowsAoa);
      ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 22 }, { wch: 20 }, ...dayMetas.map(() => ({ wch: 10 }))];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance Template');
      await shareWorkbook(wb, `${selectedClass?.className || 'Class'}_Attendance_Sample_Template.xlsx`);
    } catch (e: any) {
      if (e?.message && !String(e.message).includes('User did not share')) {
        console.error('Template export failed:', e);
        Alert.alert('Export failed', 'Could not generate the template file.');
      }
    }
  };

  const ensureAllPagesLoaded = useCallback(async () => {
    while (hasNextPage && fetchingPageRef.current === null) {
      // eslint-disable-next-line no-await-in-loop
      await loadNextPage();
    }
  }, [hasNextPage, loadNextPage]);

  const downloadFormattedMonthlyExcel = async () => {
    if (!selectedClass) { Alert.alert('No class selected', 'Please select a class first to export Excel.'); return; }
    if (rows.length === 0) { Alert.alert('Nothing to export', 'There are no students in this class.'); return; }

    setExporting(true);
    try {
      await flushNow();
      await ensureAllPagesLoaded();
      const snapshot = attendanceStore.getAll();
      const header = [
        'S.No', 'Roll No', 'Student Name', 'Photo URL', ...dayHeaders(),
        'Present (P)', 'Absent (A)', 'Leave (L)', 'Holiday (H)', 'Attendance %',
      ];
      const aoa: any[][] = [header];

      rows.forEach((r, idx) => {
        const att = snapshot[r.key] || {};
        const cells = dayMetas.map(m => {
          const st = att[m.dateStr];
          if (st === 'Present') return 'P';
          if (st === 'Absent') return 'A';
          if (st === 'Leave') return 'L';
          if (st === 'Half-Day') return 'HD';
          if (st === 'Holiday' || m.isSun) return 'H';
          return '-';
        });
        const s = computeStats(att, dayMetas, workingDays);
        aoa.push([idx + 1, r.rollNo, r.name, r.photo || '', ...cells, s.p, s.a, s.l, s.h, `${((s.p / workingDays) * 100).toFixed(1)}%`]);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        { wch: 8 }, { wch: 12 }, { wch: 22 }, { wch: 20 },
        ...dayMetas.map(() => ({ wch: 10 })),
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance Matrix');
      await shareWorkbook(wb, `${selectedClass.className || 'Class'}_Monthly_Attendance_${selectedMonth}.xlsx`);
    } catch (e: any) {
      if (e?.message && !String(e.message).includes('User did not share')) {
        console.error('Monthly export failed:', e);
        Alert.alert('Export failed', 'Could not generate the Excel file.');
      }
    } finally {
      setExporting(false);
    }
  };

  const NAME_HEADERS = ['student name', 'studentname', 'name', 'student'];
  const ROLL_HEADERS = ['roll no', 'rollno', 'roll', 'roll number'];

  const handleUploadExcel = async () => {
    if (!selectedClassId) { Alert.alert('No class selected', 'Please select a class first.'); return; }

    let picked;
    try {
      [picked] = await pick({ type: [types.xlsx, types.xls, types.csv] });
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      Alert.alert('Could not open file picker', 'Please try again.');
      return;
    }

    setUploading(true);
    setUploadProgress(null);
    try {
      await flushNow();
      const uri = Platform.OS === 'ios' ? decodeURI(picked.uri) : picked.uri;
      const base64 = await RNFS.readFile(uri, 'base64');
      const workbook = XLSX.read(base64, { type: 'base64' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const headerRow = ((XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as any[][])[0] || [])
        .map(h => String(h ?? '').trim().toLowerCase());
      if (!headerRow.some(h => NAME_HEADERS.includes(h)) && !headerRow.some(h => ROLL_HEADERS.includes(h))) {
        Alert.alert(
          'Invalid file format',
          `Could not find "Student Name" or "Roll No" columns.\n\nDetected: ${headerRow.slice(0, 6).join(', ') || 'none'}\n\nUse "Download Format" for a valid template.`
        );
        return;
      }

      const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet);
      const matrixData: any[] = [];
      jsonRows.forEach(raw => {
        const row: Record<string, any> = Object.fromEntries(
          Object.entries(raw).map(([k, v]) => [String(k).trim().toLowerCase(), v])
        );
        const rollNo = String(row['roll no'] ?? row['rollno'] ?? row['roll'] ?? row['roll number'] ?? '').trim();
        const studentName = String(row['student name'] ?? row['studentname'] ?? row['name'] ?? row['student'] ?? '').trim();
        const photo = String(row['photo url'] ?? row['photo'] ?? '').trim() || DEFAULT_AVATAR;
        if (!studentName && !rollNo) return;

        const days: Record<string, string> = {};
        dayMetas.forEach(m => {
          const val = row[`day ${m.day}`] ?? row[`day${m.day}`] ?? row[`day ${m.day} (sun)`] ?? row[String(m.day)];
          if (val !== undefined && val !== null && String(val).trim() !== '') days[m.day] = String(val).trim().toUpperCase();
        });
        matrixData.push({ rollNo, studentName, photo, days });
      });

      if (matrixData.length === 0) {
        Alert.alert('No data found', 'No valid rows were found. Each row needs a Student Name or Roll No.');
        return;
      }

      let success = 0, failed = 0, lastError: any = null;
      setUploadProgress({ done: 0, total: matrixData.length, failed: 0 });
      for (let i = 0; i < matrixData.length; i += UPLOAD_BATCH_SIZE) {
        const batch = matrixData.slice(i, i + UPLOAD_BATCH_SIZE);
        try {
          await withRetry(() =>
            http.post(BULK_ATTENDANCE_URL, { classId: selectedClassId, month: selectedMonth, matrixData: batch }, authHeaders())
          );
          success += batch.length;
        } catch (e) {
          failed += batch.length;
          lastError = e;
        }
        setUploadProgress({ done: Math.min(i + batch.length, matrixData.length), total: matrixData.length, failed });
      }

      if (success > 0) showNotice('success', `Imported attendance for ${success} students.`);
      if (failed > 0) Alert.alert('Some rows failed', `${failed} student(s) could not be imported. ${errMsg(lastError, '')}`);
      setShowUploadModal(false);
      loadGrid(selectedClassId, selectedMonth, 'silent');
    } catch (err: any) {
      console.error('Upload failed:', err?.response?.data || err?.message);
      Alert.alert('Import failed', errMsg(err, 'Failed to parse or import the attendance file.'));
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  /* ────────── Grid rendering ────────── */

  const scrollX = useRef(new Animated.Value(0)).current;
  const onHorizontalScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true }),
    [scrollX]
  );

  // No `attendance` in this dependency list anymore — a cell tap can never make
  // this (or extraData, which is gone) change identity, so FlatList never
  // re-evaluates other rows because of it.
  const renderRow = useCallback(({ item }: { item: Row }) => (
    <AttendanceRow
      row={item}
      store={attendanceStore}
      dayMetas={dayMetas}
      workingDays={workingDays}
      dayCellWidth={dayCellWidth}
      stickyColWidth={stickyColWidth}
      scrollX={scrollX}
      canEdit={canEditCells}
      onToggle={toggleCell}
      onLongPress={openSingleEdit}
    />
  ), [attendanceStore, dayMetas, workingDays, dayCellWidth, stickyColWidth, scrollX, canEditCells, toggleCell, openSingleEdit]);

  const keyExtractor = useCallback((r: Row) => r.key, []);
  const getItemLayout = useCallback((_: any, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index }), []);

  const onRefresh = useCallback(() => {
    if (selectedClassId) loadGrid(selectedClassId, selectedMonth, 'refresh');
  }, [selectedClassId, selectedMonth, loadGrid]);

  const onEndReached = useCallback(() => { loadNextPage(); }, [loadNextPage]);

  const ListFooter = useMemo(() => (loadingMore ? <FooterLoader /> : null), [loadingMore]);

  const currentMonth = todayStr.slice(0, 7);
  const canGoNext = ALLOW_FUTURE_DATES || selectedMonth < currentMonth;
  const presentInDraft = Object.values(dailyDraft).filter(v => v === 'Present').length;

  /* ────────────────────────────── JSX ────────────────────────────── */

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="check-square" size={18} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Class Attendance</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {selectedClass?.className ? `${selectedClass.className}${selectedClass.division ? ` (Div ${selectedClass.division})` : ''} · ` : ''}
            {monthLabel(selectedMonth)}
          </Text>
        </View>
        {saveState === 'saving' && (
          <View style={styles.savePill}><ActivityIndicator size="small" color={C.primary} /><Text style={styles.savePillText}>Saving</Text></View>
        )}
        {saveState === 'error' && (
          <TouchableOpacity style={[styles.savePill, { backgroundColor: C.primarySoft }]} onPress={() => flush()} activeOpacity={0.8}>
            <Feather name="alert-circle" size={12} color={C.primary} /><Text style={styles.savePillText}>Retry</Text>
          </TouchableOpacity>
        )}
        {saveState === 'idle' && syncing && <ActivityIndicator size="small" color={C.primary} />}
        <View style={styles.headerCountBadge}>
          <Feather name="users" size={12} color={C.primary} />
          <Text style={styles.headerCountText}>{totalCount > rows.length ? `${rows.length}/${totalCount}` : rows.length}</Text>
        </View>
        <TouchableOpacity style={styles.headerInfoBtn} onPress={() => setShowLegendModal(true)} activeOpacity={0.7}>
          <Feather name="info" size={16} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filterSection}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1.25 }}>
            <Text style={styles.inputLabel}>CLASS</Text>
            <TouchableOpacity style={styles.selectBtn} onPress={() => setShowClassSheet(true)} activeOpacity={0.85}>
              <Text style={styles.selectText} numberOfLines={1}>
                {selectedClass ? `${selectedClass.className}${selectedClass.division ? ` (${selectedClass.division})` : ''}` : 'Select class'}
              </Text>
              <Feather name="chevron-down" size={16} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>MONTH</Text>
            <View style={styles.monthStepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => changeMonth(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}>
                <Feather name="chevron-left" size={18} color={C.text} />
              </TouchableOpacity>
              <Text style={styles.monthText} numberOfLines={1}>{monthLabel(selectedMonth, 'short')}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => changeMonth(1)} disabled={!canGoNext} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
                <Feather name="chevron-right" size={18} color={canGoNext ? C.text : C.textFaint} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Feather name="search" size={16} color={C.textFaint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search name or roll no..."
              placeholderTextColor={C.textFaint}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x-circle" size={15} color={C.textFaint} />
              </TouchableOpacity>
            )}
          </View>
          {hasPermission('create') && (
            <TouchableOpacity style={styles.markBtn} onPress={openDailyModal} activeOpacity={0.9} disabled={rows.length === 0}>
              <Feather name="edit" size={14} color="#fff" />
              <Text style={styles.markBtnText}>Mark Daily</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Inline notice banner */}
      {notice && (
        <View style={[styles.notice, notice.type === 'error' ? styles.noticeError : notice.type === 'success' ? styles.noticeSuccess : styles.noticeInfo]}>
          <Feather
            name={notice.type === 'error' ? 'alert-circle' : notice.type === 'success' ? 'check-circle' : 'info'}
            size={15}
            color={notice.type === 'error' ? C.primary : notice.type === 'success' ? C.green : C.blue}
          />
          <Text style={styles.noticeText} numberOfLines={3}>{notice.message}</Text>
          <TouchableOpacity onPress={() => setNotice(null)}><Feather name="x" size={15} color={C.textMuted} /></TouchableOpacity>
        </View>
      )}

      {/* Matrix */}
      {loading ? (
        <View style={styles.skeletonContainer}>
          {Array.from({ length: 9 }).map((_, i) => <SkeletonRow key={i} index={i} />)}
        </View>
      ) : loadError ? (
        <View style={styles.emptyState}>
          <Feather name="wifi-off" size={40} color={C.textFaint} />
          <Text style={styles.emptyTitle}>Couldn't load attendance</Text>
          <Text style={styles.emptySubtitle}>{loadError}</Text>
          <TouchableOpacity
            style={[styles.saveBtnFull, { marginTop: 18, paddingHorizontal: 28 }]}
            onPress={() => (classes.length === 0 ? bootstrap() : loadGrid(selectedClassId, selectedMonth, 'initial'))}
            activeOpacity={0.9}
          >
            <Text style={styles.saveBtnFullText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="users" size={40} color={C.textFaint} />
          <Text style={styles.emptyTitle}>No students found</Text>
          <Text style={styles.emptySubtitle}>There are no students linked to this class.</Text>
        </View>
      ) : filteredRows.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="user-x" size={40} color={C.textFaint} />
          <Text style={styles.emptyTitle}>No matches found</Text>
          <Text style={styles.emptySubtitle}>No student matches "{searchQuery}". Try a different name or roll number.</Text>
          <TouchableOpacity style={[styles.uploadChooseBtn, { marginTop: 16 }]} onPress={() => setSearchQuery('')}>
            <Text style={styles.uploadChooseBtnText}>Clear search</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.matrixContainer}>
          <Animated.ScrollView
            horizontal
            bounces={false}
            showsHorizontalScrollIndicator
            onScroll={onHorizontalScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ width: totalWidth }}
            nestedScrollEnabled
          >
            <View style={{ width: totalWidth, flex: 1 }}>
              {/* Header row (sticky corner follows horizontal scroll) */}
              <View style={styles.headerRow}>
                <Animated.View style={[styles.stickyHeaderCell, { width: stickyColWidth, transform: [{ translateX: scrollX }] }]}>
                  <Text style={styles.matrixHeaderTitle}>STUDENT PROFILE</Text>
                </Animated.View>

                {dayMetas.map(m => {
                  const selected = selectedStatDate === m.dateStr;
                  return (
                    <TouchableOpacity
                      key={m.day}
                      activeOpacity={0.7}
                      onPress={() => setSelectedStatDate(prev => (prev === m.dateStr ? null : m.dateStr))}
                      style={[
                        styles.headerDayCell, { width: dayCellWidth },
                        m.isSun && styles.sunBg,
                        m.isToday && styles.todayBg,
                        selected && { backgroundColor: C.primary },
                      ]}
                    >
                      <Text style={[styles.headerDayText, selected && { color: '#fff' }]}>{m.day}</Text>
                      {m.isSun && <Text style={[styles.headerSunText, selected && { color: '#fff' }]}>SUN</Text>}
                      {m.isToday && !selected && <View style={styles.todayDot} />}
                      {!ALLOW_FUTURE_DATES && m.isFuture && <Feather name="lock" size={8} color={C.textFaint} style={{ marginTop: 2 }} />}
                    </TouchableOpacity>
                  );
                })}

                {[
                  { l: 'P', c: C.green, bg: C.greenSoft, w: SUMMARY_COL_W },
                  { l: 'A', c: C.primary, bg: C.primarySoft, w: SUMMARY_COL_W },
                  { l: 'L', c: C.amber, bg: C.amberSoft, w: SUMMARY_COL_W },
                  { l: 'H', c: C.slate, bg: C.slateSoft, w: SUMMARY_COL_W },
                  { l: '%', c: C.blue, bg: C.blueSoft, w: SUMMARY_PCT_W },
                ].map(s => (
                  <View key={s.l} style={[styles.headerDayCell, { width: s.w, backgroundColor: s.bg }]}>
                    <Text style={[styles.headerDayText, { color: s.c }]}>{s.l}</Text>
                  </View>
                ))}
              </View>

              <FlatList
                data={filteredRows}
                keyExtractor={keyExtractor}
                renderItem={renderRow}
                getItemLayout={getItemLayout}
                style={{ width: totalWidth, flex: 1 }}
                contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
               
                initialNumToRender={8}
                maxToRenderPerBatch={7}
                windowSize={5}
                updateCellsBatchingPeriod={16}
          
                removeClippedSubviews={Platform.OS === 'android'}
                onEndReached={onEndReached}
                onEndReachedThreshold={0.4}
                ListFooterComponent={ListFooter}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} />}
              />
            </View>
          </Animated.ScrollView>
        </View>
      )}

      {/* FAB (Excel actions) */}
      {!loading && fabOpen && <TouchableOpacity style={styles.fabBackdrop} activeOpacity={1} onPress={closeFab} />}
      {!loading && rows.length + classes.length > 0 && (
        <View style={[styles.fabWrap, { bottom: 22 + insets.bottom }]} pointerEvents="box-none">
          {fabOpen && (
            <View style={styles.fabActions}>
              <TouchableOpacity style={styles.fabActionRow} activeOpacity={0.85} onPress={() => { closeFab(); setShowUploadModal(true); }}>
                <View style={styles.fabLabelChip}><Text style={styles.fabLabelText}>Upload Excel</Text></View>
                <View style={[styles.fabMini, { backgroundColor: C.primary }]}><Feather name="upload" size={17} color="#fff" /></View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.fabActionRow} activeOpacity={0.85}
                disabled={exporting || rows.length === 0}
                onPress={() => { closeFab(); downloadFormattedMonthlyExcel(); }}
              >
                <View style={styles.fabLabelChip}><Text style={styles.fabLabelText}>{exporting ? 'Exporting…' : 'Full Month Excel'}</Text></View>
                <View style={[styles.fabMini, { backgroundColor: C.green }]}>
                  {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="file-text" size={17} color="#fff" />}
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.fabActionRow} activeOpacity={0.85} onPress={() => { closeFab(); downloadSampleAttendanceTemplate(); }}>
                <View style={styles.fabLabelChip}><Text style={styles.fabLabelText}>Download Format</Text></View>
                <View style={[styles.fabMini, { backgroundColor: C.blue }]}><Feather name="download" size={17} color="#fff" /></View>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity style={styles.fabMain} onPress={toggleFab} activeOpacity={0.9}>
            {fabOpen ? <Text style={{ color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 30 }}>×</Text> : <Feather name="grid" size={22} color="#fff" />}
          </TouchableOpacity>
        </View>
      )}

      {/* SHEET: Class picker */}
      <Modal visible={showClassSheet} animationType="slide" transparent onRequestClose={() => setShowClassSheet(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowClassSheet(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheetCard, { paddingBottom: 18 + insets.bottom, maxHeight: '70%' }]} onPress={() => { }}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.editModalTitle, { marginBottom: 10 }]}>Select Class</Text>
            <FlatList
              data={availableClasses}
              keyExtractor={c => c._id}
              renderItem={({ item }) => {
                const active = item._id === selectedClassId;
                return (
                  <TouchableOpacity style={[styles.classItem, active && styles.classItemActive]} onPress={() => selectClass(item._id)} activeOpacity={0.8}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.classItemTitle, active && { color: C.primary }]}>
                        {item.className}{item.division ? ` (Div ${item.division})` : ''}
                      </Text>
                      <Text style={styles.classItemSub}>Teacher: {item.classTeacher?.name || 'Unassigned'}</Text>
                    </View>
                    {active && <Feather name="check" size={18} color={C.primary} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.emptySubtitle}>No classes available.</Text>}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* SHEET: Day stats */}
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

      {/* MODAL: Legend */}
      <Modal visible={showLegendModal} animationType="fade" transparent onRequestClose={() => setShowLegendModal(false)}>
        <TouchableOpacity style={styles.modalOverlayCenter} activeOpacity={1} onPress={() => setShowLegendModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.editModalCard, SHADOW.raised]} onPress={() => { }}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>How marking works</Text>
              <TouchableOpacity onPress={() => setShowLegendModal(false)}><Feather name="x" size={18} color={C.textMuted} /></TouchableOpacity>
            </View>
            <View style={styles.legendRow}><View style={styles.cellBoxActive}><Feather name="check" size={12} color="#fff" /></View><Text style={styles.legendText}>Checked — Present</Text></View>
            <View style={styles.legendRow}><View style={[styles.cellBoxEmpty, styles.cellBoxAbsent]} /><Text style={styles.legendText}>Red-tinted empty — Absent</Text></View>
            <View style={styles.legendRow}><View style={styles.cellBoxEmpty} /><Text style={styles.legendText}>Empty — not marked yet</Text></View>
            <View style={styles.legendRow}><View style={styles.cellBoxSun}><Text style={styles.cellBoxSunText}>SUN</Text></View><Text style={styles.legendText}>Sunday — tap to mark Present if working</Text></View>
            {(['Leave', 'Half-Day', 'Holiday'] as Status[]).map(st => (
              <View key={st} style={styles.legendRow}>
                <View style={[styles.statusPill, { backgroundColor: STATUS_META[st].bg, borderColor: STATUS_META[st].color + '33' }]}>
                  <Text style={[styles.statusPillText, { color: STATUS_META[st].color }]}>{STATUS_META[st].abbr}</Text>
                </View>
                <Text style={styles.legendText}>{STATUS_META[st].label}</Text>
              </View>
            ))}
            <Text style={styles.legendHint}>
              Tap a cell to toggle Present/Absent — taps save automatically, even if you tap quickly. Long-press to set Leave, Half-Day or Holiday. Tap a date in the header to see that day's totals.
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* MODAL: Mark Daily Attendance */}
      <Modal visible={isDailyModalVisible} animationType="slide" transparent onRequestClose={() => setDailyModalVisible(false)}>
        <SafeAreaView style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fullModalContainer}>
            <View style={styles.formHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="check-circle" size={18} color="#fff" />
                <Text style={styles.formTitle}>Mark Daily Attendance{selectedClass?.className ? ` (${selectedClass.className})` : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => setDailyModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.dailyConfigBar}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={styles.inputLabel}>ATTENDANCE DATE *</Text>
                <TouchableOpacity style={styles.selectBtn} onPress={() => setShowDailyDatePicker(true)}>
                  <Text style={styles.selectText}>{formatToYMD(dailyDate)}</Text>
                  <Feather name="calendar" size={14} color={C.textMuted} />
                </TouchableOpacity>
                {!ALLOW_FUTURE_DATES && <Text style={styles.helperText}>Future dates can't be selected</Text>}
                {showDailyDatePicker && (
                  <DateTimePicker
                    value={dailyDate}
                    mode="date"
                    display="default"
                    maximumDate={ALLOW_FUTURE_DATES ? undefined : new Date()}
                    onChange={(e: any, d?: Date) => {
                      setShowDailyDatePicker(Platform.OS === 'ios');
                      if (e?.type === 'dismissed' || !d) return;
                      const clamped = !ALLOW_FUTURE_DATES && formatToYMD(d) > todayStr ? new Date() : d;
                      setDailyDate(clamped);
                      setDailyDraft(buildDraft(formatToYMD(clamped)));
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>QUICK ACTIONS</Text>
                <View style={styles.quickActionsRow}>
                  <TouchableOpacity style={[styles.quickActionBtn, { backgroundColor: C.greenSoft, borderColor: C.green + '40' }]} onPress={() => markAllDaily('Present')} activeOpacity={0.85}>
                    <Feather name="check-circle" size={14} color={C.green} /><Text style={[styles.quickActionText, { color: C.green }]}>All Present</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.quickActionBtn, { backgroundColor: C.primarySoft, borderColor: C.primary + '40' }]} onPress={() => markAllDaily('Absent')} activeOpacity={0.85}>
                    <Feather name="x-circle" size={14} color={C.primary} /><Text style={[styles.quickActionText, { color: C.primary }]}>All Absent</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.dailySearchWrap}>
              <View style={styles.searchContainer}>
                <Feather name="search" size={16} color={C.textFaint} />
                <TextInput style={styles.searchInput} placeholder="Find a student to mark..." placeholderTextColor={C.textFaint} value={dailySearch} onChangeText={setDailySearch} autoCorrect={false} />
              </View>
              <Text style={styles.dailyCountText}>{presentInDraft} Present · {rows.length - presentInDraft} Absent / other</Text>
            </View>

            <FlatList
              data={dailyFilteredRows}
              keyExtractor={r => r.key}
              extraData={dailyDraft}
              contentContainerStyle={{ padding: 16, paddingTop: 4 }}
              initialNumToRender={16}
              maxToRenderPerBatch={16}
              windowSize={7}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isPresent = dailyDraft[item.key] === 'Present';
                const other = dailyDraft[item.key] && dailyDraft[item.key] !== 'Present' && dailyDraft[item.key] !== 'Absent'
                  ? STATUS_META[dailyDraft[item.key]] : null;
                return (
                  <TouchableOpacity style={styles.dailyStudentRow} activeOpacity={0.7} onPress={() => toggleDailyPresent(item.key)}>
                    <StudentAvatar photo={item.photo} name={item.name} size={38} tint={isPresent ? C.green : C.textFaint} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.marksStudentName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.marksStudentRoll}>Roll {item.rollNo}</Text>
                    </View>
                    <View style={styles.presentCheckboxWrap}>
                      <Text style={[styles.presentCheckboxLabel, { color: isPresent ? C.green : other ? other.color : C.textFaint }]}>
                        {isPresent ? 'Present' : other ? other.label : 'Absent'}
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
              <TouchableOpacity style={[styles.saveBtnFull, { minWidth: 150 }]} onPress={handleSaveDaily} disabled={saving} activeOpacity={0.9}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnFullText}>Save Attendance</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* MODAL: Edit single status */}
      <Modal visible={isSingleEditModalVisible} animationType="fade" transparent onRequestClose={() => setSingleEditModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.editModalCard, SHADOW.raised]}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Edit Attendance</Text>
              <TouchableOpacity onPress={() => setSingleEditModalVisible(false)}><Feather name="x" size={18} color={C.textMuted} /></TouchableOpacity>
            </View>
            {singleEditData && (
              <>
                <View style={styles.editModalInfo}>
                  <StudentAvatar photo={singleEditData.row.photo} name={singleEditData.row.name} size={34} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.editModalName} numberOfLines={1}>{singleEditData.row.name}</Text>
                    <Text style={styles.editModalDate}>{formatPretty(singleEditData.dateStr)} · Roll {singleEditData.row.rollNo}</Text>
                  </View>
                </View>
                <View style={styles.editStatusGrid}>
                  {STATUS_ORDER.map(st => {
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
                <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveSingleEdit} activeOpacity={0.9}>
                  <Text style={styles.saveBtnFullText}>Update Status</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL: Upload monthly Excel */}
      <Modal visible={showUploadModal} animationType="fade" transparent onRequestClose={() => !uploading && setShowUploadModal(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.editModalCard, SHADOW.raised]}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Upload Monthly Attendance</Text>
              <TouchableOpacity onPress={() => !uploading && setShowUploadModal(false)}><Feather name="x" size={18} color={C.textMuted} /></TouchableOpacity>
            </View>
            <Text style={styles.uploadInfoText}>
              Upload an Excel file with the monthly attendance for{' '}
              <Text style={{ fontWeight: '800', color: C.text }}>{selectedClass?.className || 'this class'}</Text>
              {' '}({monthLabel(selectedMonth)}). Use "Download blank format" if you need a template.
            </Text>

            <View style={styles.uploadDropZone}>
              <Feather name="upload-cloud" size={30} color={C.primary} />
              <Text style={styles.uploadDropTitle}>Select Excel / CSV File</Text>
              <Text style={styles.uploadDropSubtitle}>.xlsx, .xls, .csv supported</Text>
              <TouchableOpacity style={styles.uploadChooseBtn} onPress={handleUploadExcel} disabled={uploading} activeOpacity={0.85}>
                {uploading ? <ActivityIndicator size="small" color={C.primary} /> : <Text style={styles.uploadChooseBtnText}>Choose File</Text>}
              </TouchableOpacity>
            </View>

            {uploadProgress && (
              <View style={{ marginBottom: 14 }}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {uploadProgress.done} / {uploadProgress.total} students{uploadProgress.failed > 0 ? ` · ${uploadProgress.failed} failed` : ''}
                </Text>
              </View>
            )}

            <TouchableOpacity style={[styles.excelActionBtn, { borderColor: C.green, alignSelf: 'center', marginBottom: 10 }]} onPress={downloadSampleAttendanceTemplate} activeOpacity={0.85} disabled={uploading}>
              <Feather name="download" size={13} color={C.green} />
              <Text style={[styles.excelActionText, { color: C.green }]}>Download blank format</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowUploadModal(false)} disabled={uploading}>
              <Text style={styles.ghostBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ────────────────────────────── Styles ────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, ...SHADOW.soft,
  },
  headerIconBadge: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.primary + '22' },
  title: { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: 0.1 },
  subtitle: { fontSize: 11.5, color: C.textMuted, marginTop: 1 },
  headerCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.primary + '22' },
  headerCountText: { fontSize: 12, fontWeight: '800', color: C.primary },
  headerInfoBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  savePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surfaceSunken, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 16 },
  savePillText: { fontSize: 11, fontWeight: '800', color: C.primary },

  filterSection: { backgroundColor: C.surface, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: C.border, ...SHADOW.soft },
  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, marginBottom: 6, letterSpacing: 0.5 },
  selectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  selectText: { fontSize: 13, color: C.text, fontWeight: '600', flexShrink: 1 },
  monthStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.border, borderRadius: 12, height: 46, backgroundColor: C.surfaceSoft, paddingHorizontal: 4 },
  stepBtn: { width: 32, height: 38, justifyContent: 'center', alignItems: 'center' },
  monthText: { fontSize: 13, color: C.text, fontWeight: '700', flexShrink: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13, color: C.text, paddingVertical: 0 },
  markBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 16, height: 46, borderRadius: 12, gap: 6, ...SHADOW.card },
  markBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },

  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  noticeError: { backgroundColor: C.primarySoft, borderColor: C.primary + '33' },
  noticeSuccess: { backgroundColor: C.greenSoft, borderColor: C.green + '33' },
  noticeInfo: { backgroundColor: C.blueSoft, borderColor: C.blue + '33' },
  noticeText: { flex: 1, fontSize: 12, color: C.text, fontWeight: '600' },

  skeletonContainer: { flex: 1, backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 14 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT, borderBottomWidth: 1, borderColor: C.border },
  skeletonAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.surfaceSunken },
  skeletonLineWide: { width: '55%', height: 10, borderRadius: 5, backgroundColor: C.surfaceSunken, marginBottom: 8 },
  skeletonLineNarrow: { width: '30%', height: 8, borderRadius: 4, backgroundColor: C.surfaceSunken },
  skeletonPillGroup: { flexDirection: 'row', gap: 6 },
  skeletonPill: { width: 20, height: 20, borderRadius: 6, backgroundColor: C.surfaceSunken },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center', lineHeight: 18 },

  footerLoader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  footerLoaderText: { fontSize: 11.5, color: C.textMuted, fontWeight: '600' },

  /* Matrix */
  matrixContainer: { flex: 1, backgroundColor: C.surface },
  headerRow: { flexDirection: 'row', height: HEADER_HEIGHT, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSoft },
  stickyHeaderCell: { zIndex: 20, height: HEADER_HEIGHT, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: C.surfaceSoft, borderRightWidth: 1, borderColor: C.border },
  matrixHeaderTitle: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5 },
  headerDayCell: { height: HEADER_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: C.border },
  headerDayText: { fontSize: 12, fontWeight: '800', color: C.text },
  headerSunText: { fontSize: 8, fontWeight: '800', color: C.primary, marginTop: 2 },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.primary, marginTop: 3 },

  dataRow: { flexDirection: 'row', height: ROW_HEIGHT, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  stickyCell: {
    zIndex: 10, height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    backgroundColor: C.surface, borderRightWidth: 1, borderColor: C.border, borderLeftWidth: 3,
    shadowColor: '#0F172A', shadowOffset: { width: 3, height: 0 }, shadowOpacity: 0.06, shadowRadius: 5,
  },
  studentName: { fontSize: 12.5, fontWeight: '700', color: C.text },
  studentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  studentRoll: { fontSize: 10, color: C.textMuted, flexShrink: 1 },
  pctBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  studentPct: { fontSize: 10, fontWeight: '800' },

  dayCell: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  sunBg: { backgroundColor: C.slateSoft },
  todayBg: { backgroundColor: C.todayTint },
  futureBg: { backgroundColor: C.futureBg },
  cellBoxActive: { width: 24, height: 24, borderRadius: 7, backgroundColor: C.green, justifyContent: 'center', alignItems: 'center' },
  cellBoxEmpty: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.6, borderColor: C.border, backgroundColor: C.surfaceSoft },
  cellBoxAbsent: { borderColor: C.primary + '55', backgroundColor: C.primarySoft },
  cellBoxSun: { width: 26, height: 24, borderRadius: 7, borderWidth: 1.4, borderStyle: 'dashed', borderColor: '#FCA5A5', backgroundColor: 'rgba(239,68,68,0.05)', justifyContent: 'center', alignItems: 'center' },
  cellBoxSunText: { fontSize: 8, fontWeight: '800', color: '#EF4444' },
  statusPill: { width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  statusPillText: { fontSize: 10, fontWeight: '800' },
  sumCell: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: C.border },
  sumText: { fontSize: 12, fontWeight: '800' },

  /* FAB */
  fabBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(13,15,22,0.28)' },
  fabWrap: { position: 'absolute', right: 18, alignItems: 'flex-end' },
  fabMain: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', ...SHADOW.fab },
  fabActions: { marginBottom: 14, gap: 12, alignItems: 'flex-end' },
  fabActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fabLabelChip: { backgroundColor: C.text, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, ...SHADOW.soft },
  fabLabelText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  fabMini: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', ...SHADOW.card },

  /* Sheets */
  sheetOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  sheetCard: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, ...SHADOW.raised },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 14 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  statsScopeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statsScopeText: { fontSize: 12, fontWeight: '800', color: C.primaryDark },
  statsClearBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center' },
  statCard: { minWidth: 92, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'flex-start' },
  statCardTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statValue: { fontSize: 17, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 10.5, color: C.textMuted, fontWeight: '700', marginTop: 3, letterSpacing: 0.2 },

  classItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  classItemActive: { backgroundColor: C.primarySoft },
  classItemTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  classItemSub: { fontSize: 11.5, color: C.textMuted, marginTop: 2 },

  /* Legend */
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  legendText: { fontSize: 13, color: C.text, fontWeight: '600', flex: 1 },
  legendHint: { fontSize: 11.5, color: C.textMuted, lineHeight: 17, marginTop: 6, fontWeight: '500' },

  /* Modals & forms */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)' },
  fullModalContainer: { flex: 1, backgroundColor: C.surface, marginTop: 40, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', ...SHADOW.raised },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.primary },
  formTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  dailyConfigBar: { flexDirection: 'row', padding: 16, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderColor: C.border },
  quickActionsRow: { flexDirection: 'row', gap: 8, height: 46 },
  quickActionBtn: { flex: 1, flexDirection: 'row', gap: 6, borderRadius: 11, borderWidth: 1.2, justifyContent: 'center', alignItems: 'center' },
  quickActionText: { fontSize: 11.5, fontWeight: '800' },
  helperText: { fontSize: 10, color: C.textFaint, marginTop: 5, fontWeight: '600' },
  dailySearchWrap: { paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  dailyCountText: { fontSize: 11.5, color: C.textMuted, fontWeight: '700' },
  dailyStudentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: C.border },
  marksStudentName: { fontSize: 14, fontWeight: '700', color: C.text },
  marksStudentRoll: { fontSize: 11.5, color: C.textMuted, marginTop: 2 },
  presentCheckboxWrap: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  presentCheckboxLabel: { fontSize: 11.5, fontWeight: '800', minWidth: 52, textAlign: 'right' },
  checkboxBox: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.6, borderColor: C.border, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center' },
  checkboxBoxActive: { backgroundColor: C.green, borderColor: C.green },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: 16, borderTopWidth: 1, borderColor: C.border, backgroundColor: C.surface },

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

  uploadInfoText: { fontSize: 11.5, color: C.textMuted, lineHeight: 18, marginBottom: 16 },
  uploadDropZone: { alignItems: 'center', borderWidth: 1.4, borderStyle: 'dashed', borderColor: C.border, borderRadius: 16, paddingVertical: 26, backgroundColor: C.surfaceSoft, marginBottom: 16 },
  uploadDropTitle: { fontSize: 13.5, fontWeight: '800', color: C.text, marginTop: 8 },
  uploadDropSubtitle: { fontSize: 11, color: C.textFaint, marginTop: 3, marginBottom: 14 },
  uploadChooseBtn: { borderWidth: 1.4, borderColor: C.primary, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 9, minWidth: 120, alignItems: 'center' },
  uploadChooseBtnText: { fontSize: 12.5, fontWeight: '800', color: C.primary },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: C.surfaceSunken, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: C.primary },
  progressText: { fontSize: 11.5, color: C.textMuted, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  excelActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1.4, ...SHADOW.soft },
  excelActionText: { fontSize: 11.5, fontWeight: '800' },

  ghostBtn: { paddingVertical: 10, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  ghostBtnText: { color: C.textMuted, fontSize: 14, fontWeight: '700' },
  saveBtnFull: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 12, justifyContent: 'center', alignItems: 'center', ...SHADOW.card },
  saveBtnFullText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
});