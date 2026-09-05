import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';

const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
};

const CATEGORIES = ['General', 'Science', 'Mathematics', 'Literature', 'History', 'Reference'];

function getEmptyForm() {
  return { title: '', author: '', isbn: '', category: 'General', publisher: '', totalCopies: '5', availableCopies: '5', shelfLocation: 'Shelf A1' };
}

export default function LibraryCatalogScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(getEmptyForm());
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchBooks(token, search, categoryFilter);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchBooks = async (token: string | null = authToken, q: string = search, cat: string = categoryFilter, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params: any = {};
      if (q) params.search = q;
      if (cat) params.category = cat;
      const res = await axios.get(`${BASE_URL}/library/books`, { params, ...authHeaders(token) });
      if (res.data?.success) setBooks(res.data.data || []);
    } catch (e) { console.error(e); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'library' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const handleSave = async () => {
    if (!form.title.trim() || !form.author.trim() || !form.totalCopies) { Alert.alert('Error', 'Title, Author, and Total Copies are required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, totalCopies: Number(form.totalCopies), availableCopies: Number(form.availableCopies) };
      if (editingId) await axios.put(`${BASE_URL}/library/books/${editingId}`, payload, authHeaders(authToken));
      else await axios.post(`${BASE_URL}/library/books`, payload, authHeaders(authToken));
      Alert.alert('Success', 'Book saved successfully');
      setShowModal(false); fetchBooks(authToken, search, categoryFilter, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to save'); } 
    finally { setSaving(false); }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Book', 'Remove this book from the catalog?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try { await axios.delete(`${BASE_URL}/library/books/${id}`, authHeaders(authToken)); fetchBooks(authToken, search, categoryFilter, true); } 
          catch (e) { Alert.alert('Error', 'Failed to delete'); }
      }}
    ]);
  };

  const openEdit = (bk: any) => {
    setEditingId(bk._id);
    setForm({
      title: bk.title || '', author: bk.author || '', isbn: bk.isbn || '', category: bk.category || 'General',
      publisher: bk.publisher || '', totalCopies: String(bk.totalCopies || 1), availableCopies: String(bk.availableCopies !== undefined ? bk.availableCopies : bk.totalCopies || 1), shelfLocation: bk.shelfLocation || '',
    });
    setShowModal(true);
  };

  const renderInlineDropdown = (fieldKey: string, label: string | null, options: any[], value: string, onSelect: (v: string) => void) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        {!!label && <Text style={styles.inputLabel}>{label}</Text>}
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || 'Select...'}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => (
                <TouchableOpacity key={i} style={styles.dropdownItem} onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}>
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
        <View style={styles.headerIconBadge}><Feather name="book" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Library Catalog</Text>
          <Text style={styles.subtitle}>Search books and track inventory.</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={{ flexDirection: 'row', gap: 10, zIndex: 10 }}>
          <View style={styles.searchContainer}>
            <Feather name="search" size={16} color={C.textFaint} />
            <TextInput style={styles.searchInput} placeholder="Search title, author, ISBN..." value={search} onChangeText={setSearch} onSubmitEditing={() => fetchBooks(authToken, search, categoryFilter)} />
          </View>
          <View style={{ flex: 0.7 }}>
            {renderInlineDropdown('fCat', null, [{label: 'All Categories', value: ''}, ...CATEGORIES.map(c => ({label: c, value: c}))], categoryFilter, (v) => { setCategoryFilter(v); fetchBooks(authToken, search, v); })}
          </View>
        </View>
        {hasPermission('create') && (
          <TouchableOpacity style={styles.addBtnFull} onPress={() => { setEditingId(null); setForm(getEmptyForm()); setShowModal(true); }}>
            <Feather name="plus" size={14} color="#fff" /><Text style={styles.addBtnTextFull}>Add Book</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchBooks(authToken, search, categoryFilter, true)} colors={[C.primary]} />}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="book" size={40} color={C.textFaint} /><Text style={styles.emptyTitle}>No Books Found</Text></View>}
          renderItem={({ item }) => {
            const isAvail = item.availableCopies > 0;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.authorText}>by {item.author}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: isAvail ? C.greenSoft : C.primarySoft }]}>
                    <Text style={[styles.statusText, { color: isAvail ? C.green : C.primary }]}>{isAvail ? `${item.availableCopies} Avail` : 'Out of Stock'}</Text>
                  </View>
                </View>

                <View style={styles.metaGrid}>
                  <View style={styles.metaRow}><Feather name="tag" size={12} color={C.textMuted}/><Text style={styles.metaText}>{item.category || 'General'}</Text></View>
                  <View style={styles.metaRow}><Feather name="hash" size={12} color={C.textMuted}/><Text style={styles.metaText}>ISBN: {item.isbn || '-'}</Text></View>
                  <View style={styles.metaRow}><Feather name="map-pin" size={12} color={C.textMuted}/><Text style={styles.metaText}>Shelf: {item.shelfLocation || '-'}</Text></View>
                  <View style={styles.metaRow}><Feather name="copy" size={12} color={C.textMuted}/><Text style={styles.metaText}>Total: {item.totalCopies}</Text></View>
                </View>

                <View style={styles.cardActions}>
                  {hasPermission('update') && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEdit(item)}><Feather name="edit-2" size={14} color={C.blue} /></TouchableOpacity>}
                  {hasPermission('delete') && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(item._id)}><Feather name="trash-2" size={14} color={C.primary} /></TouchableOpacity>}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* MODAL */}
      <Modal visible={showModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingId ? 'Edit Book' : 'Add New Book'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.inputWrapper}><Text style={styles.inputLabel}>Title *</Text><TextInput style={styles.input} value={form.title} onChangeText={t => setForm({...form, title: t})} /></View>
              <View style={styles.inputWrapper}><Text style={styles.inputLabel}>Author *</Text><TextInput style={styles.input} value={form.author} onChangeText={t => setForm({...form, author: t})} /></View>
              <View style={styles.row}>
                <View style={{flex: 1, marginRight: 8, zIndex: 10}}>{renderInlineDropdown('formCat', 'Category', CATEGORIES.map(c => ({label:c,value:c})), form.category, (v) => setForm({...form, category: v}))}</View>
                <View style={{flex: 1}}><Text style={styles.inputLabel}>ISBN</Text><TextInput style={styles.input} value={form.isbn} onChangeText={t => setForm({...form, isbn: t})} /></View>
              </View>
              <View style={styles.row}>
                <View style={{flex: 1, marginRight: 8}}><Text style={styles.inputLabel}>Total Copies *</Text><TextInput style={styles.input} keyboardType="numeric" value={form.totalCopies} onChangeText={t => setForm({...form, totalCopies: t, availableCopies: editingId ? form.availableCopies : t})} /></View>
                <View style={{flex: 1}}><Text style={styles.inputLabel}>Available Copies</Text><TextInput style={styles.input} keyboardType="numeric" value={form.availableCopies} onChangeText={t => setForm({...form, availableCopies: t})} /></View>
              </View>
              <View style={styles.row}>
                <View style={{flex: 1, marginRight: 8}}><Text style={styles.inputLabel}>Publisher</Text><TextInput style={styles.input} value={form.publisher} onChangeText={t => setForm({...form, publisher: t})} /></View>
                <View style={{flex: 1}}><Text style={styles.inputLabel}>Shelf Location</Text><TextInput style={styles.input} value={form.shelfLocation} onChangeText={t => setForm({...form, shelfLocation: t})} /></View>
              </View>
              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingId ? 'Update' : 'Save'} Book</Text>}
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
  searchContainer: { flex: 1.5, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text },
  addBtnFull: { backgroundColor: '#ef4444', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 10, marginTop: 10 },
  addBtnTextFull: { color: '#fff', fontSize: 14, fontWeight: '800', marginLeft: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.primaryDark },
  authorText: { fontSize: 13, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: C.surfaceSoft, padding: 10, borderRadius: 8, gap: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '45%' },
  metaText: { fontSize: 11, color: C.text, fontWeight: '600' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: C.border, gap: 10 },
  iconBtnEdit: { padding: 8, backgroundColor: C.blueSoft, borderRadius: 8, borderWidth: 1, borderColor: '#BAE6FD' },
  iconBtnDelete: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  closeBtnIcon: { padding: 6, backgroundColor: C.border, borderRadius: 20 },
  formScroll: { padding: 20 },
  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  row: { flexDirection: 'row', marginBottom: 16 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 13, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 13, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6 },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },
  saveBtnFull: { backgroundColor: C.primary, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});