import React, { useState, useEffect, useCallback } from 'react';
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
  Linking,
} from 'react-native';
import { API_BASE } from '../../network/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';


// --- Generate 24-Hour Format Arrays ---
const HOURS = Array.from({ length: 24 }, (_, i) => (i < 10 ? `0${i}` : `${i}`));
const MINUTES = Array.from({ length: 60 }, (_, i) => (i < 10 ? `0${i}` : `${i}`));

// --- Types ---
interface Staff {
  _id: string;
  staffId: string;
  name: string;
  staffType: string;
}

interface AttendanceRecord {
  staffId: string;
  status: 'Present' | 'Absent' | 'Half Day' | 'Leave' | 'None';
  timeIn: string;
  timeOut: string;
  schTimeIn: string;
  schTimeOut: string;
}

const STATUS_OPTIONS = ['Present', 'Absent', 'Half Day', 'Leave', 'None'];

export default function AttendanceScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'Daily' | 'Calendar'>('Daily');
  
  // Data States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceRecord>>({});
  
  // Daily View States
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Calendar View States
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('August 2026');
  
  // Modals
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [activeStaffForStatus, setActiveStaffForStatus] = useState<string | null>(null);
  const [staffSelectorVisible, setStaffSelectorVisible] = useState(false);
  const [dateSelectorVisible, setDateSelectorVisible] = useState(false);
  
  // Custom Time Picker States
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [activeTimeField, setActiveTimeField] = useState<{staffId: string, field: 'timeIn' | 'timeOut'} | null>(null);
  const [selectedHour, setSelectedHour] = useState('08');
  const [selectedMinute, setSelectedMinute] = useState('00');

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

      // 1. Fetch School ID (Required for Saving Attendance)
      const schoolsRes = await axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } });
      if (schoolsRes.data?.success && schoolsRes.data.data.length > 0) {
        setActiveSchoolId(schoolsRes.data.data[0]._id);
      }

      // 2. Fetch Staff List
      const staffRes = await axios.get(`${API_BASE}/staff`, { headers: { Authorization: `Bearer ${token}` } });
      const staff = staffRes.data?.data || [];
      setStaffList(staff);

      if (staff.length > 0 && !selectedStaff) setSelectedStaff(staff[0]);

      // 3. Initialize Local Attendance State
      const initialAttendance: Record<string, AttendanceRecord> = {};
      staff.forEach((s: Staff) => {
        initialAttendance[s._id] = {
          staffId: s._id,
          status: 'None',
          timeIn: '08:00', // Default 24Hr Time
          timeOut: '14:00',
          schTimeIn: '08:00',
          schTimeOut: '14:00',
        };
      });
      setAttendanceData(initialAttendance);

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => fetchInitialData(authToken, true), [authToken]);

  // --- Actions ---

  const handleStatusSelect = (status: any) => {
    if (activeStaffForStatus) {
      setAttendanceData(prev => ({ ...prev, [activeStaffForStatus]: { ...prev[activeStaffForStatus], status } }));
    }
    setStatusModalVisible(false);
  };

  const openTimeSelector = (staffId: string, field: 'timeIn' | 'timeOut') => {
    const currentTime = attendanceData[staffId][field];
    const [h, m] = currentTime.split(':');
    setSelectedHour(h || '08');
    setSelectedMinute(m || '00');
    setActiveTimeField({ staffId, field });
    setTimePickerVisible(true);
  };

  const confirmTimeSelection = () => {
    if (activeTimeField) {
      const timeString = `${selectedHour}:${selectedMinute}`;
      setAttendanceData(prev => ({
        ...prev,
        [activeTimeField.staffId]: { ...prev[activeTimeField.staffId], [activeTimeField.field]: timeString }
      }));
    }
    setTimePickerVisible(false);
  };

  // Real API Save Function
  const handleSaveIndividual = async (staffId: string) => {
    if (!activeSchoolId) {
      Alert.alert("Error", "School Branch ID not found. Please pull to refresh.");
      return;
    }

    const record = attendanceData[staffId];
    if (record.status === 'None') {
      Alert.alert("Action Required", "Please select a Present/Absent status first.");
      return;
    }
    
    try {
      const payload = {
        schoolId: activeSchoolId, // FIXED: Now strictly passing schoolId to avoid the validation error
        staffId: record.staffId,
        date: selectedDate,
        status: record.status,
        timeIn: record.timeIn,
        timeOut: record.timeOut
      };

      await axios.post(`${API_BASE}/attendance`, payload, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      
      Alert.alert("Success", "Attendance saved successfully!");
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.message || "Failed to save attendance.");
    }
  };

  // Upload & Download
  const handleDownloadFormat = () => {
    // Modify URL based on your specific backend route for downloading the template
    const downloadUrl = 'https://mern.schoolapi.dcstechnosis.com/downloads/Staff_Attendance_Template.xlsx';
    Linking.openURL(downloadUrl).catch(() => {
      Alert.alert("Error", "Unable to download format. Please check your network.");
    });
  };
const handleUploadExcel = async () => {
  try {
    const res = await pick({ type: [types.allFiles] });
    const file = res[0]; // res is already the array — no destructuring needed

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      type: file.type,
      name: file.name,
    });
    formData.append('schoolId', activeSchoolId!);

    await axios.post(`${API_BASE}/attendance/upload`, formData, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'multipart/form-data',
      },
    });

    Alert.alert("Success", "Attendance data uploaded successfully!");
    setUploadModalVisible(false);
    onRefresh();

  } catch (err) {
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
      // User cancelled the picker — do nothing
    } else {
      Alert.alert("Error", "Failed to upload file.");
    }
  } finally {
    setIsUploading(false);
  }
};
  // --- UI Renderers ---
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Present': return '#10B981';
      case 'Absent': return '#ef4444';
      case 'Half Day': return '#F59E0B';
      case 'Leave': return '#3B82F6';
      default: return '#6B7280';
    }
  };

  const renderDailyCard = ({ item }: { item: Staff }) => {
    const record = attendanceData[item._id];
    if (!record) return null;

    const statusColor = getStatusColor(record.status);

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.staffInfo}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{item.name.charAt(0)}</Text></View>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.staffName}>{item.name}</Text>
              <Text style={styles.staffId}>ID: {item.staffId || 'N/A'}</Text>
            </View>
          </View>
          
          <TouchableOpacity 
            style={[styles.statusSelector, { borderColor: statusColor, backgroundColor: statusColor + '10' }]}
            onPress={() => { setActiveStaffForStatus(item._id); setStatusModalVisible(true); }}
          >
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{record.status === 'None' ? 'Set Status' : record.status}</Text>
            <Feather name="chevron-down" size={14} color={statusColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.timeRow}>
          <View style={styles.timeInputBox}>
            <Text style={styles.timeLabel}>Time In</Text>
            <TouchableOpacity style={styles.timeDropdownBtn} onPress={() => openTimeSelector(item._id, 'timeIn')}>
              <Text style={styles.timeDropdownText}>{record.timeIn}</Text>
              <Feather name="clock" size={14} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <View style={styles.timeInputBox}>
            <Text style={styles.timeLabel}>Time Out</Text>
            <TouchableOpacity style={styles.timeDropdownBtn} onPress={() => openTimeSelector(item._id, 'timeOut')}>
              <Text style={styles.timeDropdownText}>{record.timeOut}</Text>
              <Feather name="clock" size={14} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={() => handleSaveIndividual(item._id)}>
          <Feather name="save" size={16} color="#fff" />
          <Text style={styles.saveBtnText}>Save Record</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Staff Attendance</Text>
        <Text style={styles.subtitle}>Manage daily attendance or view monthly calendar.</Text>
      </View>

      {/* Top Bar Switch & Actions */}
      <View style={styles.topBar}>
        <View style={styles.toggleContainer}>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'Daily' && styles.toggleBtnActive]} onPress={() => setViewMode('Daily')}>
            <Feather name="list" size={16} color={viewMode === 'Daily' ? '#fff' : '#ef4444'} />
            <Text style={[styles.toggleText, viewMode === 'Daily' && styles.toggleTextActive]}>Daily</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'Calendar' && styles.toggleBtnActive]} onPress={() => setViewMode('Calendar')}>
            <Feather name="calendar" size={16} color={viewMode === 'Calendar' ? '#fff' : '#ef4444'} />
            <Text style={[styles.toggleText, viewMode === 'Calendar' && styles.toggleTextActive]}>Calendar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionBtnsRow}>
          <TouchableOpacity style={styles.outlineBtn} onPress={handleDownloadFormat}>
            <Feather name="download" size={16} color="#10B981" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.filledBtn} onPress={() => setUploadModalVisible(true)}>
            <Feather name="upload" size={16} color="#fff" />
            <Text style={styles.filledBtnText}>Upload Excel</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main List / Calendar */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#ef4444" /></View>
      ) : (
        <View style={{ flex: 1 }}>
          {viewMode === 'Daily' ? (
            <>
              <View style={styles.filterBar}>
                <View>
                  <Text style={styles.filterLabel}>Select Date</Text>
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => setDateSelectorVisible(true)}>
                    <Text style={styles.dateValue}>{selectedDate}</Text>
                    <Feather name="calendar" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.staffCount}>{staffList.length} Staff Members</Text>
              </View>

              <FlatList
                data={staffList}
                keyExtractor={(item) => item._id}
                renderItem={renderDailyCard}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ef4444']} />}
              />
            </>
          ) : (
            <ScrollView style={styles.calScrollView}>
              <View style={styles.calFilters}>
                <View style={styles.calFilterBox}>
                  <Text style={styles.filterLabel}>Select Staff</Text>
                  <TouchableOpacity style={styles.dropdownStyle} onPress={() => setStaffSelectorVisible(true)}>
                    <Text style={styles.dropdownText} numberOfLines={1}>{selectedStaff ? `${selectedStaff.name} (${selectedStaff.staffId})` : '- Choose Staff -'}</Text>
                    <Feather name="chevron-down" size={16} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.calendarContainer}>
                <View style={styles.calHeaderRow}>
                  {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => <Text key={d} style={styles.calDayHeader}>{d}</Text>)}
                </View>
                <View style={styles.calGrid}>
                  <View style={styles.calCellEmpty} /><View style={styles.calCellEmpty} />
                  {Array.from({length: 31}, (_, i) => i + 1).map(day => (
                    <View key={day} style={styles.calCell}>
                      <Text style={styles.calCellDate}>{day}</Text>
                      <Text style={styles.calCellRecord}>No Record</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* --- MODALS --- */}

      {/* Custom Time Picker Modal (24-Hour Format) */}
      <Modal visible={timePickerVisible} transparent animationType="slide">
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.bottomSheet, { height: 350 }]}>
            <View style={styles.bsHeader}>
              <Text style={styles.bsTitle}>Set Time (24 Hr)</Text>
              <TouchableOpacity onPress={() => setTimePickerVisible(false)}><Feather name="x" size={20} color="#4B5563" /></TouchableOpacity>
            </View>
            
            <View style={styles.timePickerColumns}>
              {/* Hours Column */}
              <ScrollView style={styles.timeList} showsVerticalScrollIndicator={false}>
                {HOURS.map(h => (
                  <TouchableOpacity 
                    key={h} 
                    style={[styles.timeSlot, selectedHour === h && styles.timeSlotActive]}
                    onPress={() => setSelectedHour(h)}
                  >
                    <Text style={[styles.timeSlotText, selectedHour === h && styles.timeSlotTextActive]}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <Text style={styles.timeDivider}>:</Text>
              
              {/* Minutes Column */}
              <ScrollView style={styles.timeList} showsVerticalScrollIndicator={false}>
                {MINUTES.map(m => (
                  <TouchableOpacity 
                    key={m} 
                    style={[styles.timeSlot, selectedMinute === m && styles.timeSlotActive]}
                    onPress={() => setSelectedMinute(m)}
                  >
                    <Text style={[styles.timeSlotText, selectedMinute === m && styles.timeSlotTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={confirmTimeSelection}>
              <Text style={styles.saveBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom Date Picker Modal */}
      <Modal visible={dateSelectorVisible} transparent animationType="slide">
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.bottomSheet, { maxHeight: '60%' }]}>
            <View style={styles.bsHeader}>
              <Text style={styles.bsTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setDateSelectorVisible(false)}><Feather name="x" size={20} color="#4B5563" /></TouchableOpacity>
            </View>
            <FlatList
              data={Array.from({length: 15}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0]; })}
              keyExtractor={item => item}
              renderItem={({item}) => (
                <TouchableOpacity style={styles.bsItem} onPress={() => { setSelectedDate(item); setDateSelectorVisible(false); }}>
                  <Text style={[styles.bsItemText, selectedDate === item && { color: '#ef4444', fontWeight: 'bold' }]}>{item}</Text>
                  {selectedDate === item && <Feather name="check" color="#ef4444" size={18} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Excel Upload Modal */}
      <Modal visible={uploadModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.uploadBox}>
            <View style={styles.uploadHeader}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Feather name="file-text" size={20} color="#10B981" />
                <Text style={styles.uploadTitle}>Upload Attendance</Text>
              </View>
            </View>
            <Text style={styles.uploadDesc}>Upload an Excel file to bulk mark attendance. Please download the format first to ensure your file structure matches.</Text>
            
            <TouchableOpacity style={styles.dragDropZone} onPress={handleUploadExcel} disabled={isUploading}>
              {isUploading ? (
                <ActivityIndicator size="large" color="#ef4444" />
              ) : (
                <>
                  <View style={styles.uploadIconCircle}><Feather name="upload-cloud" size={28} color="#ef4444" /></View>
                  <Text style={styles.dragText}>Select Excel File</Text>
                  <Text style={styles.dragSub}>Tap to browse from device</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelUploadBtn} onPress={() => setUploadModalVisible(false)}>
              <Text style={styles.cancelUploadText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Status Modal & Staff Modal */}
      <Modal visible={statusModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setStatusModalVisible(false)} activeOpacity={1}>
          <View style={styles.statusBox}>
            <Text style={styles.modalTitleSmall}>Select Status</Text>
            {STATUS_OPTIONS.map(s => (
              <TouchableOpacity key={s} style={styles.statusOptionRow} onPress={() => handleStatusSelect(s)}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(s) }]} />
                <Text style={styles.statusOptionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={staffSelectorVisible} transparent animationType="slide">
        <View style={styles.bottomSheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.bsHeader}>
              <Text style={styles.bsTitle}>Select a Staff Member</Text>
              <TouchableOpacity onPress={() => setStaffSelectorVisible(false)}><Feather name="x" size={20} color="#4B5563" /></TouchableOpacity>
            </View>
            <FlatList
              data={staffList}
              keyExtractor={item => item._id}
              renderItem={({item}) => (
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

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title: { fontSize: 23, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', zIndex: 10 },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#FEE2E2', borderRadius: 10, padding: 4 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6 },
  toggleBtnActive: { backgroundColor: '#ef4444', elevation: 4 },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  toggleTextActive: { color: '#fff' },
  actionBtnsRow: { flexDirection: 'row', gap: 10 },
  outlineBtn: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  filledBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#10B981', gap: 6 },
  filledBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  
  filterBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  filterLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginBottom: 6 },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', gap: 12 },
  dateValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  staffCount: { fontSize: 13, color: '#3B82F6', fontWeight: '700' },

  listContent: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2, borderWidth: 1, borderColor: '#F3F4F6' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  staffInfo: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#374151' },
  staffName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  staffId: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statusSelector: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },

  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, marginBottom: 16 },
  timeInputBox: { flex: 1, marginRight: 10 },
  timeLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginBottom: 4 },
  timeDropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, height: 40, paddingHorizontal: 12 },
  timeDropdownText: { fontSize: 13, color: '#111827', fontWeight: '600' },

  saveBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 10, gap: 8 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  calScrollView: { flex: 1 },
  calFilters: { flexDirection: 'row', padding: 16, gap: 12 },
  calFilterBox: { flex: 1 },
  dropdownStyle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, height: 44 },
  dropdownText: { fontSize: 14, color: '#111827', fontWeight: '500', flex: 1 },
  calendarContainer: { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  calHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 10, marginBottom: 10 },
  calDayHeader: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#6B7280' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCellEmpty: { width: '14.28%', height: 70 },
  calCell: { width: '14.28%', height: 70, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#F3F4F6', padding: 4, alignItems: 'center' },
  calCellDate: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 },
  calCellRecord: { fontSize: 8, color: '#9CA3AF', textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  statusBox: { backgroundColor: '#fff', width: 220, borderRadius: 16, padding: 16 },
  modalTitleSmall: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 8 },
  statusOptionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  statusOptionText: { fontSize: 14, color: '#374151', fontWeight: '500' },

  uploadBox: { backgroundColor: '#fff', width: '100%', borderRadius: 20, padding: 20 },
  uploadHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  uploadTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginLeft: 8 },
  uploadDesc: { fontSize: 13, color: '#6B7280', lineHeight: 20, marginBottom: 20 },
  dragDropZone: { borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 16, padding: 30, alignItems: 'center', backgroundColor: '#F9FAFB', marginBottom: 20 },
  uploadIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  dragText: { fontSize: 15, fontWeight: '700', color: '#374151' },
  dragSub: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  cancelUploadBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelUploadText: { color: '#6B7280', fontWeight: '600', fontSize: 14 },

  bottomSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  bsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 16 },
  bsTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  bsItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  bsItemText: { fontSize: 15, color: '#374151', fontWeight: '500' },

  timePickerColumns: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 180, marginBottom: 16 },
  timeList: { width: 80, backgroundColor: '#F9FAFB', borderRadius: 12, marginHorizontal: 10 },
  timeSlot: { paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  timeSlotActive: { backgroundColor: '#ef4444' },
  timeSlotText: { fontSize: 18, fontWeight: '500', color: '#374151' },
  timeSlotTextActive: { color: '#fff', fontWeight: '700' },
  timeDivider: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
});