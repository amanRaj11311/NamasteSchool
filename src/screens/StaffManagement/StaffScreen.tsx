import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  RefreshControl,
} from 'react-native';
import { API_BASE } from '../../network/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';

const COLORS = {
  primary: '#B3122A', primaryDark: '#C5221F', primarySoft: '#FDE8E8',
  primarySoftBorder: '#FFE4E6',
  ink: '#12172B', 
  inkSoft: '#475569',
  muted: '#94A3B8',
  border: '#E7EAF0',
  surface: '#FFFFFF',
  bg: '#F6F7FB',
  success: '#16A34A',
  successSoft: '#F0FDF4',
  info: '#2563EB',
  infoSoft: '#EFF6FF',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
};

const RADIUS = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
const SPACE = { xs: 6, sm: 10, md: 16, lg: 20, xl: 28 };

const shadow = (elevation = 6) => ({
  shadowColor: '#0F172A',
  shadowOpacity: 0.08,
  shadowRadius: elevation,
  shadowOffset: { width: 0, height: elevation / 2 },
  elevation: Math.max(2, Math.round(elevation / 2)),
});

// --- Types & Interfaces ---
interface Permission {
  module: string;
  action: string;
}

interface Staff {
  _id: string;
  staffId: string;
  name: string;
  staffType: string;
  mobile: string;
  email: string;
  joiningDate?: string;
  gender: string;
  dob?: string;
  experience?: string;
  fatherName?: string;
  motherName?: string;
  religion?: string;
  nationality?: string;
  casteGroup?: string;
}

interface TimetablePeriod {
  _id: string;
  periodNumber: number;
  day: string;
  className: string;
  startTime?: string;
  endTime: string;
  roomNumber: string;
}

interface SchoolClass {
  _id: string;
  className: string;
  division?: string;
  syllabus?: string;
  studentCount?: number;
}

interface Subject {
  _id: string;
  name: string;
  code?: string;
}

interface StaffFormData {
  schoolBranch: string;
  email: string;
  password?: string;
  staffType: string;
  staffId: string;
  name: string;
  gender: string;
  mobile: string;
  altMobile: string;
  dob: string;
  joiningDate: string;
  experience: string;
  classesTaught: string[];
  subjectsTaught: string[];
  fatherName: string;
  motherName: string;
  nationality: string;
  religion: string;
  casteGroup: string;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GENDERS = [
  { _id: 'Male', name: 'Male', icon: 'user' },
  { _id: 'Female', name: 'Female', icon: 'user' },
  { _id: 'Other', name: 'Other', icon: 'users' },
];

const initialFormState: StaffFormData = {
  schoolBranch: '', email: '', password: '', staffType: '', staffId: '',
  name: '', gender: '', mobile: '', altMobile: '', dob: '', joiningDate: '',
  experience: '', classesTaught: [], subjectsTaught: [],
  fatherName: '', motherName: '', nationality: '', religion: '', casteGroup: '',
};

const formatClassLabel = (cls: Partial<SchoolClass>) => {
  const name = cls.className || (cls as any).name || 'Class';
  return cls.division ? `${name} (${cls.division})` : name;
};

const parseDDMMYYYY = (value?: string): Date => {
  if (!value) return new Date();
  const [d, m, y] = value.split('-').map((n) => parseInt(n, 10));
  if (!d || !m || !y) return new Date();
  const parsed = new Date(y, m - 1, d);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

const formatDDMMYYYY = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

// =====================================================================================
// Reusable premium primitives
// =====================================================================================

const SectionLabel: React.FC<{ icon: string; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <View style={styles.sectionLabelRow}>
    <View style={styles.sectionIconWrap}>
      <Feather name={icon} size={15} color={COLORS.primary} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionLabelText}>{title}</Text>
      {subtitle ? <Text style={styles.sectionLabelSub}>{subtitle}</Text> : null}
    </View>
  </View>
);

const FormField: React.FC<{
  label: string;
  required?: boolean;
  error?: string;
  icon?: string;
  children: React.ReactNode;
}> = ({ label, required, error, icon, children }) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>
      {label} {required ? <Text style={styles.fieldRequired}>*</Text> : null}
    </Text>
    <View style={styles.fieldInputRow}>
      {icon ? <Feather name={icon} size={16} color={COLORS.muted} style={{ marginRight: 8 }} /> : null}
      {children}
    </View>
    {error ? <Text style={styles.fieldError}>{error}</Text> : null}
  </View>
);

const IconAction: React.FC<{
  icon: string;
  label: string;
  color: string;
  softBg: string;
  onPress: () => void;
}> = ({ icon, label, color, softBg, onPress }) => (
  <TouchableOpacity style={styles.iconAction} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.iconActionCircle, { backgroundColor: softBg }]}>
      <Feather name={icon} size={16} color={color} />
    </View>
    <Text style={[styles.iconActionLabel, { color }]}>{label}</Text>
  </TouchableOpacity>
);

// =====================================================================================
// Main Screen Component
// =====================================================================================
const StaffScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [staffList, setStaffList] = useState<Staff[]>([]);
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [isFilterModalVisible, setFilterModalVisible] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [roles, setRoles] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [classesList, setClassesList] = useState<SchoolClass[]>([]);
  const [subjectsList, setSubjectsList] = useState<Subject[]>([]);

  const [isModalVisible, setModalVisible] = useState<boolean>(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [formData, setFormData] = useState<StaffFormData>(initialFormState);
  const [errors, setErrors] = useState<Partial<StaffFormData>>({});
  const [saving, setSaving] = useState<boolean>(false);

  const [selectorVisible, setSelectorVisible] = useState<boolean>(false);
  const [selectorType, setSelectorType] = useState<'branch' | 'role' | 'gender' | null>(null);
  const [selectorSearch, setSelectorSearch] = useState<string>('');

  const [datePickerField, setDatePickerField] = useState<'dob' | 'joiningDate' | null>(null);

  const [isViewVisible, setViewVisible] = useState<boolean>(false);
  const [viewingStaff, setViewingStaff] = useState<Staff | null>(null);
  const [isTimetableVisible, setTimetableVisible] = useState<boolean>(false);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [timetableData, setTimetableData] = useState<TimetablePeriod[]>([]);
  const [loadingTimetable, setLoadingTimetable] = useState<boolean>(false);
  const [selectedDay, setSelectedDay] = useState<string>('Monday');

  useEffect(() => {
    initializeScreen();
  }, []);

  const initializeScreen = async () => {
    try {
      const permsRaw = await AsyncStorage.getItem('userPermissions');
      const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
      const token = await AsyncStorage.getItem('userToken');

      if (permsRaw) setPermissions(JSON.parse(permsRaw));
      setIsSuperAdmin(superAdminRaw === 'true');
      setAuthToken(token);

      fetchStaffData(token);
      fetchFormDependencies(token);
    } catch (error) {
      console.error('Initialization Error', error);
      setLoading(false);
    }
  };

  const fetchStaffData = async (token: string | null, isRefresh: boolean = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      const response = await axios.get(`${API_BASE}/staff`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.data && response.data.success) setStaffList(response.data.data || []);
    } catch (error) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchFormDependencies = async (token: string | null) => {
    if (!token) return;
    try {
      const [rolesRes, schoolsRes, classesRes, subjectsRes] = await Promise.all([
        axios.get(`${API_BASE}/roles`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/classes`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/subjects`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (rolesRes.data.success) setRoles(rolesRes.data.data);
      if (schoolsRes.data.success) setSchools(schoolsRes.data.data);
      if (classesRes.data.success) setClassesList(classesRes.data.data);
      if (subjectsRes.data.success) setSubjectsList(subjectsRes.data.data);
    } catch (error) {
      console.error('Error fetching form dependencies', error);
    }
  };

  const onRefresh = useCallback(() => fetchStaffData(authToken, true), [authToken]);

  const getRoleName = useCallback(
    (staff: Staff) => {
      if (!staff.staffType) return 'Staff';
      const role = roles.find((r) => r._id === staff.staffType);
      if (role) return role.name;
      return staff.staffType;
    },
    [roles]
  );

  const filteredStaffList = staffList.filter((staff) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (staff.name && staff.name.toLowerCase().includes(q)) ||
      (staff.staffId && staff.staffId.toLowerCase().includes(q)) ||
      (staff.mobile && staff.mobile.includes(q));
    const matchesRole = !roleFilter || staff.staffType === roleFilter;
    return matchesSearch && matchesRole;
  });

  const kpis = useMemo(() => {
    const total = staffList.length;
    let teaching = 0;
    let nonTeaching = 0;
    let newThisMonth = 0;
    const now = new Date();

    staffList.forEach((s) => {
      const roleName = getRoleName(s).toLowerCase();
      if (roleName.includes('teach')) teaching += 1; else nonTeaching += 1;

      if (s.joiningDate) {
        const [d, m, y] = s.joiningDate.split('-').map((n) => parseInt(n, 10));
        if (m === now.getMonth() + 1 && y === now.getFullYear()) newThisMonth += 1;
      }
    });

    return { total, teaching, nonTeaching, newThisMonth };
  }, [staffList, getRoleName]);

  const hasPermission = useCallback(
    (action: string) => {
      if (isSuperAdmin) return true;
      return permissions.some((p) => p.module === 'staff' && p.action === action);
    },
    [permissions, isSuperAdmin]
  );

  const openAddModal = () => {
    setEditingStaffId(null);
    setFormData(initialFormState);
    setErrors({});
    setDatePickerField(null);
    setModalVisible(true);
  };

  const openEditModal = (staff: Staff) => {
    setEditingStaffId(staff._id);
    setFormData({
      ...initialFormState,
      name: staff.name || '',
      mobile: staff.mobile || '',
      email: staff.email || '',
      staffId: staff.staffId || '',
      staffType: staff.staffType || '',
      gender: staff.gender || '',
      dob: staff.dob || '',
      joiningDate: staff.joiningDate || '',
      experience: staff.experience || '',
      fatherName: staff.fatherName || '',
      motherName: staff.motherName || '',
      nationality: staff.nationality || '',
      religion: staff.religion || '',
      casteGroup: staff.casteGroup || '',
    });
    setErrors({});
    setDatePickerField(null);
    setModalVisible(true);
  };

  const toggleArrayItem = (arrayKey: 'classesTaught' | 'subjectsTaught', id: string) => {
    const currentArray = formData[arrayKey];
    if (currentArray.includes(id)) {
      setFormData({ ...formData, [arrayKey]: currentArray.filter((itemId) => itemId !== id) });
    } else {
      setFormData({ ...formData, [arrayKey]: [...currentArray, id] });
    }
  };

  const validateForm = (): boolean => {
    let isValid = true;
    const newErrors: Partial<StaffFormData> = {};

    if (!formData.schoolBranch) { newErrors.schoolBranch = 'Required'; isValid = false; }
    if (!formData.staffType) { newErrors.staffType = 'Required'; isValid = false; }
    if (!formData.gender) { newErrors.gender = 'Required'; isValid = false; }
    if (!formData.name.trim()) { newErrors.name = 'Required'; isValid = false; }
    if (!formData.email) { newErrors.email = 'Required'; isValid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { newErrors.email = 'Invalid email'; isValid = false; }
    if (!formData.mobile) { newErrors.mobile = 'Required'; isValid = false; }
    else if (formData.mobile.length < 10) { newErrors.mobile = '10 digits required'; isValid = false; }

    setErrors(newErrors);
    return isValid;
  };

  const handleSaveStaff = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      if (editingStaffId) {
        await axios.put(`${API_BASE}/staff/${editingStaffId}`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert('Success', 'Staff updated successfully!');
      } else {
        await axios.post(`${API_BASE}/staff`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert('Success', 'Staff added successfully!');
      }
      setModalVisible(false);
      fetchStaffData(authToken, true);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to save staff.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStaff = (staffId: string) => {
    Alert.alert('Delete Staff', 'Are you sure you want to remove this staff member?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/staff/${staffId}`, { headers: { Authorization: `Bearer ${authToken}` } });
            fetchStaffData(authToken, true);
          } catch (error) { Alert.alert('Error', 'Failed to delete.'); }
        },
      },
    ]);
  };

  const openTimetable = async (staff: Staff) => {
    setSelectedStaff(staff);
    setSelectedDay('Monday');
    setTimetableVisible(true);
    setLoadingTimetable(true);
    try {
      const response = await axios.get(`${API_BASE}/timetable?staffId=${staff._id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      setTimetableData(response.data?.success ? response.data.data : []);
    } catch (error) { setTimetableData([]); }
    finally { setLoadingTimetable(false); }
  };

  const openSelector = (type: 'branch' | 'role' | 'gender') => {
    setSelectorType(type);
    setSelectorSearch('');
    setSelectorVisible(true);
  };

  const handleDateChange = (event: any, selected?: Date) => {
    if (Platform.OS === 'android') setDatePickerField(null);
    if (event?.type === 'dismissed' || !selected || !datePickerField) return;
    setFormData((prev) => ({ ...prev, [datePickerField]: formatDDMMYYYY(selected) }));
  };

  const selectorConfig = useMemo(() => {
    if (selectorType === 'branch') return { options: schools, title: 'Select Branch', icon: 'home', field: 'schoolBranch' as const, searchable: schools.length > 5 };
    if (selectorType === 'role') return { options: roles, title: 'Select Staff Type', icon: 'briefcase', field: 'staffType' as const, searchable: roles.length > 5 };
    if (selectorType === 'gender') return { options: GENDERS, title: 'Select Gender', icon: 'user', field: 'gender' as const, searchable: false };
    return { options: [] as any[], title: '', icon: 'list', field: 'gender' as const, searchable: false };
  }, [selectorType, schools, roles]);

  const filteredSelectorOptions = selectorConfig.options.filter((o: any) =>
    (o.name || '').toLowerCase().includes(selectorSearch.toLowerCase())
  );

  const renderSelectorModal = () => (
    <Modal visible={selectorVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setSelectorVisible(false)}>
      <TouchableOpacity style={styles.selectorOverlay} activeOpacity={1} onPress={() => setSelectorVisible(false)}>
        <TouchableOpacity activeOpacity={1} style={styles.selectorCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.selectorHeader}>
            <View style={styles.selectorHeaderIcon}>
              <Feather name={selectorConfig.icon} size={16} color={COLORS.primary} />
            </View>
            <Text style={styles.selectorTitle}>{selectorConfig.title}</Text>
            <TouchableOpacity onPress={() => setSelectorVisible(false)} style={styles.closeBtn}>
              <Feather name="x" size={18} color={COLORS.inkSoft} />
            </TouchableOpacity>
          </View>

          {selectorConfig.searchable && (
            <View style={styles.selectorSearchRow}>
              <Feather name="search" size={15} color={COLORS.muted} />
              <TextInput
                style={styles.selectorSearchInput}
                placeholder="Search..."
                placeholderTextColor={COLORS.muted}
                value={selectorSearch}
                onChangeText={setSelectorSearch}
                autoFocus
              />
            </View>
          )}

          <FlatList
            data={filteredSelectorOptions}
            keyExtractor={(item) => item._id}
            style={{ maxHeight: 340 }}
            ItemSeparatorComponent={() => <View style={styles.selectorSeparator} />}
            ListEmptyComponent={<Text style={styles.selectorEmpty}>No options found</Text>}
            renderItem={({ item }) => {
              const isSelected = formData[selectorConfig.field] === item._id;
              return (
                <TouchableOpacity
                  style={[styles.selectorItem, isSelected && styles.selectorItemActive]}
                  onPress={() => {
                    setFormData({ ...formData, [selectorConfig.field]: item._id });
                    setSelectorVisible(false);
                    setErrors({ ...errors, [selectorConfig.field]: undefined });
                  }}
                >
                  <View style={styles.selectorItemLeft}>
                    <View style={[styles.selectorBullet, isSelected && styles.selectorBulletActive]} />
                    <Text style={[styles.selectorItemText, isSelected && styles.selectorItemTextActive]}>{item.name}</Text>
                  </View>
                  {isSelected && <Feather name="check" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  const renderStaffCard = ({ item }: { item: Staff }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.idBadge}>
          <Feather name="hash" size={11} color={COLORS.primary} />
          <Text style={styles.idBadgeText}>{item.staffId || 'N/A'}</Text>
        </View>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{getRoleName(item)}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name ? item.name.charAt(0).toUpperCase() : 'U'}</Text>
        </View>
        <View style={styles.infoContainer}>
          <Text style={styles.nameText} numberOfLines={1}>{item.name}</Text>
          <View style={styles.contactRow}>
            <Feather name="phone" size={12} color={COLORS.muted} />
            <Text style={styles.contactText}>{item.mobile || '—'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.actionRow}>
        <IconAction icon="clock" label="Timetable" color={COLORS.primary} softBg={COLORS.primarySoft} onPress={() => openTimetable(item)} />
        {hasPermission('read') && (
          <IconAction icon="eye" label="View" color={COLORS.info} softBg={COLORS.infoSoft} onPress={() => { setViewingStaff(item); setViewVisible(true); }} />
        )}
        {hasPermission('update') && (
          <IconAction icon="edit-2" label="Edit" color={COLORS.success} softBg={COLORS.successSoft} onPress={() => openEditModal(item)} />
        )}
        {hasPermission('delete') && (
          <IconAction icon="trash-2" label="Delete" color={COLORS.danger} softBg={COLORS.dangerSoft} onPress={() => handleDeleteStaff(item._id)} />
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header Row */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Staff Management</Text>
          <Text style={styles.screenSubtitle} numberOfLines={1}>Manage all teaching and non-teaching staff</Text>
        </View>
        {hasPermission('create') && (
          <TouchableOpacity style={styles.headerAddBtn} onPress={openAddModal} activeOpacity={0.85}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.headerAddBtnText}>Add Staff</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Compact KPI Summary Cards */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.primarySoft }]}>
            <Feather name="users" size={13} color={COLORS.primary} />
          </View>
          <Text style={styles.kpiValue}>{kpis.total}</Text>
          <Text style={styles.kpiLabel} numberOfLines={1} adjustsFontSizeToFit>Total Staff</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.infoSoft }]}>
            <Feather name="book-open" size={13} color={COLORS.info} />
          </View>
          <Text style={styles.kpiValue}>{kpis.teaching}</Text>
          <Text style={styles.kpiLabel} numberOfLines={1} adjustsFontSizeToFit>Teaching</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.amberSoft }]}>
            <Feather name="briefcase" size={13} color={COLORS.amber} />
          </View>
          <Text style={styles.kpiValue}>{kpis.nonTeaching}</Text>
          <Text style={styles.kpiLabel} numberOfLines={1} adjustsFontSizeToFit>Support</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.successSoft }]}>
            <Feather name="user-plus" size={13} color={COLORS.success} />
          </View>
          <Text style={styles.kpiValue}>{kpis.newThisMonth}</Text>
          <Text style={styles.kpiLabel} numberOfLines={1} adjustsFontSizeToFit>New (Mo)</Text>
        </View>
      </View>

      {/* Filter and Collapsible Search Row */}
      <View style={styles.filterRow}>
        {isSearchExpanded ? (
          <View style={styles.expandedSearchContainer}>
            <Feather name="search" size={16} color={COLORS.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search name, ID..."
              placeholderTextColor={COLORS.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            <TouchableOpacity 
              onPress={() => {
                setIsSearchExpanded(false);
                setSearchQuery('');
              }}
              style={{ padding: 4 }}
            >
              <Feather name="x-circle" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.filterDropdownBtn} onPress={() => setFilterModalVisible(true)} activeOpacity={0.8}>
              <Text style={styles.filterDropdownText} numberOfLines={1}>
                {roleFilter ? roles.find(r => r._id === roleFilter)?.name || 'Role' : 'All Staff Types'}
              </Text>
              <Feather name="chevron-down" size={16} color={COLORS.muted} />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.searchIconBtn} onPress={() => setIsSearchExpanded(true)} activeOpacity={0.8}>
              <Feather name="search" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {loading ? (
        <View style={styles.centerContainer}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={filteredStaffList}
          keyExtractor={(item, index) => item._id || index.toString()}
          renderItem={renderStaffCard}
          contentContainerStyle={filteredStaffList.length === 0 ? styles.emptyListContainer : styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center' }}>
              <View style={styles.emptyIconWrap}>
                <Feather name="users" size={40} color={COLORS.muted} />
              </View>
              <Text style={styles.emptyTitle}>No staff found</Text>
              <Text style={styles.emptySub}>Try a different search or filter</Text>
            </View>
          }
        />
      )}

      {/* --- ADD / EDIT STAFF MODAL --- */}
      <Modal visible={isModalVisible} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContainer}>
            <View style={styles.modalGrabber} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{editingStaffId ? 'Edit Staff' : 'Add New Staff'}</Text>
                <Text style={styles.modalSubtitle}>Fill in the details to {editingStaffId ? 'update this' : 'register a new'} staff member</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={18} color={COLORS.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <SectionLabel icon="lock" title="Login Details" subtitle="Branch, role & sign-in credentials" />
              <View style={styles.formCard}>
                <FormField label="Branch" required error={errors.schoolBranch} icon="home">
                  <TouchableOpacity style={styles.fieldTouchable} onPress={() => openSelector('branch')}>
                    <Text style={formData.schoolBranch ? styles.inputText : styles.placeholderText} numberOfLines={1}>
                      {schools.find((s) => s._id === formData.schoolBranch)?.name || 'Select branch'}
                    </Text>
                  </TouchableOpacity>
                  <Feather name="chevron-down" size={16} color={COLORS.muted} />
                </FormField>

                <FormField label="Staff Type" required error={errors.staffType} icon="briefcase">
                  <TouchableOpacity style={styles.fieldTouchable} onPress={() => openSelector('role')}>
                    <Text style={formData.staffType ? styles.inputText : styles.placeholderText} numberOfLines={1}>
                      {roles.find((r) => r._id === formData.staffType)?.name || 'Select staff type'}
                    </Text>
                  </TouchableOpacity>
                  <Feather name="chevron-down" size={16} color={COLORS.muted} />
                </FormField>

                <FormField label="Email (Login ID)" required error={errors.email} icon="mail">
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="name@school.com"
                    placeholderTextColor={COLORS.muted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={formData.email}
                    onChangeText={(t) => setFormData({ ...formData, email: t })}
                  />
                </FormField>

                {!editingStaffId && (
                  <FormField label="Password" required icon="key">
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Create a password"
                      placeholderTextColor={COLORS.muted}
                      secureTextEntry
                      value={formData.password}
                      onChangeText={(t) => setFormData({ ...formData, password: t })}
                    />
                  </FormField>
                )}
              </View>

              <SectionLabel icon="user" title="Basic Details" subtitle="Identity and contact information" />
              <View style={styles.formCard}>
                <FormField label="Staff ID" icon="hash">
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. STF-0001"
                    placeholderTextColor={COLORS.muted}
                    value={formData.staffId}
                    onChangeText={(t) => setFormData({ ...formData, staffId: t })}
                  />
                </FormField>

                <FormField label="Full Name" required error={errors.name} icon="type">
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Staff full name"
                    placeholderTextColor={COLORS.muted}
                    value={formData.name}
                    onChangeText={(t) => setFormData({ ...formData, name: t.replace(/[^a-zA-Z\s]/g, '') })}
                  />
                </FormField>

                <FormField label="Gender" required error={errors.gender} icon="users">
                  <TouchableOpacity style={styles.fieldTouchable} onPress={() => openSelector('gender')}>
                    <Text style={formData.gender ? styles.inputText : styles.placeholderText}>{formData.gender || 'Select gender'}</Text>
                  </TouchableOpacity>
                  <Feather name="chevron-down" size={16} color={COLORS.muted} />
                </FormField>

                <FormField label="Mobile" required error={errors.mobile} icon="phone">
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={COLORS.muted}
                    keyboardType="numeric"
                    maxLength={10}
                    value={formData.mobile}
                    onChangeText={(t) => setFormData({ ...formData, mobile: t.replace(/[^0-9]/g, '') })}
                  />
                </FormField>

                <FormField label="Date of Birth" icon="calendar">
                  <TouchableOpacity style={styles.fieldTouchable} onPress={() => setDatePickerField('dob')}>
                    <Text style={formData.dob ? styles.inputText : styles.placeholderText}>
                      {formData.dob || 'Select date of birth'}
                    </Text>
                  </TouchableOpacity>
                  <Feather name="chevron-down" size={16} color={COLORS.muted} />
                </FormField>

                <FormField label="Joining Date" icon="calendar">
                  <TouchableOpacity style={styles.fieldTouchable} onPress={() => setDatePickerField('joiningDate')}>
                    <Text style={formData.joiningDate ? styles.inputText : styles.placeholderText}>
                      {formData.joiningDate || 'Select joining date'}
                    </Text>
                  </TouchableOpacity>
                  <Feather name="chevron-down" size={16} color={COLORS.muted} />
                </FormField>

                <FormField label="Experience" icon="award">
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. 3 years"
                    placeholderTextColor={COLORS.muted}
                    value={formData.experience}
                    onChangeText={(t) => setFormData({ ...formData, experience: t })}
                  />
                </FormField>
              </View>

              <SectionLabel icon="book-open" title="Teaching Assignment" subtitle="Classes and subjects handled" />
              <View style={styles.formCard}>
                <Text style={styles.label}>
                  Classes Taught {formData.classesTaught.length > 0 && (
                    <Text style={styles.countPill}>{formData.classesTaught.length} selected</Text>
                  )}
                </Text>
                <View style={styles.chipContainer}>
                  {classesList.map((cls) => {
                    const isSelected = formData.classesTaught.includes(cls._id);
                    return (
                      <TouchableOpacity
                        key={cls._id}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => toggleArrayItem('classesTaught', cls._id)}
                        activeOpacity={0.75}
                      >
                        {isSelected && <Feather name="check" size={13} color="#fff" style={{ marginRight: 5 }} />}
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                          {formatClassLabel(cls)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {classesList.length === 0 && <Text style={styles.emptyInlineText}>No classes available</Text>}
                </View>

                <Text style={[styles.label, { marginTop: SPACE.lg }]}>
                  Subjects Taught {formData.subjectsTaught.length > 0 && (
                    <Text style={styles.countPill}>{formData.subjectsTaught.length} selected</Text>
                  )}
                </Text>
                <View style={styles.chipContainer}>
                  {subjectsList.map((sub) => {
                    const isSelected = formData.subjectsTaught.includes(sub._id);
                    return (
                      <TouchableOpacity
                        key={sub._id}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => toggleArrayItem('subjectsTaught', sub._id)}
                        activeOpacity={0.75}
                      >
                        {isSelected && <Feather name="check" size={13} color="#fff" style={{ marginRight: 5 }} />}
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                          {sub.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {subjectsList.length === 0 && <Text style={styles.emptyInlineText}>No subjects available</Text>}
                </View>
              </View>

              <SectionLabel icon="heart" title="Family Details" subtitle="Optional background information" />
              <View style={styles.formCard}>
                <FormField label="Father's Name" icon="user">
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Father's name"
                    placeholderTextColor={COLORS.muted}
                    value={formData.fatherName}
                    onChangeText={(t) => setFormData({ ...formData, fatherName: t.replace(/[^a-zA-Z\s]/g, '') })}
                  />
                </FormField>
                <FormField label="Mother's Name" icon="user">
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Mother's name"
                    placeholderTextColor={COLORS.muted}
                    value={formData.motherName}
                    onChangeText={(t) => setFormData({ ...formData, motherName: t.replace(/[^a-zA-Z\s]/g, '') })}
                  />
                </FormField>
                <FormField label="Nationality" icon="flag">
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. Indian"
                    placeholderTextColor={COLORS.muted}
                    value={formData.nationality}
                    onChangeText={(t) => setFormData({ ...formData, nationality: t })}
                  />
                </FormField>
                <FormField label="Religion" icon="sun">
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. Hindu"
                    placeholderTextColor={COLORS.muted}
                    value={formData.religion}
                    onChangeText={(t) => setFormData({ ...formData, religion: t })}
                  />
                </FormField>
                <FormField label="Caste Group" icon="tag">
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. General / OBC / SC / ST"
                    placeholderTextColor={COLORS.muted}
                    value={formData.casteGroup}
                    onChangeText={(t) => setFormData({ ...formData, casteGroup: t })}
                  />
                </FormField>
              </View>

              <TouchableOpacity style={styles.submitButton} onPress={handleSaveStaff} activeOpacity={0.9} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name={editingStaffId ? 'check' : 'plus'} size={18} color="#fff" />
                    <Text style={styles.submitButtonText}>{editingStaffId ? 'Save Changes' : 'Add Staff Member'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>

            {datePickerField && Platform.OS === 'ios' && (
              <View style={styles.iosDatePickerBar}>
                <View style={styles.iosDatePickerHeader}>
                  <Text style={styles.iosDatePickerTitle}>
                    {datePickerField === 'dob' ? 'Date of Birth' : 'Joining Date'}
                  </Text>
                  <TouchableOpacity onPress={() => setDatePickerField(null)}>
                    <Text style={styles.iosDatePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={parseDDMMYYYY(formData[datePickerField])}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={handleDateChange}
                />
              </View>
            )}
            {datePickerField && Platform.OS !== 'ios' && (
              <DateTimePicker
                value={parseDDMMYYYY(formData[datePickerField])}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={handleDateChange}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {renderSelectorModal()}

      {/* --- FILTER MODAL (ALL STAFF TYPES) --- */}
      <Modal visible={isFilterModalVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setFilterModalVisible(false)}>
        <TouchableOpacity style={styles.selectorOverlay} activeOpacity={1} onPress={() => setFilterModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.selectorCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.selectorHeader}>
              <View style={styles.selectorHeaderIcon}>
                <Feather name="filter" size={16} color={COLORS.primary} />
              </View>
              <Text style={styles.selectorTitle}>Filter by Role</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={18} color={COLORS.inkSoft} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={[{ _id: null, name: 'All Staff Types' }, ...roles]}
              keyExtractor={(item) => item._id || 'all'}
              style={{ maxHeight: 340 }}
              ItemSeparatorComponent={() => <View style={styles.selectorSeparator} />}
              renderItem={({ item }) => {
                const isSelected = roleFilter === item._id;
                return (
                  <TouchableOpacity
                    style={[styles.selectorItem, isSelected && styles.selectorItemActive]}
                    onPress={() => {
                      setRoleFilter(item._id);
                      setFilterModalVisible(false);
                    }}
                  >
                    <View style={styles.selectorItemLeft}>
                      <View style={[styles.selectorBullet, isSelected && styles.selectorBulletActive]} />
                      <Text style={[styles.selectorItemText, isSelected && styles.selectorItemTextActive]}>{item.name}</Text>
                    </View>
                    {isSelected && <Feather name="check" size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* --- VIEW STAFF MODAL --- */}
      <Modal visible={isViewVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setViewVisible(false)}>
        <View style={styles.ttOverlay}>
          <View style={styles.viewContainer}>
            <View style={styles.viewHeader}>
              <Text style={styles.modalTitle}>Staff Details</Text>
              <TouchableOpacity onPress={() => setViewVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={18} color={COLORS.inkSoft} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.viewProfileRow}>
                <View style={styles.avatarLg}>
                  <Text style={styles.avatarLgText}>{viewingStaff?.name?.charAt(0)}</Text>
                </View>
                <View style={{ marginLeft: SPACE.md, flex: 1 }}>
                  <Text style={styles.nameText}>{viewingStaff?.name}</Text>
                  <View style={styles.viewTypeBadge}>
                    <Text style={styles.viewTypeBadgeText}>{viewingStaff ? getRoleName(viewingStaff) : 'Staff'}</Text>
                  </View>
                </View>
              </View>

              <SectionLabel icon="info" title="Basic Details" />
              <View style={styles.viewDetailsBox}>
                <View style={styles.viewLineRow}>
                  <Feather name="hash" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>Staff ID</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.staffId || '—'}</Text>
                </View>
                <View style={styles.viewLineRow}>
                  <Feather name="users" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>Gender</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.gender || '—'}</Text>
                </View>
                <View style={styles.viewLineRow}>
                  <Feather name="phone" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>Mobile</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.mobile || '—'}</Text>
                </View>
                <View style={styles.viewLineRow}>
                  <Feather name="mail" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>Email</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.email || '—'}</Text>
                </View>
                <View style={styles.viewLineRow}>
                  <Feather name="calendar" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>DOB</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.dob || '—'}</Text>
                </View>
                <View style={styles.viewLineRow}>
                  <Feather name="calendar" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>Joined</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.joiningDate || '—'}</Text>
                </View>
                <View style={styles.viewLineRow}>
                  <Feather name="award" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>Experience</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.experience || '—'}</Text>
                </View>
              </View>

              <SectionLabel icon="heart" title="Family Details" />
              <View style={styles.viewDetailsBox}>
                <View style={styles.viewLineRow}>
                  <Feather name="user" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>Father</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.fatherName || '—'}</Text>
                </View>
                <View style={styles.viewLineRow}>
                  <Feather name="user" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>Mother</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.motherName || '—'}</Text>
                </View>
                <View style={styles.viewLineRow}>
                  <Feather name="flag" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>Nationality</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.nationality || '—'}</Text>
                </View>
                <View style={styles.viewLineRow}>
                  <Feather name="sun" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>Religion</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.religion || '—'}</Text>
                </View>
                <View style={styles.viewLineRow}>
                  <Feather name="tag" size={14} color={COLORS.muted} />
                  <Text style={styles.viewLabel}>Caste Group</Text>
                  <Text style={styles.viewValue}>{viewingStaff?.casteGroup || '—'}</Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* --- TIMETABLE MODAL --- */}
      <Modal visible={isTimetableVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setTimetableVisible(false)}>
        <View style={styles.ttOverlay}>
          <View style={styles.ttContainer}>
            <View style={styles.ttHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.ttAvatar}><Feather name="user" size={22} color={COLORS.primary} /></View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.ttTitle} numberOfLines={1}>{selectedStaff?.name?.split(' ')[0]}'s Schedule</Text>
                  <Text style={styles.ttSubtitle}>{selectedStaff?.staffType || 'Staff'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setTimetableVisible(false)} style={styles.ttCloseBtn}>
                <Feather name="x" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.ttTabsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                {DAYS_OF_WEEK.map((day) => {
                  const count = timetableData.filter((d) => d.day === day).length;
                  return (
                    <TouchableOpacity key={day} style={[styles.ttTab, selectedDay === day && styles.ttTabActive]} onPress={() => setSelectedDay(day)}>
                      <Text style={[styles.ttTabText, selectedDay === day && styles.ttTabTextActive]}>{day.slice(0, 3)}</Text>
                      <View style={[styles.ttBadge, selectedDay === day && styles.ttBadgeActive]}>
                        <Text style={[styles.ttBadgeText, selectedDay === day && styles.ttBadgeTextActive]}>{count}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <ScrollView style={styles.ttBody} contentContainerStyle={{ paddingBottom: 20 }}>
              {loadingTimetable ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
              ) : timetableData.filter((d) => d.day === selectedDay).length === 0 ? (
                <View style={styles.ttEmptyState}>
                  <View style={styles.ttEmptyIcon}><Feather name="calendar" size={26} color={COLORS.muted} /></View>
                  <Text style={styles.ttEmptyText}>No periods scheduled</Text>
                  <Text style={styles.ttEmptySub}>Nothing planned for {selectedDay}</Text>
                </View>
              ) : (
                timetableData
                  .filter((d) => d.day === selectedDay)
                  .map((period, i) => (
                    <View key={i} style={styles.periodCard}>
                      <View style={styles.periodLeft}>
                        <Text style={styles.periodNum}>P{period.periodNumber}</Text>
                        <Text style={styles.periodTime}>{period.endTime}</Text>
                      </View>
                      <View style={styles.periodRight}>
                        <Text style={styles.periodClass}>{period.className}</Text>
                        {period.roomNumber ? <Text style={styles.periodRoom}>Room {period.roomNumber}</Text> : null}
                      </View>
                    </View>
                  ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// =====================================================================================
// Styles
// =====================================================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Updated Header Row
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.lg, paddingTop: 10, paddingBottom: 10 },
  screenTitle: { fontSize: 22, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.5 },
  screenSubtitle: { fontSize: 13, color: COLORS.inkSoft, marginTop: 4, fontWeight: '500' },
  headerAddBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.md, gap: 6, ...shadow(4) },
  headerAddBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },

  // Compact KPI Grid
  kpiGrid: { flexDirection: 'row', paddingHorizontal: SPACE.lg, gap: 8, marginBottom: 16 },
  kpiCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.border, paddingVertical: 10, paddingHorizontal: 4, 
    alignItems: 'center', ...shadow(2),
  },
  kpiIconWrap: { width: 26, height: 26, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  kpiValue: { fontSize: 16, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.5 },
  kpiLabel: { fontSize: 10, color: COLORS.muted, fontWeight: '700', textAlign: 'center', marginTop: 2 },

  // Updated Filter & Search Row
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SPACE.lg, marginBottom: 12 },
  filterDropdownBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: 14, height: 46, ...shadow(2)
  },
  filterDropdownText: { fontSize: 13.5, color: COLORS.ink, fontWeight: '600' },
  searchIconBtn: {
    width: 46, height: 46, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', ...shadow(2)
  },
  expandedSearchContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: 14, height: 46, gap: 8, ...shadow(4)
  },
  searchInput: { flex: 1, color: COLORS.ink, fontSize: 14 },

  listContainer: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.xl, marginTop: 4 },
  emptyListContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIconWrap: { width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 14, ...shadow(4) },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  emptySub: { fontSize: 13, color: COLORS.muted, marginTop: 4 },

  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.md,
    borderWidth: 1, borderColor: '#F1F2F6', ...shadow(8),
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm },
  idBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primarySoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.sm },
  idBadgeText: { color: COLORS.primary, fontSize: 11.5, fontWeight: '700' },
  typeBadge: { backgroundColor: COLORS.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm },
  typeText: { fontSize: 11.5, color: COLORS.inkSoft, fontWeight: '600' },

  cardBody: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.primarySoftBorder },
  avatarText: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  infoContainer: { marginLeft: SPACE.md, flex: 1 },
  nameText: { fontSize: 16.5, fontWeight: '700', color: COLORS.ink },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  contactText: { fontSize: 13, color: COLORS.inkSoft, fontWeight: '500' },

  actionRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F1F2F6', paddingTop: SPACE.sm },
  iconAction: { alignItems: 'center', gap: 5, flex: 1 },
  iconActionCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  iconActionLabel: { fontSize: 10.5, fontWeight: '700' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: COLORS.bg, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACE.lg, paddingTop: 10, paddingBottom: 40, maxHeight: '92%',
  },
  modalGrabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.md },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.ink },
  modalSubtitle: { color: COLORS.muted, fontSize: 12.5, marginTop: 4, fontWeight: '500' },
  closeBtn: { backgroundColor: COLORS.surface, padding: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: SPACE.lg, marginBottom: SPACE.sm },
  sectionIconWrap: { width: 30, height: 30, borderRadius: RADIUS.sm, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center' },
  sectionLabelText: { fontSize: 14.5, fontWeight: '800', color: COLORS.ink },
  sectionLabelSub: { fontSize: 11.5, color: COLORS.muted, marginTop: 1, fontWeight: '500' },

  formCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACE.md,
    borderWidth: 1, borderColor: COLORS.border, gap: SPACE.md, ...shadow(4),
  },

  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: COLORS.inkSoft },
  fieldRequired: { color: COLORS.primary },
  fieldInputRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: 14, height: 50, backgroundColor: COLORS.bg,
  },
  fieldInput: { flex: 1, color: COLORS.ink, fontSize: 14.5, height: '100%' },
  fieldTouchable: { flex: 1, height: '100%', justifyContent: 'center' },
  fieldError: { fontSize: 11.5, color: COLORS.danger, fontWeight: '600', marginLeft: 2 },
  inputText: { color: COLORS.ink, fontSize: 14.5 },
  placeholderText: { color: COLORS.muted, fontSize: 14.5 },

  label: { fontSize: 13, fontWeight: '700', color: COLORS.inkSoft },
  countPill: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, borderWidth: 1,
    borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.pill,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12.5, color: COLORS.inkSoft, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  emptyInlineText: { fontSize: 12.5, color: COLORS.muted, fontStyle: 'italic' },

  iosDatePickerBar: { backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, borderRadius: RADIUS.md, marginTop: SPACE.sm, overflow: 'hidden' },
  iosDatePickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACE.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iosDatePickerTitle: { fontSize: 13.5, fontWeight: '700', color: COLORS.ink },
  iosDatePickerDone: { fontSize: 13.5, fontWeight: '800', color: COLORS.primary },

  submitButton: {
    flexDirection: 'row', backgroundColor: COLORS.primary, height: 56, borderRadius: RADIUS.md,
    justifyContent: 'center', alignItems: 'center', marginTop: SPACE.xl, gap: 8, ...shadow(10),
  },
  submitButtonText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },

  selectorOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  selectorCard: { width: '90%', maxWidth: 420, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACE.md, ...shadow(20) },
  selectorHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  selectorHeaderIcon: { width: 30, height: 30, borderRadius: RADIUS.sm, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center' },
  selectorTitle: { flex: 1, fontSize: 15.5, fontWeight: '800', color: COLORS.ink },
  selectorSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bg, borderRadius: RADIUS.sm,
    paddingHorizontal: 12, height: 40, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  selectorSearchInput: { flex: 1, fontSize: 13.5, color: COLORS.ink },
  selectorSeparator: { height: 1, backgroundColor: '#F1F2F6' },
  selectorEmpty: { textAlign: 'center', color: COLORS.muted, fontSize: 13, paddingVertical: 20 },
  selectorItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 4, borderRadius: RADIUS.sm },
  selectorItemActive: { backgroundColor: COLORS.primarySoft },
  selectorItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectorBullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  selectorBulletActive: { backgroundColor: COLORS.primary },
  selectorItemText: { fontSize: 14.5, color: COLORS.ink, fontWeight: '500' },
  selectorItemTextActive: { color: COLORS.primary, fontWeight: '700' },

  ttOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', paddingHorizontal: SPACE.md },
  viewContainer: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACE.lg, width: '100%', maxHeight: '80%', ...shadow(20) },
  viewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg },
  viewProfileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatarLg: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.primarySoftBorder },
  avatarLgText: { fontSize: 26, fontWeight: '800', color: COLORS.primary },
  viewTypeBadge: { alignSelf: 'flex-start', backgroundColor: COLORS.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm, marginTop: 6 },
  viewTypeBadgeText: { fontSize: 11.5, fontWeight: '700', color: COLORS.inkSoft },
  viewDetailsBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACE.md, gap: 14, backgroundColor: COLORS.bg },
  viewLineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewLabel: { color: COLORS.muted, fontWeight: '600', fontSize: 12.5, width: 92 },
  viewValue: { color: COLORS.ink, fontWeight: '600', fontSize: 13.5, flex: 1 },

  ttContainer: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, overflow: 'hidden', maxHeight: '80%', ...shadow(20) },
  ttHeader: { backgroundColor: COLORS.primary, padding: SPACE.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ttAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  ttTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  ttSubtitle: { fontSize: 12, color: '#FFE4E6', marginTop: 2, fontWeight: '600' },
  ttCloseBtn: { backgroundColor: 'rgba(255,255,255,0.2)', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  ttTabsContainer: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F2F6' },
  ttTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  ttTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  ttTabText: { fontSize: 13, fontWeight: '700', color: COLORS.inkSoft },
  ttTabTextActive: { color: '#fff' },
  ttBadge: { backgroundColor: COLORS.bg, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', marginLeft: 7 },
  ttBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  ttBadgeText: { fontSize: 10.5, fontWeight: '700', color: COLORS.inkSoft },
  ttBadgeTextActive: { color: '#fff' },
  ttBody: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg, minHeight: 200 },
  ttEmptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 30 },
  ttEmptyIcon: { width: 64, height: 64, borderRadius: RADIUS.md, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  ttEmptyText: { fontSize: 15, fontWeight: '700', color: COLORS.ink, textAlign: 'center' },
  ttEmptySub: { fontSize: 12.5, color: COLORS.muted, textAlign: 'center', marginTop: 4 },
  periodCard: { flexDirection: 'row', backgroundColor: COLORS.bg, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: 10, borderWidth: 1, borderColor: '#F1F2F6' },
  periodLeft: { borderRightWidth: 1, borderRightColor: COLORS.border, paddingRight: SPACE.md, marginRight: SPACE.md, justifyContent: 'center', alignItems: 'center', minWidth: 54 },
  periodNum: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  periodTime: { fontSize: 11, color: COLORS.muted, marginTop: 4, fontWeight: '600' },
  periodRight: { justifyContent: 'center', flex: 1 },
  periodClass: { fontSize: 14.5, fontWeight: '700', color: COLORS.ink },
  periodRoom: { fontSize: 13, color: COLORS.muted, marginTop: 2.5, fontWeight: '500' },
});

export default StaffScreen;