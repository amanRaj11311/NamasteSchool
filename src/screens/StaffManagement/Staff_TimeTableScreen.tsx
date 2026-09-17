import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  TextInput,
  useWindowDimensions,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import * as XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { pick, types as DocTypes, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import RNPrint from 'react-native-print';
import DateTimePicker from '@react-native-community/datetimepicker';
import { API_BASE } from '../../network/api';
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ALL_STAFF_ID = 'ALL_STAFF';
const BRAND = '#B3122A';

interface Permission {
  module: string;
  action: string;
}

interface Staff {
  _id: string;
  staffId: string;
  name: string;
  staffType: string;
}

interface SchoolClass {
  _id: string;
  className: string;
  division?: string;
  syllabus?: string;
}

interface SchoolSubject {
  _id: string;
  name: string;
  nickname?: string;
  code?: string;
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
  classId?: {
    _id: string;
    className: string;
    division?: string;
    syllabus?: string;
  };
  subjectId?: {
    _id: string;
    name: string;
  } | null;
  staffId: {
    _id: string;
    name: string;
    staffType: string;
  };
}

const ALL_STAFF_OPTION: Staff = {
  _id: ALL_STAFF_ID,
  staffId: '',
  name: 'ALL STAFF MEMBERS',
  staffType: 'Master Overview',
};

const EMPTY_FORM = {
  day: 'Monday',
  periodNumber: '',
  subjectId: '',
  subjectName: '',
  startTime: '',
  endTime: '',
  classId: '',
  className: '',
  roomNumber: '',
};
const formatTime = (date: Date) => {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minutesStr} ${ampm}`;
};

const parseTimeToDate = (timeStr: string) => {
  const d = new Date();
  d.setSeconds(0, 0);
  if (!timeStr) return d;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return d;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ap = match[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  d.setHours(h, m, 0, 0);
  return d;
};

// ============================================================
// SCREEN
// ============================================================
export default function TimetableScreen({ route }: any) {
  const { width } = useWindowDimensions();
  const isNarrow = width < 380;
  const isVeryNarrow = width < 340;

  // --- Auth / permissions ---
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // --- Data ---
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [classList, setClassList] = useState<SchoolClass[]>([]);
  const [subjectList, setSubjectList] = useState<SchoolSubject[]>([]);
  const [timetableData, setTimetableData] = useState<TimetablePeriod[]>([]);

  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>('Monday');
  const [viewMode, setViewMode] = useState<'Day' | 'Grid'>('Day');

  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  // --- Modals ---
  const [staffSelectorVisible, setStaffSelectorVisible] = useState(false);
  const [classSelectorVisible, setClassSelectorVisible] = useState(false);
  const [subjectSelectorVisible, setSubjectSelectorVisible] = useState(false);
  const [printMenuVisible, setPrintMenuVisible] = useState(false);
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [timePickerFor, setTimePickerFor] = useState<'start' | 'end' | null>(null);

  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const initialStaffId = route?.params?.staffId || null;

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const permsRaw = await AsyncStorage.getItem('userPermissions');
      const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');

      if (permsRaw) {
        try {
          setPermissions(JSON.parse(permsRaw));
        } catch {
          setPermissions([]);
        }
      }
      setIsSuperAdmin(superAdminRaw === 'true');
      setAuthToken(token);

      fetchClasses(token);
      fetchSubjects(token);
      fetchStaffList(token);
    } catch {
      setLoading(false);
    }
  };

  // --- Classes ---
  const fetchClasses = async (token: string | null) => {
    try {
      const res = await axios.get(`${API_BASE}/classes`, { headers: { Authorization: `Bearer ${token}` } });
      setClassList(res.data?.data || []);
    } catch {
      setClassList([]);
    }
  };

  // --- Subjects ---
  const fetchSubjects = async (token: string | null) => {
    try {
      const res = await axios.get(`${API_BASE}/subjects`, { headers: { Authorization: `Bearer ${token}` } });
      setSubjectList(res.data?.data || []);
    } catch {
      setSubjectList([]);
    }
  };

  // --- Staff ---
  const fetchStaffList = async (token: string | null) => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/staff`, { headers: { Authorization: `Bearer ${token}` } });
      const staff: Staff[] = res.data?.data || [];
      setStaffList(staff);

      let targetStaff: Staff | undefined = staff[0];
      if (initialStaffId) {
        const found = staff.find((s: Staff) => s._id === initialStaffId);
        if (found) targetStaff = found;
      }

      if (targetStaff) {
        setSelectedStaff(targetStaff);
        fetchTimetable(token, targetStaff._id);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  // --- Timetable ---
  const fetchTimetable = async (token: string | null, staffId: string, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const url = staffId === ALL_STAFF_ID ? `${API_BASE}/timetable` : `${API_BASE}/timetable?staffId=${staffId}`;
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });

      setTimetableData(res.data?.success ? res.data?.data || [] : []);
    } catch {
      setTimetableData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    if (selectedStaff) fetchTimetable(authToken, selectedStaff._id, true);
  }, [authToken, selectedStaff]);

  const onSelectStaff = (staff: Staff) => {
    setSelectedStaff(staff);
    setStaffSelectorVisible(false);
    fetchTimetable(authToken, staff._id);
  };

  const onSelectClass = (cls: SchoolClass) => {
    setFormData((prev) => ({ ...prev, classId: cls._id, className: cls.className }));
    setClassSelectorVisible(false);
  };

  const onSelectSubject = (subj: SchoolSubject) => {
    setFormData((prev) => ({ ...prev, subjectId: subj._id, subjectName: subj.name }));
    setSubjectSelectorVisible(false);
  };

  // --- Permissions ---
  const hasPermission = useCallback(
    (action: string) => {
      if (isSuperAdmin) return true;
      return permissions.some((p) => (p.module === 'timetable' || p.module === 'staff') && p.action === action);
    },
    [permissions, isSuperAdmin],
  );

  // --- Add / Edit period ---
  const openAddModal = () => {
    setEditingPeriodId(null);
    setFormData({ ...EMPTY_FORM, day: selectedDay });
    setPeriodModalVisible(true);
  };

  const openEditModal = (period: TimetablePeriod) => {
    setEditingPeriodId(period._id);
    setFormData({
      day: period.day,
      periodNumber: period.periodNumber.toString(),
      subjectId: period.subjectId?._id || '',
      subjectName: period.subjectId?.name || period.subjectName || '',
      startTime: period.startTime || '',
      endTime: period.endTime || '',
      classId: period.classId?._id || '',
      className: period.classId?.className || period.className || '',
      roomNumber: period.roomNumber || '',
    });
    setPeriodModalVisible(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Period', 'Are you sure you want to delete this period slot?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/timetable/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            onRefresh();
          } catch {
            Alert.alert('Error', 'Failed to delete period.');
          }
        },
      },
    ]);
  };

  const savePeriod = async () => {
    if (!formData.periodNumber) {
      Alert.alert('Required', 'Period Number is required.');
      return;
    }
    if (!formData.classId) {
      Alert.alert('Required', 'Please select a Class.');
      return;
    }
    if (!formData.subjectId) {
      Alert.alert('Required', 'Please select a Subject.');
      return;
    }
    if (!selectedStaff || selectedStaff._id === ALL_STAFF_ID) {
      Alert.alert('Required', 'Please select a single staff member first.');
      return;
    }

    const payload = {
      day: formData.day,
      periodNumber: formData.periodNumber,
      subjectId: formData.subjectId,
      subjectName: formData.subjectName,
      startTime: formData.startTime,
      endTime: formData.endTime,
      roomNumber: formData.roomNumber,
      classId: formData.classId,
      staffId: selectedStaff._id,
    };

    try {
      if (editingPeriodId) {
        await axios.put(`${API_BASE}/timetable/${editingPeriodId}`, payload, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        Alert.alert('Success', 'Period updated.');
      } else {
        await axios.post(`${API_BASE}/timetable`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert('Success', 'Period added.');
      }
      setPeriodModalVisible(false);
      onRefresh();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save period.');
    }
  };

  // --- Time picker handler ---
  const onTimeChange = (event: any, date?: Date) => {
    const field = timePickerFor;
    setTimePickerFor(null);
    if (event.type === 'dismissed' || !date || !field) return;
    const formatted = formatTime(date);
    setFormData((prev) => ({ ...prev, [field === 'start' ? 'startTime' : 'endTime']: formatted }));
  };

  // ============================================================
  // EXCEL: DOWNLOAD FORMAT / EXPORT
  // ============================================================
  const EXCEL_COLUMNS = ['Day', 'Period Number', 'Subject Name', 'Start Time', 'End Time', 'Class Name', 'Room Number', 'Teacher Name'];

  const writeAndShareWorkbook = async (rows: any[], fileName: string) => {
    try {
      setBusyLabel('Preparing Excel file...');
      const ws = XLSX.utils.json_to_sheet(rows, { header: EXCEL_COLUMNS });
      ws['!cols'] = EXCEL_COLUMNS.map(() => ({ wch: 18 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Timetable');

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const path = `${RNFS.CachesDirectoryPath}/${fileName}`;
      await RNFS.writeFile(path, base64, 'base64');

      setBusyLabel(null);
      await Share.open({
        url: `file://${path}`,
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

  const downloadFormat = () => {
    const sampleRow = {
      Day: 'Monday',
      'Period Number': 1,
      'Subject Name': 'Mathematics',
      'Start Time': '08:00 AM',
      'End Time': '08:45 AM',
      'Class Name': classList[0]?.className || 'First',
      'Room Number': '101',
      'Teacher Name': selectedStaff?.name || '',
    };
    writeAndShareWorkbook([sampleRow], 'Timetable_Format.xlsx');
  };

  const exportToExcel = async () => {
    let rowsSource = timetableData;
    if (selectedStaff?._id !== ALL_STAFF_ID) {
      try {
        setBusyLabel('Fetching all staff timetable...');
        const res = await axios.get(`${API_BASE}/timetable`, { headers: { Authorization: `Bearer ${authToken}` } });
        rowsSource = res.data?.data || [];
      } catch {
        rowsSource = timetableData;
      }
    }

    const rows = rowsSource.map((p) => ({
      Day: p.day,
      'Period Number': p.periodNumber,
      'Subject Name': p.subjectId?.name || p.subjectName,
      'Start Time': p.startTime,
      'End Time': p.endTime,
      'Class Name': p.classId?.className || p.className,
      'Room Number': p.roomNumber,
      'Teacher Name': p.staffId?.name || '',
    }));

    writeAndShareWorkbook(rows, `Timetable_Export_${Date.now()}.xlsx`);
  };

  // ============================================================
  // EXCEL: UPLOAD -> real bulk endpoint, backend parses the file
  // ============================================================
  const handleUploadExcel = async () => {
    if (!selectedStaff || selectedStaff._id === ALL_STAFF_ID) {
      Alert.alert('Select a Staff Member', 'Please select a single staff member before uploading a timetable.');
      return;
    }
    try {
      const [picked] = await pick({
        type: [DocTypes.xlsx, DocTypes.xls],
        allowMultiSelection: false,
      });

      setBusyLabel('Uploading timetable...');

      const form = new FormData();
      form.append('file', {
        uri: picked.uri,
        name: picked.name ?? 'timetable.xlsx',
        type: picked.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      } as any);
      form.append('staffId', selectedStaff._id);

      await axios.post(`${API_BASE}/timetable/bulk`, form, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      setBusyLabel(null);
      Alert.alert('Success', 'Timetable uploaded successfully.');
      onRefresh();
    } catch (err: any) {
      setBusyLabel(null);
      const cancelled = isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED;
      if (!cancelled) {
        Alert.alert('Error', err.response?.data?.message || 'Could not upload the Excel file.');
      }
    }
  };

  // ============================================================
  // PRINT
  // ============================================================
  const buildGridHTML = (title: string, subtitle: string, periods: TimetablePeriod[]) => {
    const maxPeriod = periods.reduce((m, p) => Math.max(m, p.periodNumber || 0), 8);
    const periodCols = Array.from({ length: maxPeriod }, (_, i) => i + 1);

    const rows = DAYS_OF_WEEK.map((day) => {
      const cells = periodCols
        .map((pnum) => {
          const p = periods.find((x) => x.day === day && x.periodNumber === pnum);
          return `<td>${p ? `<strong>${p.subjectId?.name || p.subjectName}</strong><br/><span style="font-size:10px;color:#555">${p.staffId?.name || ''}</span>` : '-'}</td>`;
        })
        .join('');
      return `<tr><td><strong>${day}</strong></td>${cells}</tr>`;
    }).join('');

    const headerCols = periodCols.map((n) => `<th>Period ${n}</th>`).join('');

    return `
      <html><head><meta charset="utf-8" />
      <style>
        body { font-family: Helvetica, Arial, sans-serif; padding: 16px; }
        h2, h4 { text-align:center; margin:2px 0; }
        table { width:100%; border-collapse: collapse; margin-top:12px; }
        th, td { border:1px solid #999; padding:6px; font-size:11px; text-align:center; }
        th { background:#f3f4f6; }
      </style></head>
      <body>
        <h2>NAMASTE SCHOOL MANAGEMENT SYSTEM</h2>
        <h4>${title}</h4>
        <p style="text-align:center;font-size:11px;color:#555">${subtitle} | Printed: ${new Date().toLocaleDateString()}</p>
        <table><tr><th>Day</th>${headerCols}</tr>${rows}</table>
        <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px;">
          <span>Teacher's Signature: ____________________</span>
          <span>Principal's Signature: ____________________</span>
        </div>
      </body></html>`;
  };

  const printCurrentTeacher = async () => {
    setPrintMenuVisible(false);
    if (!selectedStaff) return;
    try {
      const html = buildGridHTML(`${selectedStaff.name}'s Timetable`, `Staff ID: ${selectedStaff.staffId || '-'}`, timetableData);
      await RNPrint.print({ html });
    } catch {
      Alert.alert('Error', 'Failed to open print dialog.');
    }
  };

  const printAllStaffBooklet = async () => {
    setPrintMenuVisible(false);
    try {
      setBusyLabel('Preparing booklet...');
      const res = await axios.get(`${API_BASE}/timetable`, { headers: { Authorization: `Bearer ${authToken}` } });
      const allPeriods: TimetablePeriod[] = res.data?.data || [];
      const html = buildGridHTML('SCHOOL MASTER TIMETABLE SCHEDULE (ALL STAFF)', 'Academic Year 2026', allPeriods);
      setBusyLabel(null);
      await RNPrint.print({ html });
    } catch {
      setBusyLabel(null);
      Alert.alert('Error', 'Failed to generate the booklet.');
    }
  };

  // --- Derived data ---
  const filteredPeriods = timetableData.filter((p) => p.day === selectedDay).sort((a, b) => a.periodNumber - b.periodNumber);
  const totalAssigned = timetableData.length;

  const periodsByDay = useMemo(() => {
    const map: Record<string, TimetablePeriod[]> = {};
    DAYS_OF_WEEK.forEach((d) => {
      map[d] = timetableData.filter((p) => p.day === d).sort((a, b) => a.periodNumber - b.periodNumber);
    });
    return map;
  }, [timetableData]);

  const staffListWithAll = [ALL_STAFF_OPTION, ...staffList];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <Feather name="calendar" size={24} color={BRAND} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>Staff Personal Timetable</Text>
            <Text style={styles.subtitle} numberOfLines={1}>Manage periods & weekly schedule</Text>
          </View>
        </View>
      </View>

      {/* Action Grid */}
      <View style={styles.actionGrid}>
        <TouchableOpacity style={[styles.actionCard, isNarrow && styles.actionCardNarrow]} onPress={downloadFormat}>
          <View style={[styles.actionIconWrap, { backgroundColor: '#ECFDF5' }]}>
            <Feather name="download" size={18} color="#10B981" />
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={styles.actionCardTitle} numberOfLines={1}>Download Format</Text>
            <Text style={styles.actionCardSub} numberOfLines={1}>Blank Excel template</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionCard, isNarrow && styles.actionCardNarrow]} onPress={handleUploadExcel}>
          <View style={[styles.actionIconWrap, { backgroundColor: '#FEF2F2' }]}>
            <Feather name="upload" size={18} color={BRAND} />
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={styles.actionCardTitle} numberOfLines={1}>Upload Excel</Text>
            <Text style={styles.actionCardSub} numberOfLines={1}>Bulk add periods</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionCard, isNarrow && styles.actionCardNarrow]} onPress={() => setPrintMenuVisible(true)}>
          <View style={[styles.actionIconWrap, { backgroundColor: '#F3F4F6' }]}>
            <Feather name="printer" size={18} color="#4B5563" />
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={styles.actionCardTitle} numberOfLines={1}>Print & Export</Text>
            <Text style={styles.actionCardSub} numberOfLines={1}>PDF / Excel</Text>
          </View>
          <Feather name="chevron-down" size={16} color="#9CA3AF" />
        </TouchableOpacity>

        {hasPermission('create') && (
          <TouchableOpacity style={[styles.actionCard, styles.actionCardPrimary, isNarrow && styles.actionCardNarrow]} onPress={openAddModal}>
            <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Feather name="plus" size={18} color="#fff" />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={[styles.actionCardTitle, { color: '#fff' }]} numberOfLines={1}>Add Period Slot</Text>
              <Text style={[styles.actionCardSub, { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>New class period</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BRAND]} />} showsVerticalScrollIndicator={false}>
        {/* Staff Selector & View Controls */}
        <View style={styles.controlSection}>
          <View style={styles.staffSelectorContainer}>
            <Text style={styles.label}>SELECT STAFF MEMBER</Text>
            <TouchableOpacity style={styles.staffDropdown} onPress={() => setStaffSelectorVisible(true)}>
              <View style={styles.staffDropdownInner}>
                <View style={styles.avatarMini}>
                  {selectedStaff?._id === ALL_STAFF_ID ? (
                    <Feather name="sun" size={12} color={BRAND} />
                  ) : (
                    <Text style={styles.avatarMiniText}>{selectedStaff?.name?.charAt(0) || 'A'}</Text>
                  )}
                </View>
                <Text style={styles.staffDropdownText} numberOfLines={1} ellipsizeMode="tail">
                  {selectedStaff
                    ? selectedStaff._id === ALL_STAFF_ID
                      ? 'ALL STAFF MEMBERS'
                      : `${selectedStaff.name} (${selectedStaff.staffId}) - ${selectedStaff.staffType}`
                    : 'SELECT STAFF'}
                </Text>
              </View>
              <Feather name="chevron-down" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.viewControlsContainer}>
            <Text style={styles.totalAssignedText} numberOfLines={1}>{totalAssigned} Total Periods</Text>
            <View style={[styles.viewToggleGroup, isVeryNarrow && styles.viewToggleGroupNarrow]}>
              <TouchableOpacity style={[styles.viewToggleBtn, viewMode === 'Day' && styles.viewToggleBtnActive]} onPress={() => setViewMode('Day')}>
                <Feather name="list" size={14} color={viewMode === 'Day' ? '#fff' : BRAND} />
                {!isVeryNarrow && <Text style={[styles.viewToggleText, viewMode === 'Day' && styles.viewToggleTextActive]}>Day View</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.viewToggleBtn, viewMode === 'Grid' && styles.viewToggleBtnActive]} onPress={() => setViewMode('Grid')}>
                <Feather name="grid" size={14} color={viewMode === 'Grid' ? '#fff' : BRAND} />
                {!isVeryNarrow && <Text style={[styles.viewToggleText, viewMode === 'Grid' && styles.viewToggleTextActive]}>Weekly Grid</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}><ActivityIndicator size="large" color={BRAND} /></View>
        ) : viewMode === 'Day' ? (
          <View style={styles.timetableBoard}>
            <View style={styles.tabsWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10 }}>
                {DAYS_OF_WEEK.map((day) => {
                  const count = periodsByDay[day].length;
                  const isActive = selectedDay === day;
                  return (
                    <TouchableOpacity key={day} style={[styles.dayTab, isActive && styles.dayTabActive]} onPress={() => setSelectedDay(day)}>
                      <Text style={[styles.dayTabText, isActive && styles.dayTabTextActive]}>{day}</Text>
                      <View style={[styles.dayTabBadge, isActive && styles.dayTabBadgeActive]}>
                        <Text style={[styles.dayTabBadgeText, isActive && styles.dayTabBadgeTextActive]}>{count}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.periodsContainer}>
              {filteredPeriods.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="calendar" size={30} color="#D1D5DB" />
                  <Text style={styles.emptyTitle}>No Classes Scheduled for {selectedDay}</Text>
                  <Text style={styles.emptySub}>Click "Add Period Slot" to assign a class to this staff member.</Text>
                  {hasPermission('create') && (
                    <TouchableOpacity style={styles.addPeriodOutlineBtn} onPress={openAddModal}>
                      <Feather name="plus" size={16} color={BRAND} />
                      <Text style={styles.addPeriodOutlineBtnText}>Add {selectedDay} Period</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.periodGrid}>
                  {filteredPeriods.map((period) => (
                    <View key={period._id} style={[styles.periodCard, isNarrow && styles.periodCardNarrow]}>
                      <View style={styles.periodHeader}>
                        <View style={styles.periodBadge}>
                          <Text style={styles.periodBadgeText}>Period {period.periodNumber}</Text>
                        </View>
                        <View style={styles.periodTimeContainer}>
                          <Feather name="clock" size={12} color="#6B7280" />
                          <Text style={styles.periodTime} numberOfLines={1}>{period.startTime} - {period.endTime}</Text>
                        </View>
                      </View>

                      <Text style={styles.subjectName} numberOfLines={2}>{period.subjectId?.name || period.subjectName}</Text>

                      <View style={styles.periodDetails}>
                        <View style={styles.detailRow}>
                          <Feather name="user" size={14} color="#6B7280" />
                          <Text style={styles.teacherName} numberOfLines={1}> Teacher: {period.staffId?.name || selectedStaff?.name}</Text>
                        </View>
                        <View style={[styles.detailRow, { marginTop: 5 }]}>
                          <Feather name="map-pin" size={14} color="#6B7280" />
                          <Text style={styles.teacherName} numberOfLines={1}> Class: {period.classId?.className || period.className} | {period.roomNumber}</Text>
                        </View>
                      </View>

                      <View style={styles.periodActions}>
                        {hasPermission('update') && (
                          <TouchableOpacity style={styles.pActionBtn} onPress={() => openEditModal(period)}>
                            <Feather name="edit" size={14} color={BRAND} />
                            <Text style={styles.pActionText}>Edit</Text>
                          </TouchableOpacity>
                        )}
                        {hasPermission('delete') && (
                          <TouchableOpacity style={styles.pActionBtn} onPress={() => handleDelete(period._id)}>
                            <Feather name="trash-2" size={14} color={BRAND} />
                            <Text style={styles.pActionText}>Delete</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.weeklyGrid}>
            <View style={styles.weeklyGridHeaderRow}>
              <Text style={[styles.weeklyGridHeaderText, styles.weeklyGridDayHeader]}>DAY</Text>
              <Text style={[styles.weeklyGridHeaderText, { flex: 1 }]}>ASSIGNED PERIODS & SCHEDULE</Text>
            </View>
            {DAYS_OF_WEEK.map((day) => {
              const dayPeriods = periodsByDay[day];
              return (
                <View key={day} style={styles.weeklyGridRow}>
                  <View style={styles.weeklyGridDayCol}>
                    <Text style={styles.weeklyGridDayText} numberOfLines={2}>{day}</Text>
                    <View style={styles.weeklyGridDayBadge}>
                      <Text style={styles.weeklyGridDayBadgeText}>{dayPeriods.length}</Text>
                    </View>
                  </View>
                  <View style={styles.weeklyGridPeriodsCol}>
                    {dayPeriods.length === 0 ? (
                      <Text style={styles.weeklyGridEmptyText}>No periods scheduled</Text>
                    ) : (
                      <View style={styles.weeklyGridPillsContainer}>
                        {dayPeriods.map((p) => (
                          <TouchableOpacity key={p._id} style={styles.weeklyGridPill} onPress={() => openEditModal(p)}>
                            <Text style={styles.weeklyGridPillTime} numberOfLines={1}>P{p.periodNumber} • {p.startTime} - {p.endTime}</Text>
                            <Text style={styles.weeklyGridPillSubject} numberOfLines={2}>{p.subjectId?.name || p.subjectName}</Text>
                            <Text style={styles.weeklyGridPillTeacher} numberOfLines={1}>Teacher: {p.staffId?.name || selectedStaff?.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Staff Selector Modal */}
      <Modal visible={staffSelectorVisible} transparent animationType="slide">
        <View style={styles.bottomSheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.bsHeader}>
              <Text style={styles.bsTitle}>Select Staff Member</Text>
              <TouchableOpacity onPress={() => setStaffSelectorVisible(false)}><Feather name="x" size={20} color="#4B5563" /></TouchableOpacity>
            </View>
            <FlatList
              data={staffListWithAll}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => {
                const isAll = item._id === ALL_STAFF_ID;
                const isSelected = selectedStaff?._id === item._id;
                return (
                  <TouchableOpacity style={[styles.bsItem, isAll && styles.bsItemAll, isSelected && styles.bsItemSelected]} onPress={() => onSelectStaff(item)}>
                    <View style={[styles.avatarMini, isAll && { backgroundColor: '#FEF3C7' }]}>
                      {isAll ? <Feather name="sun" size={12} color="#D97706" /> : <Text style={styles.avatarMiniText}>{item.name.charAt(0)}</Text>}
                    </View>
                    <Text style={[styles.bsItemText, isAll && { fontWeight: '800', color: '#92400E' }]} numberOfLines={2}>
                      {isAll ? 'ALL STAFF MEMBERS (Master Overview)' : `${item.name} (${item.staffId}) - ${item.staffType}`}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Class Selector Modal */}
      <Modal visible={classSelectorVisible} transparent animationType="slide">
        <View style={styles.bottomSheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.bsHeader}>
              <Text style={styles.bsTitle}>Select Class</Text>
              <TouchableOpacity onPress={() => setClassSelectorVisible(false)}><Feather name="x" size={20} color="#4B5563" /></TouchableOpacity>
            </View>
            {classList.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#9CA3AF', paddingVertical: 20 }}>No classes found.</Text>
            ) : (
              <FlatList
                data={classList}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => {
                  const isSelected = formData.classId === item._id;
                  return (
                    <TouchableOpacity style={[styles.bsItem, isSelected && styles.bsItemSelected]} onPress={() => onSelectClass(item)}>
                      <View style={styles.avatarMini}><Feather name="book-open" size={12} color={BRAND} /></View>
                      <Text style={styles.bsItemText} numberOfLines={1}>
                        {item.className}{item.division ? ` - ${item.division}` : ''}{item.syllabus ? ` (${item.syllabus})` : ''}
                      </Text>
                      {isSelected && <Feather name="check" size={18} color={BRAND} />}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Subject Selector Modal */}
      <Modal visible={subjectSelectorVisible} transparent animationType="slide">
        <View style={styles.bottomSheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.bsHeader}>
              <Text style={styles.bsTitle}>Select Subject</Text>
              <TouchableOpacity onPress={() => setSubjectSelectorVisible(false)}><Feather name="x" size={20} color="#4B5563" /></TouchableOpacity>
            </View>
            {subjectList.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#9CA3AF', paddingVertical: 20 }}>No subjects found.</Text>
            ) : (
              <FlatList
                data={subjectList}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => {
                  const isSelected = formData.subjectId === item._id;
                  return (
                    <TouchableOpacity style={[styles.bsItem, isSelected && styles.bsItemSelected]} onPress={() => onSelectSubject(item)}>
                      <View style={styles.avatarMini}><Feather name="book" size={12} color={BRAND} /></View>
                      <Text style={styles.bsItemText} numberOfLines={1}>
                        {item.name}{item.nickname ? ` (${item.nickname})` : ''}
                      </Text>
                      {isSelected && <Feather name="check" size={18} color={BRAND} />}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Print & Export Menu */}
      <Modal visible={printMenuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setPrintMenuVisible(false)} activeOpacity={1}>
          <View style={styles.menuDropdown}>
            <TouchableOpacity style={styles.menuItem} onPress={printCurrentTeacher}>
              <Feather name="printer" size={16} color="#374151" />
              <Text style={styles.menuItemText}>Print Current Teacher</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={printAllStaffBooklet}>
              <Feather name="book-open" size={16} color="#374151" />
              <Text style={styles.menuItemText}>Print All Staff Booklet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => { setPrintMenuVisible(false); exportToExcel(); }}>
              <Feather name="file-text" size={16} color="#10B981" />
              <Text style={[styles.menuItemText, { color: '#10B981' }]}>Export All to Excel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add / Edit Period Modal */}
      <Modal visible={periodModalVisible} transparent animationType="slide">
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.bottomSheet, { maxHeight: '90%' }]}>
            <View style={styles.bsHeader}>
              <Text style={styles.bsTitle}>{editingPeriodId ? 'Edit Period Slot' : 'Add Period Slot'}</Text>
              <TouchableOpacity onPress={() => setPeriodModalVisible(false)}><Feather name="x" size={20} color="#4B5563" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Day chips — replaces the old broken dropdown, no overlap issues */}
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Day of Week *</Text>
                <View style={styles.dayChipsRow}>
                  {DAYS_OF_WEEK.map((day) => {
                    const active = formData.day === day;
                    return (
                      <TouchableOpacity key={day} style={[styles.dayChip, active && styles.dayChipActive]} onPress={() => setFormData({ ...formData, day })}>
                        <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{day.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <Text style={styles.inputLabel}>Period Number *</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="1"
                    value={formData.periodNumber}
                    onChangeText={(t) => setFormData({ ...formData, periodNumber: t.replace(/[^0-9]/g, '') })}
                  />
                </View>
                <View style={styles.formHalfLast}>
                  <Text style={styles.inputLabel}>Room Number</Text>
                  <TextInput style={styles.input} value={formData.roomNumber} onChangeText={(t) => setFormData({ ...formData, roomNumber: t })} />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Class *</Text>
                <TouchableOpacity style={styles.classPickerBtn} onPress={() => setClassSelectorVisible(true)}>
                  <Feather name="book-open" size={16} color={formData.className ? BRAND : '#9CA3AF'} />
                  <Text style={[styles.classPickerText, !formData.className && { color: '#9CA3AF' }]} numberOfLines={1}>
                    {formData.className || 'Select a class'}
                  </Text>
                  <Feather name="chevron-right" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Subject *</Text>
                <TouchableOpacity style={styles.classPickerBtn} onPress={() => setSubjectSelectorVisible(true)}>
                  <Feather name="book" size={16} color={formData.subjectName ? BRAND : '#9CA3AF'} />
                  <Text style={[styles.classPickerText, !formData.subjectName && { color: '#9CA3AF' }]} numberOfLines={1}>
                    {formData.subjectName || 'Select a subject'}
                  </Text>
                  <Feather name="chevron-right" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <Text style={styles.inputLabel}>Start Time</Text>
                  <TouchableOpacity style={styles.input} onPress={() => setTimePickerFor('start')}>
                    <View style={styles.timeInputInner}>
                      <Text style={[styles.timeInputText, !formData.startTime && { color: '#9CA3AF' }]}>{formData.startTime || '08:00 AM'}</Text>
                      <Feather name="clock" size={15} color="#9CA3AF" />
                    </View>
                  </TouchableOpacity>
                </View>
                <View style={styles.formHalfLast}>
                  <Text style={styles.inputLabel}>End Time</Text>
                  <TouchableOpacity style={styles.input} onPress={() => setTimePickerFor('end')}>
                    <View style={styles.timeInputInner}>
                      <Text style={[styles.timeInputText, !formData.endTime && { color: '#9CA3AF' }]}>{formData.endTime || '08:45 AM'}</Text>
                      <Feather name="clock" size={15} color="#9CA3AF" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {timePickerFor && (
                <DateTimePicker
                  value={parseTimeToDate(timePickerFor === 'start' ? formData.startTime : formData.endTime)}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onTimeChange}
                />
              )}

              <TouchableOpacity style={styles.saveButton} onPress={savePeriod}>
                <Text style={styles.filledBtnText}>{editingPeriodId ? 'Update & Close' : 'Save & Close'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
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

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F9' },

  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerInner: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: '#fff' },
  actionCard: { width: '48%', minWidth: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 10, gap: 10, borderWidth: 1, borderColor: '#F0F1F3' },
  actionCardNarrow: { width: '100%' },
  actionCardPrimary: { backgroundColor: BRAND, borderColor: BRAND },
  actionIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  actionTextContainer: { flex: 1, minWidth: 0 },
  actionCardTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  actionCardSub: { fontSize: 10.5, color: '#9CA3AF', marginTop: 1 },

  controlSection: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  staffSelectorContainer: { width: '100%' },
  label: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', marginBottom: 6, letterSpacing: 0.5 },
  staffDropdown: { width: '100%', height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#F9FAFB' },
  staffDropdownInner: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  staffDropdownText: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600', color: '#111827' },
  avatarMini: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginRight: 8, flexShrink: 0 },
  avatarMiniText: { color: BRAND, fontSize: 10, fontWeight: 'bold' },

  viewControlsContainer: { width: '100%', marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalAssignedText: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '700', color: BRAND, marginRight: 10 },
  viewToggleGroup: { flexDirection: 'row', backgroundColor: '#FEE2E2', borderRadius: 8, padding: 3, flexShrink: 0 },
  viewToggleGroupNarrow: { padding: 2 },
  viewToggleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, gap: 4 },
  viewToggleBtnActive: { backgroundColor: BRAND },
  viewToggleText: { fontSize: 12, fontWeight: '700', color: BRAND },
  viewToggleTextActive: { color: '#fff' },

  loadingContainer: { padding: 50, alignItems: 'center' },

  timetableBoard: { marginTop: 16 },
  tabsWrapper: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#fff' },
  dayTab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: 'transparent', marginRight: 10 },
  dayTabActive: { borderBottomColor: BRAND },
  dayTabText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  dayTabTextActive: { color: BRAND },
  dayTabBadge: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  dayTabBadgeActive: { backgroundColor: '#FEE2E2' },
  dayTabBadgeText: { fontSize: 11, fontWeight: '700', color: '#4B5563' },
  dayTabBadgeTextActive: { color: BRAND },

  periodsContainer: { padding: 16 },
  periodGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  periodCard: { width: '48%', minWidth: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  periodCardNarrow: { width: '100%' },
  periodHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  periodBadge: { backgroundColor: BRAND, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  periodBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  periodTimeContainer: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginLeft: 8 },
  periodTime: { fontSize: 12, color: '#6B7280', fontWeight: '500', marginLeft: 4, flexShrink: 1 },
  subjectName: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 },
  periodDetails: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 12, marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  teacherName: { flex: 1, minWidth: 0, fontSize: 13, color: '#4B5563', fontWeight: '500', marginLeft: 6 },
  periodActions: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 16 },
  pActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pActionText: { fontSize: 13, fontWeight: '600', color: BRAND },

  emptyState: { alignItems: 'center', padding: 40, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 12, textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 4, marginBottom: 16 },
  addPeriodOutlineBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BRAND, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, gap: 6 },
  addPeriodOutlineBtnText: { color: BRAND, fontWeight: '600', fontSize: 13 },

  weeklyGrid: { margin: 16, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#F0F1F3', overflow: 'hidden' },
  weeklyGridHeaderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#F0F1F3' },
  weeklyGridHeaderText: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5 },
  weeklyGridDayHeader: { width: 82, marginRight: 8 },
  weeklyGridRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  weeklyGridDayCol: { width: 82, flexShrink: 0, marginRight: 8, alignItems: 'flex-start' },
  weeklyGridDayText: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 5 },
  weeklyGridDayBadge: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  weeklyGridDayBadgeText: { fontSize: 10, fontWeight: '700', color: '#4B5563' },
  weeklyGridPeriodsCol: { flex: 1, minWidth: 0 },
  weeklyGridEmptyText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', paddingTop: 4 },
  weeklyGridPillsContainer: { width: '100%' },
  weeklyGridPill: { width: '100%', backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: '#FEE2E2', marginBottom: 7 },
  weeklyGridPillTime: { fontSize: 10.5, fontWeight: '700', color: BRAND },
  weeklyGridPillSubject: { fontSize: 13, fontWeight: '800', color: '#111827', marginTop: 2 },
  weeklyGridPillTeacher: { fontSize: 10.5, color: '#6B7280', marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  menuDropdown: { backgroundColor: '#fff', borderRadius: 12, padding: 8, width: 220, position: 'absolute', top: 120, right: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  menuItemText: { fontSize: 14, color: '#374151', fontWeight: '500' },

  bottomSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  bsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 16 },
  bsTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  bsItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB', gap: 4 },
  bsItemAll: { backgroundColor: '#FFFBEB', marginHorizontal: -20, paddingHorizontal: 20, borderRadius: 8 },
  bsItemSelected: { backgroundColor: '#FEF2F2', marginHorizontal: -20, paddingHorizontal: 20 },
  bsItemText: { flex: 1, minWidth: 0, fontSize: 15, color: '#374151', fontWeight: '500', marginLeft: 10 },

  formRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  formHalf: { flex: 1, minWidth: 0, marginRight: 10 },
  formHalfLast: { flex: 1, minWidth: 0 },
  formGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { width: '100%', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 46, backgroundColor: '#F9FAFB', fontSize: 14, color: '#111827', justifyContent: 'center' },

  dayChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  dayChipActive: { backgroundColor: BRAND, borderColor: BRAND },
  dayChipText: { fontSize: 12.5, fontWeight: '700', color: '#4B5563' },
  dayChipTextActive: { color: '#fff' },

  classPickerBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 46, backgroundColor: '#F9FAFB', gap: 10 },
  classPickerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },

  timeInputInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  timeInputText: { fontSize: 14, color: '#111827', fontWeight: '500' },

  saveButton: { width: '100%', height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: BRAND, marginTop: 4 },
  filledBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  busyOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  busyCard: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 24, paddingHorizontal: 30, alignItems: 'center', minWidth: 220 },
  busyText: { fontSize: 14, fontWeight: '600', color: '#374151', textAlign: 'center', marginTop: 12 },
});