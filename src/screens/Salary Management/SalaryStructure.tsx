import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { API_BASE } from '../../network/api';
const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#B3122A', primaryDark: '#C5221F', primarySoft: '#FDE8E8',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
};

function getEmptyStructureForm() {
  return { name: '', basic: '', components: [{ name: '', type: 'Earning', calcType: 'Fixed', value: '' }] };
}
function getEmptyAssignForm() {
  return { mode: 'single', staff: '', staffType: '', salaryStructure: '', basic: '', effectiveFrom: new Date() };
}
function resolveAmount(basic: any, comp: any) {
  const val = Number(comp.value || 0);
  return comp.calcType === 'PercentOfBasic' ? Math.round((Number(basic || 0) * val) / 100) : val;
}

export default function SalaryStructureScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [tab, setTab] = useState<'structures' | 'assignments'>('structures');
  const [structures, setStructures] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const [structModal, setStructModal] = useState(false);
  const [structForm, setStructForm] = useState(getEmptyStructureForm());
  const [editingStructId, setEditingStructId] = useState<string | null>(null);

  const [assignModal, setAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState(getEmptyAssignForm());
  const [showEffDatePicker, setShowEffDatePicker] = useState(false);

  const staffTypes = [...new Set(staffList.map(s => s.staffType).filter(Boolean))];

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchAll(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchAll = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [structRes, assignRes, staffRes] = await Promise.all([
        axios.get(`${API_BASE}/salary/structures`, authHeaders(token)),
        axios.get(`${API_BASE}/salary/assignments`, authHeaders(token)),
        axios.get(`${API_BASE}/staff?limit=500`, authHeaders(token)),
      ]);
      if (structRes.data?.success) setStructures(structRes.data.data || []);
      if (assignRes.data?.success) setAssignments(assignRes.data.data || []);
      if (staffRes.data?.success) setStaffList(staffRes.data.data || []);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((module: string, action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === module && p.action === action);
  }, [permissions, isSuperAdmin]);

  const canManageStructure = hasPermission('salaryStructure', 'create') || hasPermission('salaryStructure', 'update');
  const canDeleteStructure = hasPermission('salaryStructure', 'delete');
  const canAssign = hasPermission('salary', 'create');

  // --- Structure Handlers ---
  const openEditStruct = (s: any) => {
    setEditingStructId(s._id);
    setStructForm({
      name: s.name, basic: String(s.basic),
      components: (s.components || []).length ? s.components.map((c: any) => ({ ...c, value: String(c.value) })) : [{ name: '', type: 'Earning', calcType: 'Fixed', value: '' }],
    });
    setStructModal(true);
  };

  const handleSaveStruct = async () => {
    if (!structForm.name.trim() || !structForm.basic) { Alert.alert('Error', 'Name and basic pay required'); return; }
    if (structForm.components.some(c => !c.name || c.value === '')) { Alert.alert('Error', 'All components need name and value'); return; }
    setSaving(true);
    try {
      const payload = { name: structForm.name, basic: Number(structForm.basic), components: structForm.components.map(c => ({ ...c, value: Number(c.value) })) };
      if (editingStructId) await axios.put(`${API_BASE}/salary/structures/${editingStructId}`, payload, authHeaders(authToken));
      else await axios.post(`${API_BASE}/salary/structures`, payload, authHeaders(authToken));
      Alert.alert('Success', 'Structure saved');
      setStructModal(false); fetchAll(authToken, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Save failed'); } 
    finally { setSaving(false); }
  };

  const handleDeleteStruct = (id: string) => {
    Alert.alert('Deactivate', 'Staff assigned to it are kept as-is.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: async () => {
          try { await axios.delete(`${API_BASE}/salary/structures/${id}`, authHeaders(authToken)); fetchAll(authToken, true); } 
          catch (e) { Alert.alert('Error', 'Delete failed'); }
      }}
    ]);
  };

  // --- Assign Handlers ---
  const handleAssign = async () => {
    if (!assignForm.salaryStructure) { Alert.alert('Error', 'Select a structure'); return; }
    if (assignForm.mode === 'single' && !assignForm.staff) { Alert.alert('Error', 'Select staff'); return; }
    if (assignForm.mode === 'bulk' && !assignForm.staffType) { Alert.alert('Error', 'Select staff type'); return; }
    setSaving(true);
    try {
      if (assignForm.mode === 'single') {
        await axios.post(`${API_BASE}/salary/assignments`, {
          staff: assignForm.staff, salaryStructure: assignForm.salaryStructure,
          basic: assignForm.basic ? Number(assignForm.basic) : undefined, effectiveFrom: assignForm.effectiveFrom.toISOString().split('T')[0],
        }, authHeaders(authToken));
      } else {
        await axios.post(`${API_BASE}/salary/assignments/bulk`, {
          staffType: assignForm.staffType, salaryStructure: assignForm.salaryStructure, effectiveFrom: assignForm.effectiveFrom.toISOString().split('T')[0],
        }, authHeaders(authToken));
      }
      Alert.alert('Success', 'Salary assigned successfully');
      setAssignModal(false); fetchAll(authToken, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Assign failed'); } 
    finally { setSaving(false); }
  };

  const structTotal = (basic: any, components: any[]) => Number(basic || 0) + (components || []).filter(c => c.type === 'Earning').reduce((sum, c) => sum + resolveAmount(basic, c), 0);

  const renderInlineDropdown = (fieldKey: string, label: string | null, options: any[], value: string, onSelect: (v: string) => void, zIndexOff = 0) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 + zIndexOff : 1 + zIndexOff, marginBottom: label ? 16 : 0 }]}>
        {!!label && <Text style={styles.inputLabel}>{label}</Text>}
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive, !label && { height: 42 }]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || 'Select...'}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }}>
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="sitemap" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Salary Structure Setup</Text>
          <Text style={styles.subtitle}>Configure pay scales and assign them.</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, tab === 'structures' && styles.tabBtnActive]} onPress={() => setTab('structures')}>
            <Feather name="sitemap" size={14} color={tab === 'structures' ? '#fff' : C.textMuted} />
            <Text style={[styles.tabText, tab === 'structures' && styles.tabTextActive]}>Structures ({structures.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'assignments' && styles.tabBtnActive]} onPress={() => setTab('assignments')}>
            <Feather name="users" size={14} color={tab === 'assignments' ? '#fff' : C.textMuted} />
            <Text style={[styles.tabText, tab === 'assignments' && styles.tabTextActive]}>Assignments ({assignments.length})</Text>
          </TouchableOpacity>
        </View>

        {tab === 'structures' && canManageStructure && (
          <TouchableOpacity style={styles.addBtnFull} onPress={() => { setEditingStructId(null); setStructForm(getEmptyStructureForm()); setStructModal(true); }}>
            <Feather name="plus" size={16} color="#fff" /><Text style={styles.addBtnTextFull}>Add Structure</Text>
          </TouchableOpacity>
        )}
        {tab === 'assignments' && canAssign && (
          <TouchableOpacity style={styles.addBtnFull} onPress={() => { setAssignForm(getEmptyAssignForm()); setAssignModal(true); }}>
            <Feather name="plus" size={16} color="#fff" /><Text style={styles.addBtnTextFull}>Assign Salary</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : tab === 'structures' ? (
        <FlatList
          data={structures}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(authToken, true)} colors={[C.primary]} />}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="sitemap" size={40} color={C.textFaint} /><Text style={styles.emptyTitle}>No Structures Found</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.structSub}>Basic Pay: ₹{item.basic}</Text>
                </View>
                <View style={{flexDirection: 'row', gap: 8}}>
                  {canManageStructure && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditStruct(item)}><Feather name="edit-2" size={14} color={C.green}/></TouchableOpacity>}
                  {canDeleteStructure && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDeleteStruct(item._id)}><Feather name="trash-2" size={14} color={C.primary}/></TouchableOpacity>}
                </View>
              </View>

              <View style={styles.itemsBox}>
                {(item.components || []).map((c: any, idx: number) => (
                  <View key={idx} style={styles.itemRow}>
                    <Text style={styles.itemName} numberOfLines={1}>{c.name} <Text style={{color: c.type === 'Earning' ? C.green : C.primary}}>{c.type === 'Earning' ? '+' : '-'}{c.calcType === 'PercentOfBasic' ? `${c.value}%` : `₹${c.value}`}</Text></Text>
                    <Text style={styles.itemAmount}>₹{resolveAmount(item.basic, c)}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLbl}>Gross / Month</Text>
                <Text style={styles.totalVal}>₹{structTotal(item.basic, item.components)}</Text>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(authToken, true)} colors={[C.primary]} />}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="users" size={40} color={C.textFaint} /><Text style={styles.emptyTitle}>No Assignments Found</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.staff?.name}</Text>
                  <Text style={styles.structSub}>ID: {item.staff?.staffId || '—'} • {item.staff?.staffType}</Text>
                </View>
                <View style={styles.structBadge}><Text style={styles.structBadgeText}>{item.salaryStructure?.name}</Text></View>
              </View>

              <View style={styles.financeGrid}>
                <View style={styles.finBox}><Text style={styles.finLbl}>BASIC</Text><Text style={styles.finVal}>₹{item.basic}</Text></View>
                <View style={styles.finBox}><Text style={styles.finLbl}>GROSS</Text><Text style={styles.finVal}>₹{item.grossSalary}</Text></View>
                <View style={styles.finBox}><Text style={styles.finLbl}>NET</Text><Text style={[styles.finVal, {color: C.green}]}>₹{item.netSalary}</Text></View>
              </View>
              
              <Text style={{fontSize: 11, color: C.textMuted, marginTop: 10, textAlign: 'right'}}>Effective: {item.effectiveFrom}</Text>
            </View>
          )}
        />
      )}

      {/* MODAL: Structure Form */}
      <Modal visible={structModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingStructId ? 'Edit Structure' : 'Add Structure'}</Text>
              <TouchableOpacity onPress={() => setStructModal(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Name *</Text>
                  <TextInput style={styles.input} placeholder="Grade I" value={structForm.name} onChangeText={t => setStructForm({...structForm, name: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Basic Pay *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="10000" value={structForm.basic} onChangeText={t => setStructForm({...structForm, basic: t})} />
                </View>
              </View>

              <Text style={[styles.inputLabel, {marginTop: 10, marginBottom: 10}]}>COMPONENTS</Text>
              {structForm.components.map((item, idx) => (
                <View key={idx} style={[styles.itemConfigRow, { zIndex: 90 - idx }]}>
                  <View style={{ flex: 1.5, marginRight: 6 }}>
                    <TextInput style={[styles.input, {height: 42}]} placeholder="Name" value={item.name} onChangeText={t => { const newC = [...structForm.components]; newC[idx].name = t; setStructForm({...structForm, components: newC}); }} />
                  </View>
                  <View style={{ flex: 1.2, marginRight: 6, zIndex: 90 - idx }}>
                    {renderInlineDropdown(`type_${idx}`, null, [{label:'Earning',value:'Earning'},{label:'Deduct',value:'Deduction'}], item.type, (v) => { const newC = [...structForm.components]; newC[idx].type = v; setStructForm({...structForm, components: newC}); })}
                  </View>
                  <View style={{ flex: 1.5, marginRight: 6, zIndex: 90 - idx }}>
                    {renderInlineDropdown(`calc_${idx}`, null, [{label:'Fixed ₹',value:'Fixed'},{label:'% Basic',value:'PercentOfBasic'}], item.calcType, (v) => { const newC = [...structForm.components]; newC[idx].calcType = v; setStructForm({...structForm, components: newC}); })}
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput style={[styles.input, {height: 42}]} placeholder="Val" keyboardType="numeric" value={item.value} onChangeText={t => { const newC = [...structForm.components]; newC[idx].value = t; setStructForm({...structForm, components: newC}); }} />
                  </View>
                  {structForm.components.length > 1 && (
                    <TouchableOpacity style={styles.removeBtn} onPress={() => setStructForm({...structForm, components: structForm.components.filter((_, i) => i !== idx)})}>
                      <Feather name="x" size={16} color={C.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity style={styles.addItemBtn} onPress={() => setStructForm({...structForm, components: [...structForm.components, { name: '', type: 'Earning', calcType: 'Fixed', value: '' }]})}>
                <Feather name="plus" size={14} color={C.blue} /><Text style={styles.addItemText}>Add Component</Text>
              </TouchableOpacity>

              <View style={styles.totalCalcRow}>
                <Text style={styles.totalCalcLbl}>Gross / Month</Text>
                <Text style={styles.totalCalcVal}>₹{structTotal(structForm.basic, structForm.components).toLocaleString('en-IN')}</Text>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveStruct} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingStructId ? 'Update' : 'Create'} Structure</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Assign Form */}
      <Modal visible={assignModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Assign Salary Structure</Text>
              <TouchableOpacity onPress={() => setAssignModal(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.segmentControl}>
                <TouchableOpacity style={[styles.segmentBtn, assignForm.mode === 'single' && styles.segmentBtnActive]} onPress={() => setAssignForm({...assignForm, mode: 'single'})}>
                  <Text style={[styles.segmentText, assignForm.mode === 'single' && styles.segmentTextActive]}>Single Staff</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.segmentBtn, assignForm.mode === 'bulk' && styles.segmentBtnActive]} onPress={() => setAssignForm({...assignForm, mode: 'bulk'})}>
                  <Text style={[styles.segmentText, assignForm.mode === 'bulk' && styles.segmentTextActive]}>By Staff Type</Text>
                </TouchableOpacity>
              </View>

              <View style={{ zIndex: 40, marginBottom: 4 }}>
                {assignForm.mode === 'single' 
                  ? renderInlineDropdown('staffId', 'Select Staff *', staffList.map(s => ({label: `${s.name} (${s.staffId || ''})`, value: s._id})), assignForm.staff, (v) => setAssignForm({...assignForm, staff: v}))
                  : renderInlineDropdown('staffType', 'Staff Type *', staffTypes.map(t => ({label: t, value: t})), assignForm.staffType, (v) => setAssignForm({...assignForm, staffType: v}))
                }
              </View>

              <View style={{ zIndex: 30, marginBottom: 4 }}>
                {renderInlineDropdown('structureId', 'Salary Structure *', structures.map(s => ({label: `${s.name} (Basic ₹${s.basic})`, value: s._id})), assignForm.salaryStructure, (v) => setAssignForm({...assignForm, salaryStructure: v}))}
              </View>

              {assignForm.mode === 'single' && (
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Override Basic Pay (Optional)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="Uses structure's basic if blank" value={assignForm.basic} onChangeText={t => setAssignForm({...assignForm, basic: t})} />
                </View>
              )}

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Effective From *</Text>
                <TouchableOpacity style={styles.datePickerBtnForm} onPress={() => setShowEffDatePicker(true)}>
                  <Text style={styles.datePickerText}>{assignForm.effectiveFrom.toLocaleDateString('en-GB')}</Text>
                  <Feather name="calendar" size={14} color={C.textMuted} />
                </TouchableOpacity>
                {showEffDatePicker && <DateTimePicker value={assignForm.effectiveFrom} mode="date" display="default" onChange={(e, d) => { setShowEffDatePicker(Platform.OS === 'ios'); if (d) setAssignForm({ ...assignForm, effectiveFrom: d }); }} />}
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleAssign} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Confirm Assignment</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  
  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  tabContainer: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 4, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 6 },
  tabBtnActive: { backgroundColor: C.primary, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  tabTextActive: { color: '#fff' },
  addBtnFull: { backgroundColor: '#111827', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 12, marginTop: 12, elevation: 2 },
  addBtnTextFull: { color: '#fff', fontSize: 14, fontWeight: '800', marginLeft: 8 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  structSub: { fontSize: 12, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  structBadge: { backgroundColor: C.primarySoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  structBadgeText: { fontSize: 10, fontWeight: '800', color: C.primaryDark },

  itemsBox: { backgroundColor: C.surfaceSoft, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  itemName: { fontSize: 13, color: C.text, fontWeight: '600', flex: 1 },
  itemAmount: { fontSize: 13, color: C.text, fontWeight: '800' },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  totalLbl: { fontSize: 13, fontWeight: '800', color: C.text },
  totalVal: { fontSize: 16, fontWeight: '800', color: C.primary },

  financeGrid: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  finBox: { flex: 1 },
  finLbl: { fontSize: 9, color: C.textMuted, fontWeight: '800', marginBottom: 4, letterSpacing: 0.5 },
  finVal: { fontSize: 14, color: C.text, fontWeight: '800' },

  iconBtnEdit: { padding: 8, backgroundColor: C.greenSoft, borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' },
  iconBtnDelete: { padding: 8, backgroundColor: C.primarySoft, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  closeBtnIcon: { padding: 6, backgroundColor: C.border, borderRadius: 20 },
  formScroll: { padding: 20 },

  segmentControl: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 4, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segmentBtnActive: { backgroundColor: C.primary, elevation: 1 },
  segmentText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  segmentTextActive: { color: '#fff' },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft, fontSize: 13, color: C.text },
  row: { flexDirection: 'row' },
  
  itemConfigRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  removeBtn: { padding: 6, marginLeft: 2 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: C.blueSoft, borderRadius: 8, marginBottom: 20 },
  addItemText: { color: C.blue, fontSize: 12, fontWeight: '800', marginLeft: 4 },

  totalCalcRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.surfaceSoft, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  totalCalcLbl: { fontSize: 14, fontWeight: '800', color: C.textMuted },
  totalCalcVal: { fontSize: 18, fontWeight: '800', color: C.text },

  datePickerBtnForm: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 13, color: C.text, fontWeight: '600' },
  
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 42, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 13, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 13, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 46, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6 },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },

  saveBtnFull: { backgroundColor: C.primary, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});