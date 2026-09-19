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
import axios from 'axios';
import { API_BASE } from '../../network/api';

interface LeaveBalance {
  _id: string;
  staff: { _id: string; name: string };
  leaveType: { _id: string; name: string };
  schoolId?: { _id: string; name: string };
  year: number;
  totalDays: number;
  carriedForwardDays: number;
  usedDays: number;
}

export default function LeaveBalancesScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [isFormVisible, setFormVisible] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    schoolId: '',
    staffId: '',
    leaveTypeId: '',
    year: new Date().getFullYear().toString(),
    totalDays: '0',
  });

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchData(token);
  };

  const fetchData = async (token: string | null, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [balRes, staffRes, typesRes, schoolsRes] = await Promise.all([
        axios.get(`${API_BASE}/leave/balances`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/staff?limit=500`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/leave/types`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (balRes.data?.success) setBalances(balRes.data.data || []);
      if (staffRes.data?.success) setStaffList(staffRes.data.data || []);
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
      return permissions.some((p) => p.module === 'leavebalance' && p.action === action);
    },
    [permissions, isSuperAdmin]
  );

  const handleSave = async () => {
    if (!formData.schoolId || !formData.staffId || !formData.leaveTypeId || !formData.year || !formData.totalDays) {
      Alert.alert('Error', 'Please fill all required fields including School Branch.');
      return;
    }
    try {
      const payload = { ...formData, year: Number(formData.year), totalDays: Number(formData.totalDays) };
      await axios.post(`${API_BASE}/leave/balances/set`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
      Alert.alert('Success', 'Leave balance set successfully.');
      setFormVisible(false);
      fetchData(authToken, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to set balance.');
    }
  };

  const renderInlineDropdown = (fieldKey: 'schoolId' | 'staffId' | 'leaveTypeId', label: string, options: { label: string; value: string }[]) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find((o) => o.value === formData[fieldKey]);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]}
          onPress={() => setActiveDropdown(isOpen ? null : fieldKey)}
          activeOpacity={0.8}
        >
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selectedObj?.label || `Select...`}
          </Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#6B7280" />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.dropdownItem, i !== options.length - 1 && styles.borderBottom]}
                  onPress={() => {
                    setFormData({ ...formData, [fieldKey]: opt.value });
                    setActiveDropdown(null);
                  }}
                >
                  <Text style={[styles.dropdownItemText, formData[fieldKey] === opt.value && styles.textRed]}>{opt.label}</Text>
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
      {/* Header with Title, Subtitle and Button */}
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Leave Balances</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            Set yearly leave quotas per staff member.
          </Text>
        </View>
        {hasPermission('create') && (
          <TouchableOpacity
            style={styles.headerAddBtn}
            onPress={() => {
              setFormData({ schoolId: '', staffId: '', leaveTypeId: '', year: new Date().getFullYear().toString(), totalDays: '0' });
              setFormVisible(true);
            }}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.headerAddBtnText}>Set Balance</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={styles.kpiRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#F3E8FF' }]}>
              <Feather name="bar-chart-2" size={16} color="#D946EF" />
            </View>
            <Text style={styles.kpiValue}>{balances.length}</Text>
          </View>
          <Text style={styles.kpiLabel}>TOTAL ALLOCATIONS</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={styles.kpiRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
              <Feather name="users" size={16} color="#F59E0B" />
            </View>
            <Text style={styles.kpiValue}>{staffList.length}</Text>
          </View>
          <Text style={styles.kpiLabel}>ELIGIBLE STAFF</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#B3122A" />
        </View>
      ) : (
        <FlatList
          data={balances}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(authToken, true)} colors={['#B3122A']} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="pie-chart" size={40} color="#D1D5DB" />
              <Text style={{ color: '#6B7280', marginTop: 10, fontWeight: '500' }}>No balances configured.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const remaining = item.totalDays + item.carriedForwardDays - item.usedDays;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{item.staff?.name?.charAt(0) || 'U'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.staffName} numberOfLines={1}>
                        {item.staff?.name}
                      </Text>
                      <Text style={styles.schoolSubText} numberOfLines={1}>
                        {item.schoolId?.name || 'No Branch'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.yearBadge}>
                    <Text style={styles.yearText}>{item.year}</Text>
                  </View>
                </View>

                <Text style={styles.leaveType}>{item.leaveType?.name}</Text>

                <View style={styles.statsGrid}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLbl}>TOTAL</Text>
                    <Text style={styles.statVal}>{item.totalDays}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLbl}>CARRY FWD</Text>
                    <Text style={[styles.statVal, { color: '#10B981' }]}>{item.carriedForwardDays}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLbl}>USED</Text>
                    <Text style={[styles.statVal, { color: '#ef4444' }]}>{item.usedDays}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLbl}>REMAINING</Text>
                    <Text style={[styles.statVal, { color: '#0ea5e9' }]}>{remaining}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Floating Form Modal */}
      <Modal visible={isFormVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Set Leave Balance</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}>
                <Text style={{ fontSize: 20, }}>✖</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              {renderInlineDropdown(
                'schoolId',
                'School Branch *',
                schools.map((s) => ({ label: s.name, value: s._id }))
              )}
              {renderInlineDropdown(
                'staffId',
                'Staff Member *',
                staffList.map((s) => ({ label: s.name, value: s._id }))
              )}
              {renderInlineDropdown(
                'leaveTypeId',
                'Leave Type *',
                leaveTypes.map((t) => ({ label: t.name, value: t._id }))
              )}

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Year *</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formData.year}
                    onChangeText={(t) => setFormData({ ...formData, year: t })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Total Days *</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formData.totalDays}
                    onChangeText={(t) => setFormData({ ...formData, totalDays: t })}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave}>
                <Text style={styles.saveBtnFullText}>Allocate Balance</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F9' },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },

  // Header with Add Button
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F3',
  },
  headerTextContainer: { flex: 1, paddingRight: 10 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '500' },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#B3122A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
    shadowColor: '#B3122A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  headerAddBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 },
  kpiCard: { width: '48%', backgroundColor: '#fff', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', elevation: 1 },
  kpiRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  iconCircle: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 18, fontWeight: '800', color: '#111827', flex: 1 },
  kpiLabel: { fontSize: 9, fontWeight: '800', color: '#6B7280', letterSpacing: 0.5 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', elevation: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E0F2FE', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#0ea5e9' },
  staffName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  schoolSubText: { fontSize: 11, color: '#6B7280', fontWeight: '700', marginTop: 2 },
  yearBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
  yearText: { fontSize: 12, fontWeight: '800', color: '#4B5563' },
  leaveType: { fontSize: 13, color: '#B3122A', fontWeight: '800', marginBottom: 12, marginTop: 12, textTransform: 'uppercase' },

  statsGrid: { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  statBox: { flex: 1, alignItems: 'center' },
  statLbl: { fontSize: 9, color: '#6B7280', fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
  statVal: { fontSize: 15, color: '#111827', fontWeight: '800' },

  emptyState: { alignItems: 'center', padding: 40, backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed' },

  // Floating Modal Form
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: '#fff', borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
formHeader: {
  backgroundColor: '#B3122A',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 20,
  borderBottomWidth: 1,
  borderBottomColor: '#B3122A',
},  formTitle: {
  fontSize: 19,
  fontWeight: '800',
  color: '#FFFFFF',
},
closeBtnIcon: {
  padding: 8,
  backgroundColor: '#FFFFFF',
  borderRadius: 20,
},  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#4B5563', marginBottom: 6, marginLeft: 2 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: '#fff', fontSize: 14, color: '#111827' },
  row: { flexDirection: 'row', marginBottom: 16, zIndex: 2 },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: '#fff' },
  dropdownHeaderActive: { borderColor: '#B3122A' },
  dropdownSelectedText: { fontSize: 14, color: '#111827', fontWeight: '500' },
  dropdownPlaceholder: { fontSize: 14, color: '#9CA3AF' },
  dropdownListContainer: { position: 'absolute', top: 72, left: 0, right: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, elevation: 5 },
  dropdownItem: { padding: 14 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dropdownItemText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  textRed: { color: '#B3122A', fontWeight: '700' },

  saveBtnFull: { backgroundColor: '#B3122A', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});