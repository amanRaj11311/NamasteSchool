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
const ROLE_COLORS = [
  '#0F9D6B',
  '#B3122A',
  '#7C3AED',
  '#C7A466',
  '#0EA5E9',
  '#4F46E5',
  '#0D9488',
  '#E11D48',
];

// --- Types ---
interface PermissionType {
  _id: string;
  module: string;
  action: string;
  description: string;
}

interface Role {
  _id?: string;
  name: string;
  description: string;
  color?: string;
  permissions: any[]; 
  isSystem?: boolean;
}

const initialFormState: Role = {
  name: '',
  description: '',
  color: ROLE_COLORS[0],
  permissions: []
};

export default function RolesScreen() {
  const [userPermissions, setUserPermissions] = useState<{module: string, action: string}[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionType[]>([]);
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, PermissionType[]>>({});
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form & Modals
  const [isFormVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Role>(initialFormState);
  const [errors, setErrors] = useState<Partial<Role>>({});

  // Inline Expand/Collapse States
  const [expandedModule, setExpandedModule] = useState<string | null>(null); 
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null); 
  // FIXED: Track expanded tags per role ID globally to avoid the Hook error
  const [expandedTags, setExpandedTags] = useState<Record<string, boolean>>({});

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

    fetchData(token);
  };

  const fetchData = async (token: string | null, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [rolesRes, permsRes] = await Promise.all([
        axios.get(`${API_BASE}/roles`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/permissions`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (rolesRes.data?.success) setRoles(rolesRes.data.data || []);
      
      if (permsRes.data?.success) {
        const perms: PermissionType[] = permsRes.data.data || [];
        setAllPermissions(perms);
        
        const grouped = perms.reduce((acc: Record<string, PermissionType[]>, curr) => {
          if (!acc[curr.module]) acc[curr.module] = [];
          acc[curr.module].push(curr);
          return acc;
        }, {});
        setGroupedPermissions(grouped);
      }
    } catch (error) {
      console.error("Error fetching roles data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => fetchData(authToken, true), [authToken]);

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return userPermissions.some((p) => p.module === 'roles' && p.action === action);
  }, [userPermissions, isSuperAdmin]);

  const totalRoles = roles.length;
  const totalAssignedPerms = roles.reduce((acc, r) => acc + (r.permissions?.length || 0), 0);
  const avgPerms = totalRoles > 0 ? Math.round(totalAssignedPerms / totalRoles) : 0;
  const superAdminCount = roles.filter(r => r.name.toLowerCase().includes('super admin')).length;

  const filteredRoles = roles.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // --- Actions ---
  const openAddForm = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setErrors({});
    setExpandedModule(null);
    setFormVisible(true);
  };

  const openEditForm = (role: Role) => {
    if (role.isSystem || role.name.toLowerCase() === 'super admin') {
      Alert.alert("Protected Role", "System core roles cannot be modified.");
      return;
    }
    
    const extractedPermIds = (role.permissions || []).map((p: any) => 
      typeof p === 'object' && p !== null ? p._id : p
    ).filter(Boolean);

    setEditingId(role._id || null);
    setFormData({
      name: role.name,
      description: role.description || '',
      color: role.color || ROLE_COLORS[0],
      permissions: extractedPermIds
    });
    setErrors({});
    setExpandedModule(null);
    setFormVisible(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (name.toLowerCase() === 'super admin') {
      Alert.alert("Protected", "Super Admin role cannot be deleted.");
      return;
    }
    Alert.alert("Delete Role", `Are you sure you want to delete '${name}'?`, [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/roles/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            fetchData(authToken, true);
          } catch (error) { Alert.alert("Error", "Failed to delete role."); }
        }
      }
    ]);
  };

  const handleSave = async () => {
    let newErrors: any = {};
    if (!formData.name.trim()) newErrors.name = 'Role Name is required';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      if (editingId) {
        await axios.put(`${API_BASE}/roles/${editingId}`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert("Success", "Role updated successfully.");
      } else {
        await axios.post(`${API_BASE}/roles`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert("Success", "Role created successfully.");
      }
      setFormVisible(false);
      fetchData(authToken, true);
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.message || "Failed to save role.");
    }
  };

  const togglePermission = (permId: string) => {
    const currentPerms = formData.permissions;
    if (currentPerms.includes(permId)) {
      setFormData({ ...formData, permissions: currentPerms.filter(id => id !== permId) });
    } else {
      setFormData({ ...formData, permissions: [...currentPerms, permId] });
    }
  };

  const toggleModuleAll = (moduleName: string, modulePerms: PermissionType[]) => {
    const modulePermIds = modulePerms.map(p => p._id);
    const hasAll = modulePermIds.every(id => formData.permissions.includes(id));
    
    let newPerms = [...formData.permissions];
    if (hasAll) {
      newPerms = newPerms.filter(id => !modulePermIds.includes(id));
    } else {
      modulePermIds.forEach(id => { if (!newPerms.includes(id)) newPerms.push(id); });
    }
    setFormData({ ...formData, permissions: newPerms });
  };

  const getActionColor = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('create')) return '#10B981'; 
    if (act.includes('read')) return '#3B82F6';   
    if (act.includes('update')) return '#F59E0B'; 
    if (act.includes('delete')) return '#EF4444'; 
    return '#6B7280'; 
  };

  // --- Render Role Card ---
  const renderCard = ({ item }: { item: Role }) => {
    const cardColor = item.color || '#3B82F6';
    const permCount = item.permissions?.length || 0;
    const isExpanded = expandedCardId === item._id;
    
    // FIXED: Using parent state instead of local hook
    const showAllTags = item._id ? !!expandedTags[item._id] : false;

    const rolePerms = (item.permissions || []).map((p: any) => {
      if (typeof p === 'string') return allPermissions.find(ap => ap._id === p);
      if (typeof p === 'object' && p !== null) return p;
      return null;
    }).filter(Boolean) as PermissionType[];

    const modulesMap = rolePerms.reduce((acc: Record<string, PermissionType[]>, curr) => {
      if (curr && curr.module) {
        if (!acc[curr.module]) acc[curr.module] = [];
        if (!acc[curr.module].find(x => x._id === curr._id)) {
          acc[curr.module].push(curr);
        }
      }
      return acc;
    }, {});

    const moduleNames = Object.keys(modulesMap).sort();
    const displayModules = showAllTags ? moduleNames : moduleNames.slice(0, 5);
    const hiddenModulesCount = moduleNames.length - displayModules.length;

    return (
      <View style={styles.card}>
        <View style={[styles.cardTopAccent, { backgroundColor: cardColor }]} />
        <View style={styles.cardBody}>
          
          <View style={styles.cardHeader}>
            <View style={styles.roleTitleRow}>
              <View style={[styles.colorDot, { backgroundColor: cardColor }]} />
              <Text style={styles.roleName} numberOfLines={1}>{item.name}</Text>
            </View>
            <View style={[styles.permBadge, { backgroundColor: cardColor + '15' }]}>
              <Text style={[styles.permBadgeText, { color: cardColor }]}>{permCount}</Text>
            </View>
          </View>
          
          <Text style={styles.roleDesc} numberOfLines={2}>
            {item.description || 'No description provided.'}
          </Text>

          {permCount === 0 ? (
            <View style={styles.warningBox}>
              <Feather name="alert-circle" size={14} color="#F59E0B" />
              <Text style={styles.warningText}>No permissions assigned</Text>
            </View>
          ) : (
            <View style={styles.modulesContainer}>
              <Text style={styles.sectionOverline}>MODULES</Text>
              <View style={styles.tagsRow}>
                {displayModules.map(mod => (
                  <View key={mod} style={styles.moduleTag}>
                    <Text style={styles.moduleTagText}>{mod} ({modulesMap[mod].length})</Text>
                  </View>
                ))}
                {!showAllTags && hiddenModulesCount > 0 && (
                  <TouchableOpacity 
                    style={[styles.moduleTag, { backgroundColor: '#FEE2E2', borderWidth: 0 }]}
                    onPress={() => item._id && setExpandedTags(prev => ({ ...prev, [item._id as string]: true }))} 
                  >
                    <Text style={[styles.moduleTagText, { color: '#ef4444' }]}>+{hiddenModulesCount} more</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              <TouchableOpacity 
                style={styles.detailsToggleBtn}
                onPress={() => setExpandedCardId(isExpanded ? null : (item._id || null))}
              >
                <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#4B5563" />
                <Text style={styles.detailsToggleText}>{isExpanded ? 'Hide Details' : 'Details'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {isExpanded && permCount > 0 && (
            <View style={styles.breakdownContainer}>
              <Text style={styles.sectionOverlineDark}>ACTION BREAKDOWN</Text>
              {moduleNames.map(mod => (
                <View key={mod} style={styles.breakdownRow}>
                  <Text style={styles.breakdownModuleText}>{mod}</Text>
                  <View style={styles.breakdownActionsWrap}>
                    {modulesMap[mod].map(perm => (
                      <View key={perm._id} style={styles.actionChip}>
                        <View style={[styles.actionDot, { backgroundColor: getActionColor(perm.action) }]} />
                        <Text style={styles.actionChipText}>{perm.action}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.cardActions}>
            {hasPermission('update') && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => openEditForm(item)}>
                <Feather name="edit-2" size={14} color="#10B981" />
              </TouchableOpacity>
            )}
            {hasPermission('delete') && (
              <TouchableOpacity style={[styles.actionBtn, { borderColor: '#FEE2E2', backgroundColor: '#FEF2F2' }]} onPress={() => handleDelete(item._id!, item.name)}>
                <Feather name="trash-2" size={14} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>

        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Roles</Text>
        <Text style={styles.subtitle}>{totalRoles} Roles | {totalAssignedPerms} total permissions</Text>
      </View>

      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={styles.kpiRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#F3E8FF' }]}><Feather name="shield" size={16} color="#D946EF" /></View>
            <Text style={styles.kpiValue}>{totalRoles}</Text>
          </View>
          <Text style={styles.kpiLabel}>TOTAL ROLES</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={styles.kpiRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#D1FAE5' }]}><Feather name="key" size={16} color="#10B981" /></View>
            <Text style={styles.kpiValue}>{totalAssignedPerms}</Text>
          </View>
          <Text style={styles.kpiLabel}>TOTAL PERMISSIONS</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={styles.kpiRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#E0F2FE' }]}><Feather name="activity" size={16} color="#0ea5e9" /></View>
            <Text style={styles.kpiValue}>{avgPerms}</Text>
          </View>
          <Text style={styles.kpiLabel}>AVG PERMISSIONS</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={styles.kpiRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}><Feather name="star" size={16} color="#F59E0B" /></View>
            <Text style={styles.kpiValue}>{superAdminCount}</Text>
          </View>
          <Text style={styles.kpiLabel}>SUPER ADMINS</Text>
        </View>
      </View>

      <View style={styles.actionBar}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color="#9CA3AF" />
          <TextInput style={styles.searchInput} placeholder="Search roles..." value={searchQuery} onChangeText={setSearchQuery} />
        </View>
        {hasPermission('create') && (
          <TouchableOpacity style={styles.addBtn} onPress={openAddForm}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>Create Role</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.showingText}>{filteredRoles.length} results</Text>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={filteredRoles}
          keyExtractor={(item) => item._id || item.name}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="shield-off" size={40} color="#D1D5DB" />
              <Text style={{color: '#6B7280', marginTop: 10, fontWeight: '500'}}>No roles found.</Text>
            </View>
          }
        />
      )}

      {/* --- ADD/EDIT FORM MODAL --- */}
      <Modal visible={isFormVisible} animationType="slide">
        <SafeAreaView style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{editingId ? 'Edit Role' : 'Create Role'}</Text>
            <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}>
              <Feather name="x" size={22} color="#4B5563" />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
              
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Role Details</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Role Name <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={[styles.input, errors.name && styles.inputError]} placeholder="e.g. Content Manager" value={formData.name} onChangeText={t => { setFormData({...formData, name: t}); setErrors({...errors, name: undefined}); }} />
                  {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Description</Text>
                  <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} placeholder="Brief description of this role..." multiline value={formData.description} onChangeText={t => setFormData({...formData, description: t})} />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Role Color</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingTop: 4 }}>
                    {ROLE_COLORS.map(color => (
                      <TouchableOpacity key={color} style={[styles.colorCircle, { backgroundColor: color }, formData.color === color && styles.colorCircleActive]} onPress={() => setFormData({...formData, color})}>
                        {formData.color === color && <Feather name="check" size={14} color="#fff" />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View style={styles.formCard}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
                  <Text style={styles.sectionTitle}>Assign Permissions</Text>
                  <Text style={styles.permCounter}>{formData.permissions.length} / {allPermissions.length}</Text>
                </View>

                <View style={styles.autoGrantNotice}>
                  <Feather name="info" size={16} color="#0ea5e9" />
                  <Text style={styles.autoGrantText}>Dashboard access is automatically granted to all roles.</Text>
                </View>

                {Object.keys(groupedPermissions).map(moduleName => {
                  const modulePerms = groupedPermissions[moduleName];
                  const modulePermIds = modulePerms.map(p => p._id);
                  const selectedInModule = modulePermIds.filter(id => formData.permissions.includes(id)).length;
                  const isExpanded = expandedModule === moduleName;

                  return (
                    <View key={moduleName} style={styles.moduleAccordion}>
                      <TouchableOpacity style={[styles.moduleHeader, isExpanded && styles.moduleHeaderActive]} onPress={() => setExpandedModule(isExpanded ? null : moduleName)} activeOpacity={0.8}>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                          <Feather name="layers" size={16} color={isExpanded ? '#ef4444' : '#6B7280'} />
                          <Text style={[styles.moduleHeaderText, isExpanded && {color: '#ef4444'}]}>{moduleName.toUpperCase()}</Text>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
                          <Text style={styles.moduleCount}>{selectedInModule} selected</Text>
                          <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color="#9CA3AF" />
                        </View>
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.moduleBody}>
                          <TouchableOpacity style={styles.selectAllBtn} onPress={() => toggleModuleAll(moduleName, modulePerms)}>
                            <Feather name={selectedInModule === modulePerms.length ? "check-square" : "square"} size={16} color="#0ea5e9" />
                            <Text style={styles.selectAllText}>{selectedInModule === modulePerms.length ? 'Deselect All' : 'Select All in Module'}</Text>
                          </TouchableOpacity>

                          <View style={styles.permChipsContainer}>
                            {modulePerms.map(perm => {
                              const isSelected = formData.permissions.includes(perm._id);
                              return (
                                <TouchableOpacity key={perm._id} style={[styles.permChipForm, isSelected && styles.permChipFormActive]} onPress={() => togglePermission(perm._id)}>
                                  <Text style={[styles.permChipFormText, isSelected && styles.permChipFormTextActive]}>{perm.action}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave}>
                <Text style={styles.saveBtnFullText}>{editingId ? 'Update Role & Permissions' : 'Create Role'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

// --- Styles ---
const C = {
  bg: '#F6F6F9',
  surface: '#FFFFFF',
  surfaceSoft: '#FBFBFD',
  surfaceSunken: '#F1F2F6',
  border: '#E8E9EF',
  borderStrong: '#DBDDE6',

  text: '#14161F',
  textMuted: '#6B7280',
  textFaint: '#9AA0AC',

  primary: '#B3122A',
  primaryBright: '#D2263F',
  primaryDeep: '#7A0C1D',
  primarySoft: '#FBEEEF',
  primaryTint: '#F3D6D9',

  ink: '#0D0F16',
  inkSoft: '#181B24',
  inkFaint: 'rgba(255,255,255,0.62)',

  gold: '#C7A466',
  goldSoft: 'rgba(199,164,102,0.14)',

  blue: '#0EA5E9',
  blueSoft: '#E7F6FE',
  green: '#0F9D6B',
  greenSoft: '#E6F8F1',
  slate: '#475467',
  slateSoft: '#F1F3F7',
};

const SHADOW_SM = {
  elevation: 1,
  shadowColor: '#0F172A',
  shadowOpacity: 0.05,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
};

const SHADOW_MD = {
  elevation: 3,
  shadowColor: '#0F172A',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
};

const SHADOW_LG = {
  elevation: 6,
  shadowColor: '#0F172A',
  shadowOpacity: 0.12,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 10 },
};

const styles = StyleSheet.create({
  // =========================================================
  // MAIN
  // =========================================================

  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: C.bg,
  },



  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    ...SHADOW_SM,
  },
title: {
  fontSize: 21,
  fontWeight: '800',
  color: C.text,
  letterSpacing: 0.2,
},

subtitle: {
  fontSize: 12.5,
  color: C.textMuted,
  marginTop: 3,
  fontWeight: '500',
},
  // =========================================================
  // KPI CARDS
  // =========================================================

  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  kpiCard: {
    width: '48%',
    backgroundColor: C.surface,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
    ...SHADOW_SM,
  },

  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 9,
  },

  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },

  kpiValue: {
    fontSize: 21,
    fontWeight: '800',
    color: C.text,
  },

  kpiLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.6,
  },

  // =========================================================
  // SEARCH + ACTION BAR
  // =========================================================

  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
    marginTop: 4,
  },

  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    ...SHADOW_SM,
  },

  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: C.text,
    fontWeight: '600',
    height: '100%',
  },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 12,
    gap: 6,
    ...SHADOW_SM,
  },

  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },

  showingText: {
    paddingHorizontal: 16,
    paddingTop: 12,
    fontSize: 11.5,
    color: C.textMuted,
    fontWeight: '700',
    textAlign: 'right',
  },

  // =========================================================
  // LIST
  // =========================================================

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
    paddingTop: 10,
  },

  // =========================================================
  // ROLE CARD
  // =========================================================

  card: {
    backgroundColor: C.surface,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    ...SHADOW_MD,
  },

  cardTopAccent: {
    height: 3,
    width: '100%',
  },

  cardBody: {
    padding: 18,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    marginRight: 10,
  },

  colorDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },

  roleName: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
    flexShrink: 1,
  },

  permBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },

  permBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },

  roleDesc: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 18,
    marginBottom: 14,
    fontWeight: '500',
  },

  // =========================================================
  // WARNING
  // =========================================================

  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E7',
    padding: 10,
    borderRadius: 10,
    gap: 7,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F6E4B5',
  },

  warningText: {
    fontSize: 11.5,
    color: '#9A6700',
    fontWeight: '700',
  },

  // =========================================================
  // MODULES
  // =========================================================

  modulesContainer: {
    marginTop: 4,
    marginBottom: 12,
  },

  sectionOverline: {
    fontSize: 10.5,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.6,
    marginBottom: 9,
    textTransform: 'uppercase',
  },

  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 10,
  },

  moduleTag: {
    backgroundColor: C.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
  },

  moduleTagText: {
    fontSize: 10.5,
    color: C.textMuted,
    fontWeight: '700',
    textTransform: 'capitalize',
  },

  detailsToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 5,
    gap: 5,
  },

  detailsToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.textMuted,
  },

  // =========================================================
  // BREAKDOWN
  // =========================================================

  breakdownContainer: {
    backgroundColor: C.surfaceSoft,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
    marginTop: 4,
  },

  sectionOverlineDark: {
    fontSize: 10.5,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.6,
    marginBottom: 12,
    textTransform: 'uppercase',
  },

  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  breakdownModuleText: {
    width: 90,
    fontSize: 11.5,
    fontWeight: '800',
    color: C.text,
    textTransform: 'capitalize',
    marginTop: 6,
  },

  breakdownActionsWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },

  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },

  actionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  actionChipText: {
    fontSize: 10.5,
    color: C.textMuted,
    fontWeight: '700',
    textTransform: 'capitalize',
  },

  // =========================================================
  // CARD ACTIONS
  // =========================================================

  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
    gap: 8,
  },

  actionBtn: {
    padding: 9,
    backgroundColor: C.surfaceSoft,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
  },

  // =========================================================
  // MODAL
  // =========================================================

  formContainer: {
    flex: 1,
    backgroundColor: C.bg,
  },

  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    ...SHADOW_SM,
  },

  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.text,
  },

  closeBtnIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.surfaceSunken,
    justifyContent: 'center',
    alignItems: 'center',
  },

  formScroll: {
    padding: 16,
    paddingBottom: 40,
  },

  formCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOW_MD,
  },

  sectionTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: C.text,
    marginBottom: 16,
  },

  // =========================================================
  // FORM INPUTS
  // =========================================================

  inputWrapper: {
    marginBottom: 16,
  },

  inputLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: C.textMuted,
    marginBottom: 7,
    marginLeft: 2,
    letterSpacing: 0.4,
  },

  asterisk: {
    color: C.primary,
  },

  input: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    backgroundColor: C.surfaceSoft,
    fontSize: 14,
    color: C.text,
    fontWeight: '600',
  },

  inputError: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },

  errorText: {
    color: C.primary,
    fontSize: 11,
    marginTop: 5,
    fontWeight: '600',
  },

  // =========================================================
  // ROLE COLORS
  // =========================================================

  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },

  colorCircleActive: {
    borderColor: C.text,
    transform: [{ scale: 1.08 }],
  },

  // =========================================================
  // PERMISSIONS
  // =========================================================

  permCounter: {
    fontSize: 11,
    fontWeight: '800',
    color: C.textMuted,
    backgroundColor: C.surfaceSunken,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },

  autoGrantNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.blueSoft,
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#CBEEFB',
  },

  autoGrantText: {
    flex: 1,
    fontSize: 11.5,
    color: '#0369A1',
    fontWeight: '600',
    lineHeight: 16,
  },

  // =========================================================
  // MODULE ACCORDION
  // =========================================================

  moduleAccordion: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: C.surface,
  },

  moduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: C.surfaceSoft,
  },

  moduleHeaderActive: {
    backgroundColor: C.primarySoft,
    borderBottomWidth: 1,
    borderBottomColor: C.primaryTint,
  },

  moduleHeaderText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.3,
  },

  moduleCount: {
    fontSize: 11,
    color: C.textMuted,
    fontWeight: '700',
  },

  moduleBody: {
    padding: 14,
    backgroundColor: C.surface,
  },

  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  selectAllText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.blue,
  },

  permChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  permChipForm: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: C.surfaceSunken,
    borderWidth: 1,
    borderColor: C.border,
  },

  permChipFormActive: {
    backgroundColor: C.greenSoft,
    borderColor: '#A7E7D0',
  },

  permChipFormText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.textMuted,
    textTransform: 'capitalize',
  },

  permChipFormTextActive: {
    color: '#047857',
    fontWeight: '800',
  },

  // =========================================================
  // SAVE BUTTON
  // =========================================================

  saveBtnFull: {
    backgroundColor: C.primary,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    ...SHADOW_MD,
  },

  saveBtnFullText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});