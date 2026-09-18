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
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  Platform,
  LayoutAnimation,
  UIManager,
  Animated,
  PanResponder,
} from 'react-native';
import { API_BASE } from '../../network/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import axios from 'axios';
import XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import DateTimePicker from '@react-native-community/datetimepicker';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const C = {
  bg: '#F6F6F9',
  surface: '#FFFFFF',
  surfaceSoft: '#FBFBFD',
  surfaceSunken: '#F1F2F6',
  border: '#E8E9EF',
  borderStrong: '#DBDDE6',
  text: '#12172B', textMuted: '#5D6478', textFaint: '#9AA0B4',

  primary: '#B3122A',
  primaryBright: '#D2263F',
  primaryDeep: '#7A0C1D',
  primarySoft: '#FBEEEF',
  primaryTint: '#F3D6D9',

  ink: '#0D0F16',
  inkSoft: '#181B24',

  gold: '#C7A466',
  goldSoft: 'rgba(199,164,102,0.14)',

  blue: '#0EA5E9',
  blueSoft: '#E7F6FE',
  green: '#0F9D6B',
  greenDeep: '#0B7C55',
  greenSoft: '#E6F8F1',
  slate: '#475467',
  slateSoft: '#F1F3F7',
};

const BRAND_GRADIENT = [C.primary, C.primaryDeep];
const GREEN_GRADIENT = [C.green, C.greenDeep];

const SHADOW_SM = { elevation: 1, shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } };
const SHADOW_MD = { elevation: 3, shadowColor: '#0F172A', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } };
const SHADOW_LG = { elevation: 6, shadowColor: '#0F172A', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } };
const SHADOW_BRAND = { elevation: 4, shadowColor: C.primary, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } };
const SHADOW_GREEN = { elevation: 4, shadowColor: C.green, shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } };

// --- Types ---
interface Staff {
  _id: string;
  staffId: string;
  name: string;
  staffType: string;
}

interface AttendanceRecord {
  staffId: string;
  status: 'Present' | 'Absent';
  remarks: string;
}

type SavedState = 'idle' | 'saving' | 'saved' | 'unsaved' | 'error';

const getInitials = (name: string) => (name || '?').trim().charAt(0).toUpperCase();

// Debounce hook
function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function AttendanceScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'Daily' | 'Calendar'>('Daily');

  // Data States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceRecord>>({});
  const [savedState, setSavedState] = useState<Record<string, SavedState>>({});

  // Daily View States
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [bulkAction, setBulkAction] = useState<'present' | 'absent' | 'clear' | null>(null);

  // Calendar View States
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  // Modals
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [staffSelectorVisible, setStaffSelectorVisible] = useState(false);
  const [dateSelectorVisible, setDateSelectorVisible] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);

  // FAB Drag & Drop State
  const [fabOpen, setFabOpen] = useState(false);
  const pan = useRef(new Animated.ValueXY()).current;
  const panVal = useRef({ x: 0, y: 0 });

  useEffect(() => {
    pan.addListener((value) => { panVal.current = value; });
    return () => { pan.removeAllListeners(); };
  }, [pan]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        pan.setOffset({ x: panVal.current.x, y: panVal.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      }
    })
  ).current;

  const toggleFab = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFabOpen(o => !o);
  }, []);

  const closeFab = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFabOpen(false);
  }, []);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchInitialData(token);
  };

  const fetchInitialData = async (token: string | null, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const schoolsRes = await axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } });
      if (schoolsRes.data?.success && schoolsRes.data.data.length > 0) {
        setActiveSchoolId(schoolsRes.data.data[0]._id);
      }

      const staffRes = await axios.get(`${API_BASE}/staff`, { headers: { Authorization: `Bearer ${token}` } });
      const staff = staffRes.data?.data || [];
      setStaffList(staff);

      setSelectedStaff(prev => prev || (staff.length > 0 ? staff[0] : null));

      const initialAttendance: Record<string, AttendanceRecord> = {};
      const initialSaved: Record<string, SavedState> = {};
      staff.forEach((s: Staff) => {
        initialAttendance[s._id] = { staffId: s._id, status: 'Absent', remarks: '' };
        initialSaved[s._id] = 'idle';
      });
      setAttendanceData(initialAttendance);
      setSavedState(initialSaved);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => fetchInitialData(authToken, true), [authToken]);

  const filteredStaffList = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter(s => s.name?.toLowerCase().includes(q) || s.staffId?.toLowerCase().includes(q));
  }, [staffList, debouncedSearch]);

  const totalStaff = staffList.length;
  const presentCount = useMemo(
    () => staffList.filter(s => attendanceData[s._id]?.status === 'Present').length,
    [staffList, attendanceData]
  );
  const absentCount = totalStaff - presentCount;

  const saveStaffRecord = useCallback(async (staffId: string, overrides?: Partial<AttendanceRecord>) => {
    if (!activeSchoolId) {
      Alert.alert('Error', 'School Branch ID not found. Please pull to refresh.');
      return false;
    }
    const record = { ...attendanceData[staffId], ...(overrides || {}) };
    if (!record) return false;

    setSavedState(prev => ({ ...prev, [staffId]: 'saving' }));
    try {
      const payload = {
        schoolId: activeSchoolId,
        staffId: record.staffId,
        date: selectedDate,
        status: record.status,
        remarks: record.remarks || '',
      };
      await axios.post(`${API_BASE}/attendance`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
      setSavedState(prev => ({ ...prev, [staffId]: 'saved' }));
      return true;
    } catch (e: any) {
      setSavedState(prev => ({ ...prev, [staffId]: 'error' }));
      Alert.alert('Error', e.response?.data?.message || 'Failed to save attendance.');
      return false;
    }
  }, [activeSchoolId, attendanceData, authToken, selectedDate]);

  const toggleAttendance = useCallback((staffId: string) => {
    setAttendanceData(prev => {
      const current = prev[staffId];
      const nextStatus: AttendanceRecord['status'] = current.status === 'Present' ? 'Absent' : 'Present';
      const updated = { ...current, status: nextStatus };
      saveStaffRecord(staffId, { status: nextStatus });
      return { ...prev, [staffId]: updated };
    });
  }, [saveStaffRecord]);

  const updateRemarks = useCallback((staffId: string, text: string) => {
    setAttendanceData(prev => ({ ...prev, [staffId]: { ...prev[staffId], remarks: text } }));
    setSavedState(prev => ({ ...prev, [staffId]: 'unsaved' }));
  }, []);

  const saveRemarks = useCallback((staffId: string) => {
    saveStaffRecord(staffId);
  }, [saveStaffRecord]);

  const markAll = async (status: 'Present' | 'Absent') => {
    if (staffList.length === 0) return;
    setBulkAction(status === 'Present' ? 'present' : 'absent');
    setAttendanceData(prev => {
      const next = { ...prev };
      staffList.forEach(s => { next[s._id] = { ...next[s._id], status }; });
      return next;
    });
    setSavedState(prev => {
      const next = { ...prev };
      staffList.forEach(s => { next[s._id] = 'saving'; });
      return next;
    });
    try {
      await Promise.allSettled(staffList.map(s => saveStaffRecord(s._id, { status })));
    } finally {
      setBulkAction(null);
    }
  };

  const clearAll = () => {
    if (staffList.length === 0) return;
    Alert.alert(
      'Clear all attendance?',
      `This resets all ${staffList.length} staff to Absent and clears remarks for ${selectedDate}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setBulkAction('clear');
            setAttendanceData(prev => {
              const next = { ...prev };
              staffList.forEach(s => { next[s._id] = { staffId: s._id, status: 'Absent', remarks: '' }; });
              return next;
            });
            setSavedState(prev => {
              const next = { ...prev };
              staffList.forEach(s => { next[s._id] = 'saving'; });
              return next;
            });
            try {
              await Promise.allSettled(staffList.map(s => saveStaffRecord(s._id, { status: 'Absent', remarks: '' })));
            } finally {
              setBulkAction(null);
            }
          },
        },
      ]
    );
  };

  const handleDateChange = (event: any, selected?: Date) => {
    if (Platform.OS === 'android') {
      setDateSelectorVisible(false);
    }
    if (event.type === 'dismissed') return;
    if (selected) {
      const yyyy = selected.getFullYear();
      const mm = String(selected.getMonth() + 1).padStart(2, '0');
      const dd = String(selected.getDate()).padStart(2, '0');
      setSelectedDate(`${yyyy}-${mm}-${dd}`);
    }
  };

  const getSelectedDateObj = () => {
    const d = new Date(selectedDate);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const downloadSampleAttendanceTemplate = async () => {
    if (staffList.length === 0) {
      Alert.alert('Nothing to export', 'There are no staff members to include in the template.');
      return;
    }
    setIsDownloading(true);
    try {
      const headers = ['Staff ID', 'Staff Name', 'Date (YYYY-MM-DD)', 'Status (Present/Absent)', 'Remarks'];
      const rows: any[][] = [headers];
      staffList.forEach(s => {
        rows.push([s.staffId || 'N/A', s.name, selectedDate, 'Present', 'Regular Shift']);
      });

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 22 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Staff Attendance');
      const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

      const fileName = `Staff_Attendance_Template_${selectedDate}.xlsx`;
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
    } finally {
      setIsDownloading(false);
    }
  };

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

    if (!activeSchoolId) {
      Alert.alert('Missing info', 'School Branch ID not found. Please pull to refresh.');
      return;
    }

    setIsUploading(true);
    try {
      const base64 = await RNFS.readFile(picked.uri, 'base64');
      const workbook = XLSX.read(base64, { type: 'base64' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet);

      const records: any[] = [];
      jsonRows.forEach(row => {
        const staffCode = String(row['Staff ID'] ?? row['staffId'] ?? row['Staff Id'] ?? '').trim();
        const name = String(row['Staff Name'] ?? row['staffName'] ?? row['Name'] ?? '').trim();
        if (!staffCode && !name) return;

        const matched = staffList.find(s => s.staffId === staffCode || s.name === name);
        const rawStatus = String(row['Status (Present/Absent)'] ?? row['Status'] ?? row['status'] ?? '').trim();
        const normalized = /^p/i.test(rawStatus) ? 'Present' : 'Absent';
        const rowDate = String(row['Date (YYYY-MM-DD)'] ?? row['Date'] ?? row['date'] ?? selectedDate).trim();
        const remarks = String(row['Remarks'] ?? row['remarks'] ?? '').trim();

        records.push({
          staffId: matched?._id || staffCode,
          staffCode,
          name,
          date: rowDate,
          status: normalized,
          remarks,
        });
      });

      if (records.length === 0) {
        Alert.alert('No data found', 'No valid attendance rows were found in the selected file.');
        return;
      }

      await axios.post(
        `${API_BASE}/attendance/staff/bulk`,
        { schoolId: activeSchoolId, records },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      Alert.alert('Success', 'Attendance data uploaded successfully!');
      setUploadModalVisible(false);
      onRefresh();
    } catch (err: any) {
      console.error('Upload failed:', err?.response?.data || err?.message);
      Alert.alert('Import failed', err?.response?.data?.message || err?.response?.data?.error || 'Failed to parse or import the attendance file.');
    } finally {
      setIsUploading(false);
    }
  };

  const renderDailyCard = ({ item }: { item: Staff }) => {
    const record = attendanceData[item._id];
    if (!record) return null;

    const isPresent = record.status === 'Present';
    const statusColor = isPresent ? C.green : C.textFaint;
    const state = savedState[item._id] || 'idle';

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.staffInfo}>
            <View style={[styles.avatar, { backgroundColor: isPresent ? C.greenSoft : C.slateSoft }]}>
              <Text style={[styles.avatarText, { color: isPresent ? C.greenDeep : C.textMuted }]}>{getInitials(item.name)}</Text>
            </View>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.staffName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.staffId}>ID: {item.staffId || 'N/A'} · {item.staffType}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.attendancePill, isPresent ? styles.attendancePillPresent : styles.attendancePillAbsent]}
            onPress={() => toggleAttendance(item._id)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, isPresent && styles.checkboxActive]}>
              {isPresent && <Feather name="check" size={14} color="#fff" />}
            </View>
            <Text style={[styles.attendancePillText, { color: statusColor }]}>{isPresent ? 'Present' : 'Absent'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.remarksRow}>
          <View style={styles.remarksInputWrap}>
            <Feather name="edit-3" size={13} color={C.textFaint} />
            <TextInput
              style={styles.remarksInput}
              placeholder="Optional remarks..."
              placeholderTextColor={C.textFaint}
              value={record.remarks}
              onChangeText={t => updateRemarks(item._id, t)}
              onBlur={() => { if (state === 'unsaved') saveRemarks(item._id); }}
            />
          </View>

          {state === 'saving' ? (
            <View style={styles.savedBadgeNeutral}><ActivityIndicator size="small" color={C.textMuted} /></View>
          ) : state === 'unsaved' ? (
            <TouchableOpacity style={styles.saveIconBtn} onPress={() => saveRemarks(item._id)} activeOpacity={0.8}>
              <Feather name="save" size={14} color="#fff" />
            </TouchableOpacity>
          ) : state === 'error' ? (
            <View style={styles.savedBadgeError}><Feather name="alert-circle" size={11} color={C.primary} /><Text style={styles.savedBadgeErrorText}>Retry</Text></View>
          ) : state === 'saved' ? (
            <View style={styles.savedBadgeGood}><Feather name="check" size={11} color={C.green} /><Text style={styles.savedBadgeGoodText}>Saved</Text></View>
          ) : (
            <View style={styles.savedBadgeNeutral}><Text style={styles.savedBadgeNeutralText}>—</Text></View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerGlow} pointerEvents="none" />
        <View style={styles.headerRow}>
          <View style={styles.headerIconRing}>
            <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerIconBadge}>
              <Feather name="users" size={18} color="#fff" />
            </LinearGradient>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Staff Attendance</Text>
            <Text style={styles.subtitle} numberOfLines={1}>Manage all teaching/non-teaching staff members.</Text>
          </View>
          <TouchableOpacity style={styles.headerInfoBtn} onPress={() => setShowLegendModal(true)} activeOpacity={0.75}>
            <Feather name="info" size={16} color={C.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerAccentBar} />
      </View>

      <View style={styles.tabContainerWrapper}>
        <View style={styles.toggleContainer}>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'Daily' && styles.toggleBtnActive]} onPress={() => setViewMode('Daily')} activeOpacity={0.85}>
            <Feather name="list" size={14} color={viewMode === 'Daily' ? '#fff' : C.textMuted} />
            <Text style={[styles.toggleText, viewMode === 'Daily' && styles.toggleTextActive]}>Daily List</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'Calendar' && styles.toggleBtnActive]} onPress={() => setViewMode('Calendar')} activeOpacity={0.85}>
            <Feather name="calendar" size={14} color={viewMode === 'Calendar' ? '#fff' : C.textMuted} />
            <Text style={[styles.toggleText, viewMode === 'Calendar' && styles.toggleTextActive]}>Calendar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {viewMode === 'Daily' && (
        <View style={styles.filterSection}>
          <View style={styles.dateSearchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.filterLabel}>DATE</Text>
              <TouchableOpacity style={styles.datePickerBtn} onPress={() => setDateSelectorVisible(true)} activeOpacity={0.85}>
                <Text style={styles.dateValue} numberOfLines={1}>{selectedDate}</Text>
                <View style={styles.dateIconBadge}><Feather name="calendar" size={12} color={C.primary} /></View>
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1.2 }}>
              <Text style={styles.filterLabel}>SEARCH</Text>
              <View style={styles.searchContainer}>
                <Feather name="search" size={14} color={C.textFaint} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Name or ID..."
                  placeholderTextColor={C.textFaint}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Feather name="x-circle" size={15} color={C.textFaint} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <View style={styles.bulkActionsRow}>
            <TouchableOpacity activeOpacity={0.88} onPress={() => markAll('Present')} disabled={!!bulkAction} style={{ flex: 1 }}>
              <LinearGradient colors={GREEN_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bulkBtnFill, SHADOW_GREEN]}>
                {bulkAction === 'present' ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check-circle" size={14} color="#fff" />}
                <Text style={styles.bulkBtnFillText}>All Present</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bulkBtnOutline, { flex: 1 }]} onPress={() => markAll('Absent')} disabled={!!bulkAction} activeOpacity={0.85}>
              {bulkAction === 'absent' ? <ActivityIndicator size="small" color={C.primary} /> : <Feather name="x-circle" size={14} color={C.primary} />}
              <Text style={styles.bulkBtnOutlineText}>All Absent</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkBtnClear} onPress={clearAll} disabled={!!bulkAction} activeOpacity={0.85}>
              {bulkAction === 'clear' ? <ActivityIndicator size="small" color={C.slate} /> : <Feather name="rotate-ccw" size={14} color={C.slate} />}
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Feather name="users" size={12} color={C.textMuted} />
              <Text style={styles.statChipText}>Total: {totalStaff}</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: C.greenSoft }]}>
              <Feather name="check-circle" size={12} color={C.green} />
              <Text style={[styles.statChipText, { color: C.greenDeep }]}>Present: {presentCount}</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: C.primarySoft }]}>
              <Feather name="x-circle" size={12} color={C.primary} />
              <Text style={[styles.statChipText, { color: C.primary }]}>Absent: {absentCount}</Text>
            </View>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : viewMode === 'Daily' ? (
        filteredStaffList.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="users" size={36} color={C.textFaint} />
            <Text style={styles.emptyTitle}>{searchQuery ? 'No matches found' : 'No staff found'}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredStaffList}
            keyExtractor={(item) => item._id}
            renderItem={renderDailyCard}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} />}
          />
        )
      ) : (
        <ScrollView style={styles.calScrollView}>
          <View style={styles.calFilters}>
            <View style={styles.calFilterBox}>
              <Text style={styles.filterLabel}>SELECT STAFF</Text>
              <TouchableOpacity style={styles.dropdownStyle} onPress={() => setStaffSelectorVisible(true)} activeOpacity={0.85}>
                <Text style={styles.dropdownText} numberOfLines={1}>{selectedStaff ? `${selectedStaff.name} (${selectedStaff.staffId})` : '- Choose Staff -'}</Text>
                <View style={styles.chevronBadge}><Feather name="chevron-down" size={14} color={C.textMuted} /></View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.calendarContainer}>
            <View style={styles.calHeaderRow}>
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => <Text key={d} style={styles.calDayHeader}>{d}</Text>)}
            </View>
            <View style={styles.calGrid}>
              <View style={styles.calCellEmpty} /><View style={styles.calCellEmpty} />
              {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                <View key={day} style={styles.calCell}>
                  <Text style={styles.calCellDate}>{day}</Text>
                  <Text style={styles.calCellRecord}>No Record</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Movable Floating action button */}
      {!loading && (
        <Animated.View 
          style={[styles.fabWrap, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]} 
          pointerEvents="box-none"
        >
          {fabOpen && (
            <View style={styles.fabActions}>
              <TouchableOpacity style={styles.fabActionRow} activeOpacity={0.85} onPress={() => { closeFab(); setUploadModalVisible(true); }}>
                <View style={styles.fabLabelChip}><Text style={styles.fabLabelText}>Upload Excel</Text></View>
                <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fabMini, SHADOW_BRAND]}>
                  <Feather name="upload" size={17} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={styles.fabActionRow} activeOpacity={0.85} disabled={isDownloading} onPress={() => { closeFab(); downloadSampleAttendanceTemplate(); }}>
                <View style={styles.fabLabelChip}><Text style={styles.fabLabelText}>{isDownloading ? 'Preparing…' : 'Download Format'}</Text></View>
                <LinearGradient colors={GREEN_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fabMini, SHADOW_GREEN]}>
                  {isDownloading ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="download" size={17} color="#fff" />}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
          <Animated.View {...panResponder.panHandlers}>
            <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fabMain, SHADOW_BRAND]}>
              <TouchableOpacity onPress={toggleFab} activeOpacity={0.9} style={styles.fabMainTouchable}>
                <Feather name={fabOpen ? 'x' : 'grid'} size={22} color="#fff" />
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      )}

      {/* --- MODALS --- */}
      <Modal visible={showLegendModal} transparent animationType="fade" onRequestClose={() => setShowLegendModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowLegendModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.legendCard} onPress={() => {}}>
            <View style={styles.uploadHeader}>
              <Text style={styles.uploadTitle}>How marking works</Text>
              <TouchableOpacity onPress={() => setShowLegendModal(false)}><Feather name="x" size={18} color={C.textMuted} /></TouchableOpacity>
            </View>
            <View style={styles.legendRow}><View style={[styles.checkbox, styles.checkboxActive]}><Feather name="check" size={11} color="#fff" /></View><Text style={styles.legendText}>Present — tap the row to check</Text></View>
            <View style={styles.legendRow}><View style={styles.checkbox} /><Text style={styles.legendText}>Absent — unchecked / default</Text></View>
            <Text style={styles.uploadDesc}>Add a remark any time — the disk icon appears while it's unsaved, then a green "Saved" badge confirms it. Use All Present / All Absent for the whole list, or the reset icon to clear everything back to Absent.</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Native Calendar Picker Modal */}
      {dateSelectorVisible && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" onRequestClose={() => setDateSelectorVisible(false)}>
          <View style={styles.bottomSheetOverlay}>
            <View style={styles.iosDatePickerBar}>
              <View style={styles.iosDatePickerHeader}>
                <Text style={styles.iosDatePickerTitle}>Select Date</Text>
                <TouchableOpacity onPress={() => setDateSelectorVisible(false)}>
                  <Text style={styles.iosDatePickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={getSelectedDateObj()}
                mode="date"
                display="inline"
                onChange={handleDateChange}
              />
            </View>
          </View>
        </Modal>
      )}
      {dateSelectorVisible && Platform.OS !== 'ios' && (
        <DateTimePicker
          value={getSelectedDateObj()}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}

      <Modal visible={uploadModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.uploadBox}>
            <View style={styles.uploadHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.uploadHeaderIconBadge}><Feather name="file-text" size={18} color={C.green} /></View>
                <Text style={styles.uploadTitle}>Upload Attendance</Text>
              </View>
              <TouchableOpacity onPress={() => setUploadModalVisible(false)}><Feather name="x" size={18} color={C.textMuted} /></TouchableOpacity>
            </View>
            <Text style={styles.uploadDesc}>Upload an Excel file to bulk mark attendance for {selectedDate}. Download the format first so your columns match.</Text>

            <TouchableOpacity style={styles.dragDropZone} onPress={handleUploadExcel} disabled={isUploading} activeOpacity={0.85}>
              {isUploading ? (
                <ActivityIndicator size="large" color={C.primary} />
              ) : (
                <>
                  <View style={styles.uploadIconCircle}><Feather name="upload-cloud" size={28} color={C.primary} /></View>
                  <Text style={styles.dragText}>Select Excel File</Text>
                  <Text style={styles.dragSub}>Tap to browse from device</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.downloadFormatOutline}
              onPress={downloadSampleAttendanceTemplate}
              disabled={isDownloading}
              activeOpacity={0.85}
            >
              {isDownloading ? <ActivityIndicator size="small" color={C.green} /> : <Feather name="download" size={13} color={C.green} />}
              <Text style={styles.downloadFormatOutlineText}>Download blank format</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelUploadBtn} onPress={() => setUploadModalVisible(false)}>
              <Text style={styles.cancelUploadText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={staffSelectorVisible} transparent animationType="slide">
        <View style={styles.bottomSheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.bsHeader}>
              <Text style={styles.bsTitle}>Select a Staff Member</Text>
              <TouchableOpacity onPress={() => setStaffSelectorVisible(false)}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <FlatList
              data={staffList}
              keyExtractor={item => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.bsItem} onPress={() => { setSelectedStaff(item); setStaffSelectorVisible(false); }}>
                  <Text style={styles.bsItemText}>{item.name} ({item.staffId})</Text>
                </TouchableOpacity>
              )}
            />
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

  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, backgroundColor: C.surface, overflow: 'hidden' },
  headerGlow: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(179, 18, 42, 0.03)', top: -100, right: -50 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconRing: { width: 46, height: 46, borderRadius: 15, padding: 2, justifyContent: 'center', alignItems: 'center' },
  headerIconBadge: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: 0.2 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2, fontWeight: '500' },
  headerInfoBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surfaceSunken, justifyContent: 'center', alignItems: 'center' },
  headerAccentBar: { height: 2, width: 40, backgroundColor: C.primary, borderRadius: 2, marginTop: 14 },

  tabContainerWrapper: { backgroundColor: C.surface, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border, ...SHADOW_SM },
  toggleContainer: { flexDirection: 'row', backgroundColor: C.surfaceSunken, borderRadius: 13, padding: 4 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 6 },
  toggleBtnActive: { backgroundColor: C.primary, ...SHADOW_BRAND },
  toggleText: { fontSize: 12.5, fontWeight: '700', color: C.textMuted },
  toggleTextActive: { color: '#fff' },

  filterSection: { backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, borderBottomWidth: 1, borderColor: C.border, ...SHADOW_SM },
  filterLabel: { fontSize: 10.5, fontWeight: '800', color: C.textMuted, marginBottom: 7, letterSpacing: 0.5, textTransform: 'uppercase' },

  dateSearchRow: { flexDirection: 'row', gap: 10 },
  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surfaceSoft, paddingHorizontal: 10, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: C.border },
  dateValue: { fontSize: 12.5, fontWeight: '700', color: C.text },
  dateIconBadge: { width: 24, height: 24, borderRadius: 6, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 10, height: 46 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 12.5, color: C.text, fontWeight: '500' },

  bulkActionsRow: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'stretch' },
  bulkBtnFill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 12 },
  bulkBtnFillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  bulkBtnOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.surface, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: C.primary },
  bulkBtnOutlineText: { color: C.primary, fontSize: 12, fontWeight: '800' },
  bulkBtnClear: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.surfaceSunken, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: C.border },

  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surfaceSoft, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 },
  statChipText: { fontSize: 11.5, fontWeight: '800', color: C.textMuted },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 10 },

  listContent: { padding: 16, paddingBottom: 110 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border, ...SHADOW_MD },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 },
  staffInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800' },
  staffName: { fontSize: 14, fontWeight: '700', color: C.text },
  staffId: { fontSize: 11, color: C.textMuted, marginTop: 2, fontWeight: '500' },

  attendancePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, gap: 8, borderWidth: 1.5 },
  attendancePillPresent: { backgroundColor: C.greenSoft, borderColor: '#BFE9D6' },
  attendancePillAbsent: { backgroundColor: C.surfaceSunken, borderColor: C.border },
  attendancePillText: { fontSize: 12, fontWeight: '800' },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.6, borderColor: C.borderStrong, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: C.green, borderColor: C.green },

  remarksRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  remarksInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surfaceSoft, borderWidth: 1.5, borderColor: C.border, borderRadius: 11, paddingHorizontal: 10, height: 42 },
  remarksInput: { flex: 1, fontSize: 12.5, color: C.text, fontWeight: '500' },
  saveIconBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', ...SHADOW_BRAND },
  savedBadgeGood: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.greenSoft, paddingHorizontal: 9, height: 27, borderRadius: 14 },
  savedBadgeGoodText: { fontSize: 10.5, fontWeight: '800', color: C.greenDeep },
  savedBadgeError: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primarySoft, paddingHorizontal: 9, height: 27, borderRadius: 14 },
  savedBadgeErrorText: { fontSize: 10.5, fontWeight: '800', color: C.primary },
  savedBadgeNeutral: { minWidth: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  savedBadgeNeutralText: { fontSize: 12, color: C.textFaint, fontWeight: '700' },

  // Movable Floating action button 
  fabWrap: { position: 'absolute', right: 18, bottom: 90, alignItems: 'flex-end', zIndex: 999 },
  fabMain: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  fabMainTouchable: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  fabActions: { marginBottom: 14, gap: 12, alignItems: 'flex-end' },
  fabActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fabLabelChip: { backgroundColor: C.ink, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, ...SHADOW_SM },
  fabLabelText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  fabMini: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

  calScrollView: { flex: 1 },
  calFilters: { flexDirection: 'row', padding: 16, gap: 12 },
  calFilterBox: { flex: 1 },
  dropdownStyle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 48 },
  dropdownText: { fontSize: 13.5, color: C.text, fontWeight: '600', flex: 1 },
  chevronBadge: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.surfaceSunken, justifyContent: 'center', alignItems: 'center' },
  calendarContainer: { margin: 16, backgroundColor: C.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, ...SHADOW_MD },
  calHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 10, marginBottom: 10 },
  calDayHeader: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: C.textMuted },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCellEmpty: { width: '14.28%', height: 70 },
  calCell: { width: '14.28%', height: 70, borderRightWidth: 1, borderBottomWidth: 1, borderColor: C.border, padding: 4, alignItems: 'center' },
  calCellDate: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 4 },
  calCellRecord: { fontSize: 8, color: C.textFaint, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(13,15,22,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  legendCard: { backgroundColor: C.surface, width: '100%', borderRadius: 20, padding: 20, ...SHADOW_LG },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  legendText: { fontSize: 13, color: C.text, fontWeight: '600' },

  uploadBox: { backgroundColor: C.surface, width: '100%', borderRadius: 20, padding: 20, ...SHADOW_LG },
  uploadHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  uploadHeaderIconBadge: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.greenSoft, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  uploadTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  uploadDesc: { fontSize: 12.5, color: C.textMuted, lineHeight: 19, marginBottom: 18 },
  dragDropZone: { borderWidth: 1.6, borderColor: C.border, borderStyle: 'dashed', borderRadius: 16, padding: 26, alignItems: 'center', backgroundColor: C.surfaceSoft, marginBottom: 14 },
  uploadIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  dragText: { fontSize: 14.5, fontWeight: '800', color: C.text },
  dragSub: { fontSize: 11.5, color: C.textFaint, marginTop: 3 },
  downloadFormatOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.4, borderColor: C.green, borderRadius: 20, paddingVertical: 10, marginBottom: 8 },
  downloadFormatOutlineText: { fontSize: 12, fontWeight: '800', color: C.green },
  cancelUploadBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelUploadText: { color: C.textMuted, fontWeight: '700', fontSize: 13.5 },

  bottomSheetOverlay: { flex: 1, backgroundColor: 'rgba(13,15,22,0.55)', justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, ...SHADOW_LG },
  bsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 16 },
  bsTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  bsItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.surfaceSoft },
  bsItemText: { fontSize: 14.5, color: C.text, fontWeight: '600' },

  iosDatePickerBar: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30, ...SHADOW_LG },
  iosDatePickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderColor: C.border },
  iosDatePickerTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  iosDatePickerDone: { fontSize: 16, fontWeight: '800', color: C.primary },
});