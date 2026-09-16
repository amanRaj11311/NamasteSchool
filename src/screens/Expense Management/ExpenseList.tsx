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
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Approved: { bg: C.greenSoft, fg: C.green },
  Pending: { bg: C.amberSoft, fg: C.amber },
  Rejected: { bg: C.primarySoft, fg: C.primary },
};

// Safe Date Utilities
const formatToYMD = (d: Date): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

const getMonthStr = (d: Date): string => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function ExpensesScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMonthDate, setFilterMonthDate] = useState<Date>(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Modals & Form
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showExpenseDatePicker, setShowExpenseDatePicker] = useState(false);
  
  const emptyForm = {
    categoryId: '', title: '', amount: '', expenseDate: new Date(),
    paymentMode: 'Cash', paidTo: '', referenceNo: '', notes: '', status: 'Approved'
  };
  const [form, setForm] = useState(emptyForm);

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
      const res = await axios.get(`${API_BASE}/expenses/categories`, authHeaders(token));
      if (res.data?.success) setCategories(res.data.data || []);
    } catch (e) { console.error('Failed to load categories'); }
    fetchExpenses(token, filterCategory, filterStatus, getMonthStr(filterMonthDate));
  };

  const fetchExpenses = async (token: string | null, cat: string, stat: string, month: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params: any = {};
      if (cat) params.categoryId = cat;
      if (stat) params.status = stat;
      if (month) params.month = month;

      const res = await axios.get(`${API_BASE}/expenses`, { params, ...authHeaders(token) });
      if (res.data?.success) setExpenses(res.data.data || []);
    } catch (e) { console.error(e); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'expense' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const handleSave = async () => {
    if (!form.categoryId || !form.title.trim() || !form.amount) { Alert.alert('Error', 'Category, Title, and Amount are required.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        expenseDate: formatToYMD(form.expenseDate)
      };

      if (editingId) {
        await axios.put(`${API_BASE}/expenses/${editingId}`, payload, authHeaders(authToken));
        Alert.alert('Success', 'Expense updated');
      } else {
        await axios.post(`${API_BASE}/expenses`, payload, authHeaders(authToken));
        Alert.alert('Success', 'Expense created');
      }
      setShowModal(false);
      fetchExpenses(authToken, filterCategory, filterStatus, getMonthStr(filterMonthDate), true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to save'); } 
    finally { setSaving(false); }
  };

  const handleDecide = (id: string, status: string) => {
    Alert.alert('Confirm Status', `Mark expense as ${status}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', onPress: async () => {
          try {
            await axios.patch(`${API_BASE}/expenses/${id}/decide`, { status }, authHeaders(authToken));
            fetchExpenses(authToken, filterCategory, filterStatus, getMonthStr(filterMonthDate), true);
          } catch (e) { Alert.alert('Error', 'Failed to update status'); }
      }}
    ]);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Delete this expense record?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/expenses/${id}`, authHeaders(authToken));
            fetchExpenses(authToken, filterCategory, filterStatus, getMonthStr(filterMonthDate), true);
          } catch (e) { Alert.alert('Error', 'Failed to delete'); }
      }}
    ]);
  };

  const openEdit = (item: any) => {
    setEditingId(item._id);
    setForm({
      categoryId: item.categoryId?._id || item.categoryId || '',
      title: item.title || '',
      amount: String(item.amount || ''),
      expenseDate: item.expenseDate ? new Date(item.expenseDate) : new Date(),
      paymentMode: item.paymentMode || 'Cash',
      paidTo: item.paidTo || '',
      referenceNo: item.referenceNo || '',
      notes: item.notes || '',
      status: item.status || 'Approved',
    });
    setShowModal(true);
  };

  const totalExpenseSum = expenses.reduce((acc, curr) => acc + (curr.status === 'Approved' ? (curr.amount || 0) : 0), 0);

  const renderInlineDropdown = (fieldKey: string, label: string, options: any[], value: string, onSelect: (v: string) => void, zIndexOff = 0) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 + zIndexOff : 1 + zIndexOff }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || 'Select...'}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => (
                <TouchableOpacity key={opt.value + i} style={styles.dropdownItem} onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}>
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
        <View style={styles.headerIconBadge}><Feather name="receipt" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Expense Management</Text>
          <Text style={styles.subtitle}>Track operating expenses and vendor payments.</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={{ zIndex: 30, flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>MONTH</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowMonthPicker(true)}>
              <Text style={styles.datePickerText}>{getMonthStr(filterMonthDate)}</Text>
              <Feather name="calendar" size={14} color={C.textMuted} />
            </TouchableOpacity>
            {showMonthPicker && <DateTimePicker value={filterMonthDate} mode="date" display="default" onChange={(e, d) => { setShowMonthPicker(Platform.OS === 'ios'); if (d) { setFilterMonthDate(d); fetchExpenses(authToken, filterCategory, filterStatus, getMonthStr(d)); } }} />}
          </View>
          <View style={{ flex: 1 }}>
            {renderInlineDropdown('fStat', 'STATUS', [{label: 'All Statuses', value: ''}, {label: 'Approved', value: 'Approved'}, {label: 'Pending', value: 'Pending'}, {label: 'Rejected', value: 'Rejected'}], filterStatus, (v) => { setFilterStatus(v); fetchExpenses(authToken, filterCategory, v, getMonthStr(filterMonthDate)); })}
          </View>
        </View>
        <View style={{ zIndex: 20 }}>
          {renderInlineDropdown('fCat', 'CATEGORY', [{label: 'All Categories', value: ''}, ...categories.map(c => ({label: c.name, value: c._id}))], filterCategory, (v) => { setFilterCategory(v); fetchExpenses(authToken, v, filterStatus, getMonthStr(filterMonthDate)); })}
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLbl}>Approved Expenses</Text>
          <Text style={styles.summaryVal}>₹{totalExpenseSum.toLocaleString('en-IN')}</Text>
        </View>

        {hasPermission('create') && (
          <TouchableOpacity style={styles.addBtnFull} onPress={() => { setEditingId(null); setForm(emptyForm); setShowModal(true); }}>
            <Feather name="plus" size={16} color="#fff" /><Text style={styles.addBtnTextFull}>Record Expense</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchExpenses(authToken, filterCategory, filterStatus, getMonthStr(filterMonthDate), true)} colors={[C.primary]} />}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="receipt" size={40} color={C.textFaint} /><Text style={styles.emptyTitle}>No Expenses Found</Text></View>}
          renderItem={({ item }) => {
            const statusStyle = STATUS_STYLE[item.status] || STATUS_STYLE.Pending;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.dateText}>{new Date(item.expenseDate).toLocaleDateString('en-GB')} • {item.paymentMode}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.amountText}>₹{item.amount?.toLocaleString('en-IN')}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}><Text style={[styles.statusText, { color: statusStyle.fg }]}>{item.status}</Text></View>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.catBadge}><Feather name="tag" size={10} color={C.blue} style={{marginRight: 4}} /><Text style={styles.catBadgeText}>{item.categoryId?.name || 'Uncategorized'}</Text></View>
                  {!!item.paidTo && <Text style={styles.paidToText}>To: {item.paidTo}</Text>}
                </View>

                {!!item.notes && <Text style={styles.notesText} numberOfLines={2}>{item.notes}</Text>}

                <View style={styles.cardActions}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {hasPermission('update') && item.status === 'Pending' && (
                      <>
                        <TouchableOpacity style={styles.iconBtnSuccess} onPress={() => handleDecide(item._id, 'Approved')}><Feather name="check" size={14} color={C.green} /></TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtnReject} onPress={() => handleDecide(item._id, 'Rejected')}><Feather name="x" size={14} color={C.primary} /></TouchableOpacity>
                      </>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {hasPermission('update') && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEdit(item)}><Feather name="edit-2" size={14} color={C.slate} /></TouchableOpacity>}
                    {hasPermission('delete') && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(item._id)}><Feather name="trash-2" size={14} color={C.primary} /></TouchableOpacity>}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Expense Modal */}
      <Modal visible={showModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingId ? 'Edit Expense' : 'Record Expense'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={{ zIndex: 50, marginBottom: 16 }}>
                {renderInlineDropdown('formCat', 'Category *', categories.map(c => ({label: c.name, value: c._id})), form.categoryId, (v) => setForm({...form, categoryId: v}))}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Expense Title *</Text>
                <TextInput style={styles.input} placeholder="e.g. Science Lab Supplies" value={form.title} onChangeText={t => setForm({...form, title: t})} />
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Amount (₹) *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={form.amount} onChangeText={t => setForm({...form, amount: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Date *</Text>
                  <TouchableOpacity style={styles.datePickerBtnForm} onPress={() => setShowExpenseDatePicker(true)}>
                    <Text style={styles.datePickerText}>{form.expenseDate.toLocaleDateString('en-GB')}</Text>
                    <Feather name="calendar" size={14} color={C.textMuted} />
                  </TouchableOpacity>
                  {showExpenseDatePicker && <DateTimePicker value={form.expenseDate} mode="date" display="default" onChange={(e, d) => { setShowExpenseDatePicker(Platform.OS === 'ios'); if (d) setForm({ ...form, expenseDate: d }); }} />}
                </View>
              </View>

              <View style={[styles.row, { zIndex: 40 }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  {renderInlineDropdown('formMode', 'Payment Mode', [{label:'Cash',value:'Cash'}, {label:'Bank Transfer',value:'Bank Transfer'}, {label:'Cheque',value:'Cheque'}, {label:'UPI',value:'UPI'}, {label:'Other',value:'Other'}], form.paymentMode, (v) => setForm({...form, paymentMode: v}))}
                </View>
                <View style={{ flex: 1, zIndex: 30 }}>
                  {renderInlineDropdown('formStatus', 'Status', [{label:'Approved',value:'Approved'}, {label:'Pending',value:'Pending'}, {label:'Rejected',value:'Rejected'}], form.status, (v) => setForm({...form, status: v}))}
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Paid To / Vendor</Text>
                  <TextInput style={styles.input} placeholder="Vendor name" value={form.paidTo} onChangeText={t => setForm({...form, paidTo: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Ref / Invoice No.</Text>
                  <TextInput style={styles.input} placeholder="INV-001" value={form.referenceNo} onChangeText={t => setForm({...form, referenceNo: t})} />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} multiline value={form.notes} onChangeText={t => setForm({...form, notes: t})} />
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingId ? 'Update' : 'Save'} Expense</Text>}
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
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.primarySoft, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', marginTop: 10 },
  summaryLbl: { fontSize: 12, fontWeight: '800', color: C.primaryDark, textTransform: 'uppercase' },
  summaryVal: { fontSize: 18, fontWeight: '800', color: C.primary },
  
  addBtnFull: { backgroundColor: '#111827', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 12, marginTop: 12, elevation: 2 },
  addBtnTextFull: { color: '#fff', fontSize: 14, fontWeight: '800', marginLeft: 8 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  dateText: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  amountText: { fontSize: 18, fontWeight: '800', color: C.primary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '800' },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  catBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.blueSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  catBadgeText: { fontSize: 10, fontWeight: '800', color: C.blue },
  paidToText: { fontSize: 11, fontWeight: '600', color: C.textMuted },
  notesText: { fontSize: 12, color: C.textMuted, marginTop: 10, fontStyle: 'italic' },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  iconBtnSuccess: { padding: 8, backgroundColor: C.greenSoft, borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' },
  iconBtnReject: { padding: 8, backgroundColor: C.primarySoft, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },
  iconBtnEdit: { padding: 8, backgroundColor: C.surfaceSoft, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  iconBtnDelete: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  closeBtnIcon: { padding: 6, backgroundColor: C.border, borderRadius: 20 },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  row: { flexDirection: 'row' },
  
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 13, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 13, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },

  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  datePickerBtnForm: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surface },
  datePickerText: { fontSize: 13, color: C.text, fontWeight: '600' },

  saveBtnFull: { backgroundColor: C.primary, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});