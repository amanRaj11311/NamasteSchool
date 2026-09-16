import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { API_BASE } from '../../network/api';


const C = {
  bg: '#F4F6F9',
  surface: '#FFFFFF',
  surfaceSoft: '#F9FAFB',
  border: '#ECEFF3',
  text: '#101828',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  primary: '#E11D2E',
  primaryDark: '#B91424',
  primarySoft: '#FEECEC',
  blue: '#0EA5E9',
  blueSoft: '#E0F2FE',
  success: '#0F9D58',
  successSoft: '#E9F9EF',
};

const AVATAR_COLORS = ['#E11D2E', '#2563EB', '#0F9D58', '#B45309', '#7C3AED', '#0891B2'];
const colorForName = (name: string = '') => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
const initialsForName = (name: string = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';

const formatToYMD = (d: Date): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

export default function HostelAllocationScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [allocations, setAllocations] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allocating, setAllocating] = useState(false);

  const [form, setForm] = useState({ studentId: '', roomId: '', allocatedDate: new Date() });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchData(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchData = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const results = await Promise.allSettled([
        axios.get(`${API_BASE}/hostel/allocations?active=true`, authHeaders(token)),
        axios.get(`${API_BASE}/students?limit=500`, authHeaders(token)),
        axios.get(`${API_BASE}/hostel/rooms`, authHeaders(token)),
      ]);
      const [allocRes, stuRes, roomsRes] = results;

      if (allocRes.status === 'fulfilled') setAllocations(allocRes.value.data?.data || []);
      else console.error('Allocations fetch failed:', allocRes.reason?.response?.status, allocRes.reason?.message);

      if (stuRes.status === 'fulfilled') setStudents(stuRes.value.data?.data || []);
      else console.error('Students fetch failed:', stuRes.reason?.response?.status, stuRes.reason?.message);

      if (roomsRes.status === 'fulfilled') setRooms(roomsRes.value.data?.data || []);
      else console.error('Rooms fetch failed:', roomsRes.reason?.response?.status, roomsRes.reason?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAllocate = async () => {
    if (!form.studentId || !form.roomId) { Alert.alert('Missing information', 'Please select a student and a room.'); return; }
    setAllocating(true);
    try {
      await axios.post(`${API_BASE}/hostel/allocations`, {
        studentId: form.studentId,
        roomId: form.roomId,
        allocatedDate: formatToYMD(form.allocatedDate)
      }, authHeaders(authToken));

      Alert.alert('Success', 'Bed allocated successfully');
      setForm({ studentId: '', roomId: '', allocatedDate: new Date() });
      fetchData(authToken, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to allocate');
    } finally {
      setAllocating(false);
    }
  };

  // Premium top stat strip
  const stats = useMemo(() => {
    const availableRooms = rooms.filter(r => (r.occupied || 0) < (r.capacity || 0)).length;
    return {
      studentsCount: students.length,
      availableRooms,
      activeAllocations: allocations.length,
    };
  }, [students, rooms, allocations]);

  const renderInlineDropdown = (
    fieldKey: string,
    label: string,
    icon: string,
    options: any[],
    value: string,
    onSelect: (v: string) => void,
    zIndexOff = 0
  ) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 + zIndexOff : 1 + zIndexOff }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]}
          onPress={() => setActiveDropdown(isOpen ? null : fieldKey)}
          activeOpacity={0.85}
        >
          <View style={styles.dropdownHeaderLeft}>
            <View style={[styles.fieldIconBadge, isOpen && styles.fieldIconBadgeActive]}>
              <Feather name={icon} size={13} color={isOpen ? '#fff' : C.primary} />
            </View>
            <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
              {selectedObj?.label || 'Choose...'}
            </Text>
          </View>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={17} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} showsVerticalScrollIndicator={true}>
              {options.length === 0 && (
                <Text style={styles.dropdownEmptyText}>No options available</Text>
              )}
              {options.map((opt, i) => (
                <TouchableOpacity
                  key={opt.value + i}
                  style={[styles.dropdownItem, i === options.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}
                >
                  <Text style={[styles.dropdownItemText, value === opt.value && styles.textBrand]}>{opt.label}</Text>
                  {value === opt.value && <Feather name="check" size={15} color={C.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>

      {/* PAGE HEADER */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Bed Allocation</Text>
        <Text style={styles.pageSubtitle}>Assign students to available rooms</Text>
      </View>

      {/* PREMIUM STAT STRIP */}
      <View style={styles.statStrip}>
        <View style={styles.statCard}>
          <View style={[styles.statIconBadge, { backgroundColor: C.blueSoft }]}>
            <Feather name="users" size={15} color={C.blue} />
          </View>
          <Text style={styles.statValue}>{stats.studentsCount}</Text>
          <Text style={styles.statLabel}>Students</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <View style={[styles.statIconBadge, { backgroundColor: C.successSoft }]}>
            <Feather name="grid" size={15} color={C.success} />
          </View>
          <Text style={styles.statValue}>{stats.availableRooms}</Text>
          <Text style={styles.statLabel}>Rooms Free</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <View style={[styles.statIconBadge, { backgroundColor: C.primarySoft }]}>
            <Feather name="key" size={15} color={C.primary} />
          </View>
          <Text style={styles.statValue}>{stats.activeAllocations}</Text>
          <Text style={styles.statLabel}>Allocated</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={styles.loadingText}>Loading allocations…</Text>
          </View>
        ) : (
          <FlatList
            data={allocations}
            keyExtractor={item => item._id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(authToken, true)} colors={[C.primary]} tintColor={C.primary} />}
            ListHeaderComponent={
              <View style={styles.formCard}>
                <View style={styles.formCardHeader}>
                  <View style={styles.formCardIconBadge}>
                    <Feather name="key" size={16} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formCardTitle}>Allocate Bed</Text>
                    <Text style={styles.formCardSubtitle}>Assign a student to an available room</Text>
                  </View>
                </View>

                <View style={{ zIndex: 30, marginBottom: 16 }}>
                  {renderInlineDropdown(
                    'stu', 'SELECT STUDENT *', 'user',
                    students.map(s => ({ label: `${s.name} (${s.admissionNo || s.rollNo || ''})`, value: s._id })),
                    form.studentId, (v) => setForm({ ...form, studentId: v })
                  )}
                </View>

                <View style={{ zIndex: 20, marginBottom: 16 }}>
                  {renderInlineDropdown(
                    'rm', 'SELECT AVAILABLE ROOM *', 'grid',
                    rooms.map(r => ({ label: `Room ${r.roomNumber} · ${r.blockId?.name || 'Block'}`, value: r._id })),
                    form.roomId, (v) => setForm({ ...form, roomId: v })
                  )}
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>ALLOCATED DATE</Text>
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.85}>
                    <View style={styles.dropdownHeaderLeft}>
                      <View style={styles.fieldIconBadge}>
                        <Feather name="calendar" size={13} color={C.primary} />
                      </View>
                      <Text style={styles.datePickerText}>{form.allocatedDate.toLocaleDateString('en-GB')}</Text>
                    </View>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={form.allocatedDate}
                      mode="date"
                      display="default"
                      onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if (d) setForm({ ...form, allocatedDate: d }); }}
                    />
                  )}
                </View>

                <TouchableOpacity style={styles.saveBtnFull} onPress={handleAllocate} disabled={allocating} activeOpacity={0.9}>
                  {allocating
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <>
                        <Feather name="check-circle" size={17} color="#fff" />
                        <Text style={styles.saveBtnFullText}>Confirm Bed Allocation</Text>
                      </>
                    )}
                </TouchableOpacity>

                <View style={styles.sectionDivider}>
                  <Text style={styles.sectionDividerText}>ACTIVE ALLOCATIONS</Text>
                  <View style={styles.sectionCountPill}>
                    <Text style={styles.sectionCountText}>{allocations.length}</Text>
                  </View>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconBadge}>
                  <Feather name="home" size={22} color={C.textFaint} />
                </View>
                <Text style={styles.emptyTitle}>No Active Allocations</Text>
                <Text style={styles.emptySubtitle}>Allocate a bed above to see it listed here.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.allocationCard}>
                <View style={[styles.avatar, { backgroundColor: colorForName(item.studentId?.name) }]}>
                  <Text style={styles.avatarText}>{initialsForName(item.studentId?.name)}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.studentName} numberOfLines={1}>{item.studentId?.name || 'Unknown'}</Text>
                  <View style={styles.metaRow}>
                    <Feather name="map-pin" size={11} color={C.textMuted} />
                    <Text style={styles.metaText}>
                      {item.roomId?.blockId?.name || '-'} · Room {item.roomId?.roomNumber || '-'}
                    </Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Feather name="calendar" size={11} color={C.textMuted} />
                    <Text style={styles.metaText}>
                      {item.allocatedDate ? new Date(item.allocatedDate).toLocaleDateString('en-GB') : '-'}
                    </Text>
                  </View>
                </View>
                <View style={styles.feeBadge}>
                  <Text style={styles.feeText}>₹{item.roomId?.monthlyFee || 0}</Text>
                  <Text style={styles.feePeriod}>/mo</Text>
                </View>
              </View>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const shadow = {
  shadowColor: '#101828',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
};
const shadowSm = {
  shadowColor: '#101828', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Header
  pageHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: C.surface },
  pageTitle: { fontSize: 19, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  pageSubtitle: { fontSize: 12.5, color: C.textMuted, fontWeight: '500', marginTop: 2 },

  // Stat strip
  statStrip: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, marginBottom: 4, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, paddingVertical: 14, ...shadowSm },
  statCard: { flex: 1, alignItems: 'center', gap: 4 },
  statIconBadge: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  statValue: { fontSize: 17, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 10.5, fontWeight: '700', color: C.textMuted, letterSpacing: 0.3 },
  statDivider: { width: 1, height: 34, backgroundColor: C.border },

  loadingState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, color: C.textMuted, fontWeight: '600' },

  listContent: { padding: 16, paddingTop: 16, paddingBottom: 40 },

  formCard: { backgroundColor: C.surface, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: C.border, marginBottom: 18, ...shadow },
  formCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  formCardIconBadge: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  formCardTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  formCardSubtitle: { fontSize: 12, color: C.textMuted, marginTop: 2, fontWeight: '500' },

  inputWrapper: { marginBottom: 0 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, marginBottom: 7, letterSpacing: 0.6 },

  dropdownHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  fieldIconBadge: { width: 24, height: 24, borderRadius: 8, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  fieldIconBadgeActive: { backgroundColor: C.primary },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 52, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary, backgroundColor: C.surface },
  dropdownSelectedText: { fontSize: 13.5, color: C.text, fontWeight: '700', flexShrink: 1 },
  dropdownPlaceholder: { fontSize: 13.5, color: C.textFaint, fontWeight: '500' },
  dropdownListContainer: { position: 'absolute', top: 76, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, overflow: 'hidden', ...shadow, shadowOpacity: 0.12, elevation: 8 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13.5, color: C.text, fontWeight: '600', flexShrink: 1 },
  dropdownEmptyText: { padding: 16, fontSize: 12.5, color: C.textFaint, fontWeight: '500', textAlign: 'center' },
  textBrand: { color: C.primary, fontWeight: '800' },

  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 52, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 13.5, color: C.text, fontWeight: '700' },

  saveBtnFull: { flexDirection: 'row', gap: 8, backgroundColor: C.primary, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 22, shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 4 },
  saveBtnFullText: { color: '#fff', fontSize: 14.5, fontWeight: '800', letterSpacing: 0.2 },

  sectionDivider: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, paddingTop: 18, borderTopWidth: 1, borderTopColor: C.border },
  sectionDividerText: { fontSize: 11, fontWeight: '800', color: C.textMuted, letterSpacing: 0.8 },
  sectionCountPill: { backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  sectionCountText: { fontSize: 11.5, fontWeight: '800', color: C.primaryDark },

  emptyState: { alignItems: 'center', padding: 40, gap: 4 },
  emptyIconBadge: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: C.border },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  emptySubtitle: { fontSize: 12, color: C.textMuted, fontWeight: '500' },

  allocationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10, ...shadow },
  avatar: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: C.surface, shadowColor: '#101828', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  studentName: { fontSize: 14.5, fontWeight: '800', color: C.text, marginBottom: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  metaText: { fontSize: 11.5, color: C.textMuted, fontWeight: '600' },
  feeBadge: { backgroundColor: C.successSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  feeText: { fontSize: 13.5, fontWeight: '800', color: C.success },
  feePeriod: { fontSize: 11, fontWeight: '700', color: C.success, opacity: 0.8 },
});