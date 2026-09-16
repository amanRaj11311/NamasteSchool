import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';


const C = {
  bg: '#F4F6F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#101828', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#E11D2E', primaryDark: '#B91424', primarySoft: '#FEECEC',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

const shadow = {
  shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
};
const shadowSm = {
  shadowColor: '#101828', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
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
        axios.get(`${API_BASE}/hostel/blocks`, authHeaders(token)),
        axios.get(`${API_BASE}/hostel/rooms`, { params, ...authHeaders(token) }),
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
      await axios.post(`${API_BASE}/hostel/blocks`, blockForm, authHeaders(authToken));
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
      await axios.post(`${API_BASE}/hostel/rooms`, {
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

  // Summary stats for the top premium stat strip
  const stats = useMemo(() => {
    const totalCapacity = rooms.reduce((s, r) => s + (r.capacity || 0), 0);
    const totalOccupied = rooms.reduce((s, r) => s + (r.occupied || 0), 0);
    const occPct = totalCapacity ? Math.round((totalOccupied / totalCapacity) * 100) : 0;
    return {
      blocksCount: blocks.length,
      roomsCount: rooms.length,
      occPct,
    };
  }, [blocks, rooms]);

  const QUICK_ACTIONS = [
    { key: 'allocate', label: 'Allocate Student', icon: 'log-in', kind: 'outline', onPress: () => navigation.navigate('HostelAllocation') },
    { key: 'reports', label: 'Occupancy Reports', icon: 'pie-chart', kind: 'outline', onPress: () => navigation.navigate('HostelReports') },
    { key: 'addBlock', label: 'Add Block', icon: 'layers', kind: 'solid', onPress: () => { setBlockForm({ name: '', type: 'Boys' }); setBlockModal(true); } },
    { key: 'addRoom', label: 'Add Room', icon: 'plus-square', kind: 'solid', onPress: () => { setRoomForm({ blockId: '', roomNumber: '', capacity: '', type: 'Double Shared', monthlyFee: '' }); setRoomModal(true); } },
  ];

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

      {/* PAGE HEADER */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.pageTitle}>Hostel Management</Text>
          <Text style={styles.pageSubtitle}>Blocks, rooms & occupancy</Text>
        </View>
      </View>

      {/* PREMIUM STAT STRIP */}
      <View style={styles.statStrip}>
        <View style={styles.statCard}>
          <View style={[styles.statIconBadge, { backgroundColor: C.blueSoft }]}>
            <Feather name="layers" size={15} color={C.blue} />
          </View>
          <Text style={styles.statValue}>{stats.blocksCount}</Text>
          <Text style={styles.statLabel}>Blocks</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <View style={[styles.statIconBadge, { backgroundColor: C.primarySoft }]}>
            <Feather name="grid" size={15} color={C.primary} />
          </View>
          <Text style={styles.statValue}>{stats.roomsCount}</Text>
          <Text style={styles.statLabel}>Rooms</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <View style={[styles.statIconBadge, { backgroundColor: C.greenSoft }]}>
            <Feather name="pie-chart" size={15} color={C.green} />
          </View>
          <Text style={styles.statValue}>{stats.occPct}%</Text>
          <Text style={styles.statLabel}>Occupied</Text>
        </View>
      </View>

      {/* QUICK ACTIONS — responsive 2x2 grid, never clipped/hidden */}
      <View style={styles.quickActionsGrid}>
        {QUICK_ACTIONS.map(a => (
          <TouchableOpacity
            key={a.key}
            style={[styles.actionCard, a.kind === 'solid' ? styles.actionCardSolid : styles.actionCardOutline]}
            onPress={a.onPress}
            activeOpacity={0.85}
          >
            <View style={[styles.actionIconCircle, a.kind === 'solid' && styles.actionIconCircleSolid]}>
              <Feather name={a.icon} size={15} color={a.kind === 'solid' ? '#fff' : C.primary} />
            </View>
            <Text
              style={[styles.actionCardText, a.kind === 'solid' && styles.actionCardTextSolid]}
              numberOfLines={2}
            >
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
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
            const capacity = item.capacity || 0;
            const occupied = item.occupied || 0;
            const pct = capacity ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0;
            const isFull = capacity > 0 && occupied >= capacity;
            const barColor = isFull ? C.primary : pct >= 70 ? C.amber : C.green;

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
                  <View style={[styles.badge, isFull && styles.badgeFull]}>
                    <Text style={[styles.badgeText, isFull && styles.badgeTextFull]}>{item.type}</Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLbl}>CAPACITY</Text>
                    <Text style={styles.metaVal}>{capacity} Beds</Text>
                  </View>
                  <View style={styles.metaDivider} />
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLbl}>MONTHLY FEE</Text>
                    <Text style={[styles.metaVal, { color: C.green }]}>\u20b9{item.monthlyFee}</Text>
                  </View>
                </View>

                <View style={styles.occupancyBlock}>
                  <View style={styles.occupancyLabelRow}>
                    <Text style={styles.occupancyLabel}>Occupancy</Text>
                    <Text style={[styles.occupancyPct, { color: barColor }]}>{occupied}/{capacity} \u2022 {pct}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: barColor }]} />
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

  // Header
  pageHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: C.surface },
  pageTitle: { fontSize: 19, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  pageSubtitle: { fontSize: 12.5, color: C.textMuted, fontWeight: '500', marginTop: 2 },

  // Stat strip
  statStrip: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 14, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, paddingVertical: 14, ...shadowSm },
  statCard: { flex: 1, alignItems: 'center', gap: 4 },
  statIconBadge: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  statValue: { fontSize: 17, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 10.5, fontWeight: '700', color: C.textMuted, letterSpacing: 0.3 },
  statDivider: { width: 1, height: 34, backgroundColor: C.border },

  // Quick actions — responsive 2x2 grid (no clipping on any screen width)
  quickActionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 14, rowGap: 10,
  },
  actionCard: {
    width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 9,
    borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1.5,
  },
  actionCardOutline: { backgroundColor: C.primarySoft, borderColor: '#F6C6C9' },
  actionCardSolid: { backgroundColor: C.primary, borderColor: C.primary, ...shadow, shadowColor: C.primary, shadowOpacity: 0.22 },
  actionIconCircle: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(225,29,46,0.12)', justifyContent: 'center', alignItems: 'center' },
  actionIconCircleSolid: { backgroundColor: 'rgba(255,255,255,0.2)' },
  actionCardText: { flex: 1, fontSize: 12, fontWeight: '800', color: C.primaryDark, lineHeight: 15 },
  actionCardTextSolid: { color: '#fff' },

  filterSection: { paddingHorizontal: 16, paddingBottom: 14, backgroundColor: C.bg },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },

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
  badgeFull: { backgroundColor: C.primarySoft },
  badgeText: { fontSize: 10, fontWeight: '800', color: C.slate },
  badgeTextFull: { color: C.primaryDark },

  metaRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  metaCol: { flex: 1 },
  metaDivider: { width: 1, height: 28, backgroundColor: C.border, marginHorizontal: 12 },
  metaLbl: { fontSize: 9.5, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  metaVal: { fontSize: 14.5, fontWeight: '800', color: C.text },

  occupancyBlock: { gap: 6 },
  occupancyLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  occupancyLabel: { fontSize: 10.5, fontWeight: '800', color: C.textMuted, letterSpacing: 0.3 },
  occupancyPct: { fontSize: 11, fontWeight: '800' },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: C.slateSoft, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },

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
  saveBtnFullText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
});