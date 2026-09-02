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
          <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={18} color="#6B7280" />
        </TouchableOpacity>
        
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            {searchable && (
              <View style={styles.dropdownSearchBox}>
                <Feather name="search" size={16} color="#9CA3AF" />
                <TextInput 
                  style={styles.dropdownSearchInput}
                  placeholder="Search board..."
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
                    {selectedValue === option && <Feather name="check" size={16} color="#ef4444" />}
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
        <View style={styles.codeBadge}><Text style={styles.codeBadgeText}>CODE: {item.code}</Text></View>
        <View style={styles.boardBadge}>
           {/* Showing only the short code (e.g. CBSE) if the string is long */}
          <Text style={styles.boardBadgeText}>{item.board ? item.board.split(' - ')[0] : 'N/A'}</Text>
        </View>
      </View>
      
      <Text style={styles.schoolName}>{item.name}</Text>
      <Text style={styles.schoolNick}>"{item.nickName}"</Text>

      <View style={styles.infoRow}>
        <Feather name="map-pin" size={14} color="#6B7280" />
        <Text style={styles.infoText}>{item.city}, {item.state} ({item.pincode})</Text>
      </View>
      <View style={styles.infoRow}>
        <Feather name="mail" size={14} color="#6B7280" />
        <Text style={styles.infoText}>{item.email}</Text>
      </View>
      <View style={styles.infoRow}>
        <Feather name="phone" size={14} color="#6B7280" />
        <Text style={styles.infoText}>{item.primaryMobile}</Text>
      </View>

      <View style={styles.cardActions}>
        <Text style={styles.estText}>Est: {item.establishedIn}</Text>
        <View style={styles.actionBtnGroup}>
          {hasPermission('read') && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => openViewModal(item)}>
              <Feather name="eye" size={14} color="#3B82F6" /><Text style={[styles.actionBtnText, {color: '#3B82F6'}]}>View</Text>
            </TouchableOpacity>
          )}
          {hasPermission('update') && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => openEditForm(item)}>
              <Feather name="edit" size={14} color="#10B981" /><Text style={[styles.actionBtnText, {color: '#10B981'}]}>Edit</Text>
            </TouchableOpacity>
          )}
          {hasPermission('delete') && (
            <TouchableOpacity style={[styles.actionBtn, {borderColor: '#FEE2E2', backgroundColor: '#FEF2F2'}]} onPress={() => handleDelete(item._id || item.id!)}>
              <Feather name="trash-2" size={14} color="#ef4444" /><Text style={[styles.actionBtnText, {color: '#ef4444'}]}>Delete</Text>
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
        <Text style={styles.title}>School Branches</Text>
        <Text style={styles.subtitle}>Manage client school branches, education boards, and configurations.</Text>
      </View>

      <View style={{ zIndex: 10 }}>
        <View style={styles.actionBar}>
          <View style={styles.searchContainer}>
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput style={styles.searchInput} placeholder="Search schools..." value={searchQuery} onChangeText={setSearchQuery} />
          </View>
          
          <TouchableOpacity 
            style={[styles.filterBtn, isFilterDropdownOpen && { borderColor: '#ef4444' }]} 
            onPress={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
          >
            <Text style={styles.filterBtnText} numberOfLines={1}>{selectedBoardFilter}</Text>
            <Feather name={isFilterDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="#4B5563" />
          </TouchableOpacity>

          {hasPermission('create') && (
            <TouchableOpacity style={styles.addBtn} onPress={openAddForm}>
              <Feather name="plus" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* INLINE "ALL BOARDS" FILTER DROPDOWN */}
        {isFilterDropdownOpen && (
          <View style={styles.filterInlineDropdown}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
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
                  {selectedBoardFilter === board && <Feather name="check" size={16} color="#ef4444" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#ef4444" /></View>
      ) : (
        <FlatList
          data={filteredSchools}
          keyExtractor={(item, idx) => item._id || item.id || idx.toString()}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ef4444']} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="briefcase" size={40} color="#D1D5DB" />
              <Text style={{color: '#6B7280', marginTop: 10, fontWeight: '500'}}>No school branches found.</Text>
            </View>
          }
        />
      )}

      {/* --- ADD/EDIT FORM MODAL --- */}
      <Modal visible={isFormVisible} animationType="slide">
        <SafeAreaView style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{editingId ? 'Edit School Branch' : 'Add New Branch'}</Text>
            <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}>
              <Feather name="x" size={22} color="#4B5563" />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
              
              {/* Basic Details */}
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Basic Details</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>School Name <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="e.g. Namaste International" value={formData.name} onChangeText={t => setFormData({...formData, name: t})} />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Nick Name <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="e.g. NIPS Main Branch" value={formData.nickName} onChangeText={t => setFormData({...formData, nickName: t})} />
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>School Code <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="NIPS2026" value={formData.code} onChangeText={t => setFormData({...formData, code: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>Established In <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="YYYY" keyboardType="numeric" maxLength={4} value={formData.establishedIn.toString()} onChangeText={t => setFormData({...formData, establishedIn: t})} />
                  </View>
                </View>
              </View>

              {/* Address Details */}
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Address Details</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Address <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="Street Address" value={formData.address} onChangeText={t => setFormData({...formData, address: t})} />
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>City <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="City" value={formData.city} onChangeText={t => setFormData({...formData, city: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>State <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="State" value={formData.state} onChangeText={t => setFormData({...formData, state: t})} />
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>Country <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="Country" value={formData.country} onChangeText={t => setFormData({...formData, country: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>Pincode <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="Pincode" keyboardType="numeric" maxLength={6} value={formData.pincode} onChangeText={t => setFormData({...formData, pincode: t})} />
                  </View>
                </View>
              </View>

              {/* Contact Details */}
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Contact Details</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Email Address <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="info@school.edu.in" keyboardType="email-address" autoCapitalize="none" value={formData.email} onChangeText={t => setFormData({...formData, email: t})} />
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>Primary Mobile <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="10 Digits" keyboardType="numeric" maxLength={10} value={formData.primaryMobile} onChangeText={t => setFormData({...formData, primaryMobile: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>Secondary Mobile</Text>
                    <TextInput style={styles.input} placeholder="Optional" keyboardType="numeric" maxLength={10} value={formData.secondaryMobile} onChangeText={t => setFormData({...formData, secondaryMobile: t})} />
                  </View>
                </View>
              </View>

              {/* Board Details */}
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Education Board Details</Text>
                {/* Searchable Dropdown for Boards */}
                {renderInlineDropdown('board', 'All India Education Board *', BOARDS_FORM, true)}
                {/* Standard Dropdown for Grading Scheme */}
                {renderInlineDropdown('marksGradesMode', 'Evaluation & Grading Scheme *', GRADING_SCHEMES, false)}
              </View>

              {/* Descriptions */}
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Descriptions</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Short Description <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={[styles.input, {height: 80, textAlignVertical: 'top'}]} placeholder="Brief overview of the branch..." multiline value={formData.shortDescription} onChangeText={t => setFormData({...formData, shortDescription: t})} />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Long Description</Text>
                  <TextInput style={[styles.input, {height: 120, textAlignVertical: 'top'}]} placeholder="Detailed information..." multiline value={formData.longDescription} onChangeText={t => setFormData({...formData, longDescription: t})} />
                </View>
              </View>

              {/* Other Details */}
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Other Details</Text>
                <View style={styles.row}>
                  <View style={{flex: 1, marginRight: 10}}>{renderInlineDropdown('fromClass', 'From Class *', CLASSES_LIST)}</View>
                  <View style={{flex: 1}}>{renderInlineDropdown('toClass', 'To Class *', CLASSES_LIST)}</View>
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>No. of Periods <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="e.g. 8" keyboardType="numeric" value={formData.numberOfPeriods.toString()} onChangeText={t => setFormData({...formData, numberOfPeriods: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>Working Days <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="Monday - Saturday" value={formData.workingDays} onChangeText={t => setFormData({...formData, workingDays: t})} />
                  </View>
                </View>
                
                {renderInlineDropdown('attendanceType', 'Attendance Type *', ATTENDANCE_TYPES)}

                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>Sch. Time In <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="08:00 AM" value={formData.schoolTimeIn} onChangeText={t => setFormData({...formData, schoolTimeIn: t})} />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>Sch. Time Out <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="02:00 PM" value={formData.schoolTimeOut} onChangeText={t => setFormData({...formData, schoolTimeOut: t})} />
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave}>
                <Text style={styles.saveBtnFullText}>Submit Branch Details</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* --- VIEW MODAL --- */}
      <Modal visible={isViewVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.viewModalContainer}>
            <View style={styles.viewHeader}>
              <Text style={styles.viewTitle}>School Details</Text>
              <TouchableOpacity onPress={() => setViewVisible(false)}><Feather name="x" size={24} color="#fff" /></TouchableOpacity>
            </View>
            <ScrollView style={{padding: 20}}>
              <Text style={styles.viewName}>{viewingSchool?.name}</Text>
              
              <View style={styles.badgesRow}>
                <View style={styles.codeBadge}><Text style={styles.codeBadgeText}>CODE: {viewingSchool?.code}</Text></View>
                <View style={styles.boardBadge}><Text style={styles.boardBadgeText}>{viewingSchool?.board ? viewingSchool.board.split(' - ')[0] : 'N/A'}</Text></View>
              </View>

              {/* Dynamic Added/Established Row */}
              <View style={styles.metaRow}>
                <View style={styles.metaBox}>
                  <Text style={styles.metaLabel}>Established In</Text>
                  <Text style={styles.metaValue}>{viewingSchool?.establishedIn || 'N/A'}</Text>
                </View>
                <View style={styles.metaBox}>
                  <Text style={styles.metaLabel}>Registered On</Text>
                  <Text style={styles.metaValue}>
                    {viewingSchool?.createdAt ? new Date(viewingSchool.createdAt).toLocaleDateString('en-GB') : 'N/A'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.viewSection}>
                <Text style={styles.viewSectionTitle}><Feather name="phone-call"/> CONTACT DETAILS</Text>
                <Text style={styles.viewText}>{viewingSchool?.email}</Text>
                <Text style={styles.viewText}>{viewingSchool?.primaryMobile} / {viewingSchool?.secondaryMobile}</Text>
              </View>

              <View style={styles.viewSection}>
                <Text style={styles.viewSectionTitle}><Feather name="map-pin"/> LOCATION</Text>
                <Text style={styles.viewText}>{viewingSchool?.address}</Text>
                <Text style={styles.viewText}>{viewingSchool?.city}, {viewingSchool?.state} - {viewingSchool?.pincode}</Text>
              </View>

              <View style={styles.viewSection}>
                <Text style={styles.viewSectionTitle}><Feather name="book"/> ACADEMIC STRUCTURE</Text>
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
  container: { flex: 1, backgroundColor: '#F4F7F9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  
  actionBar: { flexDirection: 'row', padding: 16, gap: 10, zIndex: 10 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB', elevation: 1 },
  searchInput: { flex: 1, marginLeft: 8, height: 46, fontSize: 14, color: '#111827' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, width: 110, justifyContent: 'space-between' },
  filterBtnText: { fontSize: 13, color: '#4B5563', fontWeight: '600', width: 65 },
  filterInlineDropdown: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', elevation: 4, position: 'absolute', top: 70, left: 0, right: 0, zIndex: 20 },
  addBtn: { backgroundColor: '#ef4444', width: 46, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#ef4444', shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 10 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  codeBadge: { backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  codeBadgeText: { color: '#ef4444', fontSize: 11, fontWeight: '700' },
  boardBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  boardBadgeText: { color: '#3B82F6', fontSize: 11, fontWeight: '700' },
  schoolName: { fontSize: 18, fontWeight: '800', color: '#111827' },
  schoolNick: { fontSize: 13, color: '#6B7280', fontStyle: 'italic', marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  infoText: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  estText: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  actionBtnGroup: { flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4, backgroundColor: '#fff' },
  actionBtnText: { fontSize: 12, fontWeight: '700' },

  // Add/Edit Form Premium Styles
  formContainer: { flex: 1, backgroundColor: '#F4F7F9' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', elevation: 2 },
  formTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  closeBtnIcon: { padding: 6, backgroundColor: '#F3F4F6', borderRadius: 20 },
  formScroll: { padding: 16, paddingBottom: 40 },
  formCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB', elevation: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#6B7280', marginBottom: 16, letterSpacing: 0.5, textTransform: 'uppercase' },
  
  // Custom Input Styling
  inputWrapper: { marginBottom: 14 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, marginLeft: 2 },
  asterisk: { color: '#ef4444' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: '#fff', fontSize: 14, color: '#111827' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  
  // Inline Dropdown Styles
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: '#fff' },
  dropdownHeaderActive: { borderColor: '#ef4444' },
  dropdownSelectedText: { color: '#111827', fontSize: 14, fontWeight: '500' },
  dropdownPlaceholder: { color: '#9CA3AF', fontSize: 14 },
  dropdownListContainer: { marginTop: 4, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' },
  dropdownSearchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  dropdownSearchInput: { flex: 1, height: 44, marginLeft: 8, fontSize: 14, color: '#111827' },
  noResultText: { padding: 16, color: '#9CA3AF', textAlign: 'center', fontStyle: 'italic' },
  dropdownScroll: { maxHeight: 180 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dropdownItemText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  dropdownItemTextActive: { color: '#ef4444', fontWeight: '700' },
  
  saveBtnFull: { backgroundColor: '#ef4444', height: 56, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: '#ef4444', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveBtnFullText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  // View Modal Premium Styles
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  viewModalContainer: { backgroundColor: '#F9FAFB', width: '100%', borderRadius: 24, maxHeight: '85%', overflow: 'hidden', elevation: 10 },
  viewHeader: { backgroundColor: '#ef4444', padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewTitle: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  viewName: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 12 },
  badgesRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  metaBox: { flex: 1 },
  metaLabel: { fontSize: 11, color: '#6B7280', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  metaValue: { fontSize: 15, color: '#111827', fontWeight: '700' },

  viewSection: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB', elevation: 1 },
  viewSectionTitle: { fontSize: 12, fontWeight: '800', color: '#ef4444', marginBottom: 12, letterSpacing: 0.5 },
  viewText: { fontSize: 15, color: '#4B5563', marginBottom: 8, fontWeight: '500' },
});