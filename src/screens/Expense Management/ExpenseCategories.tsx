import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, RefreshControl, ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';

const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#B3122A', primarySoft: '#FEF2F2',
  green: '#10B981', greenSoft: '#D1FAE5',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

export default function ExpenseCategoriesScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', code: '', description: '', isActive: true });

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchCategories(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchCategories = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/expenses/categories`, authHeaders(token));
      if (res.data?.success) setCategories(res.data.data || []);
    } catch (e) { console.error(e); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'expenseCategory' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) { Alert.alert('Error', 'Name and Code are required'); return; }
    setSaving(true);
    try {
      if (editingId) await axios.put(`${API_BASE}/expenses/categories/${editingId}`, form, authHeaders(authToken));
      else await axios.post(`${API_BASE}/expenses/categories`, form, authHeaders(authToken));
      Alert.alert('Success', 'Category saved');
      setShowModal(false); fetchCategories(authToken, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Save failed'); } 
    finally { setSaving(false); }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Delete this category?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/expenses/categories/${id}`, authHeaders(authToken));
            fetchCategories(authToken, true);
          } catch (e) { Alert.alert('Error', 'Delete failed'); }
      }}
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* UPDATED HEADER: Button moved here, 'tags' icon replaced with 'grid' so it renders */}
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="grid" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Expense Categories</Text>
          <Text style={styles.subtitle}>Manage categories for operating expenses.</Text>
        </View>
        {hasPermission('create') && (
          <TouchableOpacity style={styles.headerAddBtn} onPress={() => { setEditingId(null); setForm({ name: '', code: '', description: '', isActive: true }); setShowModal(true); }}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.headerAddBtnText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterSection}>
        <Text style={{fontSize: 13, fontWeight: '700', color: C.textMuted}}>Configured Categories: {categories.length}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchCategories(authToken, true)} colors={[C.primary]} />}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="grid" size={40} color={C.textFaint} /><Text style={styles.emptyTitle}>No Categories</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.codeBadge}><Text style={styles.codeText}>{item.code}</Text></View>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: item.isActive ? C.greenSoft : C.slateSoft }]}>
                  <Text style={[styles.statusText, { color: item.isActive ? C.green : C.slate }]}>{item.isActive ? 'Active' : 'Inactive'}</Text>
                </View>
              </View>

              <Text style={styles.cardDesc}>{item.description || 'No description provided.'}</Text>

              <View style={styles.cardActions}>
                {hasPermission('update') && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => { setEditingId(item._id); setForm({ name: item.name, code: item.code, description: item.description || '', isActive: item.isActive }); setShowModal(true); }}><Feather name="edit-2" size={14} color={C.slate}/></TouchableOpacity>}
                {hasPermission('delete') && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(item._id)}><Feather name="trash-2" size={14} color={C.primary}/></TouchableOpacity>}
              </View>
            </View>
          )}
        />
      )}

      {/* Modal */}
      <Modal visible={showModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            
            {/* UPDATED MODAL HEADER: Project Color & X Icon */}
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>{editingId ? 'Edit Category' : 'Add Category'}</Text>
                <Text style={styles.formSubtitle}>{editingId ? 'Update category details' : 'Create a new expense category'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtnIcon} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Category Name *</Text>
                <TextInput style={styles.input} placeholder="e.g. Maintenance" value={form.name} onChangeText={t => setForm({...form, name: t})} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Category Code *</Text>
                <TextInput style={styles.input} placeholder="MNT" value={form.code} onChangeText={t => setForm({...form, code: t.toUpperCase()})} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} multiline value={form.description} onChangeText={t => setForm({...form, description: t})} />
              </View>
              
              <TouchableOpacity style={styles.toggleRow} onPress={() => setForm({...form, isActive: !form.isActive})} activeOpacity={0.8}>
                <Feather name={form.isActive ? "check-square" : "square"} size={18} color={form.isActive ? C.primary : C.textMuted} />
                <Text style={styles.toggleText}>Active Category</Text>
              </TouchableOpacity>

              {/* UPDATED ACTION BUTTONS: Side by Side layout */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)} activeOpacity={0.9}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.saveBtnFull, { flex: 1, marginTop: 0 }, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.9}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingId ? 'Update' : 'Create'}</Text>}
                </TouchableOpacity>
              </View>
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
  
  // UPDATED HEADER
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, paddingTop: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  headerAddBtnText: { color: '#fff', fontSize: 13, fontWeight: '800', marginLeft: 6 },
  
  filterSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  codeBadge: { backgroundColor: C.surfaceSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.border },
  codeText: { fontSize: 11, fontWeight: '800', color: C.textMuted },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  cardDesc: { fontSize: 13, color: C.textMuted, lineHeight: 20 },

  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: C.border, gap: 10 },
  iconBtnEdit: { padding: 8, backgroundColor: C.surfaceSoft, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  iconBtnDelete: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },

  // UPDATED MODAL STYLES
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, elevation: 12, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.primary },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  formSubtitle: { fontSize: 12, color: '#FCA5A5', marginTop: 3 },
  closeBtnIcon: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  toggleText: { fontSize: 13, fontWeight: '700', color: C.text },

  // SIDE BY SIDE BUTTONS
  saveBtnFull: { backgroundColor: C.primary, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: { flex: 1, height: 50, borderRadius: 12, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelBtnText: { color: C.textMuted, fontSize: 15, fontWeight: '800' },
});