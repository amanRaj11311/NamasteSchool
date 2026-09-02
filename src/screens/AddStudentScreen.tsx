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
  RefreshControl,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import DocumentPicker from '@react-native-documents/picker';
import { API_BASE } from '../network/api';
import { COLORS, RADIUS, SPACING, FONT, SHADOW, TOUCH_TARGET } from '../constants/theme';

// --- Constants ---
const GENDERS = ['Male', 'Female', 'Other'];
const RELATIONS = ['Father', 'Mother', 'Brother', 'Sister', 'Guardian', 'Other'];
const PAGE_LIMIT = 50;

// --- Types ---
interface Permission {
  module: string;
  action: string;
}

interface ClassObj {
  _id: string;
  className: string;
}

interface Student {
  _id?: string;
  id?: string;
  name: string;
  admissionNo: string;
  rollNo: string;
  classId: string | any;
  section: string;
  gender: string;
  dob: string;
  nationality: string;
  religion: string;
  caste: string;
  guardianName: string;
  guardianMobile: string;
  relationWithStudent: string;
  guardianDOB: string;
  guardianEducation: string;
  guardianProfession: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
}

const initialFormState: Student = {
  name: '',
  admissionNo: '',
  rollNo: '',
  classId: '',
  section: '',
  gender: 'Male',
  dob: '',
  nationality: 'Indian',
  religion: '',
  caste: '',
  guardianName: '',
  guardianMobile: '',
  relationWithStudent: 'Father',
  guardianDOB: '',
  guardianEducation: '',
  guardianProfession: '',
  address: '',
  city: '',
  state: '',
  country: 'India',
  pincode: '',
};

export default function StudentsScreen() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassObj[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalStudents, setTotalStudents] = useState(0);

  // Pagination & Filters
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('');

  // Modals & Forms
  const [isFormVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Student>(initialFormState);
  const [errors, setErrors] = useState<Partial<Student>>({});

  // Upload Modal
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // View Profile Modal
  const [isViewVisible, setViewVisible] = useState(false);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);

  // Unified Inline Dropdown State
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

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

    fetchClasses(token);
    fetchStudents(token, 1, '', '');
  };

  const fetchClasses = async (token: string | null) => {
    try {
      const res = await axios.get(`${API_BASE}/classes`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) setClasses(res.data.data || []);
    } catch (e) {
      console.warn('Could not load classes');
    }
  };

  const fetchStudents = async (token: string | null, page: number, search: string, classId: string, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      let url = `${API_BASE}/students?page=${page}&limit=${PAGE_LIMIT}`;
      if (search) url += `&search=${search}`;
      if (classId) url += `&classId=${classId}`;

      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });

      if (res.data?.success) {
        setStudents(res.data.data || []);
        setTotalStudents(res.data.count || res.data.data.length || 0);
        setTotalPages(res.data.pagination?.totalPages || 1);
        setCurrentPage(page);
      }
    } catch (error) {
      console.error('Fetch Students Error', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    fetchStudents(authToken, 1, searchQuery, selectedClassFilter, true);
  }, [authToken, searchQuery, selectedClassFilter]);

  const handleSearch = () => {
    fetchStudents(authToken, 1, searchQuery, selectedClassFilter);
  };

  const handleClassFilterSelect = (classId: string) => {
    setSelectedClassFilter(classId);
    setActiveDropdown(null);
    fetchStudents(authToken, 1, searchQuery, classId);
  };

  const hasPermission = useCallback(
    (action: string) => {
      if (isSuperAdmin) return true;
      return permissions.some((p) => p.module === 'students' && p.action === action);
    },
    [permissions, isSuperAdmin]
  );

  // --- CRUD Actions ---
  const openAddForm = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setActiveDropdown(null);
    setErrors({});
    setFormVisible(true);
  };

  const openEditForm = (student: Student) => {
    setEditingId(student._id || student.id || null);
    setFormData({
      ...student,
      classId: typeof student.classId === 'object' ? student.classId._id : student.classId,
    });
    setActiveDropdown(null);
    setErrors({});
    setFormVisible(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Student', 'Are you sure you want to permanently delete this student?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/students/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            fetchStudents(authToken, currentPage, searchQuery, selectedClassFilter, true);
          } catch (error) {
            Alert.alert('Error', 'Failed to delete student.');
          }
        },
      },
    ]);
  };

  const validateForm = () => {
    let isValid = true;
    let newErrors: Partial<Student> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Required';
      isValid = false;
    }
    if (!formData.classId) {
      newErrors.classId = 'Required';
      isValid = false;
    }
    if (!formData.guardianName.trim()) {
      newErrors.guardianName = 'Required';
      isValid = false;
    }
    if (!formData.guardianMobile) {
      newErrors.guardianMobile = 'Required';
      isValid = false;
    } else if (formData.guardianMobile.length < 10) {
      newErrors.guardianMobile = '10 Digits min';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    try {
      if (editingId) {
        await axios.put(`${API_BASE}/students/${editingId}`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert('Success', 'Student profile updated.');
      } else {
        await axios.post(`${API_BASE}/students`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert('Success', 'Student registered successfully.');
      }
      setFormVisible(false);
      fetchStudents(authToken, currentPage, searchQuery, selectedClassFilter, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save student.');
    }
  };

  // --- Excel Actions ---
  const handleDownloadFormat = () => {
    const url = 'https://mern.schoolapi.dcstechnosis.com/downloads/Students_Template.xlsx';
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open download link.'));
  };

  const handleExportExcel = () => {
    const url = `${API_BASE}/students/export`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not export data.'));
  };

  const handleUploadExcel = async () => {
    try {
      const res = await DocumentPicker.pick({ type: [DocumentPicker.types.xls, DocumentPicker.types.xlsx] });
      setIsUploading(true);

      const uploadData = new FormData();
      uploadData.append('file', { uri: res[0].uri, type: res[0].type, name: res[0].name } as any);

      await axios.post(`${API_BASE}/students/bulk`, uploadData, {
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'multipart/form-data' },
      });

      Alert.alert('Success', 'Students uploaded successfully!');
      setUploadModalVisible(false);
      onRefresh();
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) {
        Alert.alert('Upload Error', err.response?.data?.message || 'Failed to upload file.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  // --- UI Renderers ---
  const toggleDropdown = (field: string) => {
    setActiveDropdown(activeDropdown === field ? null : field);
  };

  const renderInlineDropdown = (fieldKey: keyof Student | 'classFilter', label: string, options: { label: string; value: string }[], isFilter = false) => {
    const isOpen = activeDropdown === fieldKey;
    const currentValue = isFilter ? selectedClassFilter : formData[fieldKey as keyof Student];
    const selectedObj = options.find((o) => o.value === currentValue);

    return (
      <View style={[styles.inputWrapper, isFilter && { marginBottom: 0, flex: 1, marginLeft: SPACING.md }]}>
        {!isFilter && <Text style={styles.inputLabel}>{label}</Text>}
        <TouchableOpacity
          style={[isFilter ? styles.filterDropdownHeader : styles.dropdownHeader, isOpen && styles.dropdownHeaderActive, !isFilter && errors[fieldKey as keyof Student] && styles.inputError]}
          onPress={() => toggleDropdown(fieldKey as string)}
          activeOpacity={0.75}
        >
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selectedObj?.label || (isFilter ? 'All Classes' : 'Select...')}
          </Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
        </TouchableOpacity>

        {isOpen && (
          <View style={[styles.dropdownListContainer, isFilter && { position: 'absolute', top: 50, left: 0, right: 0, zIndex: 100 }]}>
            <ScrollView nestedScrollEnabled style={styles.dropdownScroll} showsVerticalScrollIndicator={false}>
              {options.map((opt, index) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.dropdownItem, index !== options.length - 1 && styles.dropdownItemBorder, currentValue === opt.value && styles.dropdownItemActive]}
                  onPress={() => {
                    if (isFilter) {
                      handleClassFilterSelect(opt.value);
                    } else {
                      setFormData({ ...formData, [fieldKey]: opt.value });
                      setErrors({ ...errors, [fieldKey]: undefined });
                      setActiveDropdown(null);
                    }
                  }}
                >
                  <Text style={[styles.dropdownItemText, currentValue === opt.value && styles.dropdownItemTextActive]}>{opt.label}</Text>
                  {currentValue === opt.value && <Feather name="check" size={16} color={COLORS.secondary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        {!isFilter && errors[fieldKey as keyof Student] && <Text style={styles.errorText}>{errors[fieldKey as keyof Student]}</Text>}
      </View>
    );
  };

  const renderCard = ({ item }: { item: Student }) => {
    const classNameStr = typeof item.classId === 'object' ? item.classId?.className : item.classId;

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.classBadge}>
            <Feather name="monitor" size={12} color={COLORS.secondary} />
            <Text style={styles.classBadgeText} numberOfLines={1}>
              {classNameStr || 'N/A'} {item.section ? `(${item.section})` : ''}
            </Text>
          </View>
          <View style={styles.admissionBadge}>
            <Text style={styles.admissionText}>{item.admissionNo || 'No ID'}</Text>
          </View>
        </View>

        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
          </View>
          <View style={styles.nameContainer}>
            <Text style={styles.studentName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.rollText}>
              Roll: {item.rollNo || '-'} • {item.gender}
            </Text>
          </View>
        </View>

        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <View style={styles.detailLabelWrap}>
              <Feather name="user" size={14} color={COLORS.secondary} />
              <Text style={styles.detailLabel}>Guardian</Text>
            </View>
            <Text style={styles.detailValue} numberOfLines={1}>
              {item.guardianName}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLabelWrap}>
              <Feather name="phone" size={14} color={COLORS.success} />
              <Text style={styles.detailLabel}>Phone</Text>
            </View>
            <Text style={[styles.detailValue, { color: COLORS.success }]} numberOfLines={1}>
              {item.guardianMobile}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLabelWrap}>
              <Feather name="gift" size={14} color={COLORS.warning} />
              <Text style={styles.detailLabel}>DOB</Text>
            </View>
            <Text style={styles.detailValue} numberOfLines={1}>
              {item.dob || '-'}
            </Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.profileBtn}
            activeOpacity={0.85}
            onPress={() => {
              setViewingStudent(item);
              setViewVisible(true);
            }}
          >
            <Feather name="eye" size={14} color={COLORS.secondary} />
            <Text style={styles.profileBtnText}>Profile</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            {hasPermission('update') && (
              <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEditForm(item)}>
                <Feather name="edit-2" size={14} color={COLORS.info} />
              </TouchableOpacity>
            )}
            {hasPermission('delete') && (
              <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(item._id || item.id!)}>
                <Feather name="trash-2" size={14} color={COLORS.primary} />
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
        <View style={styles.headerIconWrap}>
          <Feather name="users" size={20} color={COLORS.secondary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            Students Directory
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Manage admissions, profiles & class assignments
          </Text>
        </View>
      </View>

      <View style={{ zIndex: 10 }}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <Feather name="search" size={16} color={COLORS.faint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search student..."
              placeholderTextColor={COLORS.faint}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
          </View>
          {renderInlineDropdown('classFilter', '', [{ label: 'All Classes', value: '' }, ...classes.map((c) => ({ label: c.className, value: c._id }))], true)}
        </View>

        <View style={styles.statsRow}>
          <Text style={styles.totalText}>{totalStudents} Students Found</Text>
          {hasPermission('create') && (
            <TouchableOpacity style={styles.addBtn} onPress={openAddForm} activeOpacity={0.9}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Add Student</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bulkActionsScroll}>
          <TouchableOpacity style={styles.bulkChipBtn} onPress={handleDownloadFormat} activeOpacity={0.85}>
            <Feather name="download" size={14} color={COLORS.success} />
            <Text style={[styles.bulkChipText, { color: COLORS.success }]}>Download Format</Text>
          </TouchableOpacity>
          {hasPermission('create') && (
            <TouchableOpacity style={styles.bulkChipBtn} onPress={() => setUploadModalVisible(true)} activeOpacity={0.85}>
              <Feather name="upload" size={14} color={COLORS.info} />
              <Text style={[styles.bulkChipText, { color: COLORS.info }]}>Upload Excel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.bulkChipBtn} onPress={handleExportExcel} activeOpacity={0.85}>
            <Feather name="file-text" size={14} color={COLORS.body} />
            <Text style={[styles.bulkChipText, { color: COLORS.body }]}>Export Excel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
          <Text style={styles.loadingText}>Loading students…</Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={(item, idx) => item._id || idx.toString()}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.secondary]} tintColor={COLORS.secondary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Feather name="users" size={26} color={COLORS.faint} />
              </View>
              <Text style={styles.emptyTitle}>No students found</Text>
              <Text style={styles.emptySub}>Try adjusting your search or class filter.</Text>
            </View>
          }
        />
      )}

      {/* Pagination Controls */}
      <View style={styles.paginationBar}>
        <Text style={styles.pageText}>
          Page {currentPage} of {totalPages}
        </Text>
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <TouchableOpacity
            style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
            disabled={currentPage === 1}
            onPress={() => fetchStudents(authToken, currentPage - 1, searchQuery, selectedClassFilter)}
          >
            <Feather name="chevron-left" size={18} color={currentPage === 1 ? COLORS.faint : COLORS.ink} />
          </TouchableOpacity>
          <View style={styles.pageIndicator}>
            <Text style={styles.pageIndicatorText}>{currentPage}</Text>
          </View>
          <TouchableOpacity
            style={[styles.pageBtn, currentPage >= totalPages && styles.pageBtnDisabled]}
            disabled={currentPage >= totalPages}
            onPress={() => fetchStudents(authToken, currentPage + 1, searchQuery, selectedClassFilter)}
          >
            <Feather name="chevron-right" size={18} color={currentPage >= totalPages ? COLORS.faint : COLORS.ink} />
          </TouchableOpacity>
        </View>
      </View>

      {/* --- ADD/EDIT FORM MODAL --- */}
      <Modal visible={isFormVisible} animationType="slide" onRequestClose={() => setFormVisible(false)}>
        <SafeAreaView style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{editingId ? 'Edit Student' : 'Add New Student'}</Text>
            <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={20} color={COLORS.body} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.formCard}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="user" size={13} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Basic Information</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>
                    Student Name <Text style={styles.asterisk}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, errors.name && styles.inputError]}
                    placeholder="e.g. Aarav Sharma"
                    placeholderTextColor={COLORS.faint}
                    value={formData.name}
                    onChangeText={(t) => {
                      setFormData({ ...formData, name: t.replace(/[^a-zA-Z\s]/g, '') });
                      setErrors({ ...errors, name: undefined });
                    }}
                  />
                  {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
                </View>

                {renderInlineDropdown('classId', 'Class *', classes.map((c) => ({ label: c.className, value: c._id })))}

                <View style={styles.row}>
                  <View style={[styles.inputWrapper, { flex: 1, marginRight: SPACING.md }]}>
                    <Text style={styles.inputLabel}>Admission Number</Text>
                    <TextInput style={styles.input} placeholder="e.g. ADM-001" placeholderTextColor={COLORS.faint} value={formData.admissionNo} onChangeText={(t) => setFormData({ ...formData, admissionNo: t })} />
                  </View>
                  <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Roll Number</Text>
                    <TextInput style={styles.input} placeholder="e.g. 101" placeholderTextColor={COLORS.faint} value={formData.rollNo} onChangeText={(t) => setFormData({ ...formData, rollNo: t })} />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputWrapper, { flex: 1, marginRight: SPACING.md }]}>
                    <Text style={styles.inputLabel}>Section</Text>
                    <TextInput style={styles.input} placeholder="e.g. A" placeholderTextColor={COLORS.faint} value={formData.section} onChangeText={(t) => setFormData({ ...formData, section: t })} />
                  </View>
                  <View style={{ flex: 1 }}>{renderInlineDropdown('gender', 'Gender', GENDERS.map((g) => ({ label: g, value: g })))}</View>
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputWrapper, { flex: 1, marginRight: SPACING.md }]}>
                    <Text style={styles.inputLabel}>Date of Birth</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.faint} value={formData.dob} onChangeText={(t) => setFormData({ ...formData, dob: t })} />
                  </View>
                  <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Nationality</Text>
                    <TextInput style={styles.input} placeholder="Indian" placeholderTextColor={COLORS.faint} value={formData.nationality} onChangeText={(t) => setFormData({ ...formData, nationality: t })} />
                  </View>
                </View>
              </View>

              <View style={styles.formCard}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="users" size={13} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Guardian Details</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>
                    Guardian Name <Text style={styles.asterisk}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, errors.guardianName && styles.inputError]}
                    placeholder="Full Name"
                    placeholderTextColor={COLORS.faint}
                    value={formData.guardianName}
                    onChangeText={(t) => {
                      setFormData({ ...formData, guardianName: t.replace(/[^a-zA-Z\s]/g, '') });
                      setErrors({ ...errors, guardianName: undefined });
                    }}
                  />
                  {errors.guardianName && <Text style={styles.errorText}>{errors.guardianName}</Text>}
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, { flex: 1, marginRight: SPACING.md }]}>
                    <Text style={styles.inputLabel}>
                      Mobile <Text style={styles.asterisk}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.input, errors.guardianMobile && styles.inputError]}
                      placeholder="10 Digits"
                      placeholderTextColor={COLORS.faint}
                      keyboardType="numeric"
                      maxLength={10}
                      value={formData.guardianMobile}
                      onChangeText={(t) => {
                        setFormData({ ...formData, guardianMobile: t.replace(/[^0-9]/g, '') });
                        setErrors({ ...errors, guardianMobile: undefined });
                      }}
                    />
                    {errors.guardianMobile && <Text style={styles.errorText}>{errors.guardianMobile}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>{renderInlineDropdown('relationWithStudent', 'Relation', RELATIONS.map((r) => ({ label: r, value: r })))}</View>
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Profession</Text>
                  <TextInput style={styles.input} placeholder="e.g. Business" placeholderTextColor={COLORS.faint} value={formData.guardianProfession} onChangeText={(t) => setFormData({ ...formData, guardianProfession: t })} />
                </View>
              </View>

              <View style={styles.formCard}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="map-pin" size={13} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Address Info</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Full Address</Text>
                  <TextInput style={styles.input} placeholder="Street / Colony" placeholderTextColor={COLORS.faint} value={formData.address} onChangeText={(t) => setFormData({ ...formData, address: t })} />
                </View>
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, { flex: 1, marginRight: SPACING.md }]}>
                    <Text style={styles.inputLabel}>City</Text>
                    <TextInput style={styles.input} placeholderTextColor={COLORS.faint} value={formData.city} onChangeText={(t) => setFormData({ ...formData, city: t })} />
                  </View>
                  <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>State</Text>
                    <TextInput style={styles.input} placeholderTextColor={COLORS.faint} value={formData.state} onChangeText={(t) => setFormData({ ...formData, state: t })} />
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave} activeOpacity={0.9}>
                <Feather name="check" size={16} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.saveBtnFullText}>{editingId ? 'Update Student Profile' : 'Register Student'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* --- VIEW PROFILE MODAL --- */}
      <Modal visible={isViewVisible} transparent animationType="fade" onRequestClose={() => setViewVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.viewModalContainer}>
            <View style={styles.viewHeaderBlue}>
              <View style={styles.viewAvatar}>
                <Text style={styles.viewAvatarText}>{viewingStudent?.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: SPACING.lg, minWidth: 0 }}>
                <Text style={styles.viewName} numberOfLines={1}>
                  {viewingStudent?.name}
                </Text>
                <Text style={styles.viewSub} numberOfLines={1}>
                  {typeof viewingStudent?.classId === 'object' ? viewingStudent.classId.className : viewingStudent?.classId}{' '}
                  {viewingStudent?.section ? `(${viewingStudent.section})` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setViewVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: SPACING.xl }} showsVerticalScrollIndicator={false}>
              <View style={styles.viewRow}>
                <View style={styles.viewBox}>
                  <Text style={styles.viewLabel}>Admission No</Text>
                  <Text style={styles.viewVal}>{viewingStudent?.admissionNo || '-'}</Text>
                </View>
                <View style={styles.viewBox}>
                  <Text style={styles.viewLabel}>Roll Number</Text>
                  <Text style={styles.viewVal}>{viewingStudent?.rollNo || '-'}</Text>
                </View>
              </View>
              <View style={styles.viewRow}>
                <View style={styles.viewBox}>
                  <Text style={styles.viewLabel}>Gender</Text>
                  <Text style={styles.viewVal}>{viewingStudent?.gender}</Text>
                </View>
                <View style={styles.viewBox}>
                  <Text style={styles.viewLabel}>Date of Birth</Text>
                  <Text style={styles.viewVal}>{viewingStudent?.dob || '-'}</Text>
                </View>
              </View>

              <Text style={styles.sectionHeaderBlue}>Guardian Information</Text>
              <View style={styles.viewDetailsBox}>
                <Text style={styles.viewLine}>
                  <Text style={styles.viewLabelBold}>{viewingStudent?.relationWithStudent}: </Text>
                  {viewingStudent?.guardianName}
                </Text>
                <Text style={styles.viewLine}>
                  <Text style={styles.viewLabelBold}>Mobile: </Text>
                  {viewingStudent?.guardianMobile}
                </Text>
                <Text style={[styles.viewLine, { marginBottom: 0 }]}>
                  <Text style={styles.viewLabelBold}>Profession: </Text>
                  {viewingStudent?.guardianProfession || '-'}
                </Text>
              </View>

              <Text style={styles.sectionHeaderBlue}>Address Details</Text>
              <View style={[styles.viewDetailsBox, { marginBottom: SPACING.xl }]}>
                <Text style={styles.viewText}>{viewingStudent?.address}</Text>
                <Text style={styles.viewText}>
                  {viewingStudent?.city}, {viewingStudent?.state} - {viewingStudent?.pincode}
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* --- EXCEL UPLOAD MODAL --- */}
      <Modal visible={uploadModalVisible} transparent animationType="fade" onRequestClose={() => setUploadModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.uploadBox}>
            <View style={styles.uploadHeader}>
              <Text style={styles.uploadTitle}>Bulk Upload Students</Text>
              <TouchableOpacity onPress={() => setUploadModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.dragDropZone} onPress={handleUploadExcel} disabled={isUploading} activeOpacity={0.85}>
              {isUploading ? (
                <ActivityIndicator size="large" color={COLORS.secondary} />
              ) : (
                <>
                  <View style={styles.uploadIconCircle}>
                    <Feather name="upload-cloud" size={28} color={COLORS.secondary} />
                  </View>
                  <Text style={styles.dragText}>Select Excel File</Text>
                  <Text style={styles.dragSubText}>.xls or .xlsx, matching the downloaded template</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: SPACING.md, color: COLORS.muted, fontSize: FONT.small, fontWeight: '600' },

  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.xl, paddingBottom: SPACING.lg, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  headerIconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.secondarySoft, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  title: { fontSize: FONT.h1, fontWeight: '800', color: COLORS.ink },
  subtitle: { fontSize: FONT.tiny, color: COLORS.faint, marginTop: 2 },

  searchRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, alignItems: 'center' },
  searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: TOUCH_TARGET + 2, ...SHADOW.card },
  searchInput: { flex: 1, marginLeft: SPACING.sm, fontSize: FONT.body, color: COLORS.ink },
  filterDropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: TOUCH_TARGET + 2, ...SHADOW.card },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  totalText: { fontSize: FONT.h3, fontWeight: '800', color: COLORS.ink },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: SPACING.lg, height: TOUCH_TARGET, borderRadius: RADIUS.sm, ...SHADOW.button },
  addBtnText: { color: '#fff', fontSize: FONT.small, fontWeight: '700', marginLeft: 6 },

  bulkActionsScroll: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.sm },
  bulkChipBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, gap: 6, ...SHADOW.card },
  bulkChipText: { fontSize: FONT.small, fontWeight: '600' },

  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderSoft, borderTopWidth: 4, borderTopColor: COLORS.secondary, ...SHADOW.card },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md, alignItems: 'center', gap: SPACING.sm },
  classBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  classBadgeText: { color: COLORS.secondary, fontSize: FONT.small, fontWeight: '800' },
  admissionBadge: { backgroundColor: COLORS.background, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.border },
  admissionText: { fontSize: FONT.tiny, color: COLORS.body, fontWeight: '700' },

  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.secondary, justifyContent: 'center', alignItems: 'center', ...SHADOW.card },
  avatarText: { fontSize: FONT.h1, fontWeight: '800', color: '#fff' },
  nameContainer: { marginLeft: SPACING.md, flex: 1, minWidth: 0 },
  studentName: { fontSize: FONT.h2, fontWeight: '800', color: COLORS.ink },
  rollText: { fontSize: FONT.small, color: COLORS.muted, marginTop: 2, fontWeight: '500' },

  detailsContainer: { backgroundColor: COLORS.background, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderSoft, marginBottom: SPACING.lg },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 6 },
  detailLabelWrap: { flexDirection: 'row', alignItems: 'center', width: 90 },
  detailLabel: { fontSize: FONT.tiny, color: COLORS.muted, marginLeft: 6, fontWeight: '500' },
  detailValue: { fontSize: FONT.small, color: COLORS.ink, fontWeight: '700', flex: 1, textAlign: 'right' },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.borderSoft, paddingTop: SPACING.lg },
  profileBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.secondary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, gap: 6 },
  profileBtnText: { color: COLORS.secondary, fontSize: FONT.small, fontWeight: '700' },
  iconBtnEdit: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.infoSoft, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.infoSoftBorder },
  iconBtnDelete: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.primarySoftBorder },

  emptyState: { alignItems: 'center', padding: SPACING.xxl, marginTop: SPACING.lg },
  emptyIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft },
  emptyTitle: { fontSize: FONT.h3, fontWeight: '800', color: COLORS.ink },
  emptySub: { fontSize: FONT.small, color: COLORS.muted, marginTop: 4, textAlign: 'center' },

  paginationBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  pageText: { fontSize: FONT.small, color: COLORS.body, fontWeight: '600' },
  pageBtn: { width: TOUCH_TARGET - 8, height: TOUCH_TARGET - 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xs, backgroundColor: COLORS.background },
  pageBtnDisabled: { opacity: 0.4 },
  pageIndicator: { height: TOUCH_TARGET - 8, paddingHorizontal: SPACING.lg, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: RADIUS.xs, ...SHADOW.card },
  pageIndicatorText: { color: '#fff', fontWeight: 'bold', fontSize: FONT.small },

  formContainer: { flex: 1, backgroundColor: COLORS.background },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.xl, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, ...SHADOW.card },
  formTitle: { fontSize: FONT.h1, fontWeight: '800', color: COLORS.ink },
  closeBtnIcon: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.borderSoft, borderRadius: 18 },
  formScroll: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  formCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.lg },
  sectionTitle: { fontSize: FONT.small, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.4 },

  inputWrapper: { marginBottom: SPACING.md },
  inputLabel: { fontSize: FONT.small, fontWeight: '700', color: COLORS.body, marginBottom: 6, marginLeft: 2 },
  asterisk: { color: COLORS.primary },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: TOUCH_TARGET + 4, backgroundColor: COLORS.background, fontSize: FONT.body, color: COLORS.ink },
  inputError: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  errorText: { color: COLORS.primary, fontSize: FONT.tiny, marginTop: 4, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: TOUCH_TARGET + 4, backgroundColor: COLORS.background },
  dropdownHeaderActive: { borderColor: COLORS.primary },
  dropdownSelectedText: { color: COLORS.ink, fontSize: FONT.body, fontWeight: '500' },
  dropdownPlaceholder: { color: COLORS.faint, fontSize: FONT.body },
  dropdownListContainer: { marginTop: 4, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, overflow: 'hidden', ...SHADOW.raised },
  dropdownScroll: { maxHeight: 160 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.md, paddingHorizontal: SPACING.md },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  dropdownItemActive: { backgroundColor: COLORS.secondarySoft },
  dropdownItemText: { fontSize: FONT.body, color: COLORS.body },
  dropdownItemTextActive: { color: COLORS.secondary, fontWeight: '700' },

  saveBtnFull: { flexDirection: 'row', backgroundColor: COLORS.primary, height: 56, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xs, ...SHADOW.button },
  saveBtnFullText: { color: '#fff', fontSize: FONT.h3, fontWeight: '800' },

  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  viewModalContainer: { backgroundColor: COLORS.background, width: '100%', maxWidth: 650, borderRadius: RADIUS.xl, maxHeight: '85%', overflow: 'hidden', ...SHADOW.raised },
  viewHeaderBlue: { backgroundColor: COLORS.secondary, padding: SPACING.xl, flexDirection: 'row', alignItems: 'center' },
  viewAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', ...SHADOW.raised },
  viewAvatarText: { fontSize: FONT.h1, fontWeight: '800', color: COLORS.secondary },
  viewName: { fontSize: FONT.h1, fontWeight: '800', color: '#fff', marginBottom: 4 },
  viewSub: { fontSize: FONT.small, color: '#EFF6FF', fontWeight: '600' },

  viewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md, gap: SPACING.sm },
  viewBox: { flex: 1, backgroundColor: COLORS.surface, padding: SPACING.md, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  viewLabel: { fontSize: FONT.tiny, color: COLORS.muted, textTransform: 'uppercase', fontWeight: '700' },
  viewVal: { fontSize: FONT.body, color: COLORS.ink, fontWeight: '700', marginTop: 4 },
  sectionHeaderBlue: { fontSize: FONT.small, fontWeight: '800', color: COLORS.secondary, marginTop: SPACING.lg, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  viewDetailsBox: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  viewLine: { fontSize: FONT.body, color: COLORS.body, marginBottom: SPACING.sm },
  viewLabelBold: { fontWeight: '700', color: COLORS.muted },
  viewText: { fontSize: FONT.body, color: COLORS.body, lineHeight: 22, fontWeight: '500' },

  uploadBox: { backgroundColor: COLORS.surface, width: '100%', maxWidth: 480, borderRadius: RADIUS.xl, padding: SPACING.xl, ...SHADOW.raised },
  uploadHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
  uploadTitle: { fontSize: FONT.h2, fontWeight: '800', color: COLORS.ink },
  dragDropZone: { borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: RADIUS.lg, padding: SPACING.xxl, alignItems: 'center', backgroundColor: COLORS.background },
  uploadIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.secondarySoft, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md },
  dragText: { fontSize: FONT.h3, fontWeight: '700', color: COLORS.secondary },
  dragSubText: { fontSize: FONT.tiny, color: COLORS.muted, marginTop: 4, textAlign: 'center' },
});