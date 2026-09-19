import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  bg: '#F3F5F9',
  surface: '#FFFFFF',
  surfaceSoft: '#F8F9FC',
  surfaceSunken: '#EEF1F6',
  border: '#E7EAF1',
  borderStrong: '#D9DEE8',
  text: '#0F1626',
  textMuted: '#5B667A',
  textFaint: '#9AA4B6',

  primary: '#B3122A',
  primaryDark: '#BE123C',
  primarySoft: '#FFF1F3',
  primaryBorder: '#FBD1D9',

  ink: '#111827',
  slate: '#334155',

  green: '#0F9D63',
  greenDark: '#0B7A4E',
  greenSoft: '#E7F8F1',
  greenBorder: '#BFEBD8',

  amber: '#B45309',
  amberSoft: '#FEF3C7',
  amberBorder: '#FCE2A4',

  blue: '#2563EB',
  blueSoft: '#EAF1FE',

  gold: '#C99A2E',
};

const AVATAR_PALETTE = ['#B3122A', '#2563EB', '#0F9D63', '#C99A2E', '#7C3AED', '#0891B2'];

type Option = { label: string; value: string };

// --- Safe Date Parsers ---
const formatToYMD = (d: Date): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

const initialsOf = (name?: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0]?.toUpperCase() || '?';
};

const avatarColorFor = (name?: string) => {
  if (!name) return AVATAR_PALETTE[0];
  const code = name.charCodeAt(0) || 0;
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
};

export default function FeesScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [studentFees, setStudentFees] = useState<any[]>([]);
  const [dueList, setDueList] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);

  // UI & Filter States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'assignments' | 'due'>('assignments');
  const [classFilter, setClassFilter] = useState<string>('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Assign Modal
  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({
    mode: 'single', student: '', classId: '', feeStructure: '',
    discountType: 'None', discountValue: '0', discountReason: ''
  });

  // Collect Modal
  const [collectTarget, setCollectTarget] = useState<any>(null);
  const [showCollectDatePicker, setShowCollectDatePicker] = useState(false);
  const [collectForm, setCollectForm] = useState({
    amount: '', lateFeeCharged: '0', mode: 'Cash', referenceNo: '', paidOn: new Date(), remarks: ''
  });

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchStaticData(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchStaticData = async (token: string | null) => {
    try {
      const [stuRes, clsRes, structRes] = await Promise.all([
        axios.get(`${API_BASE}/students?limit=500`, authHeaders(token)),
        axios.get(`${API_BASE}/classes?limit=200`, authHeaders(token)),
        axios.get(`${API_BASE}/fees/structures`, authHeaders(token)),
      ]);
      if (stuRes.data?.success) setStudents(stuRes.data.data || []);
      if (clsRes.data?.success) setClasses(clsRes.data.data || []);
      if (structRes.data?.success) setStructures(structRes.data.data || []);
    } catch (err) { console.error(err); }
    fetchLists(token, classFilter);
  };

  const fetchLists = async (token: string | null, filterCls: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = filterCls ? { classId: filterCls } : {};
      const [assignRes, dueRes] = await Promise.all([
        axios.get(`${API_BASE}/fees`, { params, ...authHeaders(token) }),
        axios.get(`${API_BASE}/fees/reports/due-list`, { params, ...authHeaders(token) })
      ]);
      if (assignRes.data?.success) setStudentFees(assignRes.data.data || []);
      if (dueRes.data?.success) setDueList(dueRes.data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'fees' && p.action === action);
  }, [permissions, isSuperAdmin]);

  // Summary strip (premium touch — quick totals for whatever list is active)
  const summary = useMemo(() => {
    const list = activeTab === 'assignments' ? studentFees : dueList;
    const totalPayable = list.reduce((s, i) => s + (i.totalPayable || 0), 0);
    const totalPaid = list.reduce((s, i) => s + (i.totalPaid || 0), 0);
    const totalDue = totalPayable - totalPaid;
    return { count: list.length, totalPayable, totalPaid, totalDue };
  }, [activeTab, studentFees, dueList]);

  // --- Actions ---
  const handleAssign = async () => {
    if (!assignForm.feeStructure) { Alert.alert('Error', 'Select a fee structure'); return; }
    if (assignForm.mode === 'single' && !assignForm.student) { Alert.alert('Error', 'Select a student'); return; }
    if (assignForm.mode === 'bulk' && !assignForm.classId) { Alert.alert('Error', 'Select a class'); return; }

    const discountValue = Number(assignForm.discountValue) || 0;
    const discount = assignForm.discountType !== 'None' && discountValue > 0
      ? { type: assignForm.discountType, value: discountValue, reason: assignForm.discountReason }
      : { type: 'None', value: 0, reason: '' };

    setSaving(true);
    try {
      if (assignForm.mode === 'single') {
        await axios.post(`${API_BASE}/fees/assign`, { student: assignForm.student, feeStructure: assignForm.feeStructure, discount }, authHeaders(authToken));
        Alert.alert('Success', 'Fee assigned to student');
      } else {
        const res = await axios.post(`${API_BASE}/fees/assign/bulk`, { classId: assignForm.classId, feeStructure: assignForm.feeStructure, discount }, authHeaders(authToken));
        Alert.alert('Success', res.data?.message || 'Bulk assignment complete');
      }
      setShowAssign(false);
      fetchLists(authToken, classFilter, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Assignment failed'); }
    finally { setSaving(false); }
  };

  const openCollectModal = (sf: any) => {
    setCollectTarget(sf);
    setCollectForm({
      amount: (sf.totalPayable - sf.totalPaid).toFixed(2),
      lateFeeCharged: '0',
      mode: 'Cash',
      referenceNo: '',
      paidOn: new Date(),
      remarks: ''
    });
  };

  const handleCollect = async () => {
    if (!collectForm.amount) { Alert.alert('Error', 'Amount is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...collectForm,
        amount: Number(collectForm.amount),
        lateFeeCharged: Number(collectForm.lateFeeCharged) || 0,
        paidOn: formatToYMD(collectForm.paidOn),
      };
      await axios.post(`${API_BASE}/fees/${collectTarget._id}/collect`, payload, authHeaders(authToken));
      Alert.alert('Success', 'Payment recorded successfully');
      setCollectTarget(null);
      fetchLists(authToken, classFilter, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Payment failed'); }
    finally { setSaving(false); }
  };

  // --- Render Helpers ---

  const MAX_VISIBLE_ITEMS = 6;
  const ITEM_HEIGHT = 46;

  const renderInlineDropdown = (
    fieldKey: string,
    label: string,
    options: Option[],
    value: string,
    onSelect: (v: string) => void,
    placeholder = "Select...",
  ) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    const needsScroll = options.length > MAX_VISIBLE_ITEMS;
    const listMaxHeight = (needsScroll ? MAX_VISIBLE_ITEMS : options.length) * ITEM_HEIGHT;

    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 999 : 1 }]}>
        {!!label && <Text style={styles.inputLabel}>{label}</Text>}
        <TouchableOpacity
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]}
          onPress={() => setActiveDropdown(isOpen ? null : fieldKey)}
          activeOpacity={0.85}
        >
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selectedObj?.label || placeholder}
          </Text>
          <View style={[styles.chevronBadge, isOpen && styles.chevronBadgeActive]}>
            <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={isOpen ? '#fff' : C.textMuted} />
          </View>
        </TouchableOpacity>

        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView
              nestedScrollEnabled
              scrollEnabled={needsScroll}
              style={{ maxHeight: listMaxHeight }}
              showsVerticalScrollIndicator={needsScroll}
            >
              {options.length === 0 ? (
                <View style={styles.dropdownEmpty}>
                  <Text style={styles.dropdownEmptyText}>No options available</Text>
                </View>
              ) : options.map((opt, idx) => {
                const selected = value === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.dropdownItem,
                      idx === options.length - 1 && { borderBottomWidth: 0 },
                      selected && styles.dropdownItemSelected,
                    ]}
                    onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}
                  >
                    <Text style={[styles.dropdownItemText, selected && styles.textBrand]} numberOfLines={1}>
                      {opt.label}
                    </Text>
                    {selected && <Feather name="check" size={15} color={C.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const renderCard = ({ item }: { item: any }) => {
    const outstanding = item.totalPayable - item.totalPaid;
    const pct = item.totalPayable > 0 ? Math.min((item.totalPaid / item.totalPayable) * 100, 100) : 0;
    const isPaid = pct >= 100;
    const barColor = isPaid ? C.green : (outstanding > 0 && item.totalPaid > 0 ? C.amber : C.primary);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, { backgroundColor: avatarColorFor(item.student?.name) + '1A', borderColor: avatarColorFor(item.student?.name) + '33' }]}>
            <Text style={[styles.avatarText, { color: avatarColorFor(item.student?.name) }]}>{initialsOf(item.student?.name)}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.studentName} numberOfLines={1}>{item.student?.name}</Text>
            <Text style={styles.admissionNo}>Adm No. {item.student?.admissionNo || item.student?.rollNo || '—'}</Text>
          </View>
          <View style={styles.structBadge}>
            <Text style={styles.structBadgeText} numberOfLines={1}>{item.feeStructure?.name}</Text>
          </View>
        </View>

        <View style={styles.financeGrid}>
          <View style={styles.finBox}>
            <Text style={styles.finLbl}>PAYABLE</Text>
            <Text style={styles.finVal}>₹{item.totalPayable?.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.finDivider} />
          <View style={styles.finBox}>
            <Text style={styles.finLbl}>PAID</Text>
            <Text style={[styles.finVal, { color: C.greenDark }]}>₹{item.totalPaid?.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.finDivider} />
          <View style={styles.finBox}>
            <Text style={styles.finLbl}>DUE</Text>
            <Text style={[styles.finVal, outstanding > 0 ? { color: C.primaryDark } : { color: C.greenDark }]}>
              ₹{outstanding.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.progressRow}>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${pct}%`, backgroundColor: barColor }]} />
          </View>
          <Text style={[styles.progressPct, { color: barColor }]}>{Math.round(pct)}%</Text>
        </View>

        {hasPermission('update') && outstanding > 0 && (
          <View style={styles.cardFooter}>
            <TouchableOpacity style={styles.collectBtn} onPress={() => openCollectModal(item)} activeOpacity={0.9}>
              <Feather name="plus-circle" size={15} color="#fff" />
              <Text style={styles.collectBtnText}>Collect Payment</Text>
            </TouchableOpacity>
          </View>
        )}
        {isPaid && (
          <View style={styles.paidPill}>
            <Feather name="check-circle" size={12} color={C.greenDark} />
            <Text style={styles.paidPillText}>Fully Paid</Text>
          </View>
        )}
      </View>
    );
  };

  const listData = activeTab === 'assignments' ? studentFees : dueList;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconBadge}>
          {/* Fixed Icon: Replaced with grid */}
          <Feather name="grid" size={20} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Collect & Assign Fees</Text>
          <Text style={styles.subtitle}>Manage student fee structures and process collections</Text>
        </View>
      </View>

      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Records</Text>
          <Text style={styles.summaryValue}>{summary.count}</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Payable</Text>
          <Text style={styles.summaryValue}>₹{summary.totalPayable.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Collected</Text>
          <Text style={[styles.summaryValue, { color: C.greenDark }]}>₹{summary.totalPaid.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Outstanding</Text>
          <Text style={[styles.summaryValue, { color: C.primaryDark }]}>₹{summary.totalDue.toLocaleString('en-IN')}</Text>
        </View>
      </View>

      {/* Filters — class dropdown + compact Assign button share one row */}
      <View style={styles.filterSection}>
        <View style={styles.filterRow}>
          <View style={{ flex: 1, zIndex: 100 }}>
            {renderInlineDropdown(
              'classFilter',
              '',
              [{ label: 'All Classes', value: '' }, ...classes.map(c => ({ label: c.className, value: c._id }))],
              classFilter,
              (v) => { setClassFilter(v); fetchLists(authToken, v); },
              'Filter by Class'
            )}
          </View>

          {hasPermission('create') && (
            <TouchableOpacity
              style={styles.addBtnCompact}
              activeOpacity={0.9}
              onPress={() => {
                setAssignForm({ ...assignForm, mode: 'single', student: '', classId: '', feeStructure: '' });
                setShowAssign(true);
              }}
            >
              <Feather name="plus" size={15} color="#fff" />
              <Text style={styles.addBtnCompactText}>Assign Fee</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'assignments' && styles.tabBtnActive]} onPress={() => setActiveTab('assignments')} activeOpacity={0.85}>
            <Feather name="list" size={14} color={activeTab === 'assignments' ? '#fff' : C.textMuted} />
            <Text style={[styles.tabText, activeTab === 'assignments' && styles.tabTextActive]}>All Assignments</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'due' && styles.tabBtnActive]} onPress={() => setActiveTab('due')} activeOpacity={0.85}>
            <Feather name="alert-circle" size={14} color={activeTab === 'due' ? '#fff' : C.textMuted} />
            <Text style={[styles.tabText, activeTab === 'due' && styles.tabTextActive]}>Pending Dues</Text>
            {dueList.length > 0 && (
              <View style={styles.tabCountPill}>
                <Text style={styles.tabCountText}>{dueList.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchLists(authToken, classFilter, true)} colors={[C.primary]} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                {/* Fixed Icon: Replaced with grid */}
                <Feather name="grid" size={30} color={C.textFaint} />
              </View>
              <Text style={styles.emptyTitle}>No Records Found</Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'due' ? 'No pending dues for this selection.' : 'No fee assignments created yet.'}
              </Text>
            </View>
          }
          renderItem={renderCard}
        />
      )}

      {/* MODAL: Assign Fee */}
      <Modal visible={showAssign} animationType="fade" transparent statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            
            {/* UPDATED MODAL HEADER: Project Color & Native X Icon */}
            <View style={styles.formHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>Assign Fee Structure</Text>
                <Text style={styles.formHint}>Attach a fee structure to a student or class</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAssign(false)} style={styles.closeBtnIcon} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>

              <View style={styles.segmentControl}>
                <TouchableOpacity style={[styles.segmentBtn, assignForm.mode === 'single' && styles.segmentBtnActive]} onPress={() => setAssignForm({ ...assignForm, mode: 'single' })}>
                  <Feather name="user" size={13} color={assignForm.mode === 'single' ? '#fff' : C.textMuted} />
                  <Text style={[styles.segmentText, assignForm.mode === 'single' && styles.segmentTextActive]}>Single Student</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.segmentBtn, assignForm.mode === 'bulk' && styles.segmentBtnActive]} onPress={() => setAssignForm({ ...assignForm, mode: 'bulk' })}>
                  <Feather name="users" size={13} color={assignForm.mode === 'bulk' ? '#fff' : C.textMuted} />
                  <Text style={[styles.segmentText, assignForm.mode === 'bulk' && styles.segmentTextActive]}>Whole Class</Text>
                </TouchableOpacity>
              </View>

              <View style={{ zIndex: 40, marginBottom: 4 }}>
                {assignForm.mode === 'single'
                  ? renderInlineDropdown('studentId', 'Select Student *', students.map(s => ({ label: `${s.name} (${s.rollNo || ''})`, value: s._id })), assignForm.student, (v) => setAssignForm({ ...assignForm, student: v }))
                  : renderInlineDropdown('classId', 'Select Class *', classes.map(c => ({ label: c.className, value: c._id })), assignForm.classId, (v) => setAssignForm({ ...assignForm, classId: v }))
                }
              </View>

              <View style={{ zIndex: 30, marginBottom: 4 }}>
                {renderInlineDropdown('structureId', 'Fee Structure *', structures.map(s => ({ label: `${s.name} (${s.academicYear})`, value: s._id })), assignForm.feeStructure, (v) => setAssignForm({ ...assignForm, feeStructure: v }))}
              </View>

              <View style={{ zIndex: 20, marginBottom: 4 }}>
                {renderInlineDropdown('discType', 'Discount Type', [{ label: 'None', value: 'None' }, { label: 'Fixed (₹)', value: 'Fixed' }, { label: 'Percentage (%)', value: 'Percentage' }], assignForm.discountType, (v) => setAssignForm({ ...assignForm, discountType: v }))}
              </View>

              {assignForm.discountType !== 'None' && (
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.inputLabel}>Discount Value</Text>
                    <TextInput style={styles.input} keyboardType="numeric" value={assignForm.discountValue} onChangeText={t => setAssignForm({ ...assignForm, discountValue: t })} placeholderTextColor={C.textFaint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Reason</Text>
                    <TextInput style={styles.input} placeholder="e.g. Scholarship" placeholderTextColor={C.textFaint} value={assignForm.discountReason} onChangeText={t => setAssignForm({ ...assignForm, discountReason: t })} />
                  </View>
                </View>
              )}

              {/* ACTION BUTTONS (CANCEL AND CONFIRM IN SAME ROW) */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAssign(false)} activeOpacity={0.9}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.saveBtnFull, { flex: 1, marginTop: 0 }, saving && { opacity: 0.7 }]} onPress={handleAssign} disabled={saving} activeOpacity={0.9}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Confirm</Text>}
                </TouchableOpacity>
              </View>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Collect Payment */}
      <Modal visible={!!collectTarget} animationType="fade" transparent statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            
            {/* UPDATED MODAL HEADER: Project Color & Native X Icon */}
            <View style={styles.formHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>Collect Payment</Text>
                <Text style={styles.formHint} numberOfLines={1}>
                  {collectTarget?.student?.name} • Adm: {collectTarget?.student?.admissionNo || '-'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCollectTarget(null)} style={styles.closeBtnIcon} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>

              <View style={styles.alertBox}>
                <Feather name="info" size={17} color={C.primaryDark} />
                <Text style={styles.alertText}>
                  Total Outstanding Due: ₹{((collectTarget?.totalPayable || 0) - (collectTarget?.totalPaid || 0)).toFixed(2)}
                </Text>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Amount to Collect (₹) *</Text>
                  <TextInput style={[styles.input, styles.inputBold]} keyboardType="numeric" value={collectForm.amount} onChangeText={t => setCollectForm({ ...collectForm, amount: t })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Late Fee Charge (₹)</Text>
                  <TextInput style={[styles.input, styles.inputBold, { color: C.amber }]} keyboardType="numeric" value={collectForm.lateFeeCharged} onChangeText={t => setCollectForm({ ...collectForm, lateFeeCharged: t })} />
                </View>
              </View>

              <View style={{ zIndex: 40, marginBottom: 4 }}>
                {renderInlineDropdown('payMode', 'Payment Mode *', ['Cash', 'Online', 'Cheque', 'Card', 'UPI', 'Bank Transfer'].map(m => ({ label: m, value: m })), collectForm.mode, (v) => setCollectForm({ ...collectForm, mode: v }))}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Reference / Transaction No.</Text>
                <TextInput style={styles.input} placeholder="Cheque / UTR / Txn ID" placeholderTextColor={C.textFaint} value={collectForm.referenceNo} onChangeText={t => setCollectForm({ ...collectForm, referenceNo: t })} />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Payment Date *</Text>
                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowCollectDatePicker(true)} activeOpacity={0.85}>
                  <Text style={styles.datePickerText}>{formatToYMD(collectForm.paidOn)}</Text>
                  <Feather name="calendar" size={16} color={C.textMuted} />
                </TouchableOpacity>
                {showCollectDatePicker && (
                  <DateTimePicker value={collectForm.paidOn} mode="date" display="default" onChange={(e, d) => { setShowCollectDatePicker(Platform.OS === 'ios'); if (d) setCollectForm({ ...collectForm, paidOn: d }); }} />
                )}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Remarks (Optional)</Text>
                <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} multiline placeholder="Notes..." placeholderTextColor={C.textFaint} value={collectForm.remarks} onChangeText={t => setCollectForm({ ...collectForm, remarks: t })} />
              </View>

              {/* ACTION BUTTONS (CANCEL AND RECORD IN SAME ROW) */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setCollectTarget(null)} activeOpacity={0.9}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.saveBtnFullGreen, { flex: 1, marginTop: 0 }, saving && { opacity: 0.7 }]} onPress={handleCollect} disabled={saving} activeOpacity={0.9}>
                  {saving ? <ActivityIndicator color="#fff" /> : <><Feather name="check" size={18} color="#fff" style={{ marginRight: 8 }} /><Text style={styles.saveBtnFullText}>Record</Text></>}
                </TouchableOpacity>
              </View>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, paddingBottom: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.primaryBorder },
  title: { fontSize: 21, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 3, fontWeight: '500' },

  // Summary strip
  summaryStrip: {
    flexDirection: 'row', backgroundColor: C.surface, paddingVertical: 14, paddingHorizontal: 12,
    borderBottomWidth: 1, borderColor: C.border,
  },
  summaryItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  summarySep: { width: 1, backgroundColor: C.border, marginVertical: 2 },
  summaryLabel: { fontSize: 9.5, fontWeight: '800', color: C.textFaint, letterSpacing: 0.4, marginBottom: 4, textTransform: 'uppercase' },
  summaryValue: { fontSize: 14.5, fontWeight: '800', color: C.ink },

  // Filters
  filterSection: { padding: 16, paddingBottom: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  filterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },

  addBtnCompact: {
    backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 48, paddingHorizontal: 16, borderRadius: 12,
    shadowColor: C.primary, shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  addBtnCompactText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  tabContainer: { flexDirection: 'row', backgroundColor: C.surfaceSunken, padding: 4, borderRadius: 13, borderWidth: 1, borderColor: C.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 10, gap: 6 },
  tabBtnActive: { backgroundColor: C.primary, shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  tabTextActive: { color: '#fff' },
  tabCountPill: { backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 2 },
  tabCountText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.surfaceSunken, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  // Cards
  card: {
    backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#0F1626', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  avatarText: { fontSize: 14, fontWeight: '800' },
  studentName: { fontSize: 15.5, fontWeight: '800', color: C.ink },
  admissionNo: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  structBadge: { backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, borderWidth: 1, borderColor: C.primaryBorder, maxWidth: 110 },
  structBadgeText: { fontSize: 10, fontWeight: '800', color: C.primaryDark },

  financeGrid: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  finBox: { flex: 1, alignItems: 'center' },
  finDivider: { width: 1, height: 28, backgroundColor: C.border },
  finLbl: { fontSize: 9, color: C.textFaint, fontWeight: '800', marginBottom: 4, letterSpacing: 0.5 },
  finVal: { fontSize: 14, color: C.ink, fontWeight: '800' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressContainer: { flex: 1, height: 7, backgroundColor: C.surfaceSunken, borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 4 },
  progressPct: { fontSize: 11, fontWeight: '800', width: 34, textAlign: 'right' },

  cardFooter: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  collectBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: C.green,
    paddingVertical: 12, borderRadius: 11, gap: 6,
    shadowColor: C.green, shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  collectBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  paidPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 12, backgroundColor: C.greenSoft, borderWidth: 1, borderColor: C.greenBorder, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  paidPillText: { fontSize: 10.5, fontWeight: '800', color: C.greenDark },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(9,14,26,0.62)', justifyContent: 'center', padding: 16 },
  compactModalContainer: {
    backgroundColor: C.surface, borderRadius: 26, maxHeight: '90%', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
  },
  // UPDATED MODAL HEADER
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, backgroundColor: C.primary, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  formHint: { fontSize: 12, color: '#FCA5A5', marginTop: 3 },
  closeBtnIcon: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  formScroll: { padding: 20 },

  segmentControl: { flexDirection: 'row', backgroundColor: C.surfaceSunken, padding: 4, borderRadius: 13, borderWidth: 1, borderColor: C.border, marginBottom: 20 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10 },
  segmentBtnActive: { backgroundColor: C.primary, shadowColor: C.primary, shadowOpacity: 0.2, shadowRadius: 5, elevation: 1 },
  segmentText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  segmentTextActive: { color: '#fff' },

  alertBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primarySoft, padding: 14, borderRadius: 13, marginBottom: 20, gap: 8, borderWidth: 1, borderColor: C.primaryBorder },
  alertText: { fontSize: 13.5, fontWeight: '800', color: C.primaryDark, flex: 1 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.4 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 13, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  inputBold: { fontWeight: '800', fontSize: 16 },
  row: { flexDirection: 'row', marginBottom: 16, zIndex: 2 },

  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 13, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 14, color: C.text, fontWeight: '600' },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 13, paddingHorizontal: 14, paddingRight: 8, height: 48, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary, backgroundColor: C.surface },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600', flex: 1 },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint, flex: 1 },
  chevronBadge: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.surfaceSunken, justifyContent: 'center', alignItems: 'center' },
  chevronBadgeActive: { backgroundColor: C.primary },
  dropdownListContainer: {
    position: 'absolute', top: 52, left: 0, right: 0, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderStrong, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, height: 46, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemSelected: { backgroundColor: C.primarySoft },
  dropdownItemText: { fontSize: 13.5, color: C.slate, fontWeight: '500', flex: 1 },
  dropdownEmpty: { padding: 16, alignItems: 'center' },
  dropdownEmptyText: { fontSize: 12.5, color: C.textFaint, fontWeight: '600' },
  textBrand: { color: C.primary, fontWeight: '800' },

  // BUTTON STYLES FOR SIDE BY SIDE LAYOUT
  saveBtnFull: { backgroundColor: C.primary, height: 52, borderRadius: 15, justifyContent: 'center', alignItems: 'center', shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  saveBtnFullGreen: { backgroundColor: C.green, flexDirection: 'row', height: 52, borderRadius: 15, justifyContent: 'center', alignItems: 'center', shadowColor: C.green, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: { flex: 1, height: 52, borderRadius: 15, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelBtnText: { color: C.textMuted, fontSize: 15, fontWeight: '800' },
});