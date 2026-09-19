import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput,
  Modal, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl, Switch
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';


const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#B3122A', primaryDark: '#C5221F', primarySoft: '#FDE8E8',
  blue: '#0EA5E9', blueDark: '#0284C7', blueSoft: '#E0F2FE',
  green: '#10B981', greenDark: '#059669', greenSoft: '#D1FAE5',
  slate: '#64748B', slateDark: '#475569', slateSoft: '#F1F5F9',
};

const emptyForm = {
  name: "", businessName: "", gstNumber: "", email: "", password: "",
  phone: "", whatsappNumber: "", city: "", address: "", notes: "", isActive: true,
};

export default function MarketplaceSellersScreen() {
  const navigation = useNavigation<any>();
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const isSuper = await AsyncStorage.getItem('isSuperAdmin');
    if (isSuper !== 'true') {
      Alert.alert('Access Denied', 'Only Super Admins can manage sellers.');
      navigation.goBack();
      return;
    }
    setAuthToken(token);
    fetchSellers(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchSellers = async (token: string | null = authToken, q: string = searchQuery, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = q ? { search: q } : {};
      const res = await axios.get(`${API_BASE}/sellers`, { params, ...authHeaders(token) });
      if (res.data?.success) {
        setSellers(res.data.data || []);
      }
    } catch (err) { Alert.alert('Error', 'Failed to load sellers'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  // Pagination logic (client-side for now since backend returns all on search)
  const paginatedList = useMemo(() => {
    return sellers.slice((page - 1) * pageSize, page * pageSize);
  }, [sellers, page]);

  const totalPages = Math.ceil(sellers.length / pageSize) || 1;

  const handleSave = async () => {
    if (!form.name || !form.businessName || !form.email || !form.whatsappNumber) {
      Alert.alert('Validation Error', 'Name, Business Name, Email, and WhatsApp Number are required.');
      return;
    }
    if (!editingId && !form.password) {
      Alert.alert('Validation Error', 'Password is required for a new seller.');
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form };
      if (editingId && !payload.password) delete payload.password; // Don't send empty pwd on edit

      if (editingId) {
        await axios.put(`${API_BASE}/sellers/${editingId}`, payload, authHeaders(authToken));
        Alert.alert('Success', 'Seller updated successfully.');
      } else {
        await axios.post(`${API_BASE}/sellers`, payload, authHeaders(authToken));
        Alert.alert('Success', 'Seller created successfully.');
      }
      setShowModal(false);
      fetchSellers(authToken, searchQuery, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to save seller.'); } 
    finally { setSaving(false); }
  };

  const handleDelete = (id: string, business: string) => {
    Alert.alert('Delete Seller', `Are you sure you want to remove "${business}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/sellers/${id}`, authHeaders(authToken));
            fetchSellers(authToken, searchQuery, true);
          } catch (e) { Alert.alert('Error', 'Failed to delete seller.'); }
      }}
    ]);
  };

  const openAddForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowPwd(false);
    setShowModal(true);
  };

  const openEditForm = (item: any) => {
    setEditingId(item._id || item.id);
    setForm({
      name: item.name || '',
      businessName: item.businessName || '',
      gstNumber: item.gstNumber || '',
      email: item.email || '',
      password: '', // Kept blank to avoid overwriting unless intended
      phone: item.phone || '',
      whatsappNumber: item.whatsappNumber || '',
      city: item.city || '',
      address: item.address || '',
      notes: item.notes || '',
      isActive: item.isActive !== false,
    });
    setShowPwd(false);
    setShowModal(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        
        <View style={styles.headerIconBadge}><Feather name="briefcase" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Marketplace Sellers</Text>
          <Text style={styles.subtitle}>Super Admin controls.</Text>
        </View>
        <TouchableOpacity style={styles.addBtnFull} onPress={openAddForm}>
          <Feather name="plus" size={14} color="#fff" /><Text style={styles.addBtnTextFull}>Add Seller</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={C.textFaint} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search business, name, email..." 
            placeholderTextColor={C.textFaint}
            value={searchQuery} 
            onChangeText={setSearchQuery} 
            onSubmitEditing={() => { setPage(1); fetchSellers(authToken, searchQuery); }}
            returnKeyType="search"
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); fetchSellers(authToken, ''); }}>
              <Feather name="x-circle" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.totalText}>{sellers.length} Sellers Found</Text>
      </View>

      {/* List */}
      {loading && page === 1 ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : sellers.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="inbox" size={40} color={C.textFaint} />
          <Text style={styles.emptyTitle}>No Sellers Found</Text>
          <Text style={styles.emptySubtitle}>No vendor accounts exist yet. Click 'Add Seller' to create one.</Text>
        </View>
      ) : (
        <FlatList
          data={paginatedList}
          keyExtractor={item => item._id || item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchSellers(authToken, searchQuery, true)} colors={[C.primary]} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.businessName} numberOfLines={1}>{item.businessName}</Text>
                  <Text style={styles.sellerName} numberOfLines={1}><Feather name="user" size={10} color={C.textMuted}/> {item.name}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: item.isActive ? C.greenSoft : C.slateSoft }]}>
                  <Text style={[styles.statusBadgeText, { color: item.isActive ? C.greenDark : C.slateDark }]}>{item.isActive ? 'ACTIVE' : 'INACTIVE'}</Text>
                </View>
              </View>

              <View style={styles.metaGrid}>
                <View style={styles.metaRow}>
                  <View style={styles.metaCol}><Text style={styles.metaLbl}>EMAIL</Text><Text style={styles.metaVal} numberOfLines={1}>{item.email}</Text></View>
                  <View style={styles.metaCol}><Text style={styles.metaLbl}>WHATSAPP</Text><Text style={styles.metaVal}><Feather name="phone" size={10} color={C.greenDark}/> {item.whatsappNumber}</Text></View>
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.metaCol}><Text style={styles.metaLbl}>GST NO</Text><Text style={[styles.metaVal, {fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'}]}>{item.gstNumber || '—'}</Text></View>
                  <View style={styles.metaCol}><Text style={styles.metaLbl}>CITY</Text><Text style={styles.metaVal}>{item.city || '—'}</Text></View>
                </View>
              </View>

              <View style={styles.cardFooter}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.metaLbl}>PRODUCTS</Text>
                  <View style={styles.countPill}><Text style={styles.countPillText}>{item.publishedCount ?? 0} Published / {item.productCount ?? 0} Total</Text></View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditForm(item)}><Feather name="edit-2" size={14} color={C.blueDark} /></TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(item._id || item.id, item.businessName)}><Feather name="trash-2" size={14} color={C.primaryDark} /></TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          // Simple local pagination controls
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.paginationRow}>
                <TouchableOpacity style={[styles.pageBtn, page === 1 && {opacity: 0.5}]} disabled={page === 1} onPress={() => setPage(p => p - 1)}><Feather name="chevron-left" size={18} color={C.text}/></TouchableOpacity>
                <Text style={styles.pageText}>Page {page} of {totalPages}</Text>
                <TouchableOpacity style={[styles.pageBtn, page === totalPages && {opacity: 0.5}]} disabled={page === totalPages} onPress={() => setPage(p => p + 1)}><Feather name="chevron-right" size={18} color={C.text}/></TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}

      {/* FORM MODAL */}
      <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.modalHeaderRed}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="store" size={18} color="#fff" />
                <Text style={styles.modalTitle}>{editingId ? 'Edit Seller Profile' : 'Register New Seller'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtnIconLight} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text style={{ fontSize: 18, color: '#fff' }}>✕</Text></TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Contact Person *</Text>
                  <TextInput style={styles.input} placeholder="e.g. Rahul Sharma" value={form.name} onChangeText={t => setForm({...form, name: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Business Name *</Text>
                  <TextInput style={styles.input} placeholder="e.g. Uniforms Hub" value={form.businessName} onChangeText={t => setForm({...form, businessName: t})} />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>GST Number</Text>
                  <TextInput style={[styles.input, {textTransform: 'uppercase', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'}]} placeholder="22AAAAA0000A1Z5" value={form.gstNumber} onChangeText={t => setForm({...form, gstNumber: t.toUpperCase()})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>City</Text>
                  <TextInput style={styles.input} placeholder="e.g. Jaipur" value={form.city} onChangeText={t => setForm({...form, city: t})} />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Login Email *</Text>
                <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" placeholder="seller@example.com" value={form.email} onChangeText={t => setForm({...form, email: t})} />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Password {editingId ? '(Leave blank to keep)' : '*'}</Text>
                <View style={styles.pwdContainer}>
                  <TextInput 
                    style={styles.pwdInput} 
                    secureTextEntry={!showPwd} 
                    autoCapitalize="none"
                    placeholder={editingId ? "••••••••" : "Enter secure password"} 
                    value={form.password} 
                    onChangeText={t => setForm({...form, password: t})} 
                  />
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPwd(!showPwd)}>
                    <Feather name={showPwd ? "eye-off" : "eye"} size={16} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>WhatsApp No. *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="+91..." value={form.whatsappNumber} onChangeText={t => setForm({...form, whatsappNumber: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Alt Phone</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="Optional" value={form.phone} onChangeText={t => setForm({...form, phone: t})} />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Physical Address</Text>
                <TextInput style={styles.input} placeholder="Shop no, street..." value={form.address} onChangeText={t => setForm({...form, address: t})} />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.switchTitle}>Account Active</Text>
                  <Text style={styles.switchSub}>Allow seller to login and list products.</Text>
                </View>
                <Switch value={form.isActive} onValueChange={v => setForm({...form, isActive: v})} trackColor={{ false: C.border, true: C.primarySoft }} thumbColor={form.isActive ? C.primary : C.textFaint} />
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingId ? 'Update Seller' : 'Create Account'}</Text>}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  backBtn: { padding: 4, marginRight: -4 },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  addBtnFull: { backgroundColor: '#B3122A', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, height: 38, borderRadius: 10, elevation: 2 },
  addBtnTextFull: { color: '#fff', fontSize: 12, fontWeight: '800', marginLeft: 6 },

  filterSection: { padding: 16, paddingBottom: 0, backgroundColor: C.bg },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 48, elevation: 1 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text, fontWeight: '500' },

  statsRow: { paddingHorizontal: 16, marginTop: 16 },
  totalText: { fontSize: 12, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 },
  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', marginHorizontal: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  businessName: { fontSize: 17, fontWeight: '900', color: C.text, marginBottom: 4 },
  sellerName: { fontSize: 12, color: C.textMuted, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },

  metaGrid: { backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  metaRow: { flexDirection: 'row', marginBottom: 10 },
  metaCol: { flex: 1 },
  metaLbl: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  metaVal: { fontSize: 13, fontWeight: '700', color: C.text },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 14, marginTop: 12, borderTopWidth: 1, borderColor: C.border },
  countPill: { backgroundColor: C.slateSoft, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countPillText: { fontSize: 11, fontWeight: '800', color: C.slateDark },

  iconBtnEdit: { padding: 8, backgroundColor: C.blueSoft, borderRadius: 8, borderWidth: 1, borderColor: '#BAE6FD' },
  iconBtnDelete: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },

  paginationRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, gap: 16 },
  pageBtn: { width: 40, height: 40, backgroundColor: C.surface, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border, elevation: 1 },
  pageText: { fontSize: 14, fontWeight: '700', color: C.textMuted },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  modalHeaderRed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: C.primary },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  closeBtnIconLight: { padding: 4, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 20 },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text, fontWeight: '500' },
  row: { flexDirection: 'row', marginBottom: 16 },
  
  pwdContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.surfaceSoft, height: 46 },
  pwdInput: { flex: 1, paddingHorizontal: 12, fontSize: 14, color: C.text, fontWeight: '500' },
  eyeBtn: { paddingHorizontal: 14, height: '100%', justifyContent: 'center' },

  switchesContainer: { borderTopWidth: 1, borderColor: C.border, paddingTop: 16, marginBottom: 16 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  switchTitle: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 2 },
  switchSub: { fontSize: 11, color: C.textMuted },

  saveBtnFull: { backgroundColor: C.primary, flexDirection: 'row', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});