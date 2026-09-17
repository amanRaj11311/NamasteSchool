import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../network/api';


// --- Types ---
interface PermissionType {
  _id: string;
  module: string;
  action: string;
  description: string;
}

interface GroupedPermission {
  module: string;
  actions: PermissionType[];
}

const initialFormState = {
  module: '',
  action: '',
  description: ''
};

// Common action suggestions for the UI
const COMMON_ACTIONS = ['create', 'read', 'update', 'delete'];

export default function PermissionsScreen() {
  const [userPermissions, setUserPermissions] = useState<{module: string, action: string}[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [permissions, setPermissions] = useState<PermissionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');

  // Form Modals & State
  const [isFormVisible, setFormVisible] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [errors, setErrors] = useState<Partial<typeof initialFormState>>({});

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    
    if (permsRaw) setUserPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);

    fetchPermissions(token);
  };

  const fetchPermissions = async (token: string | null, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await axios.get(`${API_BASE}/permissions`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) {
        setPermissions(res.data.data || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => fetchPermissions(authToken, true), [authToken]);

  // RBAC Checker (Checking against the 'permissions' module)
  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return userPermissions.some((p) => p.module === 'permissions' && p.action === action);
  }, [userPermissions, isSuperAdmin]);

  // --- Filtering & Grouping ---
  const filteredPerms = permissions.filter(p => 
    p.module.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.action.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group permissions by module to create clean cards
  const groupedData: GroupedPermission[] = Object.values(
    filteredPerms.reduce((acc: Record<string, GroupedPermission>, curr) => {
      if (!acc[curr.module]) {
        acc[curr.module] = { module: curr.module, actions: [] };
      }
      acc[curr.module].actions.push(curr);
      return acc;
    }, {})
  ).sort((a, b) => a.module.localeCompare(b.module));

  // --- Actions ---
  const openAddForm = () => {
    setFormData(initialFormState);
    setErrors({});
    setFormVisible(true);
  };

  const handleDelete = (id: string, moduleName: string, actionName: string) => {
    Alert.alert("Delete Permission", `Are you sure you want to delete '${actionName}' from '${moduleName}'?`, [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/permissions/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            fetchPermissions(authToken, true);
          } catch (error) { Alert.alert("Error", "Failed to delete permission."); }
        }
      }
    ]);
  };

  const validateForm = () => {
    let isValid = true;
    let newErrors: Partial<typeof initialFormState> = {};

    if (!formData.module.trim()) { newErrors.module = 'Module name is required'; isValid = false; }
    if (!formData.action.trim()) { newErrors.action = 'Action is required'; isValid = false; }
    
    setErrors(newErrors);
    return isValid;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    try {
      await axios.post(`${API_BASE}/permissions`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
      Alert.alert("Success", "System permission created successfully.");
      setFormVisible(false);
      fetchPermissions(authToken, true);
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.message || "Failed to create permission.");
    }
  };

  // Helper for color coding action chips
  const getActionColor = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('create')) return { bg: '#ECFDF5', text: '#10B981', dot: '#10B981' }; 
    if (act.includes('read')) return { bg: '#EFF6FF', text: '#3B82F6', dot: '#3B82F6' };   
    if (act.includes('update')) return { bg: '#FFFBEB', text: '#F59E0B', dot: '#F59E0B' }; 
    if (act.includes('delete')) return { bg: '#FEF2F2', text: '#EF4444', dot: '#EF4444' }; 
    return { bg: '#F3F4F6', text: '#4B5563', dot: '#6B7280' }; 
  };

  // --- Render Grouped Module Card ---
  const renderModuleCard = ({ item }: { item: GroupedPermission }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.moduleTitleRow}>
          <View style={styles.iconCircle}><Feather name="layers" size={18} color="#0ea5e9" /></View>
          <Text style={styles.moduleName} numberOfLines={1}>{item.module}</Text>
        </View>
        <View style={styles.badge}><Text style={styles.badgeText}>{item.actions.length} Actions</Text></View>
      </View>
      
      <View style={styles.actionsContainer}>
        {item.actions.map(perm => {
          const colors = getActionColor(perm.action);
          return (
            <View key={perm._id} style={styles.actionRow}>
              <View style={styles.actionInfo}>
                <View style={[styles.actionChip, { backgroundColor: colors.bg }]}>
                  <View style={[styles.actionDot, { backgroundColor: colors.dot }]} />
                  <Text style={[styles.actionChipText, { color: colors.text }]}>{perm.action}</Text>
                </View>
                <Text style={styles.actionDesc} numberOfLines={1}>{perm.description || 'No description'}</Text>
              </View>

              {hasPermission('delete') && (
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(perm._id, item.module, perm.action)}>
                  <Feather name="trash-2" size={16} color='#B3122A' />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="lock" size={24} color="#B3122A" />
          <Text style={styles.title}>System Permissions</Text>
        </View>
        <Text style={styles.subtitle}>Manage global system modules and their available access actions.</Text>
      </View>

      <View style={styles.actionBar}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color="#9CA3AF" />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search module or action..." 
            value={searchQuery} 
            onChangeText={setSearchQuery} 
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        {hasPermission('create') && (
          <TouchableOpacity style={styles.addBtn} onPress={openAddForm}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>Add Perm</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.showingText}>{groupedData.length} Modules Found</Text>
        <Text style={styles.showingText}>{filteredPerms.length} Total Actions</Text>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#B3122A" /></View>
      ) : (
        <FlatList
          data={groupedData}
          keyExtractor={(item) => item.module}
          renderItem={renderModuleCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#B3122A']} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="shield-off" size={40} color="#D1D5DB" />
              <Text style={{color: '#6B7280', marginTop: 10, fontWeight: '500'}}>No permissions found.</Text>
            </View>
          }
        />
      )}

      {/* --- ADD FORM MODAL (Floating Centered Design) --- */}
      <Modal visible={isFormVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Register Permission</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}>
                <Feather name="x" size={20} color="#4B5563" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Module Name <Text style={styles.asterisk}>*</Text></Text>
                <TextInput 
                  style={[styles.input, errors.module && styles.inputError]} 
                  placeholder="e.g. students, attendance" 
                  value={formData.module} 
                  autoCapitalize="none"
                  onChangeText={t => { setFormData({...formData, module: t}); setErrors({...errors, module: undefined}); }} 
                />
                {errors.module && <Text style={styles.errorText}>{errors.module}</Text>}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Access Action <Text style={styles.asterisk}>*</Text></Text>
                <TextInput 
                  style={[styles.input, errors.action && styles.inputError]} 
                  placeholder="e.g. create, read, updateOwn" 
                  value={formData.action} 
                  autoCapitalize="none"
                  onChangeText={t => { setFormData({...formData, action: t}); setErrors({...errors, action: undefined}); }} 
                />
                
                {/* Premium Suggestion Chips */}
                <View style={styles.suggestionRow}>
                  <Text style={styles.suggestionLabel}>Suggestions:</Text>
                  {COMMON_ACTIONS.map(act => (
                    <TouchableOpacity key={act} style={styles.suggestionChip} onPress={() => setFormData({...formData, action: act})}>
                      <Text style={styles.suggestionText}>{act}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {errors.action && <Text style={styles.errorText}>{errors.action}</Text>}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Description (Optional)</Text>
                <TextInput 
                  style={[styles.input, { height: 70, textAlignVertical: 'top' }]} 
                  placeholder="e.g. Allows user to create new student records." 
                  multiline 
                  value={formData.description} 
                  onChangeText={t => setFormData({...formData, description: t})} 
                />
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave}>
                <Text style={styles.saveBtnFullText}>Save Permission</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F9' },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  
  actionBar: { flexDirection: 'row', paddingHorizontal: 16, alignItems: 'center', gap: 10, zIndex: 10, marginTop: 16 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, height: 46, elevation: 1 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#111827' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#B3122A', paddingHorizontal: 16, height: 46, borderRadius: 12, gap: 6, elevation: 2 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 12 },
  showingText: { fontSize: 12, color: '#6B7280', fontWeight: '700', textTransform: 'uppercase' },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 10 },
  card: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', elevation: 2, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  moduleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E0F2FE', justifyContent: 'center', alignItems: 'center' },
  moduleName: { fontSize: 18, fontWeight: '800', color: '#111827', textTransform: 'capitalize' },
  badge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#4B5563' },

  actionsContainer: { padding: 16 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  actionInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 10 },
  actionChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 6, width: 110 },
  actionDot: { width: 6, height: 6, borderRadius: 3 },
  actionChipText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  actionDesc: { flex: 1, fontSize: 13, color: '#6B7280' },
  
  deleteBtn: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FEE2E2' },

  // Add/Edit Compact Modal Form
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: '#fff', borderRadius: 20, elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtnIcon: { padding: 6, backgroundColor: '#E5E7EB', borderRadius: 20 },
  formScroll: { padding: 20 },
  
  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#4B5563', marginBottom: 6, marginLeft: 2 },
  asterisk: { color: '#B3122A' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: '#fff', fontSize: 14, color: '#111827' },
  inputError: { borderColor: '#B3122A', backgroundColor: '#FEF2F2' },
  errorText: { color: '#B3122A', fontSize: 12, marginTop: 4, fontWeight: '500' },
  
  suggestionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  suggestionLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  suggestionChip: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB' },
  suggestionText: { fontSize: 11, color: '#4B5563', fontWeight: '600', textTransform: 'capitalize' },

  saveBtnFull: { backgroundColor: '#B3122A', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});