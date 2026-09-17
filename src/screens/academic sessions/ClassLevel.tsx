import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';

const C = {
  bg: '#F4F6F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#101828', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#B3122A', primaryDark: '#B91424', primarySoft: '#FEECEC',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

interface ClassLevel {
  _id: string;
  name: string;
  sequenceOrder: number;
}

export default function ClassLevelsScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [levels, setLevels] = useState<ClassLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal & Form State
  const [isFormVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', sequenceOrder: '' });

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchLevels(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchLevels = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/class-levels`, authHeaders(token));
      if (res.data?.data) {
        const sorted = res.data.data.sort((a: ClassLevel, b: ClassLevel) => a.sequenceOrder - b.sequenceOrder);
        setLevels(sorted);
      }
    } catch (e) { console.error(e); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    // Assuming 'academic' or 'classes' module governs this based on your previous config
    return permissions.some(p => (p.module === 'academic' || p.module === 'classes') && p.action === action);
  }, [permissions, isSuperAdmin]);

  const openModal = (levelDoc?: ClassLevel) => {
    if (levelDoc) {
      setEditingId(levelDoc._id);
      setFormData({ name: levelDoc.name, sequenceOrder: String(levelDoc.sequenceOrder) });
    } else {
      setEditingId(null);
      const nextSeq = levels.length > 0 ? Math.max(...levels.map((l) => l.sequenceOrder)) + 1 : 1;
      setFormData({ name: '', sequenceOrder: String(nextSeq) });
    }
    setFormVisible(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.sequenceOrder) {
      Alert.alert("Validation Error", "Name and Sequence Order are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        sequenceOrder: Number(formData.sequenceOrder),
      };

      if (editingId) {
        await axios.put(`${API_BASE}/class-levels/${editingId}`, payload, authHeaders(authToken));
        Alert.alert("Success", "Class Level updated successfully.");
      } else {
        await axios.post(`${API_BASE}/class-levels`, payload, authHeaders(authToken));
        Alert.alert("Success", "Class Level created successfully.");
      }
      setFormVisible(false);
      fetchLevels(authToken, true);
    } catch (e: any) { 
      Alert.alert("Error", e.response?.data?.message || "Failed to save Class Level."); 
    } finally { setSaving(false); }
  };

  const moveLevel = async (index: number, direction: number) => {
    const newLevels = [...levels];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= newLevels.length) return;

    // Swap sequence orders locally
    const tempSeq = newLevels[index].sequenceOrder;
    newLevels[index].sequenceOrder = newLevels[targetIdx].sequenceOrder;
    newLevels[targetIdx].sequenceOrder = tempSeq;

    // Sort visually immediately for snappy UX
    const sortedLevels = [...newLevels].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    setLevels(sortedLevels);

    // Persist to backend
    try {
      const reorderList = sortedLevels.map((l) => ({ id: l._id, sequenceOrder: l.sequenceOrder }));
      await axios.put(`${API_BASE}/class-levels/reorder`, reorderList, authHeaders(authToken));
    } catch (e: any) {
      Alert.alert("Error", "Failed to save new sequence order.");
      fetchLevels(authToken, true); // Revert on failure
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Class Level', `Are you sure you want to delete ${name}? This may affect student promotions.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/class-levels/${id}`, authHeaders(authToken));
            fetchLevels(authToken, true);
          } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to delete Class Level.'); }
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="layers" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Class Levels</Text>
          <Text style={styles.subtitle}>Define grade sequences for automated promotions.</Text>
        </View>
      </View>

      <View style={styles.actionBar}>
        <Text style={styles.listCount}>{levels.length} Levels Configured</Text>
        {hasPermission('create') && (
          <TouchableOpacity style={styles.addBtn} onPress={() => openModal()} activeOpacity={0.9}>
            <Feather name="plus" size={14} color="#fff" />
            <Text style={styles.addBtnText}>Add Level</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={levels}
          keyExtractor={item => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchLevels(authToken, true)} colors={[C.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="list" size={40} color={C.textFaint} />
              <Text style={styles.emptyTitle}>No Class Levels Configured</Text>
              <Text style={styles.emptySubtitle}>Add grade levels to establish student progression order.</Text>
              {hasPermission('create') && (
                <TouchableOpacity style={[styles.addBtn, { marginTop: 16 }]} onPress={() => openModal()}>
                  <Feather name="plus" size={14} color="#fff" />
                  <Text style={styles.addBtnText}>Add First Level</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item, index }) => {
            const nextLvl = levels[index + 1];
            return (
              <View style={styles.card}>
                <View style={styles.cardInfo}>
                  <View style={styles.orderBadge}>
                    <Text style={styles.orderBadgeText}>#{item.sequenceOrder}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    {nextLvl ? (
                      <Text style={styles.promotesText}>Promotes to: <Text style={{fontWeight: '700', color: C.text}}>{nextLvl.name}</Text></Text>
                    ) : (
                      <View style={styles.exitBadge}>
                        <Feather name="award" size={10} color={C.green} />
                        <Text style={styles.exitBadgeText}>Exit Grade (Passed Out)</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.cardActions}>
                  {/* Reorder Controls */}
                  {hasPermission('update') && (
                    <View style={styles.reorderGroup}>
                      <TouchableOpacity 
                        style={[styles.reorderBtn, index === 0 && styles.reorderBtnDisabled]} 
                        onPress={() => moveLevel(index, -1)}
                        disabled={index === 0}
                      >
                        <Feather name="arrow-up" size={16} color={index === 0 ? C.border : C.textMuted} />
                      </TouchableOpacity>
                      <View style={styles.reorderDivider} />
                      <TouchableOpacity 
                        style={[styles.reorderBtn, index === levels.length - 1 && styles.reorderBtnDisabled]} 
                        onPress={() => moveLevel(index, 1)}
                        disabled={index === levels.length - 1}
                      >
                        <Feather name="arrow-down" size={16} color={index === levels.length - 1 ? C.border : C.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Edit / Delete */}
                  {hasPermission('update') && (
                    <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openModal(item)}>
                      <Feather name="edit-2" size={16} color={C.slate} />
                    </TouchableOpacity>
                  )}
                  {hasPermission('delete') && (
                    <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(item._id, item.name)}>
                      <Feather name="trash-2" size={16} color={C.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Floating Add/Edit Modal */}
      <Modal visible={isFormVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Feather name="layers" size={18} color="#fff" />
                <Text style={styles.formTitle}>{editingId ? 'Edit Class Level' : 'Add Class Level'}</Text>
              </View>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}>
                <Feather name="x" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Class / Grade Name *</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="e.g. 1st, 2nd, Nursery..." 
                  placeholderTextColor={C.textFaint} 
                  value={formData.name} 
                  onChangeText={t => setFormData({ ...formData, name: t })} 
                />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Sequence Order Position *</Text>
                <TextInput 
                  style={styles.input} 
                  keyboardType="numeric"
                  placeholder="e.g. 1, 2, 3..." 
                  placeholderTextColor={C.textFaint} 
                  value={formData.sequenceOrder} 
                  onChangeText={t => setFormData({ ...formData, sequenceOrder: t })} 
                />
                <Text style={styles.helperText}>Determines the promotion order hierarchy.</Text>
              </View>

              <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10}}>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setFormVisible(false)}>
                  <Text style={styles.ghostBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave} disabled={saving} activeOpacity={0.9}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnFullText}>{editingId ? 'Update Level' : 'Save Level'}</Text>}
                </TouchableOpacity>
              </View>
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
  center: { padding: 30, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  actionBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16 },
  listCount: { fontSize: 12, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, gap: 6, shadowColor: C.primary, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border, shadowColor: '#0F172A', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  cardInfo: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  orderBadge: { backgroundColor: C.primarySoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  orderBadgeText: { fontSize: 14, fontWeight: '800', color: C.primary },
  cardName: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 4 },
  promotesText: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
  
  exitBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.greenSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  exitBadgeText: { fontSize: 10, fontWeight: '800', color: C.green },

  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reorderGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 8 },
  reorderBtn: { padding: 8, justifyContent: 'center', alignItems: 'center' },
  reorderBtnDisabled: { opacity: 0.3 },
  reorderDivider: { width: 1, height: 20, backgroundColor: C.border },
  
  iconBtnEdit: { padding: 10, backgroundColor: C.surfaceSoft, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  iconBtnDelete: { padding: 10, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FEE2E2' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.primary },
  formTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  closeBtnIcon: { padding: 4 },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: '#4B5563', marginBottom: 6, marginLeft: 2 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  helperText: { fontSize: 11, color: C.textFaint, marginTop: 6, marginLeft: 2 },

  ghostBtn: { paddingVertical: 10, paddingHorizontal: 16, justifyContent: 'center' },
  ghostBtnText: { color: C.textMuted, fontSize: 14, fontWeight: '700' },
  saveBtnFull: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  saveBtnFullText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});