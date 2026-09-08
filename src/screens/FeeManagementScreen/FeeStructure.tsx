import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';

const API_BASE = 'https://mern.schoolapi.dcstechnosis.com/api';

// ---------------------------------------------------------------------------
// Design tokens — shared premium palette (matches FeesScreen)
// ---------------------------------------------------------------------------
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

  primary: '#E11D48',
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
  blueBorder: '#C7D9FC',
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
        axios.get(`${API_BASE}/fees/categories`, authHeaders(token)),
        axios.get(`${API_BASE}/fees/structures`, authHeaders(token)),
        axios.get(`${API_BASE}/classes?limit=200`, authHeaders(token)),
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
      if (editingCatId) await axios.put(`${API_BASE}/fees/categories/${editingCatId}`, catForm, authHeaders(authToken));
      else await axios.post(`${API_BASE}/fees/categories`, catForm, authHeaders(authToken));
      setCatModal(false); fetchAll(authToken, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteCat = (id: string) => {
    Alert.alert('Deactivate Category', 'It will no longer be usable in new fee structures.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate', style: 'destructive', onPress: async () => {
          try { await axios.delete(`${API_BASE}/fees/categories/${id}`, authHeaders(authToken)); fetchAll(authToken, true); }
          catch (e) { Alert.alert('Error', 'Delete failed'); }
        }
      }
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
      if (editingStructId) await axios.put(`${API_BASE}/fees/structures/${editingStructId}`, payload, authHeaders(authToken));
      else await axios.post(`${API_BASE}/fees/structures`, payload, authHeaders(authToken));
      setStructModal(false); fetchAll(authToken, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteStruct = (id: string) => {
    Alert.alert('Deactivate Structure', 'Students already assigned to it are kept as-is.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate', style: 'destructive', onPress: async () => {
          try { await axios.delete(`${API_BASE}/fees/structures/${id}`, authHeaders(authToken)); fetchAll(authToken, true); }
          catch (e) { Alert.alert('Error', 'Delete failed'); }
        }
      }
    ]);
  };

  const structTotal = (items: any[]) => items.reduce((sum, i) => sum + Number(i.amount || 0) * (MULTIPLIER[i.frequency] || 1), 0);

  // --- Dropdown: shows every option at once, scrolls only past 6 items ---
  const MAX_VISIBLE_ITEMS = 6;
  const ITEM_HEIGHT = 44;

  const renderInlineDropdown = (fieldKey: string, label: string | null, options: Option[], value: string, onSelect: (v: string) => void, placeholder = "Select...", zIndexOffset = 0) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    const needsScroll = options.length > MAX_VISIBLE_ITEMS;
    const listMaxHeight = (needsScroll ? MAX_VISIBLE_ITEMS : options.length) * ITEM_HEIGHT;

    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 999 + zIndexOffset : 1 + zIndexOffset, marginBottom: label ? 16 : 0 }]}>
        {!!label && <Text style={styles.inputLabel}>{label}</Text>}
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive, !label && { height: 42 }]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || placeholder}</Text>
          <View style={[styles.chevronBadge, isOpen && styles.chevronBadgeActive]}>
            <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={isOpen ? '#fff' : C.textMuted} />
          </View>
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled scrollEnabled={needsScroll} style={{ maxHeight: listMaxHeight }} showsVerticalScrollIndicator={needsScroll}>
              {options.length === 0 ? (
                <View style={styles.dropdownEmpty}><Text style={styles.dropdownEmptyText}>No options available</Text></View>
              ) : options.map((opt, idx) => {
                const selected = value === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.dropdownItem, idx === options.length - 1 && { borderBottomWidth: 0 }, selected && styles.dropdownItemSelected]}
                    onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}
                  >
                    <Text style={[styles.dropdownItemText, selected && styles.textBrand]} numberOfLines={1}>{opt.label}</Text>
                    {selected && <Feather name="check" size={14} color={C.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="git-branch" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Fee Structure Setup</Text>
          <Text style={styles.subtitle}>Configure fee categories, frequencies, and structures</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.filterRow}>
          <View style={styles.tabContainer}>
            <TouchableOpacity style={[styles.tabBtn, tab === 'structures' && styles.tabBtnActive]} onPress={() => setTab('structures')} activeOpacity={0.85}>
              <Feather name="git-branch" size={13} color={tab === 'structures' ? '#fff' : C.textMuted} />
              <Text style={[styles.tabText, tab === 'structures' && styles.tabTextActive]}>Structures</Text>
              <View style={[styles.tabCountPill, tab !== 'structures' && styles.tabCountPillMuted]}>
                <Text style={[styles.tabCountText, tab !== 'structures' && { color: C.textMuted }]}>{structures.length}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, tab === 'categories' && styles.tabBtnActive]} onPress={() => setTab('categories')} activeOpacity={0.85}>
              <Feather name="tag" size={13} color={tab === 'categories' ? '#fff' : C.textMuted} />
              <Text style={[styles.tabText, tab === 'categories' && styles.tabTextActive]}>Categories</Text>
              <View style={[styles.tabCountPill, tab !== 'categories' && styles.tabCountPillMuted]}>
                <Text style={[styles.tabCountText, tab !== 'categories' && { color: C.textMuted }]}>{categories.length}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {(tab === 'structures' && canManageStructure) && (
            <TouchableOpacity style={styles.addBtnCompact} onPress={openCreateStruct} activeOpacity={0.9}>
              <Feather name="plus" size={15} color="#fff" /><Text style={styles.addBtnCompactText}>Structure</Text>
            </TouchableOpacity>
          )}
          {(tab === 'categories' && canManageCategory) && (
            <TouchableOpacity style={styles.addBtnCompact} onPress={openCreateCat} activeOpacity={0.9}>
              <Feather name="plus" size={15} color="#fff" /><Text style={styles.addBtnCompactText}>Category</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : tab === 'categories' ? (
        <FlatList
          data={categories}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(authToken, true)} colors={[C.primary]} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}><Feather name="tag" size={28} color={C.textFaint} /></View>
              <Text style={styles.emptyTitle}>No Categories</Text>
              <Text style={styles.emptySubtitle}>Create a category to start building fee structures.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={styles.codeBadge}><Text style={styles.codeText}>{item.code}</Text></View>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {canManageCategory && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditCat(item)}><Feather name="edit-2" size={14} color={C.greenDark} /></TouchableOpacity>}
                  {canDeleteCategory && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDeleteCat(item._id)}><Feather name="trash-2" size={14} color={C.primary} /></TouchableOpacity>}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(authToken, true)} colors={[C.primary]} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}><Feather name="git-branch" size={28} color={C.textFaint} /></View>
              <Text style={styles.emptyTitle}>No Fee Structures</Text>
              <Text style={styles.emptySubtitle}>Add your first fee structure to assign it to students.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.structSub}>{item.classId ? `${item.classId.className} ${item.classId.division || ''}` : 'All Classes'} • {item.academicYear}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {canManageStructure && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditStruct(item)}><Feather name="edit-2" size={14} color={C.greenDark} /></TouchableOpacity>}
                  {canDeleteStructure && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDeleteStruct(item._id)}><Feather name="trash-2" size={14} color={C.primary} /></TouchableOpacity>}
                </View>
              </View>

              <View style={styles.itemsBox}>
                {(item.items || []).map((i: any, idx: number) => (
                  <View key={idx} style={[styles.itemRow, idx === (item.items.length - 1) && { borderBottomWidth: 0 }]}>
                    <Text style={styles.itemName} numberOfLines={1}>{i.feeCategory?.name || 'Fee'} <Text style={{ color: C.textMuted, fontWeight: '500' }}>({i.frequency})</Text></Text>
                    <Text style={styles.itemAmount}>₹{i.amount?.toLocaleString('en-IN')}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLbl}>Total / Year</Text>
                <Text style={styles.totalVal}>₹{(item.totalAmount ?? structTotal(item.items || [])).toLocaleString('en-IN')}</Text>
              </View>

              {item.lateFee?.enabled && (
                <View style={styles.lateFeeBox}>
                  <Feather name="clock" size={11} color={C.amber} />
                  <Text style={styles.lateFeeText}>Late Fee: {item.lateFee.type === 'Percentage' ? `${item.lateFee.amount}%` : `₹${item.lateFee.amount}`} after {item.lateFee.gracePeriodDays} days grace</Text>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* MODAL: Category Form */}
      <Modal visible={catModal} animationType="fade" transparent statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderIconBadge}><Feather name="tag" size={16} color={C.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>{editingCatId ? 'Edit Category' : 'Add Category'}</Text>
                <Text style={styles.formHint}>A category groups related fee items, e.g. Tuition or Transport</Text>
              </View>
              <TouchableOpacity onPress={() => setCatModal(false)} style={styles.closeBtnIcon}><Feather name="x" size={18} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput style={styles.input} placeholder="Tuition Fee" placeholderTextColor={C.textFaint} value={catForm.name} onChangeText={t => setCatForm({ ...catForm, name: t })} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Code *</Text>
                <TextInput style={styles.input} placeholder="TUI" placeholderTextColor={C.textFaint} value={catForm.code} onChangeText={t => setCatForm({ ...catForm, code: t.toUpperCase() })} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} multiline placeholderTextColor={C.textFaint} value={catForm.description} onChangeText={t => setCatForm({ ...catForm, description: t })} />
              </View>
              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveCat} disabled={saving} activeOpacity={0.9}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingCatId ? 'Update' : 'Create'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Structure Form */}
      <Modal visible={structModal} animationType="fade" transparent statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderIconBadge}><Feather name="git-branch" size={16} color={C.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>{editingStructId ? 'Edit Fee Structure' : 'Add Fee Structure'}</Text>
                <Text style={styles.formHint}>Combine fee items into a structure for a class or year</Text>
              </View>
              <TouchableOpacity onPress={() => setStructModal(false)} style={styles.closeBtnIcon}><Feather name="x" size={18} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Name *</Text>
                  <TextInput style={styles.input} placeholder="Class 5 Fee" placeholderTextColor={C.textFaint} value={structForm.name} onChangeText={t => setStructForm({ ...structForm, name: t })} />
                </View>
                <View style={{ flex: 1, zIndex: 100 }}>
                  {renderInlineDropdown('classId', 'Class', [{ label: 'All Classes', value: '' }, ...classes.map(c => ({ label: `${c.className} ${c.division || ''}`, value: c._id }))], structForm.classId, (v) => setStructForm({ ...structForm, classId: v }))}
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Academic Year *</Text>
                <TextInput style={styles.input} placeholder="2026-27" placeholderTextColor={C.textFaint} value={structForm.academicYear} onChangeText={t => setStructForm({ ...structForm, academicYear: t })} />
              </View>

              <Text style={[styles.inputLabel, { marginTop: 10, marginBottom: 10 }]}>FEE ITEMS</Text>
              {structForm.items.map((item, idx) => (
                <View key={idx} style={[styles.itemConfigRow, { zIndex: 90 - idx }]}>
                  <View style={{ flex: 2, marginRight: 8, zIndex: 90 - idx }}>
                    {renderInlineDropdown(`cat_${idx}`, null, categories.map(c => ({ label: c.name, value: c._id })), item.feeCategory, (v) => {
                      const newItems = [...structForm.items]; newItems[idx].feeCategory = v; setStructForm({ ...structForm, items: newItems });
                    }, 'Category')}
                  </View>
                  <View style={{ flex: 1.5, marginRight: 8 }}>
                    <TextInput style={[styles.input, { height: 42 }]} placeholder="Amt" placeholderTextColor={C.textFaint} keyboardType="numeric" value={item.amount} onChangeText={t => {
                      const newItems = [...structForm.items]; newItems[idx].amount = t; setStructForm({ ...structForm, items: newItems });
                    }} />
                  </View>
                  <View style={{ flex: 2, zIndex: 90 - idx }}>
                    {renderInlineDropdown(`freq_${idx}`, null, FREQUENCIES.map(f => ({ label: f, value: f })), item.frequency, (v) => {
                      const newItems = [...structForm.items]; newItems[idx].frequency = v; setStructForm({ ...structForm, items: newItems });
                    })}
                  </View>
                  {structForm.items.length > 1 && (
                    <TouchableOpacity style={styles.removeBtn} onPress={() => setStructForm({ ...structForm, items: structForm.items.filter((_, i) => i !== idx) })}>
                      <Feather name="x" size={16} color={C.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity style={styles.addItemBtn} onPress={() => setStructForm({ ...structForm, items: [...structForm.items, { feeCategory: '', amount: '', frequency: 'Once' }] })} activeOpacity={0.85}>
                <Feather name="plus" size={14} color={C.blue} /><Text style={styles.addItemText}>Add Item</Text>
              </TouchableOpacity>

              <View style={styles.lateFeeSection}>
                <TouchableOpacity style={styles.toggleRow} onPress={() => setStructForm({ ...structForm, lateFee: { ...structForm.lateFee, enabled: !structForm.lateFee.enabled } })} activeOpacity={0.85}>
                  <Feather name={structForm.lateFee.enabled ? "check-square" : "square"} size={18} color={structForm.lateFee.enabled ? C.primary : C.textMuted} />
                  <Text style={styles.toggleText}>Enable Late Fee</Text>
                </TouchableOpacity>

                {structForm.lateFee.enabled && (
                  <View style={[styles.row, { zIndex: 10, marginTop: 10 }]}>
                    <View style={{ flex: 1.5, marginRight: 10 }}>
                      {renderInlineDropdown('lfType', 'Type', [{ label: 'Fixed (₹)', value: 'Fixed' }, { label: 'Percentage (%)', value: 'Percentage' }], structForm.lateFee.type, (v) => setStructForm({ ...structForm, lateFee: { ...structForm.lateFee, type: v } }))}
                    </View>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.inputLabel}>Amount</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={structForm.lateFee.amount} onChangeText={t => setStructForm({ ...structForm, lateFee: { ...structForm.lateFee, amount: t } })} />
                    </View>
                    <View style={{ flex: 1.2 }}>
                      <Text style={styles.inputLabel}>Grace (Days)</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={structForm.lateFee.gracePeriodDays} onChangeText={t => setStructForm({ ...structForm, lateFee: { ...structForm.lateFee, gracePeriodDays: t } })} />
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.totalCalcRow}>
                <Text style={styles.totalCalcLbl}>Total / Year</Text>
                <Text style={styles.totalCalcVal}>₹{structTotal(structForm.items).toLocaleString('en-IN')}</Text>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveStruct} disabled={saving} activeOpacity={0.9}>
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

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, paddingBottom: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.primaryBorder },
  title: { fontSize: 21, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 3, fontWeight: '500' },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tabContainer: { flex: 1, flexDirection: 'row', backgroundColor: C.surfaceSunken, padding: 4, borderRadius: 13, borderWidth: 1, borderColor: C.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 10, gap: 5 },
  tabBtnActive: { backgroundColor: C.primary, shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tabText: { fontSize: 12.5, fontWeight: '700', color: C.textMuted },
  tabTextActive: { color: '#fff' },
  tabCountPill: { backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 2 },
  tabCountPillMuted: { backgroundColor: C.border },
  tabCountText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },

  addBtnCompact: {
    backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 48, paddingHorizontal: 16, borderRadius: 12,
    shadowColor: C.primary, shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  addBtnCompactText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.surfaceSunken, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  card: {
    backgroundColor: C.surface, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border,
    shadowColor: '#0F1626', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 15.5, fontWeight: '800', color: C.ink },
  structSub: { fontSize: 11.5, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  codeBadge: { backgroundColor: C.surfaceSunken, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: C.border },
  codeText: { fontSize: 10.5, fontWeight: '800', color: C.textMuted },
  cardDesc: { fontSize: 12.5, color: C.textMuted, marginTop: 4, lineHeight: 18 },

  itemsBox: { backgroundColor: C.surfaceSoft, borderRadius: 12, padding: 4, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  itemName: { fontSize: 12.5, color: C.text, fontWeight: '600', flex: 1 },
  itemAmount: { fontSize: 12.5, color: C.ink, fontWeight: '800' },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  totalLbl: { fontSize: 12.5, fontWeight: '800', color: C.textMuted },
  totalVal: { fontSize: 16, fontWeight: '800', color: C.primaryDark },

  lateFeeBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 9, backgroundColor: C.amberSoft, borderRadius: 8, borderWidth: 1, borderColor: C.amberBorder },
  lateFeeText: { fontSize: 11, color: C.amber, fontWeight: '700', flex: 1 },

  iconBtnEdit: { padding: 9, backgroundColor: C.greenSoft, borderRadius: 9, borderWidth: 1, borderColor: C.greenBorder },
  iconBtnDelete: { padding: 9, backgroundColor: C.primarySoft, borderRadius: 9, borderWidth: 1, borderColor: C.primaryBorder },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(9,14,26,0.62)', justifyContent: 'center', padding: 16 },
  compactModalContainer: {
    backgroundColor: C.surface, borderRadius: 26, maxHeight: '90%', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
  },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  formHeaderIconBadge: { width: 38, height: 38, borderRadius: 11, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  formTitle: { fontSize: 16.5, fontWeight: '800', color: C.ink },
  formHint: { fontSize: 11.5, color: C.textMuted, marginTop: 2, fontWeight: '600' },
  closeBtnIcon: { padding: 8, backgroundColor: C.surfaceSunken, borderRadius: 20 },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.4 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  row: { flexDirection: 'row' },

  itemConfigRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  removeBtn: { padding: 6, marginLeft: 4 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 12, backgroundColor: C.blueSoft, borderRadius: 9, borderWidth: 1, borderColor: C.blueBorder, marginBottom: 20 },
  addItemText: { color: C.blue, fontSize: 12, fontWeight: '800', marginLeft: 4 },

  lateFeeSection: { borderTopWidth: 1, borderColor: C.border, paddingTop: 16, marginBottom: 20 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleText: { fontSize: 13, fontWeight: '700', color: C.text },

  totalCalcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  totalCalcLbl: { fontSize: 13.5, fontWeight: '800', color: C.textMuted },
  totalCalcVal: { fontSize: 18, fontWeight: '800', color: C.ink },

  // Dropdown — non-scrolling until options exceed MAX_VISIBLE_ITEMS
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingRight: 8, height: 46, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary, backgroundColor: C.surface },
  dropdownSelectedText: { fontSize: 13, color: C.text, fontWeight: '600', flex: 1 },
  dropdownPlaceholder: { fontSize: 13, color: C.textFaint, flex: 1 },
  chevronBadge: { width: 24, height: 24, borderRadius: 7, backgroundColor: C.surfaceSunken, justifyContent: 'center', alignItems: 'center' },
  chevronBadgeActive: { backgroundColor: C.primary },
  dropdownListContainer: {
    position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderStrong, borderRadius: 13, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 13, height: 44, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemSelected: { backgroundColor: C.primarySoft },
  dropdownItemText: { fontSize: 13, color: C.slate, fontWeight: '500', flex: 1 },
  dropdownEmpty: { padding: 14, alignItems: 'center' },
  dropdownEmptyText: { fontSize: 12, color: C.textFaint, fontWeight: '600' },
  textBrand: { color: C.primary, fontWeight: '800' },

  ghostBtn: { paddingVertical: 10, paddingHorizontal: 16, justifyContent: 'center' },
  ghostBtnText: { color: C.textMuted, fontSize: 14, fontWeight: '700' },
  saveBtnFull: { backgroundColor: C.primary, height: 52, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginTop: 4, shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});