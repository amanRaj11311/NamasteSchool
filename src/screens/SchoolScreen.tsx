import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
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

// --- Static Data for Dropdowns ---
const BOARDS_FILTER = ['All Boards', 'CBSE', 'ICSE', 'RBSE', 'UPMSP', 'BSEB', 'NIOS', 'Other'];
const BOARDS_FORM = [
  'CBSE - Central Board of Secondary Education',
  'ICSE - Indian Certificate of Secondary Education',
  'RBSE - Board of Secondary Education, Rajasthan',
  'UPMSP - Uttar Pradesh Madhyamik Shiksha Parishad',
  'BSEB - Bihar School Examination Board',
  'NIOS - National Institute of Open Schooling',
  'Other'
];
const GRADING_SCHEMES = ['Marks & Grades (Both)', 'Marks Only', 'Grades Only'];
const ATTENDANCE_TYPES = ['Only One Time', 'Subject Wise', 'Biometric Automated'];
const CLASSES_LIST = ['Nursery', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

// --- Types ---
interface Permission {
  module: string;
  action: string;
}

interface SchoolBranch {
  _id?: string;
  id?: string;
  name: string;
  nickName: string;
  code: string;
  establishedIn: number | string;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  email: string;
  primaryMobile: string;
  secondaryMobile: string;
  landline: string;
  fax: string;
  board: string;
  marksGradesMode: string; // Added from your requirement
  shortDescription: string;
  longDescription: string;
  fromClass: string;
  toClass: string;
  numberOfPeriods: number | string;
  workingDays: string;
  attendanceType: string;
  schoolTimeIn: string;
  schoolTimeOut: string;
  createdAt?: string;
}

const initialFormState: SchoolBranch = {
  name: '', nickName: '', code: '', establishedIn: '',
  address: '', city: '', state: '', country: 'India', pincode: '',
  email: '', primaryMobile: '', secondaryMobile: '', landline: '', fax: '',
  board: '', marksGradesMode: '', shortDescription: '', longDescription: '',
  fromClass: '', toClass: '', numberOfPeriods: '', workingDays: 'Monday - Saturday',
  attendanceType: '', schoolTimeIn: '08:00 AM', schoolTimeOut: '02:00 PM'
};

// --- Palette (kept consistent with the rest of the app: brand red) ---
const COLORS = {
  bg: '#F4F7F9',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  borderSoft: '#F3F4F6',
  text: '#111827',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  primary: '#ef4444',
  primarySoft: '#FEF2F2',
  primaryBorder: '#FECACA',
  info: '#3B82F6',
  infoSoft: '#EFF6FF',
  success: '#10B981',
};

export default function SchoolScreen() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [schools, setSchools] = useState<SchoolBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBoardFilter, setSelectedBoardFilter] = useState('All Boards');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false); // Replaced Bottom Sheet with Inline

  // Form Modals & State
  const [isFormVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<SchoolBranch>(initialFormState);
  const [saving, setSaving] = useState(false);

  // Inline Dropdown Tracker
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [dropdownSearch, setDropdownSearch] = useState('');

  // View Modal
  const [isViewVisible, setViewVisible] = useState(false);
  const [viewingSchool, setViewingSchool] = useState<SchoolBranch | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');

    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);

    fetchSchools(token);
  };

  const fetchSchools = async (token: string | null, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) {
        setSchools(res.data.data || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => fetchSchools(authToken, true), [authToken]);

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some((p) => p.module === 'schools' && p.action === action);
  }, [permissions, isSuperAdmin]);

  // --- Filtering ---
  const filteredSchools = schools.filter(school => {
    const matchesSearch = school.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          school.code.toLowerCase().includes(searchQuery.toLowerCase());

    // Exact match or partial match for the long board string
    const matchesBoard = selectedBoardFilter === 'All Boards' ||
                         (school.board && school.board.includes(selectedBoardFilter));
    return matchesSearch && matchesBoard;
  });

  // --- Actions ---
  const openAddForm = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const openEditForm = (school: SchoolBranch) => {
    setEditingId(school._id || school.id || null);
    setFormData({ ...school });
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const openViewModal = (school: SchoolBranch) => {
    setViewingSchool(school);
    setViewVisible(true);
  };

  const closeForm = () => {
    setActiveDropdown(null);
    setFormVisible(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete Branch", "Are you sure you want to delete this school branch?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/schools/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            fetchSchools(authToken, true);
          } catch (error) { Alert.alert("Error", "Failed to delete branch."); }
        }
      }
    ]);
  };

  const validateForm = () => {
    if (!formData.name || !formData.code || !formData.email || !formData.primaryMobile || !formData.board || !formData.marksGradesMode) {
      Alert.alert("Validation Error", "Please fill all required fields marked with *");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    try {
      setSaving(true);
      const payload = { ...formData };
      if (editingId) {
        await axios.put(`${API_BASE}/schools/${editingId}`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert("Success", "School branch updated successfully.");
      } else {
        await axios.post(`${API_BASE}/schools`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert("Success", "School branch created successfully.");
      }
      setFormVisible(false);
      fetchSchools(authToken, true);
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.message || "Failed to save branch.");
    } finally {
      setSaving(false);
    }
  };

  // --- UI Selectors (Inline Dropdowns) ---
  const toggleDropdown = (fieldKey: string) => {
    if (activeDropdown === fieldKey) {
      setActiveDropdown(null);
    } else {
      setActiveDropdown(fieldKey);
      setDropdownSearch(''); // Reset search when opening a new dropdown
    }
  };

  const renderInlineDropdown = (fieldKey: keyof SchoolBranch, label: string, options: string[], searchable: boolean = false) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedValue = formData[fieldKey];

    // Apply search filter if searchable is true
    const filteredOptions = searchable && dropdownSearch
      ? options.filter(o => o.toLowerCase().includes(dropdownSearch.toLowerCase()))
      : options;

    return (
      <View style={styles.inputWrapper}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]}
          onPress={() => toggleDropdown(fieldKey)}
          activeOpacity={0.8}
        >
          <Text style={selectedValue ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selectedValue?.toString() || `Select...`}
          </Text>
          <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
        </TouchableOpacity>

        {isOpen && (
          <View style={styles.dropdownListContainer}>
            {searchable && (
              <View style={styles.dropdownSearchBox}>
                <Feather name="search" size={16} color={COLORS.textFaint} />
                <TextInput
                  style={styles.dropdownSearchInput}
                  placeholder="Search board..."
                  placeholderTextColor={COLORS.textFaint}
                  value={dropdownSearch}
                  onChangeText={setDropdownSearch}
                  autoFocus
                />
              </View>
            )}
            <ScrollView nestedScrollEnabled style={styles.dropdownScroll} showsVerticalScrollIndicator={true}>
              {filteredOptions.length === 0 ? (
                <Text style={styles.noResultText}>No matches found</Text>
              ) : (
                filteredOptions.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.dropdownItem, index !== filteredOptions.length - 1 && styles.dropdownItemBorder]}
                    onPress={() => {
                      setFormData({ ...formData, [fieldKey]: option });
                      setActiveDropdown(null);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, selectedValue === option && styles.dropdownItemTextActive]}>
                      {option}
                    </Text>
                    {selectedValue === option && <Feather name="check" size={16} color={COLORS.primary} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  // --- Render School Card ---
  const renderCard = ({ item }: { item: SchoolBranch }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.schoolName} numberOfLines={1}>{item.name}</Text>
          {!!item.nickName && <Text style={styles.schoolNick} numberOfLines={1}>{item.nickName}</Text>}
        </View>
        <View style={styles.badgeStack}>
          <View style={styles.codeBadge}><Text style={styles.codeBadgeText}>{item.code}</Text></View>
          <View style={styles.boardBadge}>
            <Text style={styles.boardBadgeText}>{item.board ? item.board.split(' - ')[0] : 'N/A'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.infoBlock}>
        <View style={styles.infoRow}>
          <Feather name="map-pin" size={13} color={COLORS.textFaint} />
          <Text style={styles.infoText} numberOfLines={1}>{item.city}, {item.state} · {item.pincode}</Text>
        </View>
        <View style={styles.infoRow}>
          <Feather name="mail" size={13} color={COLORS.textFaint} />
          <Text style={styles.infoText} numberOfLines={1}>{item.email}</Text>
        </View>
        <View style={styles.infoRow}>
          <Feather name="phone" size={13} color={COLORS.textFaint} />
          <Text style={styles.infoText} numberOfLines={1}>{item.primaryMobile}</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <Text style={styles.estText}>Est. {item.establishedIn}</Text>
        <View style={styles.actionBtnGroup}>
          {hasPermission('read') && (
            <TouchableOpacity style={styles.iconAction} onPress={() => openViewModal(item)} hitSlop={8}>
              <Feather name="eye" size={16} color={COLORS.info} />
            </TouchableOpacity>
          )}
          {hasPermission('update') && (
            <TouchableOpacity style={styles.iconAction} onPress={() => openEditForm(item)} hitSlop={8}>
              <Feather name="edit-2" size={15} color={COLORS.success} />
            </TouchableOpacity>
          )}
          {hasPermission('delete') && (
            <TouchableOpacity
              style={[styles.iconAction, styles.iconActionDanger]}
              onPress={() => handleDelete(item._id || item.id!)}
              hitSlop={8}
            >
              <Feather name="trash-2" size={15} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Main Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>School Branches</Text>
          <Text style={styles.subtitle}>Manage branches, boards, and configurations</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{schools.length}</Text>
        </View>
      </View>

      <View style={{ zIndex: 10 }}>
        <View style={styles.actionBar}>
          <View style={styles.searchContainer}>
            <Feather name="search" size={17} color={COLORS.textFaint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search schools..."
              placeholderTextColor={COLORS.textFaint}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <TouchableOpacity
            style={[styles.filterBtn, isFilterDropdownOpen && styles.filterBtnActive]}
            onPress={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
            activeOpacity={0.8}
          >
            <Text style={styles.filterBtnText} numberOfLines={1}>{selectedBoardFilter}</Text>
            <Feather name={isFilterDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          {hasPermission('create') && (
            <TouchableOpacity style={styles.addBtn} onPress={openAddForm} activeOpacity={0.85}>
              <Feather name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* INLINE "ALL BOARDS" FILTER DROPDOWN */}
        {isFilterDropdownOpen && (
          <View style={styles.filterInlineDropdown}>
            <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {BOARDS_FILTER.map((board, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.dropdownItem, index !== BOARDS_FILTER.length - 1 && styles.dropdownItemBorder]}
                  onPress={() => {
                    setSelectedBoardFilter(board);
                    setIsFilterDropdownOpen(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, selectedBoardFilter === board && styles.dropdownItemTextActive]}>
                    {board}
                  </Text>
                  {selectedBoardFilter === board && <Feather name="check" size={16} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={filteredSchools}
          keyExtractor={(item, idx) => item._id || item.id || idx.toString()}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Feather name="briefcase" size={30} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No school branches yet</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery || selectedBoardFilter !== 'All Boards' ? 'No branches match your filters.' : 'Add your first branch to get started.'}
              </Text>
              {hasPermission('create') && !searchQuery && selectedBoardFilter === 'All Boards' && (
                <TouchableOpacity style={styles.emptyCta} onPress={openAddForm} activeOpacity={0.85}>
                  <Feather name="plus" size={16} color="#fff" />
                  <Text style={styles.emptyCtaText}>Add Branch</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* --- ADD/EDIT FORM (centered mid-screen dialog) --- */}
      <Modal visible={isFormVisible} transparent animationType="fade" onRequestClose={closeForm}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.formOverlay}
        >
          <View style={styles.formDialog}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingId ? 'Edit School Branch' : 'Add New Branch'}</Text>
              <TouchableOpacity onPress={closeForm} style={styles.closeBtnIcon} hitSlop={10} accessibilityLabel="Cancel">
                <Text style={styles.closeBtnGlyph}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.formDialogScroll}
              contentContainerStyle={styles.formScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >

              {/* Basic Details */}
              <View style={styles.formSection}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="info" size={13} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Basic Details</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>School Name <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="e.g. Namaste International" placeholderTextColor={COLORS.textFaint} value={formData.name} onChangeText={t => setFormData({...formData, name: t})} />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Nick Name <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="e.g. NIPS Main Branch" placeholderTextColor={COLORS.textFaint} value={formData.nickName} onChangeText={t => setFormData({...formData, nickName: t})} />
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>School Code <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="NIPS2026" placeholderTextColor={COLORS.textFaint} value={formData.code} onChangeText={t => setFormData({...formData, code: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>Established In <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="YYYY" placeholderTextColor={COLORS.textFaint} keyboardType="numeric" maxLength={4} value={formData.establishedIn.toString()} onChangeText={t => setFormData({...formData, establishedIn: t})} />
                  </View>
                </View>
              </View>

              {/* Address Details */}
              <View style={styles.formSection}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="map-pin" size={13} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Address Details</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Address <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="Street Address" placeholderTextColor={COLORS.textFaint} value={formData.address} onChangeText={t => setFormData({...formData, address: t})} />
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>City <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="City" placeholderTextColor={COLORS.textFaint} value={formData.city} onChangeText={t => setFormData({...formData, city: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>State <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="State" placeholderTextColor={COLORS.textFaint} value={formData.state} onChangeText={t => setFormData({...formData, state: t})} />
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>Country <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="Country" placeholderTextColor={COLORS.textFaint} value={formData.country} onChangeText={t => setFormData({...formData, country: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>Pincode <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="Pincode" placeholderTextColor={COLORS.textFaint} keyboardType="numeric" maxLength={6} value={formData.pincode} onChangeText={t => setFormData({...formData, pincode: t})} />
                  </View>
                </View>
              </View>

              {/* Contact Details */}
              <View style={styles.formSection}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="phone" size={13} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Contact Details</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Email Address <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="info@school.edu.in" placeholderTextColor={COLORS.textFaint} keyboardType="email-address" autoCapitalize="none" value={formData.email} onChangeText={t => setFormData({...formData, email: t})} />
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>Primary Mobile <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="10 Digits" placeholderTextColor={COLORS.textFaint} keyboardType="numeric" maxLength={10} value={formData.primaryMobile} onChangeText={t => setFormData({...formData, primaryMobile: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>Secondary Mobile</Text>
                    <TextInput style={styles.input} placeholder="Optional" placeholderTextColor={COLORS.textFaint} keyboardType="numeric" maxLength={10} value={formData.secondaryMobile} onChangeText={t => setFormData({...formData, secondaryMobile: t})} />
                  </View>
                </View>
              </View>

              {/* Board Details */}
              <View style={styles.formSection}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="award" size={13} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Education Board Details</Text>
                </View>
                {/* Searchable Dropdown for Boards */}
                {renderInlineDropdown('board', 'All India Education Board *', BOARDS_FORM, true)}
                {/* Standard Dropdown for Grading Scheme */}
                {renderInlineDropdown('marksGradesMode', 'Evaluation & Grading Scheme *', GRADING_SCHEMES, false)}
              </View>

              {/* Descriptions */}
              <View style={styles.formSection}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="file-text" size={13} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Descriptions</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Short Description <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={[styles.input, styles.textAreaSmall]} placeholder="Brief overview of the branch..." placeholderTextColor={COLORS.textFaint} multiline value={formData.shortDescription} onChangeText={t => setFormData({...formData, shortDescription: t})} />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Long Description</Text>
                  <TextInput style={[styles.input, styles.textAreaLarge]} placeholder="Detailed information..." placeholderTextColor={COLORS.textFaint} multiline value={formData.longDescription} onChangeText={t => setFormData({...formData, longDescription: t})} />
                </View>
              </View>

              {/* Other Details */}
              <View style={[styles.formSection, { marginBottom: 4 }]}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="settings" size={13} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Other Details</Text>
                </View>
                <View style={styles.row}>
                  <View style={{flex: 1, marginRight: 10}}>{renderInlineDropdown('fromClass', 'From Class *', CLASSES_LIST)}</View>
                  <View style={{flex: 1}}>{renderInlineDropdown('toClass', 'To Class *', CLASSES_LIST)}</View>
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>No. of Periods <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="e.g. 8" placeholderTextColor={COLORS.textFaint} keyboardType="numeric" value={formData.numberOfPeriods.toString()} onChangeText={t => setFormData({...formData, numberOfPeriods: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>Working Days <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="Monday - Saturday" placeholderTextColor={COLORS.textFaint} value={formData.workingDays} onChangeText={t => setFormData({...formData, workingDays: t})} />
                  </View>
                </View>

                {renderInlineDropdown('attendanceType', 'Attendance Type *', ATTENDANCE_TYPES)}

                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>Sch. Time In <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="08:00 AM" placeholderTextColor={COLORS.textFaint} value={formData.schoolTimeIn} onChangeText={t => setFormData({...formData, schoolTimeIn: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>Sch. Time Out <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="02:00 PM" placeholderTextColor={COLORS.textFaint} value={formData.schoolTimeOut} onChangeText={t => setFormData({...formData, schoolTimeOut: t})} />
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.formFooter}>
              <Pressable
                onPress={closeForm}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && styles.cancelBtnPressed,
                ]}
              >
                {({ pressed }) => (
                  <Text style={[styles.cancelBtnText, pressed && styles.cancelBtnTextPressed]}>Cancel</Text>
                )}
              </Pressable>
              <TouchableOpacity
                style={[styles.saveBtnFull, saving && styles.saveBtnFullDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name={editingId ? 'check' : 'plus'} size={17} color="#fff" />
                    <Text style={styles.saveBtnFullText}>{editingId ? 'Save Changes' : 'Create Branch'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- VIEW MODAL --- */}
      <Modal visible={isViewVisible} transparent animationType="fade" onRequestClose={() => setViewVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.viewModalContainer}>
            <View style={styles.viewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.viewHeaderLabel}>SCHOOL DETAILS</Text>
                <Text style={styles.viewName} numberOfLines={1}>{viewingSchool?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setViewVisible(false)} style={styles.viewCloseBtn} hitSlop={10}>
                <Text style={styles.viewCloseGlyph}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }} bounces={false}>
              <View style={styles.badgesRow}>
                <View style={styles.codeBadge}><Text style={styles.codeBadgeText}>{viewingSchool?.code}</Text></View>
                <View style={styles.boardBadge}><Text style={styles.boardBadgeText}>{viewingSchool?.board ? viewingSchool.board.split(' - ')[0] : 'N/A'}</Text></View>
              </View>

              {/* Dynamic Added/Established Row */}
              <View style={styles.metaRow}>
                <View style={styles.metaBox}>
                  <Text style={styles.metaLabel}>Established In</Text>
                  <Text style={styles.metaValue}>{viewingSchool?.establishedIn || 'N/A'}</Text>
                </View>
                <View style={[styles.metaBox, styles.metaBoxLast]}>
                  <Text style={styles.metaLabel}>Registered On</Text>
                  <Text style={styles.metaValue}>
                    {viewingSchool?.createdAt ? new Date(viewingSchool.createdAt).toLocaleDateString('en-GB') : 'N/A'}
                  </Text>
                </View>
              </View>

              <View style={styles.viewSection}>
                <Text style={styles.viewSectionTitle}>CONTACT DETAILS</Text>
                <View style={styles.viewInfoRow}>
                  <Feather name="mail" size={14} color={COLORS.textFaint} />
                  <Text style={styles.viewText}>{viewingSchool?.email}</Text>
                </View>
                <View style={styles.viewInfoRow}>
                  <Feather name="phone" size={14} color={COLORS.textFaint} />
                  <Text style={styles.viewText}>{viewingSchool?.primaryMobile}{viewingSchool?.secondaryMobile ? ` / ${viewingSchool.secondaryMobile}` : ''}</Text>
                </View>
              </View>

              <View style={styles.viewSection}>
                <Text style={styles.viewSectionTitle}>LOCATION</Text>
                <View style={styles.viewInfoRow}>
                  <Feather name="map-pin" size={14} color={COLORS.textFaint} />
                  <Text style={styles.viewText}>{viewingSchool?.address}</Text>
                </View>
                <Text style={[styles.viewText, { marginLeft: 22 }]}>{viewingSchool?.city}, {viewingSchool?.state} - {viewingSchool?.pincode}</Text>
              </View>

              <View style={styles.viewSection}>
                <Text style={styles.viewSectionTitle}>ACADEMIC STRUCTURE</Text>
                <Text style={styles.viewText}>Classes: {viewingSchool?.fromClass} to {viewingSchool?.toClass}</Text>
                <Text style={styles.viewText}>Periods/Day: {viewingSchool?.numberOfPeriods}</Text>
                <Text style={styles.viewText}>Timings: {viewingSchool?.schoolTimeIn} - {viewingSchool?.schoolTimeOut}</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 3 },
  countPill: {
    backgroundColor: COLORS.primarySoft,
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  countPillText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },

  actionBar: { flexDirection: 'row', padding: 16, gap: 10, zIndex: 10 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, marginLeft: 10, height: 46, fontSize: 14, color: COLORS.text },
  filterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 12, width: 116, height: 46, justifyContent: 'space-between' },
  filterBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  filterBtnText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '700', width: 70 },
  filterInlineDropdown: {
    backgroundColor: COLORS.surface, marginHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    position: 'absolute', top: 70, left: 0, right: 0, zIndex: 20,
    shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  addBtn: {
    backgroundColor: COLORS.primary, width: 46, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.primary, shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 4 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.borderSoft,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  badgeStack: { alignItems: 'flex-end', gap: 6, marginLeft: 10 },
  codeBadge: { backgroundColor: COLORS.primarySoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  codeBadgeText: { color: COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  boardBadge: { backgroundColor: COLORS.infoSoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  boardBadgeText: { color: COLORS.info, fontSize: 11, fontWeight: '800' },
  schoolName: { fontSize: 16.5, fontWeight: '800', color: COLORS.text },
  schoolNick: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },

  infoBlock: { marginTop: 2, marginBottom: 4, gap: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500', flexShrink: 1 },

  cardActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderSoft,
  },
  estText: { fontSize: 12, color: COLORS.textFaint, fontWeight: '600' },
  actionBtnGroup: { flexDirection: 'row', gap: 8 },
  iconAction: { width: 32, height: 32, borderRadius: 9, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  iconActionDanger: { backgroundColor: COLORS.primarySoft },

  emptyState: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 32 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19 },
  emptyCta: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  emptyCtaText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },

  // Add/Edit Form — centered mid-screen dialog
  formOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  formDialog: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  formTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, flex: 1, marginRight: 12 },
  closeBtnIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center',
  },
  closeBtnGlyph: { fontSize: 15, color: COLORS.primary, fontWeight: '700', lineHeight: 16 },
  formDialogScroll: { flexGrow: 0 },
  formScroll: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },

  formSection: { marginBottom: 22 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },

  // Custom Input Styling
  inputWrapper: { marginBottom: 14 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6, marginLeft: 2 },
  asterisk: { color: COLORS.primary },
  input: { borderWidth: 1.2, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: COLORS.bg, fontSize: 14, color: COLORS.text },
  textAreaSmall: { height: 80, paddingTop: 12, textAlignVertical: 'top' },
  textAreaLarge: { height: 110, paddingTop: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },

  // Inline Dropdown Styles
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.2, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: COLORS.bg },
  dropdownHeaderActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  dropdownSelectedText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  dropdownPlaceholder: { color: COLORS.textFaint, fontSize: 14 },
  dropdownListContainer: {
    marginTop: 6, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.surface, overflow: 'hidden',
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  dropdownSearchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft, backgroundColor: COLORS.bg },
  dropdownSearchInput: { flex: 1, height: 44, marginLeft: 8, fontSize: 14, color: COLORS.text },
  noResultText: { padding: 16, color: COLORS.textFaint, textAlign: 'center', fontStyle: 'italic' },
  dropdownScroll: { maxHeight: 180 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  dropdownItemText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  dropdownItemTextActive: { color: COLORS.primary, fontWeight: '700' },

  // Dialog footer / action buttons
  formFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  cancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  cancelBtnPressed: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  cancelBtnText: { color: COLORS.textMuted, fontSize: 14.5, fontWeight: '700' },
  cancelBtnTextPressed: { color: '#fff' },
  saveBtnFull: {
    flex: 1.5,
    flexDirection: 'row', gap: 8,
    backgroundColor: COLORS.primary, height: 50, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.primary, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  saveBtnFullDisabled: { opacity: 0.7 },
  saveBtnFullText: { color: '#fff', fontSize: 14.5, fontWeight: '800', letterSpacing: 0.3 },

  // View Modal
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  viewModalContainer: { backgroundColor: COLORS.bg, width: '100%', borderRadius: 22, maxHeight: '85%', overflow: 'hidden' },
  viewHeader: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewHeaderLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  viewName: { color: '#fff', fontSize: 19, fontWeight: '800' },
  viewCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  viewCloseGlyph: { fontSize: 15, color: '#fff', fontWeight: '700', lineHeight: 16 },

  badgesRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },

  metaRow: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.borderSoft },
  metaBox: { flex: 1, borderRightWidth: 1, borderRightColor: COLORS.borderSoft, paddingRight: 12 },
  metaBoxLast: { borderRightWidth: 0, paddingRight: 0, paddingLeft: 12 },
  metaLabel: { fontSize: 10.5, color: COLORS.textMuted, fontWeight: '800', textTransform: 'uppercase', marginBottom: 5, letterSpacing: 0.4 },
  metaValue: { fontSize: 14.5, color: COLORS.text, fontWeight: '700' },

  viewSection: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.borderSoft },
  viewSectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.primary, marginBottom: 10, letterSpacing: 0.6 },
  viewInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  viewText: { fontSize: 14, color: COLORS.text, lineHeight: 22 },
});