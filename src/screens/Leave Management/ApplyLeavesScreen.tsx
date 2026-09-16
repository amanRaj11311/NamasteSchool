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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import { pick, types } from '@react-native-documents/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { API_BASE } from '../../network/api';

const COLORS = {
  bg: '#F5F6FA',
  surface: '#FFFFFF',
  border: '#ECEEF2',
  borderStrong: '#E2E5EB',
  text: '#111827',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  accent: '#EF4444',
  accentSoft: '#FEF2F2',
  accentDark: '#B91C1C',
  success: '#10B981',
  successSoft: '#ECFDF5',
  successText: '#047857',
  warning: '#F59E0B',
  warningSoft: '#FFFBEB',
  warningText: '#B45309',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',
  dangerText: '#B91C1C',
  neutralSoft: '#F3F4F6',
  neutralText: '#4B5563',
  purple: '#8B5CF6',
  purpleSoft: '#F5F3FF',
  blue: '#0EA5E9',
  blueSoft: '#EFF8FF',
};

interface Leave {
  _id: string;
  staff: { _id: string; name: string; staffType: string };
  leaveType: { _id: string; name: string };
  schoolId?: { _id: string; name: string };
  fromDate: string;
  toDate: string;
  days: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  reason: string;
  comments?: string;
  isHalfDay: boolean;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Approved: { bg: COLORS.successSoft, text: COLORS.successText, dot: COLORS.success },
  Rejected: { bg: COLORS.dangerSoft, text: COLORS.dangerText, dot: COLORS.danger },
  Cancelled: { bg: COLORS.neutralSoft, text: COLORS.neutralText, dot: '#9CA3AF' },
  Pending: { bg: COLORS.warningSoft, text: COLORS.warningText, dot: COLORS.warning },
};

const toISODate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatPretty = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

export default function ApplyLeaveScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'MyLeaves' | 'Approvals'>('MyLeaves');
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form State
  const [isFormVisible, setFormVisible] = useState(false);
  const [isApproveModalVisible, setApproveModalVisible] = useState(false);
  const [activeLeaveId, setActiveLeaveId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [remarks, setRemarks] = useState('');

  const [formData, setFormData] = useState({
    schoolId: '',
    leaveTypeId: '',
    fromDate: '',
    toDate: '',
    reason: '',
    isHalfDay: false,
  });
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [file, setFile] = useState<any>(null);

  // Date picker state
  const [datePickerFor, setDatePickerFor] = useState<'from' | 'to' | null>(null);
  const [tempPickerDate, setTempPickerDate] = useState(new Date());

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    const uid = await AsyncStorage.getItem('userId');

    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    setUserId(uid);
    fetchData(token);
  };

  const fetchData = async (token: string | null, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [leavesRes, typesRes, schoolsRes] = await Promise.all([
        axios.get(`${API_BASE}/leave`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/leave/types`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (leavesRes.data?.success) setLeaves(leavesRes.data.data || []);
      if (typesRes.data?.success) setLeaveTypes(typesRes.data.data || []);
      if (schoolsRes.data?.success) setSchools(schoolsRes.data.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const hasPermission = useCallback(
    (action: string) => {
      if (isSuperAdmin) return true;
      return permissions.some(p => p.module === 'leave' && p.action === action);
    },
    [permissions, isSuperAdmin]
  );

  // -------------------------------------------------------------------------
  // Date picker handlers
  // -------------------------------------------------------------------------
  const openDatePicker = (field: 'from' | 'to') => {
    const current = field === 'from' ? formData.fromDate : formData.toDate;
    const base = current ? new Date(current) : field === 'to' && formData.fromDate ? new Date(formData.fromDate) : new Date();
    setTempPickerDate(base);
    setDatePickerFor(field);
  };

  const closeDatePicker = () => setDatePickerFor(null);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    // Android fires 'dismissed' on cancel and closes itself automatically
    if (Platform.OS === 'android') {
      setDatePickerFor(null);
      if (event.type === 'dismissed' || !selectedDate) return;
      applyPickedDate(selectedDate);
      return;
    }
    // iOS inline spinner keeps firing while scrolling — just track the value
    if (selectedDate) setTempPickerDate(selectedDate);
  };

  const applyPickedDate = (date: Date) => {
    const iso = toISODate(date);
    if (datePickerFor === 'from') {
      setFormData(prev => {
        // keep To Date valid: if it's before the new From Date, push it forward
        const needsBump = !prev.toDate || new Date(prev.toDate) < date;
        return {
          ...prev,
          fromDate: iso,
          toDate: prev.isHalfDay ? iso : needsBump ? iso : prev.toDate,
        };
      });
    } else if (datePickerFor === 'to') {
      setFormData(prev => ({ ...prev, toDate: iso }));
    }
  };

  const confirmIOSDate = () => {
    applyPickedDate(tempPickerDate);
    setDatePickerFor(null);
  };

  const handleApplyLeave = async () => {
    if (!formData.schoolId || !formData.leaveTypeId || !formData.fromDate || !formData.toDate || !formData.reason) {
      Alert.alert('Missing information', 'Please fill all required fields including School Branch.');
      return;
    }
    if (new Date(formData.toDate) < new Date(formData.fromDate)) {
      Alert.alert('Invalid dates', 'To Date cannot be earlier than From Date.');
      return;
    }
    try {
      const payload = new FormData();
      payload.append('schoolId', formData.schoolId);
      payload.append('leaveTypeId', formData.leaveTypeId);
      payload.append('fromDate', formData.fromDate);
      payload.append('toDate', formData.toDate);
      payload.append('reason', formData.reason);
      payload.append('isHalfDay', String(formData.isHalfDay));
      if (file) payload.append('attachment', { uri: file.uri, type: file.type, name: file.name } as any);

      await axios.post(`${API_BASE}/leave/apply`, payload, {
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'multipart/form-data' },
      });
      Alert.alert('Success', 'Leave application submitted.');
      setFormVisible(false);
      fetchData(authToken, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to apply.');
    }
  };

  const handleDecision = async () => {
    try {
      await axios.patch(
        `${API_BASE}/leave/${activeLeaveId}/decide`,
        { action: decision, remarks },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      Alert.alert('Success', `Leave ${decision}d successfully.`);
      setApproveModalVisible(false);
      fetchData(authToken, true);
    } catch (e: any) {
      Alert.alert('Error', 'Action failed.');
    }
  };

  const handleCancel = async (id: string) => {
    Alert.alert('Cancel Leave', 'Are you sure?', [
      { text: 'No' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.patch(`${API_BASE}/leave/${id}/cancel`, {}, { headers: { Authorization: `Bearer ${authToken}` } });
            fetchData(authToken, true);
          } catch (e) {
            Alert.alert('Error', 'Failed to cancel.');
          }
        },
      },
    ]);
  };

  const handlePickFile = async () => {
    try {
      const res = await pick({ type: [types.allFiles] });
      setFile(res[0]);
    } catch (err: any) {
      if (err?.code !== 'DOCUMENT_PICKER_CANCELED' && err?.message !== 'User canceled document picker') {
        Alert.alert('Error', 'Failed to pick file.');
      }
    }
  };

  const filteredLeaves = leaves.filter(l => (activeTab === 'MyLeaves' ? l.staff?._id === userId : l.staff?._id !== userId));

  const pendingCount = filteredLeaves.filter(l => l.status === 'Pending').length;
  const approvedCount = filteredLeaves.filter(l => l.status === 'Approved').length;

  const renderInlineDropdown = (fieldKey: 'schoolId' | 'leaveTypeId', label: string, options: { label: string; value: string }[]) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === (formData as any)[fieldKey]);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity
          style={[styles.fieldControl, isOpen && styles.fieldControlActive]}
          onPress={() => setActiveDropdown(isOpen ? null : fieldKey)}
          activeOpacity={0.85}
        >
          <Text style={selectedObj ? styles.fieldValueText : styles.fieldPlaceholderText} numberOfLines={1}>
            {selectedObj?.label || 'Select...'}
          </Text>
          <View style={[styles.fieldIconCircle, isOpen && { backgroundColor: COLORS.accentSoft }]}>
            <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={isOpen ? COLORS.accent : COLORS.textMuted} />
          </View>
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 170 }} showsVerticalScrollIndicator={false}>
              {options.length === 0 && (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: COLORS.textFaint, fontSize: 13 }}>No options available</Text>
                </View>
              )}
              {options.map((opt, i) => {
                const selected = (formData as any)[fieldKey] === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.dropdownItem, i !== options.length - 1 && styles.borderBottom, selected && styles.dropdownItemSelected]}
                    onPress={() => {
                      setFormData({ ...formData, [fieldKey]: opt.value });
                      setActiveDropdown(null);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, selected && styles.dropdownItemTextSelected]}>{opt.label}</Text>
                    {selected && <Feather name="check" size={16} color={COLORS.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const renderDateField = (field: 'from' | 'to', label: string) => {
    const value = field === 'from' ? formData.fromDate : formData.toDate;
    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={styles.dateControl} onPress={() => openDatePicker(field)} activeOpacity={0.85}>
          <View style={styles.dateIconCircle}>
            <Feather name="calendar" size={13} color={COLORS.accent} />
          </View>
          <Text style={value ? styles.dateValueText : styles.fieldPlaceholderText} numberOfLines={1}>
            {value ? formatPretty(value) : 'Select date'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const dayCount =
    formData.fromDate && formData.toDate
      ? Math.max(1, Math.round((new Date(formData.toDate).getTime() - new Date(formData.fromDate).getTime()) / 86400000) + 1)
      : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Leave Applications</Text>
        <Text style={styles.subtitle}>Apply for leave, track balance, and manage approvals.</Text>
      </View>

      {/* KPI Grid */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={[styles.iconCircle, { backgroundColor: COLORS.purpleSoft }]}>
            <Feather name="file-text" size={16} color={COLORS.purple} />
          </View>
          <Text style={styles.kpiValue}>{filteredLeaves.length}</Text>
          <Text style={styles.kpiLabel}>TOTAL</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.iconCircle, { backgroundColor: COLORS.warningSoft }]}>
            <Feather name="clock" size={16} color={COLORS.warning} />
          </View>
          <Text style={styles.kpiValue}>{pendingCount}</Text>
          <Text style={styles.kpiLabel}>PENDING</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.iconCircle, { backgroundColor: COLORS.successSoft }]}>
            <Feather name="check-circle" size={16} color={COLORS.success} />
          </View>
          <Text style={styles.kpiValue}>{approvedCount}</Text>
          <Text style={styles.kpiLabel}>APPROVED</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'MyLeaves' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('MyLeaves')}
          >
            <Text style={[styles.segmentText, activeTab === 'MyLeaves' && styles.segmentTextActive]}>My Leaves</Text>
          </TouchableOpacity>
          {hasPermission('update') && (
            <TouchableOpacity
              style={[styles.segmentBtn, activeTab === 'Approvals' && styles.segmentBtnActive]}
              onPress={() => setActiveTab('Approvals')}
            >
              <Text style={[styles.segmentText, activeTab === 'Approvals' && styles.segmentTextActive]}>Approvals</Text>
            </TouchableOpacity>
          )}
        </View>
        {hasPermission('create') && (
          <TouchableOpacity
            style={styles.headerAddBtn}
            onPress={() => {
              setFormData({ schoolId: '', leaveTypeId: '', fromDate: '', toDate: '', reason: '', isHalfDay: false });
              setFile(null);
              setFormVisible(true);
            }}
            activeOpacity={0.9}
          >
            <Feather name="plus" size={15} color="#fff" />
            <Text style={styles.headerAddBtnText}>Apply</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredLeaves}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(authToken, true)} colors={[COLORS.accent]} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="calendar" size={30} color={COLORS.textFaint} />
              </View>
              <Text style={styles.emptyTitle}>No leave applications</Text>
              <Text style={styles.emptySub}>Applications you submit will show up here.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const status = STATUS_STYLES[item.status] || STATUS_STYLES.Pending;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{item.staff?.name?.charAt(0)?.toUpperCase() || 'U'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.staff?.name || 'Unknown'}
                      </Text>
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {item.leaveType?.name} • {item.schoolId?.name || 'No Branch'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
                    <Text style={[styles.statusText, { color: status.text }]}>{item.status}</Text>
                  </View>
                </View>

                <View style={styles.dateRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lbl}>FROM</Text>
                    <Text style={styles.val}>{new Date(item.fromDate).toLocaleDateString('en-GB')}</Text>
                  </View>
                  <View style={styles.dateDivider} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lbl}>TO</Text>
                    <Text style={styles.val}>{new Date(item.toDate).toLocaleDateString('en-GB')}</Text>
                  </View>
                  <View style={styles.dateDivider} />
                  <View style={{ flex: 0.6 }}>
                    <Text style={styles.lbl}>DAYS</Text>
                    <Text style={styles.val}>{item.days}</Text>
                  </View>
                </View>

                <Text style={styles.lbl}>REASON</Text>
                <Text style={styles.reasonText}>{item.reason}</Text>

                {((activeTab === 'MyLeaves' && item.status === 'Pending' && hasPermission('delete')) ||
                  (activeTab === 'Approvals' && item.status === 'Pending' && hasPermission('update'))) && (
                  <View style={styles.cardActions}>
                    {activeTab === 'MyLeaves' && item.status === 'Pending' && hasPermission('delete') && (
                      <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(item._id)} activeOpacity={0.85}>
                        <Text style={styles.cancelBtnText}>Cancel Application</Text>
                      </TouchableOpacity>
                    )}
                    {activeTab === 'Approvals' && item.status === 'Pending' && hasPermission('update') && (
                      <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
                        <TouchableOpacity
                          style={[styles.decisionBtn, styles.bgRedBtn]}
                          onPress={() => {
                            setActiveLeaveId(item._id);
                            setDecision('reject');
                            setRemarks('');
                            setApproveModalVisible(true);
                          }}
                          activeOpacity={0.9}
                        >
                          <Feather name="x" color="#fff" size={14} />
                          <Text style={styles.decisionText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.decisionBtn, styles.bgGreenBtn]}
                          onPress={() => {
                            setActiveLeaveId(item._id);
                            setDecision('approve');
                            setRemarks('');
                            setApproveModalVisible(true);
                          }}
                          activeOpacity={0.9}
                        >
                          <Feather name="check" color="#fff" size={14} />
                          <Text style={styles.decisionText}>Approve</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Apply Leave — bottom sheet */}
      <Modal visible={isFormVisible} animationType="slide" transparent onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setFormVisible(false)} />
          <View style={styles.sheetContainer}>
            
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>Apply Leave</Text>
                <Text style={styles.formSubtitle}>Fill in the details below</Text>
              </View>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}>
                <Feather name="x" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {renderInlineDropdown(
                'schoolId',
                'School Branch *',
                schools.map(s => ({ label: s.name, value: s._id }))
              )}
              {renderInlineDropdown(
                'leaveTypeId',
                'Leave Type *',
                leaveTypes.map(t => ({ label: t.name, value: t._id }))
              )}

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() =>
                  setFormData(prev => ({
                    ...prev,
                    isHalfDay: !prev.isHalfDay,
                    toDate: !prev.isHalfDay && prev.fromDate ? prev.fromDate : prev.toDate,
                  }))
                }
                activeOpacity={0.85}
              >
                <View style={[styles.checkbox, formData.isHalfDay && styles.checkboxChecked]}>
                  {formData.isHalfDay && <Feather name="check" size={12} color="#fff" />}
                </View>
                <Text style={styles.toggleLabel}>This is a half-day leave</Text>
              </TouchableOpacity>

              <View style={styles.row}>
                {renderDateField('from', 'From Date *')}
                <View style={{ width: 12 }} />
                {renderDateField('to', 'To Date *')}
              </View>

              {dayCount !== null && (
                <View style={styles.durationPill}>
                  <Feather name="info" size={12} color={COLORS.accent} />
                  <Text style={styles.durationPillText}>
                    {dayCount} {dayCount === 1 ? 'day' : 'days'} selected
                  </Text>
                </View>
              )}

              <View style={{ marginBottom: 16, marginTop: 4 }}>
                <Text style={styles.inputLabel}>Reason *</Text>
                <TextInput
                  style={[styles.input, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
                  placeholder="Briefly describe your reason for leave"
                  placeholderTextColor={COLORS.textFaint}
                  multiline
                  value={formData.reason}
                  onChangeText={t => setFormData({ ...formData, reason: t })}
                />
              </View>

              <Text style={styles.inputLabel}>Attachment (Optional)</Text>
              <TouchableOpacity style={styles.uploadBtn} onPress={handlePickFile} activeOpacity={0.85}>
                <View style={styles.uploadIconCircle}>
                  <Feather name="paperclip" size={15} color={COLORS.accent} />
                </View>
                <Text style={styles.uploadText} numberOfLines={1}>
                  {file ? file.name : 'Tap to choose a file'}
                </Text>
                {file && (
                  <TouchableOpacity onPress={() => setFile(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="x-circle" size={16} color={COLORS.textFaint} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              <TouchableOpacity
  style={styles.saveBtnFull}
  onPress={handleApplyLeave}
  activeOpacity={0.9}
>
  <Text style={styles.saveBtnFullText}>Submit Application</Text>
</TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Approve / Reject */}
      <Modal visible={isApproveModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.compactModalContainer, { padding: 22 }]}>
            <View style={[styles.iconCircle, { backgroundColor: decision === 'approve' ? COLORS.successSoft : COLORS.dangerSoft, marginBottom: 14 }]}>
              <Feather name={decision === 'approve' ? 'check' : 'x'} size={18} color={decision === 'approve' ? COLORS.success : COLORS.danger} />
            </View>
            <Text style={styles.formTitle}>{decision === 'approve' ? 'Approve Leave' : 'Reject Leave'}</Text>
            <Text style={[styles.formSubtitle, { marginBottom: 16 }]}>Add an optional remark for this decision</Text>
            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
              placeholder="Add optional remarks..."
              placeholderTextColor={COLORS.textFaint}
              multiline
              value={remarks}
              onChangeText={setRemarks}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={[styles.decisionBtn, styles.secondaryBtn]} onPress={() => setApproveModalVisible(false)} activeOpacity={0.85}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.decisionBtn, decision === 'approve' ? styles.bgGreenBtn : styles.bgRedBtn, { flex: 1 }]}
                onPress={handleDecision}
                activeOpacity={0.9}
              >
                <Text style={styles.decisionText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker — Android shows its own modal; iOS renders inline in a sheet */}
      {datePickerFor && Platform.OS === 'android' && (
        <DateTimePicker
          value={tempPickerDate}
          mode="date"
          display="calendar"
          minimumDate={datePickerFor === 'to' && formData.fromDate ? new Date(formData.fromDate) : undefined}
          onChange={handleDateChange}
        />
      )}

      {datePickerFor && Platform.OS === 'ios' && (
        <Modal visible transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.compactModalContainer}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>{datePickerFor === 'from' ? 'Select From Date' : 'Select To Date'}</Text>
                <TouchableOpacity onPress={closeDatePicker} style={styles.closeBtnIcon}>
                  <Feather name="x" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempPickerDate}
                mode="date"
                display="inline"
                minimumDate={datePickerFor === 'to' && formData.fromDate ? new Date(formData.fromDate) : undefined}
                onChange={handleDateChange}
                style={{ alignSelf: 'stretch' }}
              />
              <View style={{ padding: 20, paddingTop: 4 }}>
                <TouchableOpacity style={styles.saveBtnFull} onPress={confirmIOSDate} activeOpacity={0.9}>
                  <Text style={styles.saveBtnFullText}>Confirm Date</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },

  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },

  kpiGrid: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  iconCircle: { width: 34, height: 34, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  kpiValue: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  kpiLabel: { fontSize: 9.5, fontWeight: '800', color: COLORS.textFaint, letterSpacing: 0.6, marginTop: 2 },

  tabRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 16, marginBottom: 4, gap: 10 },
  segmentedControl: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: COLORS.border, flex: 1 },
  segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: COLORS.text },
  segmentText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  segmentTextActive: { color: '#fff' },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    gap: 6,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  headerAddBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.blueSoft, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: COLORS.blue },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontWeight: '800', fontSize: 10.5, letterSpacing: 0.2 },

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  dateDivider: { width: 1, height: 24, backgroundColor: COLORS.borderStrong, marginHorizontal: 10 },
  lbl: { fontSize: 9.5, color: COLORS.textFaint, fontWeight: '800', marginBottom: 4, letterSpacing: 0.5 },
  val: { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  reasonText: { fontSize: 13.5, color: '#374151', lineHeight: 20, fontWeight: '500' },

  cardActions: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: 'row' },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, backgroundColor: COLORS.dangerSoft, borderRadius: 12 },
  cancelBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
  decisionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 12, gap: 6 },
  bgGreenBtn: { backgroundColor: COLORS.success },
  bgRedBtn: { backgroundColor: COLORS.accent },
  decisionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  secondaryBtn: { backgroundColor: COLORS.neutralSoft, flex: 1 },
  secondaryBtnText: { color: COLORS.neutralText, fontWeight: '700', fontSize: 13 },

  emptyState: { alignItems: 'center', padding: 44, backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 20, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  emptySub: { fontSize: 12.5, color: COLORS.textFaint, marginTop: 4, textAlign: 'center' },

  // Centered modal (approve/reject + iOS date picker)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'center', padding: 18 },
  compactModalContainer: { backgroundColor: COLORS.surface, borderRadius: 24, maxHeight: '90%', overflow: 'hidden' },

  // Bottom sheet (Apply Leave form)
sheetOverlay: {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  paddingHorizontal: 18,
  paddingVertical: 24,
},
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,24,39,0.55)' },
sheetContainer: {
  backgroundColor: COLORS.surface,
  borderRadius: 24,
  width: '100%',
  maxHeight: '88%',
  overflow: 'hidden',
  elevation: 10,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.15,
  shadowRadius: 20,
},  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.borderStrong, alignSelf: 'center', marginBottom: 8 },

formHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingHorizontal: 22,
  paddingTop: 16,
  paddingBottom: 12,
},  formTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text },
  formSubtitle: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 3 },
  closeBtnIcon: { padding: 8, backgroundColor: COLORS.neutralSoft, borderRadius: 20 },
  formScroll: { paddingHorizontal: 22, paddingBottom: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: COLORS.neutralText, marginBottom: 7, marginLeft: 1 },
  input: {
    borderWidth: 1.3,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    height: 50,
    backgroundColor: COLORS.bg,
    fontSize: 14,
    color: COLORS.text,
  },
  row: { flexDirection: 'row', marginBottom: 10, zIndex: 2 },

  fieldControl: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.3,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    height: 50,
    backgroundColor: COLORS.bg,
  },
  fieldControlActive: { borderColor: COLORS.accent, backgroundColor: COLORS.surface },
  fieldValueText: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  fieldPlaceholderText: { fontSize: 14, color: COLORS.textFaint },
  fieldIconCircle: { width: 24, height: 24, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

  dateControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1.3,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 12,
    height: 50,
    backgroundColor: COLORS.bg,
  },
  dateIconCircle: { width: 26, height: 26, borderRadius: 8, backgroundColor: COLORS.accentSoft, justifyContent: 'center', alignItems: 'center' },
  dateValueText: { fontSize: 12.5, color: COLORS.text, fontWeight: '700', flexShrink: 1 },

  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  durationPillText: { fontSize: 11.5, fontWeight: '700', color: COLORS.accentDark },

  dropdownListContainer: {
    position: 'absolute',
    top: 78,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 6,
    overflow: 'hidden',
  },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  dropdownItemSelected: { backgroundColor: COLORS.accentSoft },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dropdownItemText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  dropdownItemTextSelected: { color: COLORS.accentDark, fontWeight: '700' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.6, borderColor: COLORS.borderStrong, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  toggleLabel: { fontSize: 13.5, fontWeight: '600', color: '#374151' },

  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.3,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: 13,
    padding: 12,
    backgroundColor: COLORS.bg,
    gap: 10,
    marginBottom: 22,
  },
  uploadIconCircle: { width: 30, height: 30, borderRadius: 9, backgroundColor: COLORS.accentSoft, justifyContent: 'center', alignItems: 'center' },
  uploadText: { fontSize: 13, color: COLORS.textMuted, flex: 1, fontWeight: '500' },

  saveBtnFull: {
    backgroundColor: COLORS.accent,
    height: 52,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});