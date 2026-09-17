import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';

import { API_BASE } from '../../network/api';
interface LeaveType {
  _id: string;
  name: string;
  code: string;
  schoolId?: { _id: string; name: string };
  maxDays: number;
  isPaid: boolean;
  applicableFor: 'Staff' | 'Student' | 'Both';
  allowCarryForward: boolean;
  allowHalfDay: boolean;
  description: string;
}

const initialForm = { schoolId: '', name: '', code: '', maxDays: '12', isPaid: true, applicableFor: 'Both', allowCarryForward: false, allowHalfDay: true, description: '' };

export default function LeaveTypesScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [isFormVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(initialForm);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => { initialize(); }, []);

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
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [typesRes, schoolsRes] = await Promise.all([
        axios.get(`${API_BASE}/leave/types`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (typesRes.data?.success) setLeaveTypes(typesRes.data.data || []);
      if (schoolsRes.data?.success) setSchools(schoolsRes.data.data || []);
    } catch (error) { console.error(error); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'leavetype' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const openForm = (item?: LeaveType) => {
    if (item) {
      setEditingId(item._id);
      setFormData({ schoolId: item.schoolId?._id || '', name: item.name, code: item.code, maxDays: String(item.maxDays), isPaid: item.isPaid, applicableFor: item.applicableFor as any, allowCarryForward: item.allowCarryForward, allowHalfDay: item.allowHalfDay, description: item.description || '' });
    } else {
      setEditingId(null); setFormData(initialForm);
    }
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete", "Remove this leave type?", [
      { text: "Cancel" }, { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await axios.delete(`${API_BASE}/leave/types/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
          fetchData(authToken, true);
        } catch (e) { Alert.alert("Error", "Failed to delete."); }
      }}
    ]);
  };

  const handleSave = async () => {
    if (!formData.schoolId || !formData.name || !formData.code || !formData.maxDays) { Alert.alert("Error", "Fill required fields including School."); return; }
    try {
      const payload = { ...formData, maxDays: Number(formData.maxDays) };
      if (editingId) await axios.put(`${API_BASE}/leave/types/${editingId}`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
      else await axios.post(`${API_BASE}/leave/types`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
      setFormVisible(false); fetchData(authToken, true);
    } catch (e: any) { Alert.alert("Error", e.response?.data?.message || "Failed to save."); }
  };

  const paidCount = leaveTypes.filter(t => t.isPaid).length;

  const renderInlineDropdown = (fieldKey: 'schoolId' | 'applicableFor', label: string, options: {label: string, value: string}[]) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === formData[fieldKey]);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.8}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || `Select...`}</Text>
          <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{maxHeight: 150}} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => (
                <TouchableOpacity key={opt.value} style={[styles.dropdownItem, i !== options.length - 1 && styles.borderBottom]} onPress={() => { setFormData({ ...formData, [fieldKey]: opt.value as any }); setActiveDropdown(null); }}>
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
      <View style={styles.header}>
        <Text style={styles.title}>Leave Types</Text>
        <Text style={styles.subtitle}>Configure leave categories, quotas, and branch rules.</Text>
      </View>

      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={styles.kpiRow}><View style={[styles.iconCircle, {backgroundColor: '#E0F2FE'}]}><Feather name="layers" size={16} color="#0ea5e9"/></View><Text style={styles.kpiValue}>{leaveTypes.length}</Text></View>
          <Text style={styles.kpiLabel}>TOTAL TYPES</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={styles.kpiRow}><View style={[styles.iconCircle, {backgroundColor: '#D1FAE5'}]}><Feather name="dollar-sign" size={16} color="#10B981"/></View><Text style={styles.kpiValue}>{paidCount}</Text></View>
          <Text style={styles.kpiLabel}>PAID LEAVES</Text>
        </View>
      </View>

      <View style={styles.actionBar}>
        {hasPermission('create') && (
          <TouchableOpacity style={styles.addBtn} onPress={() => openForm()}>
            <Feather name="plus" size={14} color="#fff" /><Text style={styles.addBtnText}>Create Leave Type</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#ef4444" /></View> : (
        <FlatList
          data={leaveTypes}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(authToken, true)} colors={['#ef4444']} />}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="layers" size={40} color="#D1D5DB" /><Text style={{color: '#6B7280', marginTop: 10, fontWeight: '500'}}>No leave types configured.</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1}}>
                  <View style={styles.codeBadge}><Text style={styles.codeText}>{item.code}</Text></View>
                  <View>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>{item.schoolId?.name || 'Global'}</Text>
                  </View>
                </View>
                {item.isPaid && <View style={styles.paidBadge}><Text style={styles.paidText}>Paid</Text></View>}
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.statBox}><Text style={styles.statLbl}>MAX DAYS</Text><Text style={styles.statVal}>{item.maxDays}</Text></View>
                <View style={styles.statBox}><Text style={styles.statLbl}>APPLIES TO</Text><Text style={[styles.statVal, {fontSize: 13}]}>{item.applicableFor}</Text></View>
                <View style={styles.statBox}><Text style={styles.statLbl}>CARRY FWD</Text><Feather name={item.allowCarryForward ? "check" : "minus"} color={item.allowCarryForward ? "#10B981" : "#9CA3AF"} size={16}/></View>
                <View style={styles.statBox}><Text style={styles.statLbl}>HALF-DAY</Text><Feather name={item.allowHalfDay ? "check" : "minus"} color={item.allowHalfDay ? "#10B981" : "#9CA3AF"} size={16}/></View>
              </View>

              <View style={styles.cardActions}>
                {hasPermission('update') && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openForm(item)}><Feather name="edit-2" size={14} color="#10B981" /></TouchableOpacity>}
                {hasPermission('delete') && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(item._id)}><Feather name="trash-2" size={14} color="#ef4444" /></TouchableOpacity>}
              </View>
            </View>
          )}
        />
      )}

      {/* Floating Modal Form */}
      <Modal visible={isFormVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingId ? 'Edit Leave Type' : 'Add Leave Type'}</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color="#4B5563" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              {renderInlineDropdown('schoolId', 'School Branch *', schools.map(s => ({label: s.name, value: s._id})))}

              <View style={styles.row}>
                <View style={{flex: 1, marginRight: 10}}><Text style={styles.inputLabel}>Name *</Text><TextInput style={styles.input} value={formData.name} onChangeText={t => setFormData({...formData, name: t})} /></View>
                <View style={{flex: 1}}><Text style={styles.inputLabel}>Code *</Text><TextInput style={styles.input} value={formData.code} onChangeText={t => setFormData({...formData, code: t})} /></View>
              </View>
              
              <View style={[styles.row, { zIndex: 10 }]}>
                <View style={{flex: 1, marginRight: 10}}><Text style={styles.inputLabel}>Max Days / Year *</Text><TextInput style={styles.input} keyboardType="numeric" value={formData.maxDays} onChangeText={t => setFormData({...formData, maxDays: t})} /></View>
                <View style={{flex: 1}}>{renderInlineDropdown('applicableFor', 'Applicable For', [{label:'Staff',value:'Staff'},{label:'Student',value:'Student'},{label:'Both',value:'Both'}])}</View>
              </View>

              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 20, marginTop: 4}}>
                <TouchableOpacity style={styles.toggleBtn} onPress={() => setFormData({...formData, isPaid: !formData.isPaid})}>
                  <Feather name={formData.isPaid ? "check-square" : "square"} size={18} color={formData.isPaid ? "#10B981" : "#9CA3AF"} /><Text style={styles.toggleLbl}>Paid Leave</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.toggleBtn} onPress={() => setFormData({...formData, allowCarryForward: !formData.allowCarryForward})}>
                  <Feather name={formData.allowCarryForward ? "check-square" : "square"} size={18} color={formData.allowCarryForward ? "#10B981" : "#9CA3AF"} /><Text style={styles.toggleLbl}>Carry Forward</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.toggleBtn} onPress={() => setFormData({...formData, allowHalfDay: !formData.allowHalfDay})}>
                  <Feather name={formData.allowHalfDay ? "check-square" : "square"} size={18} color={formData.allowHalfDay ? "#10B981" : "#9CA3AF"} /><Text style={styles.toggleLbl}>Allow Half-Day</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput style={[styles.input, {height: 70, textAlignVertical: 'top'}]} multiline value={formData.description} onChangeText={t => setFormData({...formData, description: t})} />
              
              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave}><Text style={styles.saveBtnFullText}>{editingId ? 'Update Type' : 'Create Type'}</Text></TouchableOpacity>
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
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#E5E7EB' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 },
  kpiCard: { width: '48%', backgroundColor: '#fff', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', elevation: 1 },
  kpiRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  iconCircle: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 18, fontWeight: '800', color: '#111827', flex: 1 },
  kpiLabel: { fontSize: 9, fontWeight: '800', color: '#6B7280', letterSpacing: 0.5 },

actionBar: {
  paddingHorizontal: 16,
  paddingVertical: 12,
  alignItems: 'flex-end',
  zIndex: 10,
  elevation: 5,
}, 
addBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#B3122A',
  paddingHorizontal: 16,
  paddingVertical: 11,
  borderRadius: 10,
  gap: 7,
  elevation: 3,
},                     addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  codeBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  codeText: { fontSize: 12, fontWeight: '800', color: '#4B5563' },
  cardName: { fontSize: 18, fontWeight: '800', color: '#111827' },
  cardSub: { fontSize: 11, color: '#6B7280', fontWeight: '700', marginTop: 2 },
  paidBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#A7F3D0' },
  paidText: { fontSize: 10, fontWeight: '800', color: '#059669' },

  statsGrid: { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  statBox: { flex: 1, alignItems: 'center' },
  statLbl: { fontSize: 9, color: '#6B7280', fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
  statVal: { fontSize: 15, color: '#111827', fontWeight: '800' },

  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderColor: '#F3F4F6', gap: 10 },
  iconBtnEdit: { padding: 8, backgroundColor: '#ECFDF5', borderRadius: 8, borderWidth: 1, borderColor: '#D1FAE5' },
  iconBtnDelete: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FEE2E2' },
  emptyState: { alignItems: "center", padding: 40, backgroundColor: "#fff", borderRadius: 16, borderWidth: 2, borderColor: "#E5E7EB", borderStyle: "dashed" },

  // Floating Modal Form
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: '#fff', borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtnIcon: { padding: 6, backgroundColor: '#E5E7EB', borderRadius: 20 },
  formScroll: { padding: 20 },
  
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
  
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLbl: { fontSize: 13, fontWeight: '600', color: '#374151' },

  saveBtnFull: { backgroundColor: '#B3122A', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});