import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';

const C = {
  bg: '#F4F6F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#101828', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#E11D2E', primaryDark: '#B91424', primarySoft: '#FEECEC',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

const shadow = {
  shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
};

export default function HostelBlocksRoomsScreen() {
  const navigation = useNavigation<any>();
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterBlock, setFilterBlock] = useState('');

  // Modals
  const [blockModal, setBlockModal] = useState(false);
  const [roomModal, setRoomModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const [blockForm, setBlockForm] = useState({ name: '', type: 'Boys' });
  const [roomForm, setRoomForm] = useState({ blockId: '', roomNumber: '', capacity: '', type: 'Double Shared', monthlyFee: '' });

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchData(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchData = async (token: string | null = authToken, bFilter: string = filterBlock, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = bFilter ? { blockId: bFilter } : {};
      const results = await Promise.allSettled([
        axios.get(`${BASE_URL}/hostel/blocks`, authHeaders(token)),
        axios.get(`${BASE_URL}/hostel/rooms`, { params, ...authHeaders(token) }),
      ]);
      const [bRes, rRes] = results;

      if (bRes.status === 'fulfilled') {
        setBlocks(bRes.value.data?.data || []);
      } else {
        console.error('Blocks fetch failed:', bRes.reason?.response?.status, bRes.reason?.response?.data || bRes.reason?.message);
      }

      if (rRes.status === 'fulfilled') {
        setRooms(rRes.value.data?.data || []);
      } else {
        console.error('Rooms fetch failed:', rRes.reason?.response?.status, rRes.reason?.response?.data || rRes.reason?.message);
      }

      if (results.every(r => r.status === 'rejected') && !isRefresh) {
        Alert.alert('Couldn\u2019t load data', 'Check your connection and pull down to try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSaveBlock = async () => {
    if (!blockForm.name.trim()) { Alert.alert('Error', 'Block name required'); return; }
    setSaving(true);
    try {
      await axios.post(`${BASE_URL}/hostel/blocks`, blockForm, authHeaders(authToken));
      Alert.alert('Success', 'Block added successfully');
      setBlockModal(false);
      fetchData(authToken, filterBlock, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to add block'); }
    finally { setSaving(false); }
  };

  const handleSaveRoom = async () => {
    if (!roomForm.blockId || !roomForm.roomNumber || !roomForm.capacity || !roomForm.monthlyFee) {
      Alert.alert('Error', 'All fields are required'); return;
    }
    setSaving(true);
    try {
      await axios.post(`${BASE_URL}/hostel/rooms`, {
        ...roomForm,
        capacity: Number(roomForm.capacity),
        monthlyFee: Number(roomForm.monthlyFee)
      }, authHeaders(authToken));
      Alert.alert('Success', 'Room added successfully');
      setRoomModal(false);
      fetchData(authToken, filterBlock, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to add room'); }
    finally { setSaving(false); }
  };

  const renderInlineDropdown = (fieldKey: string, label: string, icon: string, options: any[], value: string, onSelect: (v: string) => void) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <View style={styles.dropdownHeaderLeft}>
            <View style={[styles.fieldIconBadge, isOpen && styles.fieldIconBadgeActive]}>
              <Feather name={icon} size={13} color={isOpen ? '#fff' : C.primary} />
            </View>
            <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || 'Select...'}</Text>
          </View>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={17} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => (
                <TouchableOpacity key={opt.value + i} style={[styles.dropdownItem, i === options.length - 1 && { borderBottomWidth: 0 }]} onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}>
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
      <View style={styles.actionScrollerWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionScroller}>
          <TouchableOpacity style={styles.actionBtnOutline} onPress={() => navigation.navigate('HostelAllocation')} activeOpacity={0.85}>
            <Feather name="log-in" size={14} color={C.primary} /><Text style={styles.actionBtnOutlineText}>Allocate Student</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnOutline} onPress={() => navigation.navigate('HostelReports')} activeOpacity={0.85}>
            <Feather name="pie-chart" size={14} color={C.primary} /><Text style={styles.actionBtnOutlineText}>Occupancy Reports</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnSolid} onPress={() => { setBlockForm({ name: '', type: 'Boys' }); setBlockModal(true); }} activeOpacity={0.9}>
            <Feather name="plus" size={14} color="#fff" /><Text style={styles.actionBtnSolidText}>Add Block</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnSolid} onPress={() => { setRoomForm({ blockId: '', roomNumber: '', capacity: '', type: 'Double Shared', monthlyFee: '' }); setRoomModal(true); }} activeOpacity={0.9}>
            <Feather name="plus" size={14} color="#fff" /><Text style={styles.actionBtnSolidText}>Add Room</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.filterSection}>
        <View style={{ zIndex: 10 }}>
          {renderInlineDropdown('fBlock', 'FILTER BLOCK', 'filter', [{ label: 'All Hostel Blocks', value: '' }, ...blocks.map(b => ({ label: b.name, value: b._id }))], filterBlock, (v) => { setFilterBlock(v); fetchData(authToken, v); })}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingText}>Loading rooms\u2026</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(authToken, filterBlock, true)} colors={[C.primary]} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBadge}><Feather name="home" size={22} color={C.textFaint} /></View>
              <Text style={styles.emptyTitle}>No Rooms Registered</Text>
              <Text style={styles.emptySubtitle}>Add a block and room to get started.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const pct = item.capacity ? Math.min(100, Math.round(((item.occupied || 0) / item.capacity) * 100)) : 0;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.roomIconBadge}>
                    <Feather name="grid" size={16} color={C.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.roomNo}>Room {item.roomNumber}</Text>
                    <View style={styles.metaInlineRow}>
                      <Feather name="map-pin" size={10} color={C.textMuted} />
                      <Text style={styles.blockName}>{item.blockId?.name || 'Unknown Block'}</Text>
                    </View>
                  </View>
                  <View style={styles.badge}><Text style={styles.badgeText}>{item.type}</Text></View>
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLbl}>CAPACITY</Text>
                    <Text style={styles.metaVal}>{item.capacity} Beds</Text>
                  </View>
                  <View style={styles.metaDivider} />
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLbl}>MONTHLY FEE</Text>
                    <Text style={[styles.metaVal, { color: C.green }]}>\u20b9{item.monthlyFee}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ADD BLOCK MODAL */}
      <Modal visible={blockModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderLeft}>
                <View style={styles.formHeaderIconBadge}><Feather name="layers" size={16} color="#fff" /></View>
                <Text style={styles.formTitle}>Add Block</Text>
              </View>
              <TouchableOpacity onPress={() => setBlockModal(false)} style={styles.modalCloseBtn}><Feather name="x" size={18} color="#fff" /></TouchableOpacity>
            </View>
            <View style={styles.formScroll}>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>BLOCK NAME *</Text>
                <TextInput style={styles.input} placeholder="e.g. Block A - Boys Hostel" placeholderTextColor={C.textFaint} value={blockForm.name} onChangeText={t => setBlockForm({ ...blockForm, name: t })} />
              </View>
              <View style={{ zIndex: 10 }}>
                {renderInlineDropdown('bType', 'GENDER / TYPE', 'users', [{ label: 'Boys', value: 'Boys' }, { label: 'Girls', value: 'Girls' }, { label: 'Mixed', value: 'Mixed' }], blockForm.type, (v) => setBlockForm({ ...blockForm, type: v }))}
              </View>
              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveBlock} disabled={saving} activeOpacity={0.9}>
                {saving ? <ActivityIndicator color="#fff" /> : <><Feather name="check-circle" size={16} color="#fff" /><Text style={styles.saveBtnFullText}>Add Block</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ADD ROOM MODAL */}
      <Modal visible={roomModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderLeft}>
                <View style={styles.formHeaderIconBadge}><Feather name="grid" size={16} color="#fff" /></View>
                <Text style={styles.formTitle}>Add Room</Text>
              </View>
              <TouchableOpacity onPress={() => setRoomModal(false)} style={styles.modalCloseBtn}><Feather name="x" size={18} color="#fff" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              <View style={{ zIndex: 50, marginBottom: 16 }}>
                {renderInlineDropdown('rBlock', 'HOSTEL BLOCK *', 'layers', blocks.map(b => ({ label: b.name, value: b._id })), roomForm.blockId, (v) => setRoomForm({ ...roomForm, blockId: v }))}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>ROOM NUMBER *</Text>
                  <TextInput style={styles.input} placeholder="e.g. 101" placeholderTextColor={C.textFaint} value={roomForm.roomNumber} onChangeText={t => setRoomForm({ ...roomForm, roomNumber: t })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>BED CAPACITY *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="2" placeholderTextColor={C.textFaint} value={roomForm.capacity} onChangeText={t => setRoomForm({ ...roomForm, capacity: t })} />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10, zIndex: 40 }}>
                  {renderInlineDropdown('rType', 'ROOM TYPE', 'home', [{ label: 'Single', value: 'Single' }, { label: 'Double Shared', value: 'Double Shared' }, { label: 'Triple Shared', value: 'Triple Shared' }, { label: 'Dormitory', value: 'Dormitory' }], roomForm.type, (v) => setRoomForm({ ...roomForm, type: v }))}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>MONTHLY FEE (\u20b9) *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="3000" placeholderTextColor={C.textFaint} value={roomForm.monthlyFee} onChangeText={t => setRoomForm({ ...roomForm, monthlyFee: t })} />
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveRoom} disabled={saving} activeOpacity={0.9}>
                {saving ? <ActivityIndicator color="#fff" /> : <><Feather name="check-circle" size={16} color="#fff" /><Text style={styles.saveBtnFullText}>Add Room</Text></>}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, color: C.textMuted, fontWeight: '600' },

  actionScrollerWrap: { backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  actionScroller: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  actionBtnOutline: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, gap: 6, backgroundColor: C.primarySoft },
  actionBtnOutlineText: { color: C.primaryDark, fontSize: 12, fontWeight: '800' },
  actionBtnSolid: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, gap: 6, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
  actionBtnSolidText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, gap: 4 },
  emptyIconBadge: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: C.border },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  emptySubtitle: { fontSize: 12, color: C.textMuted, fontWeight: '500' },

  card: { backgroundColor: C.surface, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border, ...shadow },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  roomIconBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  roomNo: { fontSize: 16, fontWeight: '800', color: C.text },
  metaInlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  blockName: { fontSize: 11.5, color: C.textMuted, fontWeight: '600' },
  badge: { backgroundColor: C.slateSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '800', color: C.slate },

  metaRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  metaCol: { flex: 1 },
  metaDivider: { width: 1, height: 28, backgroundColor: C.border, marginHorizontal: 12 },
  metaLbl: { fontSize: 9.5, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  metaVal: { fontSize: 14.5, fontWeight: '800', color: C.text },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 22, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18, backgroundColor: C.primary },
  formHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formHeaderIconBadge: { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  formTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  modalCloseBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, marginBottom: 7, letterSpacing: 0.6 },
  input: { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 50, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text, fontWeight: '600' },
  row: { flexDirection: 'row' },

  dropdownHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  fieldIconBadge: { width: 24, height: 24, borderRadius: 8, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  fieldIconBadgeActive: { backgroundColor: C.primary },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 50, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary, backgroundColor: C.surface },
  dropdownSelectedText: { fontSize: 13.5, color: C.text, fontWeight: '700', flexShrink: 1 },
  dropdownPlaceholder: { fontSize: 13.5, color: C.textFaint, fontWeight: '500' },
  dropdownListContainer: { position: 'absolute', top: 74, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, overflow: 'hidden', ...shadow, shadowOpacity: 0.12, elevation: 8 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13.5, color: C.text, fontWeight: '600', flexShrink: 1 },
  textBrand: { color: C.primary, fontWeight: '800' },

  saveBtnFull: { flexDirection: 'row', gap: 8, backgroundColor: C.primary, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 4 },
  saveBtnFullText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
});