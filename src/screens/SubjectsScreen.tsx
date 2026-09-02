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
import { API_BASE } from '../network/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';


// --- Types ---
interface Permission {
  module: string;
  action: string;
}

interface School {
  _id: string;
  name: string;
}

interface Subject {
  _id?: string;
  id?: string;
  name: string;
  nickname: string;
  code: string;
  shortDescription: string;
  createdAt?: string;
  schoolId?: string; // If your backend ties subjects to schools
}

const initialFormState: Subject = {
  name: '',
  nickname: '',
  code: '',
  shortDescription: '',
  schoolId: ''
};

export default function SubjectsScreen() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');

  // Form Modals & State
  const [isFormVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Subject>(initialFormState);
  const [errors, setErrors] = useState<Partial<Subject>>({});
  
  // Inline Dropdown Tracker
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // View Modal
  const [isViewVisible, setViewVisible] = useState(false);
  const [viewingSubject, setViewingSubject] = useState<Subject | null>(null);

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

    fetchData(token);
  };

  const fetchData = async (token: string | null, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [subjectsRes, schoolsRes] = await Promise.all([
        axios.get(`${API_BASE}/subjects`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (subjectsRes.data?.success) {
        setSubjects(subjectsRes.data.data || []);
      }
      if (schoolsRes.data?.success) {
        setSchools(schoolsRes.data.data || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => fetchData(authToken, true), [authToken]);

  // RBAC Checker (Checking against the 'subjects' module)
  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some((p) => p.module === 'subjects' && p.action === action);
  }, [permissions, isSuperAdmin]);

  // --- Filtering ---
  const filteredSubjects = subjects.filter(subject => 
    subject.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    subject.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- Actions ---
  const openAddForm = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setErrors({});
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const openEditForm = (subject: Subject) => {
    setEditingId(subject._id || subject.id || null);
    setFormData({ ...subject });
    setErrors({});
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const openViewModal = (subject: Subject) => {
    setViewingSubject(subject);
    setViewVisible(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete Subject", "Are you sure you want to delete this subject?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/subjects/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            fetchData(authToken, true);
          } catch (error) { Alert.alert("Error", "Failed to delete subject."); }
        }
      }
    ]);
  };

  const validateForm = () => {
    let isValid = true;
    let newErrors: Partial<Subject> = {};

    if (!formData.name.trim()) { newErrors.name = 'Required'; isValid = false; }
    if (!formData.code.trim()) { newErrors.code = 'Required'; isValid = false; }
    
    setErrors(newErrors);
    return isValid;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    try {
      const payload = { ...formData };
      if (editingId) {
        await axios.put(`${API_BASE}/subjects/${editingId}`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert("Success", "Subject updated successfully.");
      } else {
        await axios.post(`${API_BASE}/subjects`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert("Success", "Subject created successfully.");
      }
      setFormVisible(false);
      fetchData(authToken, true);
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.message || "Failed to save subject.");
    }
  };

  // --- Premium Inline Dropdown Renderer ---
  const renderInlineDropdown = () => {
    const isOpen = activeDropdown === 'schoolBranch';
    const selectedSchool = schools.find(s => s._id === formData.schoolId);

    return (
      <View style={styles.inputWrapper}>
        <Text style={styles.inputLabel}>School Branch <Text style={styles.asterisk}>*</Text></Text>
        <TouchableOpacity 
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} 
          onPress={() => setActiveDropdown(isOpen ? null : 'schoolBranch')}
          activeOpacity={0.8}
        >
          <Text style={selectedSchool ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selectedSchool?.name || `Select Branch...`}
          </Text>
          <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={18} color="#6B7280" />
        </TouchableOpacity>
        
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={styles.dropdownScroll} showsVerticalScrollIndicator={false}>
              {schools.map((school, index) => (
                <TouchableOpacity 
                  key={school._id} 
                  style={[styles.dropdownItem, index !== schools.length - 1 && styles.dropdownItemBorder]}
                  onPress={() => {
                    setFormData({ ...formData, schoolId: school._id });
                    setActiveDropdown(null);
                  }}
                >
                  <Text style={[styles.dropdownItemText, formData.schoolId === school._id && styles.dropdownItemTextActive]}>
                    {school.name}
                  </Text>
                  {formData.schoolId === school._id && <Feather name="check" size={16} color="#ef4444" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  // --- Render Subject Card ---
  const renderCard = ({ item }: { item: Subject }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.subjectName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.codeBadge}><Text style={styles.codeBadgeText}>CODE: {item.code}</Text></View>
      </View>
      
      <Text style={styles.subjectNick}>"{item.nickname || 'No nickname'}"</Text>

      {item.shortDescription ? (
        <Text style={styles.descText} numberOfLines={2}>{item.shortDescription}</Text>
      ) : (
        <Text style={[styles.descText, {fontStyle: 'italic', color: '#9CA3AF'}]}>No description provided.</Text>
      )}

      <View style={styles.cardActions}>
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
        <Text style={styles.title}>Subjects Manager</Text>
        <Text style={styles.subtitle}>Manage subjects, codes, and their descriptions.</Text>
      </View>

      <View style={styles.actionBar}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={18} color="#9CA3AF" />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search subjects by name or code..." 
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
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#ef4444" /></View>
      ) : (
        <FlatList
          data={filteredSubjects}
          keyExtractor={(item, idx) => item._id || item.id || idx.toString()}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ef4444']} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="book" size={40} color="#D1D5DB" />
              <Text style={{color: '#6B7280', marginTop: 10, fontWeight: '500'}}>No subjects found.</Text>
            </View>
          }
        />
      )}

      {/* --- ADD/EDIT FORM MODAL --- */}
      <Modal visible={isFormVisible} animationType="slide">
        <SafeAreaView style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{editingId ? 'Edit Subject' : 'Create Subject'}</Text>
            <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}>
              <Feather name="x" size={22} color="#4B5563" />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
              
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Subject Information</Text>
                
                {/* Inline School Branch Selector */}
                {schools.length > 0 && renderInlineDropdown()}

                <View style={styles.row}>
                  <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                    <Text style={styles.inputLabel}>Subject Name <Text style={styles.asterisk}>*</Text></Text>
                    <TextInput 
                      style={[styles.input, errors.name && styles.inputError]} 
                      placeholder="e.g. Chemistry" 
                      value={formData.name} 
                      onChangeText={t => { setFormData({...formData, name: t}); setErrors({...errors, name: undefined}); }} 
                    />
                  </View>
                  <View style={[styles.inputWrapper, {flex: 1}]}>
                    <Text style={styles.inputLabel}>Subject Nickname</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="e.g. CHE" 
                      value={formData.nickname} 
                      onChangeText={t => setFormData({...formData, nickname: t})} 
                    />
                  </View>
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Subject Code <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput 
                    style={[styles.input, errors.code && styles.inputError]} 
                    placeholder="e.g. 112" 
                    value={formData.code} 
                    onChangeText={t => { setFormData({...formData, code: t}); setErrors({...errors, code: undefined}); }} 
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Short Description</Text>
                  <TextInput 
                    style={[styles.input, {height: 80, textAlignVertical: 'top'}]} 
                    placeholder="Optional brief description..." 
                    multiline 
                    value={formData.shortDescription} 
                    onChangeText={t => setFormData({...formData, shortDescription: t})} 
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave}>
                <Text style={styles.saveBtnFullText}>Submit Subject</Text>
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
              <Text style={styles.viewTitle}>Subject Details</Text>
              <TouchableOpacity onPress={() => setViewVisible(false)}><Feather name="x" size={24} color="#fff" /></TouchableOpacity>
            </View>
            <View style={{padding: 24}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
                <Text style={styles.viewName}>{viewingSubject?.name}</Text>
                <View style={styles.codeBadge}><Text style={styles.codeBadgeText}>CODE: {viewingSubject?.code}</Text></View>
              </View>
              <Text style={styles.schoolNick}>"{viewingSubject?.nickname || 'No nickname'}"</Text>

              <View style={styles.viewSection}>
                <Text style={styles.viewSectionTitle}><Feather name="file-text"/> SHORT DESCRIPTION</Text>
                {viewingSubject?.shortDescription ? (
                  <Text style={styles.viewText}>{viewingSubject.shortDescription}</Text>
                ) : (
                  <Text style={[styles.viewText, {fontStyle: 'italic', color: '#9CA3AF'}]}>No description provided.</Text>
                )}
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaBox}>
                  <Text style={styles.metaLabel}>Created On</Text>
                  <Text style={styles.metaValue}>
                    {viewingSubject?.createdAt ? new Date(viewingSubject.createdAt).toLocaleDateString('en-GB') : 'N/A'}
                  </Text>
                </View>
                <View style={styles.metaBox}>
                  <Text style={styles.metaLabel}>System ID</Text>
                  <Text style={[styles.metaValue, {fontSize: 11, color: '#6B7280'}]}>{viewingSubject?._id}</Text>
                </View>
              </View>

            </View>
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
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  searchInput: { flex: 1, marginLeft: 8, height: 46, fontSize: 14, color: '#111827' },
  addBtn: { backgroundColor: '#ef4444', width: 46, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#ef4444', shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  codeBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  codeBadgeText: { color: '#3B82F6', fontSize: 11, fontWeight: '700' },
  subjectName: { fontSize: 18, fontWeight: '800', color: '#111827', flex: 1, marginRight: 10 },
  subjectNick: { fontSize: 13, color: '#6B7280', fontStyle: 'italic', marginBottom: 12 },
  descText: { fontSize: 13, color: '#4B5563', lineHeight: 18 },
  
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
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
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 16, letterSpacing: 0.5, textTransform: 'uppercase' },
  
  // Custom Input Styling
  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#4B5563', marginBottom: 6, marginLeft: 2 },
  asterisk: { color: '#ef4444' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: '#F9FAFB', fontSize: 14, color: '#111827' },
  inputError: { borderColor: '#ef4444', backgroundColor: '#FEF2F2' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  
  // Inline Dropdown Styles
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: '#F9FAFB' },
  dropdownHeaderActive: { borderColor: '#ef4444', backgroundColor: '#FEF2F2' },
  dropdownSelectedText: { color: '#111827', fontSize: 14, fontWeight: '500' },
  dropdownPlaceholder: { color: '#9CA3AF', fontSize: 14 },
  dropdownListContainer: { marginTop: 4, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden', elevation: 2 },
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
  viewName: { fontSize: 24, fontWeight: '800', color: '#111827', flex: 1, marginRight: 10 },
  schoolNick: { fontSize: 14, color: '#6B7280', fontStyle: 'italic', marginBottom: 20 },
  
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  metaBox: { flex: 1 },
  metaLabel: { fontSize: 11, color: '#6B7280', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  metaValue: { fontSize: 15, color: '#111827', fontWeight: '700' },

  viewSection: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB', elevation: 1 },
  viewSectionTitle: { fontSize: 12, fontWeight: '800', color: '#ef4444', marginBottom: 12, letterSpacing: 0.5 },
  viewText: { fontSize: 14, color: '#4B5563', lineHeight: 22, fontWeight: '500' },
});