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

// --- Palette (back to the original red brand color, kept as one system) ---
const COLORS = {
  bg: '#F4F7F9',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  borderSoft: '#F3F4F6',
  text: '#111827',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  primary: '#ef4444',        // original red — primary brand action
  primarySoft: '#FEF2F2',
  primaryBorder: '#FECACA',
  accent: '#ef4444',         // destructive / delete uses the same brand red
  accentSoft: '#FEF2F2',
  success: '#10B981',
  successSoft: '#ECFDF5',
  info: '#3B82F6',
  infoSoft: '#EFF6FF',
};

function getInitials(name: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[1][0]).toUpperCase();
}

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
  const [saving, setSaving] = useState(false);

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
    Alert.alert("Delete Subject", "Are you sure you want to delete this subject? This action cannot be undone.", [
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
      setSaving(true);
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
    } finally {
      setSaving(false);
    }
  };

  // --- Inline Dropdown Renderer ---
  const renderInlineDropdown = () => {
    const isOpen = activeDropdown === 'schoolBranch';
    const selectedSchool = schools.find(s => s._id === formData.schoolId);

    return (
      <View style={styles.inputWrapper}>
        <Text style={styles.inputLabel}>School Branch <Text style={styles.asterisk}>*</Text></Text>
        <TouchableOpacity
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]}
          onPress={() => setActiveDropdown(isOpen ? null : 'schoolBranch')}
          activeOpacity={0.7}
        >
          <View style={styles.dropdownHeaderLeft}>
            <Feather name="home" size={15} color={selectedSchool ? COLORS.primary : COLORS.textFaint} />
            <Text style={selectedSchool ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
              {selectedSchool?.name || `Select a branch`}
            </Text>
          </View>
          <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
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
                  {formData.schoolId === school._id && <Feather name="check" size={16} color={COLORS.primary} />}
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
      <View style={styles.cardTopRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
        </View>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.subjectName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.codeBadge}>
              <Text style={styles.codeBadgeText}>{item.code}</Text>
            </View>
          </View>
          {!!item.nickname && (
            <Text style={styles.subjectNick} numberOfLines={1}>{item.nickname}</Text>
          )}
        </View>
      </View>

      {item.shortDescription ? (
        <Text style={styles.descText} numberOfLines={2}>{item.shortDescription}</Text>
      ) : (
        <Text style={[styles.descText, styles.descTextEmpty]}>No description provided.</Text>
      )}

      <View style={styles.cardActions}>
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
            <Feather name="trash-2" size={15} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Main Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Subjects</Text>
          <Text style={styles.subtitle}>Manage subjects, codes, and descriptions</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{subjects.length}</Text>
        </View>
      </View>

      <View style={styles.actionBar}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={17} color={COLORS.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or code"
            placeholderTextColor={COLORS.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x-circle" size={16} color={COLORS.textFaint} />
            </TouchableOpacity>
          )}
        </View>
        {hasPermission('create') && (
          <TouchableOpacity style={styles.addBtn} onPress={openAddForm} activeOpacity={0.85}>
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={filteredSubjects}
          keyExtractor={(item, idx) => item._id || item.id || idx.toString()}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Feather name="book-open" size={30} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No subjects yet</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery ? 'No subjects match your search.' : 'Create your first subject to get started.'}
              </Text>
              {hasPermission('create') && !searchQuery && (
                <TouchableOpacity style={styles.emptyCta} onPress={openAddForm} activeOpacity={0.85}>
                  <Feather name="plus" size={16} color="#fff" />
                  <Text style={styles.emptyCtaText}>New Subject</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* --- ADD/EDIT FORM (centered mid-screen dialog) --- */}
      <Modal visible={isFormVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.formOverlay}
        >
          <View style={styles.formDialog}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingId ? 'Edit Subject' : 'New Subject'}</Text>
              <TouchableOpacity
                onPress={() => setFormVisible(false)}
                style={styles.closeBtnIcon}
                hitSlop={10}
                accessibilityLabel="Cancel"
              >
                <Text style={styles.closeBtnGlyph}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.formDialogScroll}
              contentContainerStyle={styles.formScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.sectionTitleRow}>
                <Feather name="book" size={14} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Subject Information</Text>
              </View>

              {/* Inline School Branch Selector */}
              {schools.length > 0 && renderInlineDropdown()}

              <View style={styles.row}>
                <View style={[styles.inputWrapper, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.inputLabel}>Subject Name <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput
                    style={[styles.input, errors.name && styles.inputError]}
                    placeholder="e.g. Chemistry"
                    placeholderTextColor={COLORS.textFaint}
                    value={formData.name}
                    onChangeText={t => { setFormData({ ...formData, name: t }); setErrors({ ...errors, name: undefined }); }}
                  />
                  {!!errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
                </View>
                <View style={[styles.inputWrapper, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Nickname</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. CHE"
                    placeholderTextColor={COLORS.textFaint}
                    value={formData.nickname}
                    onChangeText={t => setFormData({ ...formData, nickname: t })}
                  />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Subject Code <Text style={styles.asterisk}>*</Text></Text>
                <TextInput
                  style={[styles.input, errors.code && styles.inputError]}
                  placeholder="e.g. 112"
                  placeholderTextColor={COLORS.textFaint}
                  value={formData.code}
                  onChangeText={t => { setFormData({ ...formData, code: t }); setErrors({ ...errors, code: undefined }); }}
                />
                {!!errors.code && <Text style={styles.errorText}>{errors.code}</Text>}
              </View>

              <View style={[styles.inputWrapper, { marginBottom: 4 }]}>
                <Text style={styles.inputLabel}>Short Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Optional brief description..."
                  placeholderTextColor={COLORS.textFaint}
                  multiline
                  value={formData.shortDescription}
                  onChangeText={t => setFormData({ ...formData, shortDescription: t })}
                />
              </View>
            </ScrollView>

            <View style={styles.formFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setFormVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
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
                    <Text style={styles.saveBtnFullText}>{editingId ? 'Save Changes' : 'Create'}</Text>
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
                <Text style={styles.viewHeaderLabel}>SUBJECT DETAILS</Text>
                <Text style={styles.viewName} numberOfLines={1}>{viewingSubject?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setViewVisible(false)} style={styles.viewCloseBtn} hitSlop={10}>
                <Text style={styles.viewCloseGlyph}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }} bounces={false}>
              <View style={styles.viewMetaRow}>
                <View style={styles.codeBadge}><Text style={styles.codeBadgeText}>{viewingSubject?.code}</Text></View>
                {!!viewingSubject?.nickname && (
                  <Text style={styles.schoolNick}>"{viewingSubject?.nickname}"</Text>
                )}
              </View>

              <View style={styles.viewSection}>
                <Text style={styles.viewSectionTitle}>DESCRIPTION</Text>
                {viewingSubject?.shortDescription ? (
                  <Text style={styles.viewText}>{viewingSubject.shortDescription}</Text>
                ) : (
                  <Text style={[styles.viewText, styles.viewTextEmpty]}>No description provided.</Text>
                )}
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaBox}>
                  <Text style={styles.metaLabel}>Created On</Text>
                  <Text style={styles.metaValue}>
                    {viewingSubject?.createdAt ? new Date(viewingSubject.createdAt).toLocaleDateString('en-GB') : 'N/A'}
                  </Text>
                </View>
                <View style={[styles.metaBox, styles.metaBoxLast]}>
                  <Text style={styles.metaLabel}>System ID</Text>
                  <Text style={styles.metaValueId} numberOfLines={1}>{viewingSubject?._id}</Text>
                </View>
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
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: 0.1 },
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
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: { flex: 1, marginLeft: 10, height: 46, fontSize: 14, color: COLORS.text },
  addBtn: {
    backgroundColor: COLORS.primary,
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 4 },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: COLORS.primary, fontWeight: '800', fontSize: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codeBadge: { backgroundColor: COLORS.infoSoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, marginLeft: 8 },
  codeBadgeText: { color: COLORS.info, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  subjectName: { fontSize: 16, fontWeight: '800', color: COLORS.text, flexShrink: 1 },
  subjectNick: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  descText: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19 },
  descTextEmpty: { fontStyle: 'italic', color: COLORS.textFaint },

  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  iconAction: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconActionDanger: { backgroundColor: COLORS.accentSoft },

  emptyState: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: COLORS.primarySoft,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19 },
  emptyCta: {
    marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
  },
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
    maxWidth: 480,
    maxHeight: '86%',
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
  formTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  closeBtnIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center',
  },
  closeBtnGlyph: { fontSize: 15, color: COLORS.textMuted, fontWeight: '700', lineHeight: 16 },
  formDialogScroll: { flexGrow: 0 },
  formScroll: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 16 },
  sectionTitle: { fontSize: 12.5, fontWeight: '800', color: COLORS.text, letterSpacing: 0.6, textTransform: 'uppercase' },

  // Inputs
  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 7, marginLeft: 2 },
  asterisk: { color: COLORS.accent },
  input: {
    borderWidth: 1.2, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14,
    height: 48, backgroundColor: COLORS.bg, fontSize: 14, color: COLORS.text,
  },
  inputError: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  textArea: { height: 90, paddingTop: 12, textAlignVertical: 'top' },
  errorText: { fontSize: 11.5, color: COLORS.accent, marginTop: 5, marginLeft: 2, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },

  // Dropdown
  dropdownHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1.2, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14,
    height: 48, backgroundColor: COLORS.bg,
  },
  dropdownHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dropdownHeaderActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  dropdownSelectedText: { color: COLORS.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  dropdownPlaceholder: { color: COLORS.textFaint, fontSize: 14 },
  dropdownListContainer: {
    marginTop: 6, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    backgroundColor: COLORS.surface, overflow: 'hidden',
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
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
  cancelBtnText: { color: COLORS.textMuted, fontSize: 14.5, fontWeight: '700' },
  saveBtnFull: {
    flex: 1.4,
    flexDirection: 'row', gap: 8,
    backgroundColor: COLORS.primary, height: 50, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.primary, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  saveBtnFullDisabled: { opacity: 0.7 },
  saveBtnFullText: { color: '#fff', fontSize: 14.5, fontWeight: '800', letterSpacing: 0.3 },

  // View Modal (centered dialog)
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  viewModalContainer: { backgroundColor: COLORS.bg, width: '100%', borderRadius: 22, maxHeight: '82%', overflow: 'hidden' },
  viewHeader: {
    backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 18,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  viewHeaderLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  viewName: { color: '#fff', fontSize: 19, fontWeight: '800' },
  viewCloseBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', marginLeft: 12,
  },
  viewCloseGlyph: { fontSize: 15, color: '#fff', fontWeight: '700', lineHeight: 16 },

  viewMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  schoolNick: { fontSize: 13.5, color: COLORS.textMuted, fontStyle: 'italic', marginLeft: 10 },

  viewSection: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  viewSectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.primary, marginBottom: 10, letterSpacing: 0.6 },
  viewText: { fontSize: 14, color: COLORS.text, lineHeight: 21 },
  viewTextEmpty: { fontStyle: 'italic', color: COLORS.textFaint },

  metaRow: {
    flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  metaBox: { flex: 1, borderRightWidth: 1, borderRightColor: COLORS.borderSoft, paddingRight: 12 },
  metaBoxLast: { borderRightWidth: 0, paddingRight: 0, paddingLeft: 12 },
  metaLabel: { fontSize: 10.5, color: COLORS.textMuted, fontWeight: '800', textTransform: 'uppercase', marginBottom: 5, letterSpacing: 0.4 },
  metaValue: { fontSize: 14.5, color: COLORS.text, fontWeight: '700' },
  metaValueId: { fontSize: 11.5, color: COLORS.textMuted, fontWeight: '600' },
});