import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';

// ---------------------------------------------------------------------------
// Design tokens — premium red/coral brand system
// ---------------------------------------------------------------------------
const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

const FREQUENCIES = ['Once', 'Monthly', 'Quarterly', 'Yearly'];
const MULTIPLIER: Record<string, number> = { Once: 1, Monthly: 12, Quarterly: 4, Yearly: 1 };

type Option = { label: string; value: string };

function getEmptyCategoryForm() {
  return { name: '', code: '', description: '' };
}

function getEmptyStructureForm() {
  const currentYear = new Date().getFullYear();
  const nextYear = String((currentYear + 1) % 100).padStart(2, '0');
  return {
    name: '',
    classId: '',
    academicYear: `${currentYear}-${nextYear}`,
    items: [{ feeCategory: '', amount: '', frequency: 'Once' }],
    lateFee: { enabled: false, type: 'Fixed', amount: '0', gracePeriodDays: '0' },
  };
}

export default function FeeStructureScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [categories, setCategories] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  
  // UI States
  const [tab, setTab] = useState<'structures' | 'categories'>('structures');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Category Modal
  const [catModal, setCatModal] = useState(false);
  const [catForm, setCatForm] = useState(getEmptyCategoryForm());
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  // Structure Modal
  const [structModal, setStructModal] = useState(false);
  const [structForm, setStructForm] = useState(getEmptyStructureForm());
  const [editingStructId, setEditingStructId] = useState<string | null>(null);

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
      const [catRes, structRes, clsRes] = await Promise.all([
        axios.get(`${BASE_URL}/fees/categories`, authHeaders(token)),
        axios.get(`${BASE_URL}/fees/structures`, authHeaders(token)),
        axios.get(`${BASE_URL}/classes?limit=200`, authHeaders(token)),
      ]);
      setCategories(catRes.data?.data || []);
      setStructures(structRes.data?.data || []);
      setClasses(clsRes.data?.data || []);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((module: string, action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === module && p.action === action);
  }, [permissions, isSuperAdmin]);

  const canManageCategory = hasPermission('feecategory', 'create') || hasPermission('feecategory', 'update');
  const canDeleteCategory = hasPermission('feecategory', 'delete');
  const canManageStructure = hasPermission('feestructure', 'create') || hasPermission('feestructure', 'update');
  const canDeleteStructure = hasPermission('feestructure', 'delete');

  // --- Category Handlers ---
  const openCreateCat = () => { setEditingCatId(null); setCatForm(getEmptyCategoryForm()); setCatModal(true); };
  const openEditCat = (c: any) => { setEditingCatId(c._id); setCatForm({ name: c.name, code: c.code, description: c.description || '' }); setCatModal(true); };
  
  const handleSaveCat = async () => {
    if (!catForm.name.trim() || !catForm.code.trim()) { Alert.alert('Error', 'Name and code are required'); return; }
    setSaving(true);
    try {
      if (editingCatId) await axios.put(`${BASE_URL}/fees/categories/${editingCatId}`, catForm, authHeaders(authToken));
      else await axios.post(`${BASE_URL}/fees/categories`, catForm, authHeaders(authToken));
      setCatModal(false); fetchAll(authToken, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Save failed'); } 
    finally { setSaving(false); }
  };

  const handleDeleteCat = (id: string) => {
    Alert.alert('Deactivate Category', 'It will no longer be usable in new fee structures.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: async () => {
          try { await axios.delete(`${BASE_URL}/fees/categories/${id}`, authHeaders(authToken)); fetchAll(authToken, true); } 
          catch (e) { Alert.alert('Error', 'Delete failed'); }
      }}
    ]);
  };

  // --- Structure Handlers ---
  const openCreateStruct = () => { setEditingStructId(null); setStructForm(getEmptyStructureForm()); setActiveDropdown(null); setStructModal(true); };
  const openEditStruct = (s: any) => {
    setEditingStructId(s._id);
    setStructForm({
      name: s.name, classId: s.classId?._id || '', academicYear: s.academicYear,
      items: (s.items || []).map((i: any) => ({ feeCategory: i.feeCategory?._id || i.feeCategory, amount: String(i.amount), frequency: i.frequency })),
      lateFee: s.lateFee ? { enabled: s.lateFee.enabled, type: s.lateFee.type, amount: String(s.lateFee.amount), gracePeriodDays: String(s.lateFee.gracePeriodDays) } : { enabled: false, type: 'Fixed', amount: '0', gracePeriodDays: '0' },
    });
    setActiveDropdown(null); setStructModal(true);
  };

  const handleSaveStruct = async () => {
    if (!structForm.name.trim() || !structForm.academicYear.trim()) { Alert.alert('Error', 'Name and academic year are required'); return; }
    if (structForm.items.some(i => !i.feeCategory || !i.amount)) { Alert.alert('Error', 'Every fee item needs a category and amount'); return; }
    setSaving(true);
    try {
      const payload = {
        ...structForm,
        classId: structForm.classId || null,
        items: structForm.items.map(i => ({ ...i, amount: Number(i.amount) })),
        lateFee: { ...structForm.lateFee, amount: Number(structForm.lateFee.amount), gracePeriodDays: Number(structForm.lateFee.gracePeriodDays) }
      };
      if (editingStructId) await axios.put(`${BASE_URL}/fees/structures/${editingStructId}`, payload, authHeaders(authToken));
      else await axios.post(`${BASE_URL}/fees/structures`, payload, authHeaders(authToken));
      setStructModal(false); fetchAll(authToken, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Save failed'); } 
    finally { setSaving(false); }
  };

  const handleDeleteStruct = (id: string) => {
    Alert.alert('Deactivate Structure', 'Students already assigned to it are kept as-is.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: async () => {
          try { await axios.delete(`${BASE_URL}/fees/structures/${id}`, authHeaders(authToken)); fetchAll(authToken, true); } 
          catch (e) { Alert.alert('Error', 'Delete failed'); }
      }}
    ]);
  };

  const structTotal = (items: any[]) => items.reduce((sum, i) => sum + Number(i.amount || 0) * (MULTIPLIER[i.frequency] || 1), 0);

  // --- Dynamic Inline Dropdown ---
  const renderInlineDropdown = (fieldKey: string, label: string | null, options: Option[], value: string, onSelect: (v: string) => void, placeholder = "Select...", zIndexOffset = 0) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 + zIndexOffset : 1 + zIndexOffset, marginBottom: label ? 16 : 0 }]}>
        {!!label && <Text style={styles.inputLabel}>{label}</Text>}
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive, !label && { height: 42 }]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || placeholder}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
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
          <Text style={styles.title}>Fee Structure Setup</Text>
          <Text style={styles.subtitle}>Configure fee categories, frequencies, and structures.</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, tab === 'structures' && styles.tabBtnActive]} onPress={() => setTab('structures')}>
            <Feather name="sitemap" size={14} color={tab === 'structures' ? '#fff' : C.textMuted} />
            <Text style={[styles.tabText, tab === 'structures' && styles.tabTextActive]}>Structures ({structures.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'categories' && styles.tabBtnActive]} onPress={() => setTab('categories')}>
            <Feather name="tags" size={14} color={tab === 'categories' ? '#fff' : C.textMuted} />
            <Text style={[styles.tabText, tab === 'categories' && styles.tabTextActive]}>Categories ({categories.length})</Text>
          </TouchableOpacity>
        </View>

        {(tab === 'structures' && canManageStructure) && (
          <TouchableOpacity style={styles.addBtnFull} onPress={openCreateStruct}>
            <Feather name="plus" size={16} color="#fff" /><Text style={styles.addBtnTextFull}>Add Fee Structure</Text>
          </TouchableOpacity>
        )}
        {(tab === 'categories' && canManageCategory) && (
          <TouchableOpacity style={styles.addBtnFull} onPress={openCreateCat}>
            <Feather name="plus" size={16} color="#fff" /><Text style={styles.addBtnTextFull}>Add Category</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : tab === 'categories' ? (
        <FlatList
          data={categories}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(authToken, true)} colors={[C.primary]} />}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="tags" size={40} color={C.textFaint} /><Text style={styles.emptyTitle}>No Categories</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1}}>
                  <View style={styles.codeBadge}><Text style={styles.codeText}>{item.code}</Text></View>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                </View>
                <View style={{flexDirection: 'row', gap: 8}}>
                  {canManageCategory && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditCat(item)}><Feather name="edit-2" size={14} color={C.green}/></TouchableOpacity>}
                  {canDeleteCategory && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDeleteCat(item._id)}><Feather name="trash-2" size={14} color={C.primary}/></TouchableOpacity>}
                </View>
              </View>
              {!!item.description && <Text style={styles.cardDesc}>{item.description}</Text>}
            </View>
          )}
        />
      ) : (
        <FlatList
          data={structures}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(authToken, true)} colors={[C.primary]} />}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="sitemap" size={40} color={C.textFaint} /><Text style={styles.emptyTitle}>No Fee Structures</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.structSub}>{item.classId ? `${item.classId.className} ${item.classId.division || ''}` : 'All Classes'} • {item.academicYear}</Text>
                </View>
                <View style={{flexDirection: 'row', gap: 8}}>
                  {canManageStructure && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditStruct(item)}><Feather name="edit-2" size={14} color={C.green}/></TouchableOpacity>}
                  {canDeleteStructure && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDeleteStruct(item._id)}><Feather name="trash-2" size={14} color={C.primary}/></TouchableOpacity>}
                </View>
              </View>

              <View style={styles.itemsBox}>
                {(item.items || []).map((i: any, idx: number) => (
                  <View key={idx} style={styles.itemRow}>
                    <Text style={styles.itemName} numberOfLines={1}>{i.feeCategory?.name || 'Fee'} <Text style={{color: C.textMuted, fontWeight: '500'}}>({i.frequency})</Text></Text>
                    <Text style={styles.itemAmount}>₹{i.amount?.toLocaleString('en-IN')}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLbl}>Total / Year</Text>
                <Text style={styles.totalVal}>₹{item.totalAmount ?? structTotal(item.items || []).toLocaleString('en-IN')}</Text>
              </View>

              {item.lateFee?.enabled && (
                <View style={styles.lateFeeBox}>
                  <Text style={styles.lateFeeText}>Late Fee: {item.lateFee.type === 'Percentage' ? `${item.lateFee.amount}%` : `₹${item.lateFee.amount}`} after {item.lateFee.gracePeriodDays} days grace</Text>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* MODAL: Category Form */}
      <Modal visible={catModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingCatId ? 'Edit Category' : 'Add Category'}</Text>
              <TouchableOpacity onPress={() => setCatModal(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput style={styles.input} placeholder="Tuition Fee" value={catForm.name} onChangeText={t => setCatForm({...catForm, name: t})} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Code *</Text>
                <TextInput style={styles.input} placeholder="TUI" value={catForm.code} onChangeText={t => setCatForm({...catForm, code: t.toUpperCase()})} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} multiline value={catForm.description} onChangeText={t => setCatForm({...catForm, description: t})} />
              </View>
              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveCat} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingCatId ? 'Update' : 'Create'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Structure Form */}
      <Modal visible={structModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingStructId ? 'Edit Fee Structure' : 'Add Fee Structure'}</Text>
              <TouchableOpacity onPress={() => setStructModal(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Name *</Text>
                  <TextInput style={styles.input} placeholder="Class 5 Fee" value={structForm.name} onChangeText={t => setStructForm({...structForm, name: t})} />
                </View>
                <View style={{ flex: 1, zIndex: 100 }}>
                  {renderInlineDropdown('classId', 'Class', [{label:'All Classes', value:''}, ...classes.map(c => ({label: `${c.className} ${c.division||''}`, value: c._id}))], structForm.classId, (v) => setStructForm({...structForm, classId: v}))}
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Academic Year *</Text>
                <TextInput style={styles.input} placeholder="2026-27" value={structForm.academicYear} onChangeText={t => setStructForm({...structForm, academicYear: t})} />
              </View>

              <Text style={[styles.inputLabel, {marginTop: 10, marginBottom: 10}]}>FEE ITEMS</Text>
              {structForm.items.map((item, idx) => (
                <View key={idx} style={[styles.itemConfigRow, { zIndex: 90 - idx }]}>
                  <View style={{ flex: 2, marginRight: 8, zIndex: 90 - idx }}>
                    {renderInlineDropdown(`cat_${idx}`, null, categories.map(c => ({label: c.name, value: c._id})), item.feeCategory, (v) => {
                      const newItems = [...structForm.items]; newItems[idx].feeCategory = v; setStructForm({...structForm, items: newItems});
                    }, 'Category')}
                  </View>
                  <View style={{ flex: 1.5, marginRight: 8 }}>
                    <TextInput style={[styles.input, {height: 42}]} placeholder="Amt" keyboardType="numeric" value={item.amount} onChangeText={t => {
                      const newItems = [...structForm.items]; newItems[idx].amount = t; setStructForm({...structForm, items: newItems});
                    }} />
                  </View>
                  <View style={{ flex: 2, zIndex: 90 - idx }}>
                    {renderInlineDropdown(`freq_${idx}`, null, FREQUENCIES.map(f => ({label: f, value: f})), item.frequency, (v) => {
                      const newItems = [...structForm.items]; newItems[idx].frequency = v; setStructForm({...structForm, items: newItems});
                    })}
                  </View>
                  {structForm.items.length > 1 && (
                    <TouchableOpacity style={styles.removeBtn} onPress={() => setStructForm({...structForm, items: structForm.items.filter((_, i) => i !== idx)})}>
                      <Feather name="x" size={16} color={C.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity style={styles.addItemBtn} onPress={() => setStructForm({...structForm, items: [...structForm.items, { feeCategory: '', amount: '', frequency: 'Once' }]})}>
                <Feather name="plus" size={14} color={C.blue} /><Text style={styles.addItemText}>Add Item</Text>
              </TouchableOpacity>

              <View style={styles.lateFeeSection}>
                <TouchableOpacity style={styles.toggleRow} onPress={() => setStructForm({...structForm, lateFee: {...structForm.lateFee, enabled: !structForm.lateFee.enabled}})}>
                  <Feather name={structForm.lateFee.enabled ? "check-square" : "square"} size={18} color={structForm.lateFee.enabled ? C.primary : C.textMuted} />
                  <Text style={styles.toggleText}>Enable Late Fee</Text>
                </TouchableOpacity>

                {structForm.lateFee.enabled && (
                  <View style={[styles.row, { zIndex: 10, marginTop: 10 }]}>
                    <View style={{ flex: 1.5, marginRight: 10 }}>
                      {renderInlineDropdown('lfType', 'Type', [{label:'Fixed (₹)',value:'Fixed'},{label:'Percentage (%)',value:'Percentage'}], structForm.lateFee.type, (v) => setStructForm({...structForm, lateFee: {...structForm.lateFee, type: v}}))}
                    </View>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.inputLabel}>Amount</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={structForm.lateFee.amount} onChangeText={t => setStructForm({...structForm, lateFee: {...structForm.lateFee, amount: t}})} />
                    </View>
                    <View style={{ flex: 1.2 }}>
                      <Text style={styles.inputLabel}>Grace (Days)</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={structForm.lateFee.gracePeriodDays} onChangeText={t => setStructForm({...structForm, lateFee: {...structForm.lateFee, gracePeriodDays: t}})} />
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.totalCalcRow}>
                <Text style={styles.totalCalcLbl}>Total / Year</Text>
                <Text style={styles.totalCalcVal}>₹{structTotal(structForm.items).toLocaleString('en-IN')}</Text>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveStruct} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingStructId ? 'Update Structure' : 'Create Structure'}</Text>}
              </TouchableOpacity>
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
  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  structSub: { fontSize: 12, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  codeBadge: { backgroundColor: C.surfaceSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.border },
  codeText: { fontSize: 11, fontWeight: '800', color: C.textMuted },
  cardDesc: { fontSize: 13, color: C.textMuted, marginTop: 4 },

  itemsBox: { backgroundColor: C.surfaceSoft, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  itemName: { fontSize: 13, color: C.text, fontWeight: '600', flex: 1 },
  itemAmount: { fontSize: 13, color: C.text, fontWeight: '800' },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  totalLbl: { fontSize: 13, fontWeight: '800', color: C.text },
  totalVal: { fontSize: 16, fontWeight: '800', color: C.primary },

  lateFeeBox: { marginTop: 10, padding: 8, backgroundColor: C.primarySoft, borderRadius: 6 },
  lateFeeText: { fontSize: 11, color: C.primaryDark, fontWeight: '600' },

  iconBtnEdit: { padding: 8, backgroundColor: C.greenSoft, borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' },
  iconBtnDelete: { padding: 8, backgroundColor: C.primarySoft, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },

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

  itemConfigRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  removeBtn: { padding: 6, marginLeft: 4 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: C.blueSoft, borderRadius: 8, marginBottom: 20 },
  addItemText: { color: C.blue, fontSize: 12, fontWeight: '800', marginLeft: 4 },

  lateFeeSection: { borderTopWidth: 1, borderColor: C.border, paddingTop: 16, marginBottom: 20 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleText: { fontSize: 13, fontWeight: '700', color: C.text },

  totalCalcRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.surfaceSoft, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  totalCalcLbl: { fontSize: 14, fontWeight: '800', color: C.textMuted },
  totalCalcVal: { fontSize: 18, fontWeight: '800', color: C.text },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 13, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 13, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },

  ghostBtn: { paddingVertical: 10, paddingHorizontal: 16, justifyContent: 'center' },
  ghostBtnText: { color: C.textMuted, fontSize: 14, fontWeight: '700' },
  saveBtnFull: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});