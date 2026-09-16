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
  Image,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import DocumentPicker from '@react-native-documents/picker';
import { launchImageLibrary } from 'react-native-image-picker';
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
  division?: string;
}

interface SchoolObj {
  _id: string;
  name: string;
}

interface Student {
  _id?: string;
  id?: string;
  name: string;
  photo?: string;
  admissionNo: string;
  rollNo: string;
  schoolId?: string | any;
  classId: string | any;
  division: string;
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
  street: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
}

const initialFormState: Student = {
  name: '',
  photo: '',
  admissionNo: '',
  rollNo: '',
  schoolId: '',
  classId: '',
  division: '',
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
  street: '',
  address: '',
  city: '',
  state: '',
  country: 'India',
  pincode: '',
};

interface RegisterForm {
  name: string;
  email: string;
  password: string;
  schoolId: string;
  classId: string;
  admissionNo: string;
  rollNo: string;
  gender: string;
  guardianName: string;
  guardianMobile: string;
}

const initialRegisterState: RegisterForm = {
  name: '',
  email: '',
  password: '',
  schoolId: '',
  classId: '',
  admissionNo: '',
  rollNo: '',
  gender: 'Male',
  guardianName: '',
  guardianMobile: '',
};

// --- Helpers ---
const getPhotoUrl = (photoPath?: string | null): string | null => {
  if (!photoPath || photoPath === 'undefined' || photoPath === 'null') return null;
  if (
    photoPath.startsWith('http://') ||
    photoPath.startsWith('https://') ||
    photoPath.startsWith('data:') ||
    photoPath.startsWith('file:') ||
    photoPath.startsWith('content:')
  ) {
    return photoPath;
  }
  const baseUrl = API_BASE.replace(/\/api\/?$/, '');
  return `${baseUrl}${photoPath.startsWith('/') ? '' : '/'}${photoPath}`;
};

// --- Student Avatar (photo or initials fallback) ---
const StudentAvatar = ({ photo, name, size = 44 }: { photo?: string; name: string; size?: number }) => {
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    setImgErr(false);
  }, [photo]);

  const initial = name ? name.trim().charAt(0).toUpperCase() : 'S';
  const photoUrl = getPhotoUrl(photo);

  if (photoUrl && !imgErr) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setImgErr(true)}
      />
    );
  }

  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarFallbackText, { fontSize: size <= 40 ? FONT.h3 : FONT.h1 }]}>{initial}</Text>
    </View>
  );
};

export default function StudentsScreen() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassObj[]>([]);
  const [schools, setSchools] = useState<SchoolObj[]>([]);
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [isRegisterVisible, setRegisterVisible] = useState(false);
  const [registerData, setRegisterData] = useState<RegisterForm>(initialRegisterState);
  const [registerErrors, setRegisterErrors] = useState<Partial<RegisterForm>>({});
  const [registering, setRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [registeredCredentials, setRegisteredCredentials] = useState<{ name: string; email: string; password: string } | null>(null);

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
    const superAdmin = superAdminRaw === 'true';

    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdmin);
    setAuthToken(token);

    // schoolId may be stored directly, or nested inside a saved user profile —
    // fall back gracefully depending on how your auth flow persists it.
    let resolvedSchoolId = await AsyncStorage.getItem('schoolId');
    if (!resolvedSchoolId) {
      const userDataRaw = await AsyncStorage.getItem('userData');
      if (userDataRaw) {
        try {
          const parsed = JSON.parse(userDataRaw);
          resolvedSchoolId = parsed?.schoolId || parsed?.school?._id || null;
        } catch (e) {
          resolvedSchoolId = null;
        }
      }
    }
    setSchoolId(resolvedSchoolId);

    fetchClasses(token);
    fetchStudents(token, 1, '', '');

    if (superAdmin) {
      fetchSchools(token);
    }
  };

  const fetchClasses = async (token: string | null) => {
    try {
      const res = await axios.get(`${API_BASE}/classes`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) setClasses(res.data.data || []);
    } catch (e) {
      console.warn('Could not load classes');
    }
  };

  const fetchSchools = async (token: string | null) => {
    try {
      const res = await axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) setSchools(res.data.data || []);
    } catch (e) {
      console.warn('Could not load schools');
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
    (action: 'create' | 'read' | 'update' | 'delete') => {
      if (isSuperAdmin) return true;
      return permissions.some(
        (p) => p.module === 'students' && (p.action === action || p.action === `${action}Own`)
      );
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
      ...initialFormState,
      ...student,
      schoolId: typeof student.schoolId === 'object' ? student.schoolId?._id : student.schoolId,
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
    if (isSuperAdmin && !formData.schoolId) {
      newErrors.schoolId = 'Required';
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
      // Super admins explicitly pick the school via the dropdown; every other
      // role is locked to the schoolId resolved from their own login.
      const payload = {
        ...formData,
        schoolId: isSuperAdmin ? formData.schoolId : schoolId || undefined,
      };

      if (editingId) {
        await axios.put(`${API_BASE}/students/${editingId}`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert('Success', 'Student profile updated.');
      } else {
        await axios.post(`${API_BASE}/students`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert('Success', 'Student registered successfully.');
      }
      setFormVisible(false);
      fetchStudents(authToken, currentPage, searchQuery, selectedClassFilter, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save student.');
    }
  };

  // --- Photo Upload ---
  const handlePickPhoto = () => {
    launchImageLibrary({ mediaType: 'photo', quality: 0.7, includeBase64: false }, async (response) => {
      if (response.didCancel || response.errorCode || !response.assets?.[0]) return;
      const asset = response.assets[0];

      // Instant local preview
      setFormData((prev) => ({ ...prev, photo: asset.uri || '' }));

      try {
        setUploadingPhoto(true);
        const uploadData = new FormData();
        uploadData.append('file', {
          uri: asset.uri,
          type: asset.type || 'image/jpeg',
          name: asset.fileName || `photo_${Date.now()}.jpg`,
        } as any);

        const res = await axios.post(`${API_BASE}/upload`, uploadData, {
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'multipart/form-data' },
        });

        const photoUrl = res.data?.filePath || res.data?.url;
        if (photoUrl) {
          setFormData((prev) => ({ ...prev, photo: photoUrl }));
        }
      } catch (err) {
        console.error('Photo upload failed', err);
        Alert.alert('Error', 'Failed to upload photo.');
      } finally {
        setUploadingPhoto(false);
      }
    });
  };

  // --- Register Student (User + Student, with login) ---
  const openRegisterForm = () => {
    setRegisterData(initialRegisterState);
    setRegisterErrors({});
    setShowPassword(false);
    setActiveDropdown(null);
    setRegisterVisible(true);
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < 8; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    setRegisterData((prev) => ({ ...prev, password: pass }));
    setRegisterErrors((prev) => ({ ...prev, password: undefined }));
    setShowPassword(true);
  };

  const validateRegisterForm = () => {
    let isValid = true;
    const newErrors: Partial<RegisterForm> = {};

    if (!registerData.name.trim()) {
      newErrors.name = 'Required';
      isValid = false;
    }
    if (!registerData.email.trim()) {
      newErrors.email = 'Required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerData.email.trim())) {
      newErrors.email = 'Enter a valid email';
      isValid = false;
    }
    if (!registerData.password || registerData.password.length < 6) {
      newErrors.password = 'Min 6 characters';
      isValid = false;
    }
    if (isSuperAdmin && !registerData.schoolId) {
      newErrors.schoolId = 'Required';
      isValid = false;
    }
    if (!registerData.classId) {
      newErrors.classId = 'Required';
      isValid = false;
    }
    if (!registerData.guardianName.trim()) {
      newErrors.guardianName = 'Required';
      isValid = false;
    }
    if (!registerData.guardianMobile || registerData.guardianMobile.length < 10) {
      newErrors.guardianMobile = '10 Digits min';
      isValid = false;
    }

    setRegisterErrors(newErrors);
    return isValid;
  };

  const handleRegisterStudent = async () => {
    if (!validateRegisterForm()) return;
    try {
      setRegistering(true);
      const email = registerData.email.trim().toLowerCase();
      // Super admins choose the school explicitly; everyone else is scoped
      // to their own resolved schoolId — no picker, no ambiguity.
      const resolvedSchoolId = isSuperAdmin ? registerData.schoolId : schoolId || undefined;
      const payload = {
        name: registerData.name.trim(),
        email,
        password: registerData.password,
        classId: registerData.classId,
        schoolId: resolvedSchoolId,
        admissionNo: registerData.admissionNo,
        rollNo: registerData.rollNo,
        gender: registerData.gender,
        guardianName: registerData.guardianName.trim(),
        guardianMobile: registerData.guardianMobile,
      };

      await axios.post(`${API_BASE}/auth/register/student`, payload, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      setRegisterVisible(false);
      setRegisteredCredentials({ name: payload.name, email, password: registerData.password });
      fetchStudents(authToken, currentPage, searchQuery, selectedClassFilter, true);
    } catch (e: any) {
      Alert.alert('Registration Failed', e.response?.data?.message || 'Could not register this student. Please check the details and try again.');
    } finally {
      setRegistering(false);
    }
  };

  const handleShareCredentials = () => {
    if (!registeredCredentials) return;
    Share.share({
      message: `Student Login Details\n\nName: ${registeredCredentials.name}\nLogin Email: ${registeredCredentials.email}\nPassword: ${registeredCredentials.password}\n\nPlease change your password after the first login.`,
    }).catch(() => {});
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

      const response = await axios.post(`${API_BASE}/students/bulk`, uploadData, {
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'multipart/form-data' },
      });

      if (response.data?.success) {
        const insertedCount = response.data.insertedCount || response.data.data?.insertedCount || 0;
        const skippedDuplicates = response.data.data?.skippedDuplicates || response.data.skippedDuplicates || [];
        const errorsList = response.data.data?.errors || response.data.errors || [];

        let msg = `Successfully imported ${insertedCount} student record${insertedCount === 1 ? '' : 's'}.`;
        if (skippedDuplicates.length > 0) {
          msg += `\n\nSkipped ${skippedDuplicates.length} duplicate${skippedDuplicates.length === 1 ? '' : 's'}.`;
        }
        if (errorsList.length > 0) {
          const errDetails = errorsList
            .slice(0, 3)
            .map((e: any) => (typeof e === 'object' ? `Row #${e.row}: ${e.reason}` : e))
            .join('\n');
          msg += `\n\nErrors:\n${errDetails}${errorsList.length > 3 ? '\n...' : ''}`;
        }

        Alert.alert(insertedCount > 0 ? 'Import Complete' : 'Import Warning', msg);
      } else {
        Alert.alert('Upload Complete', 'Students uploaded successfully!');
      }

      setUploadModalVisible(false);
      onRefresh();
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) {
        Alert.alert('Upload Error', err.response?.data?.message || 'Failed to upload file. Please check file formatting.');
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
              {classNameStr || 'N/A'} {item.division ? `(${item.division})` : ''}
            </Text>
          </View>
          <View style={styles.admissionBadge}>
            <Text style={styles.admissionText}>{item.admissionNo || 'No ID'}</Text>
          </View>
        </View>

        <View style={styles.profileRow}>
          <StudentAvatar photo={item.photo} name={item.name} size={48} />
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
        <View style={styles.headerLeft}>
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

        <View style={styles.headerActions}>
  <TouchableOpacity
    style={styles.headerRegisterBtn}
    onPress={openRegisterForm}
    activeOpacity={0.9}
  >
    <Feather name="user-check" size={14} color={COLORS.secondary} />
    <Text style={styles.headerRegisterBtnText}>Register</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={styles.headerAddBtn}
    onPress={openAddForm}
    activeOpacity={0.9}
  >
    <Feather name="plus" size={15} color="#fff" />
    <Text style={styles.headerAddBtnText}>Add Student</Text>
  </TouchableOpacity>
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
          {renderInlineDropdown(
            'classFilter',
            '',
            [
              { label: 'All Classes', value: '' },
              ...classes.map((c) => ({ label: c.division ? `${c.className} – ${c.division}` : c.className, value: c._id })),
            ],
            true
          )}
        </View>

        <View style={styles.statsRow}>
          <Text style={styles.totalText}>{totalStudents} Students Found</Text>
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

      <Modal visible={isFormVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.formModalCard}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingId ? 'Edit Student' : 'Add New Student'}</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={COLORS.body} />
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
<ScrollView
  style={{ flex: 1 }}
  contentContainerStyle={styles.formScroll}
  keyboardShouldPersistTaps="handled"
  showsVerticalScrollIndicator={false}
>              <View style={styles.formCard}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="user" size={13} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Basic Information</Text>
                </View>

                {/* Student Photo Upload */}
                <View style={styles.photoUploadWrap}>
                  <View style={{ position: 'relative' }}>
                    <StudentAvatar photo={formData.photo} name={formData.name || 'S'} size={78} />
                    <TouchableOpacity style={styles.photoCameraBtn} onPress={handlePickPhoto} disabled={uploadingPhoto}>
                      {uploadingPhoto ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Feather name="camera" size={13} color="#fff" />
                      )}
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.photoHint}>Tap the camera icon to upload photo</Text>
                </View>

                {isSuperAdmin &&
                  renderInlineDropdown(
                    'schoolId',
                    'School *',
                    schools.map((s) => ({ label: s.name, value: s._id }))
                  )}

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

                {renderInlineDropdown(
                  'classId',
                  'Class *',
                  classes.map((c) => ({ label: c.division ? `${c.className} – ${c.division}` : c.className, value: c._id }))
                )}

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
                    <Text style={styles.inputLabel}>Section / Division</Text>
                    <TextInput style={styles.input} placeholder="e.g. A" placeholderTextColor={COLORS.faint} value={formData.division} onChangeText={(t) => setFormData({ ...formData, division: t })} />
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

                <View style={styles.row}>
                  <View style={[styles.inputWrapper, { flex: 1, marginRight: SPACING.md }]}>
                    <Text style={styles.inputLabel}>Religion</Text>
                    <TextInput style={styles.input} placeholder="e.g. Hindu" placeholderTextColor={COLORS.faint} value={formData.religion} onChangeText={(t) => setFormData({ ...formData, religion: t })} />
                  </View>
                  <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Caste / Category</Text>
                    <TextInput style={styles.input} placeholder="e.g. General" placeholderTextColor={COLORS.faint} value={formData.caste} onChangeText={(t) => setFormData({ ...formData, caste: t })} />
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
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, { flex: 1, marginRight: SPACING.md }]}>
                    <Text style={styles.inputLabel}>Guardian DOB</Text>
                    <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.faint} value={formData.guardianDOB} onChangeText={(t) => setFormData({ ...formData, guardianDOB: t })} />
                  </View>
                  <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Education</Text>
                    <TextInput style={styles.input} placeholder="e.g. Graduate" placeholderTextColor={COLORS.faint} value={formData.guardianEducation} onChangeText={(t) => setFormData({ ...formData, guardianEducation: t })} />
                  </View>
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
                  <Text style={styles.inputLabel}>Street / Locality</Text>
                  <TextInput style={styles.input} placeholder="Street / Colony" placeholderTextColor={COLORS.faint} value={formData.street} onChangeText={(t) => setFormData({ ...formData, street: t })} />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Full Address</Text>
                  <TextInput style={styles.input} placeholder="House No / Building" placeholderTextColor={COLORS.faint} value={formData.address} onChangeText={(t) => setFormData({ ...formData, address: t })} />
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
                <View style={styles.row}>
                  <View style={[styles.inputWrapper, { flex: 1, marginRight: SPACING.md }]}>
                    <Text style={styles.inputLabel}>Country</Text>
                    <TextInput style={styles.input} placeholderTextColor={COLORS.faint} value={formData.country} onChangeText={(t) => setFormData({ ...formData, country: t })} />
                  </View>
                  <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Pincode</Text>
                    <TextInput style={styles.input} keyboardType="numeric" placeholderTextColor={COLORS.faint} value={formData.pincode} onChangeText={(t) => setFormData({ ...formData, pincode: t })} />
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave} activeOpacity={0.9}>
                <Feather name="check" size={16} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.saveBtnFullText}>{editingId ? 'Update Student Profile' : 'Register Student'}</Text>
              </TouchableOpacity>
            </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>

      {/* --- VIEW PROFILE MODAL --- */}
      <Modal visible={isViewVisible} transparent animationType="fade" onRequestClose={() => setViewVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.viewModalContainer}>
            <View style={styles.viewHeaderBlue}>
              <StudentAvatar photo={viewingStudent?.photo} name={viewingStudent?.name || 'S'} size={60} />
              <View style={{ flex: 1, marginLeft: SPACING.lg, minWidth: 0 }}>
                <Text style={styles.viewName} numberOfLines={1}>
                  {viewingStudent?.name}
                </Text>
                <Text style={styles.viewSub} numberOfLines={1}>
                  {typeof viewingStudent?.classId === 'object' ? viewingStudent.classId.className : viewingStudent?.classId}{' '}
                  {viewingStudent?.division ? `(${viewingStudent.division})` : ''}
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

              <Text style={styles.sectionHeaderBlue}>Personal Details</Text>
              <View style={styles.viewDetailsBox}>
                <Text style={styles.viewLine}>
                  <Text style={styles.viewLabelBold}>Nationality: </Text>
                  {viewingStudent?.nationality || '-'}
                </Text>
                <Text style={styles.viewLine}>
                  <Text style={styles.viewLabelBold}>Religion: </Text>
                  {viewingStudent?.religion || '-'}
                </Text>
                <Text style={[styles.viewLine, { marginBottom: 0 }]}>
                  <Text style={styles.viewLabelBold}>Caste / Category: </Text>
                  {viewingStudent?.caste || '-'}
                </Text>
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
                <Text style={styles.viewLine}>
                  <Text style={styles.viewLabelBold}>DOB: </Text>
                  {viewingStudent?.guardianDOB || '-'}
                </Text>
                <Text style={styles.viewLine}>
                  <Text style={styles.viewLabelBold}>Education: </Text>
                  {viewingStudent?.guardianEducation || '-'}
                </Text>
                <Text style={[styles.viewLine, { marginBottom: 0 }]}>
                  <Text style={styles.viewLabelBold}>Profession: </Text>
                  {viewingStudent?.guardianProfession || '-'}
                </Text>
              </View>

              <Text style={styles.sectionHeaderBlue}>Address Details</Text>
              <View style={[styles.viewDetailsBox, { marginBottom: SPACING.xl }]}>
                {!!viewingStudent?.street && <Text style={styles.viewText}>{viewingStudent.street}</Text>}
                <Text style={styles.viewText}>{viewingStudent?.address}</Text>
                <Text style={styles.viewText}>
                  {viewingStudent?.city}, {viewingStudent?.state}, {viewingStudent?.country} - {viewingStudent?.pincode}
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

      <Modal visible={isRegisterVisible} transparent animationType="fade" onRequestClose={() => setRegisterVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.formModalCard}>
            <View style={[styles.formHeader, styles.registerHeader]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1, minWidth: 0 }}>
                <View style={styles.registerHeaderIcon}>
                  <Feather name="user-check" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.formTitle, { color: '#fff' }]}>Register Student</Text>
                  <Text style={styles.registerHeaderSub}>Creates a login account for the student portal</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setRegisterVisible(false)} style={styles.closeBtnIconLight} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.registerInfoBanner}>
                <Feather name="info" size={16} color={COLORS.secondary} />
                <Text style={styles.registerInfoText}>
                  This creates a student login in addition to the profile record, so the student can sign in to the app using the email and password below. Use "Add Student" instead if you only need an
                  admin-side record without portal access.
                </Text>
              </View>

              <View style={styles.formCard}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="key" size={13} color={COLORS.secondary} />
                  <Text style={[styles.sectionTitle, { color: COLORS.secondary }]}>Login Credentials</Text>
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>
                    Login Email <Text style={styles.asterisk}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, registerErrors.email && styles.inputError]}
                    placeholder="student@example.com"
                    placeholderTextColor={COLORS.faint}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={registerData.email}
                    onChangeText={(t) => {
                      setRegisterData({ ...registerData, email: t });
                      setRegisterErrors({ ...registerErrors, email: undefined });
                    }}
                  />
                  {registerErrors.email && <Text style={styles.errorText}>{registerErrors.email}</Text>}
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>
                    Password <Text style={styles.asterisk}>*</Text>
                  </Text>
                  <View style={{ position: 'relative', justifyContent: 'center' }}>
                    <TextInput
                      style={[styles.input, styles.passwordInputField, registerErrors.password && styles.inputError]}
                      placeholder="Minimum 6 characters"
                      placeholderTextColor={COLORS.faint}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      value={registerData.password}
                      onChangeText={(t) => {
                        setRegisterData({ ...registerData, password: t });
                        setRegisterErrors({ ...registerErrors, password: undefined });
                      }}
                    />
                    <TouchableOpacity style={styles.passwordEyeBtn} onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name={showPassword ? 'eye-off' : 'eye'} size={17} color={COLORS.muted} />
                    </TouchableOpacity>
                  </View>
                  {registerErrors.password && <Text style={styles.errorText}>{registerErrors.password}</Text>}
                  <TouchableOpacity style={styles.generateBtn} onPress={generatePassword} activeOpacity={0.7}>
                    <Feather name="refresh-cw" size={12} color={COLORS.secondary} />
                    <Text style={styles.generateBtnText}>Generate strong password</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formCard}>
                <View style={styles.sectionTitleRow}>
                  <Feather name="user" size={13} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Student Information</Text>
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>
                    Student Name <Text style={styles.asterisk}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, registerErrors.name && styles.inputError]}
                    placeholder="e.g. Priya Patel"
                    placeholderTextColor={COLORS.faint}
                    value={registerData.name}
                    onChangeText={(t) => {
                      setRegisterData({ ...registerData, name: t.replace(/[^a-zA-Z\s]/g, '') });
                      setRegisterErrors({ ...registerErrors, name: undefined });
                    }}
                  />
                  {registerErrors.name && <Text style={styles.errorText}>{registerErrors.name}</Text>}
                </View>

                {/* Same rule as the Add/Edit form: only super admins pick a
                    school here — regular users are pinned to their own. */}
                {isSuperAdmin && (
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>
                      School <Text style={styles.asterisk}>*</Text>
                    </Text>
                    <TouchableOpacity
                      style={[styles.dropdownHeader, activeDropdown === 'registerSchoolId' && styles.dropdownHeaderActive, registerErrors.schoolId && styles.inputError]}
                      onPress={() => toggleDropdown('registerSchoolId')}
                      activeOpacity={0.75}
                    >
                      <Text style={registerData.schoolId ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
                        {schools.find((s) => s._id === registerData.schoolId)?.name || 'Select...'}
                      </Text>
                      <Feather name={activeDropdown === 'registerSchoolId' ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
                    </TouchableOpacity>
                    {activeDropdown === 'registerSchoolId' && (
                      <View style={styles.dropdownListContainer}>
                        <ScrollView nestedScrollEnabled style={styles.dropdownScroll} showsVerticalScrollIndicator={false}>
                          {schools.map((s, index) => (
                            <TouchableOpacity
                              key={s._id}
                              style={[styles.dropdownItem, index !== schools.length - 1 && styles.dropdownItemBorder, registerData.schoolId === s._id && styles.dropdownItemActive]}
                              onPress={() => {
                                setRegisterData({ ...registerData, schoolId: s._id });
                                setRegisterErrors({ ...registerErrors, schoolId: undefined });
                                setActiveDropdown(null);
                              }}
                            >
                              <Text style={[styles.dropdownItemText, registerData.schoolId === s._id && styles.dropdownItemTextActive]}>{s.name}</Text>
                              {registerData.schoolId === s._id && <Feather name="check" size={16} color={COLORS.secondary} />}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                    {registerErrors.schoolId && <Text style={styles.errorText}>{registerErrors.schoolId}</Text>}
                  </View>
                )}

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>
                    Class <Text style={styles.asterisk}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={[styles.dropdownHeader, activeDropdown === 'registerClassId' && styles.dropdownHeaderActive, registerErrors.classId && styles.inputError]}
                    onPress={() => toggleDropdown('registerClassId')}
                    activeOpacity={0.75}
                  >
                    <Text style={registerData.classId ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
                      {classes.find((c) => c._id === registerData.classId)
                        ? `${classes.find((c) => c._id === registerData.classId)!.className}${
                            classes.find((c) => c._id === registerData.classId)!.division ? ` – ${classes.find((c) => c._id === registerData.classId)!.division}` : ''
                          }`
                        : 'Select...'}
                    </Text>
                    <Feather name={activeDropdown === 'registerClassId' ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
                  </TouchableOpacity>
                  {activeDropdown === 'registerClassId' && (
                    <View style={styles.dropdownListContainer}>
                      <ScrollView nestedScrollEnabled style={styles.dropdownScroll} showsVerticalScrollIndicator={false}>
                        {classes.map((c, index) => (
                          <TouchableOpacity
                            key={c._id}
                            style={[styles.dropdownItem, index !== classes.length - 1 && styles.dropdownItemBorder, registerData.classId === c._id && styles.dropdownItemActive]}
                            onPress={() => {
                              setRegisterData({ ...registerData, classId: c._id });
                              setRegisterErrors({ ...registerErrors, classId: undefined });
                              setActiveDropdown(null);
                            }}
                          >
                            <Text style={[styles.dropdownItemText, registerData.classId === c._id && styles.dropdownItemTextActive]}>
                              {c.division ? `${c.className} – ${c.division}` : c.className}
                            </Text>
                            {registerData.classId === c._id && <Feather name="check" size={16} color={COLORS.secondary} />}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  {registerErrors.classId && <Text style={styles.errorText}>{registerErrors.classId}</Text>}
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputWrapper, { flex: 1, marginRight: SPACING.md }]}>
                    <Text style={styles.inputLabel}>Admission Number</Text>
                    <TextInput style={styles.input} placeholder="e.g. ADM-001" placeholderTextColor={COLORS.faint} value={registerData.admissionNo} onChangeText={(t) => setRegisterData({ ...registerData, admissionNo: t })} />
                  </View>
                  <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Roll Number</Text>
                    <TextInput style={styles.input} placeholder="e.g. 101" placeholderTextColor={COLORS.faint} value={registerData.rollNo} onChangeText={(t) => setRegisterData({ ...registerData, rollNo: t })} />
                  </View>
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Gender</Text>
                  <View style={styles.genderPillRow}>
                    {GENDERS.map((g) => (
                      <TouchableOpacity
                        key={g}
                        style={[styles.genderPill, registerData.gender === g && styles.genderPillActive]}
                        onPress={() => setRegisterData({ ...registerData, gender: g })}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.genderPillText, registerData.gender === g && styles.genderPillTextActive]}>{g}</Text>
                      </TouchableOpacity>
                    ))}
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
                    style={[styles.input, registerErrors.guardianName && styles.inputError]}
                    placeholder="Full Name"
                    placeholderTextColor={COLORS.faint}
                    value={registerData.guardianName}
                    onChangeText={(t) => {
                      setRegisterData({ ...registerData, guardianName: t.replace(/[^a-zA-Z\s]/g, '') });
                      setRegisterErrors({ ...registerErrors, guardianName: undefined });
                    }}
                  />
                  {registerErrors.guardianName && <Text style={styles.errorText}>{registerErrors.guardianName}</Text>}
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>
                    Guardian Mobile <Text style={styles.asterisk}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, registerErrors.guardianMobile && styles.inputError]}
                    placeholder="10 Digits"
                    placeholderTextColor={COLORS.faint}
                    keyboardType="numeric"
                    maxLength={10}
                    value={registerData.guardianMobile}
                    onChangeText={(t) => {
                      setRegisterData({ ...registerData, guardianMobile: t.replace(/[^0-9]/g, '') });
                      setRegisterErrors({ ...registerErrors, guardianMobile: undefined });
                    }}
                  />
                  {registerErrors.guardianMobile && <Text style={styles.errorText}>{registerErrors.guardianMobile}</Text>}
                </View>
              </View>

              <TouchableOpacity style={styles.registerSubmitBtn} onPress={handleRegisterStudent} disabled={registering} activeOpacity={0.9}>
                {registering ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="user-check" size={16} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.saveBtnFullText}>Register & Create Login</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>

      {/* --- REGISTRATION SUCCESS / CREDENTIALS MODAL --- */}
      <Modal visible={!!registeredCredentials} transparent animationType="fade" onRequestClose={() => setRegisteredCredentials(null)}>
        <View style={styles.overlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Feather name="check-circle" size={34} color={COLORS.success} />
            </View>
            <Text style={styles.successTitle}>Student Registered!</Text>
            <Text style={styles.successSub}>{registeredCredentials?.name} can now log in to the student portal using the credentials below.</Text>

            <View style={styles.credentialsBox}>
              <View style={styles.credentialRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.credentialLabel}>Login Email</Text>
                  <Text style={styles.credentialValue} numberOfLines={1}>
                    {registeredCredentials?.email}
                  </Text>
                </View>
              </View>
              <View style={styles.credentialDivider} />
              <View style={styles.credentialRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.credentialLabel}>Password</Text>
                  <Text style={styles.credentialValue} numberOfLines={1}>
                    {registeredCredentials?.password}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.shareBtn} onPress={handleShareCredentials} activeOpacity={0.9}>
              <Feather name="share-2" size={16} color="#fff" />
              <Text style={styles.shareBtnText}>Share Login Details</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.doneBtnOutline} onPress={() => setRegisteredCredentials(null)} activeOpacity={0.8}>
              <Text style={styles.doneBtnOutlineText}>Done</Text>
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

  // Header now carries the Register/Add Student actions on its right side,
  // so it wraps onto two lines on narrow screens instead of squashing.
header: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: SPACING.xl,
  paddingBottom: SPACING.lg,
  backgroundColor: COLORS.surface,
  borderBottomWidth: 1,
  borderBottomColor: COLORS.borderSoft,
},

headerLeft: {
  flexDirection: 'row',
  alignItems: 'center',
  flex: 1,
  minWidth: 0,
  marginRight: SPACING.md,
},

headerActions: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: SPACING.sm,
  marginLeft: 'auto',
},
 headerIconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.secondarySoft, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  title: { fontSize: FONT.h1, fontWeight: '800', color: COLORS.ink },
  subtitle: { fontSize: FONT.tiny, color: COLORS.faint, marginTop: 2 },
 headerRegisterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondarySoft, borderWidth: 1, borderColor: COLORS.secondary, paddingHorizontal: SPACING.md, height: 34, borderRadius: RADIUS.sm, gap: 5 },
  headerRegisterBtnText: { color: COLORS.secondary, fontSize: FONT.tiny, fontWeight: '700' },
  headerAddBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: SPACING.md, height: 34, borderRadius: RADIUS.sm, gap: 5, ...SHADOW.button },
  headerAddBtnText: { color: '#fff', fontSize: FONT.tiny, fontWeight: '700' },

  searchRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, alignItems: 'center' },
  searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: TOUCH_TARGET + 2, ...SHADOW.card },
  searchInput: { flex: 1, marginLeft: SPACING.sm, fontSize: FONT.body, color: COLORS.ink },
  filterDropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: TOUCH_TARGET + 2, ...SHADOW.card },

  // Register/Add Student now live in the header (top-right), so this row is
  // just the count on its own line — nothing left to crowd it.
  statsRow: { paddingHorizontal: SPACING.lg, marginTop: SPACING.lg, marginBottom: SPACING.sm },
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
  avatarFallback: { backgroundColor: COLORS.secondary, justifyContent: 'center', alignItems: 'center', ...SHADOW.card },
  avatarFallbackText: { fontWeight: '800', color: '#fff' },
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

formModalCard: {
  backgroundColor: COLORS.background,
  width: '94%',
  maxWidth: 620,
  height: '88%',
  maxHeight: '92%',
  borderRadius: RADIUS.xl,
  overflow: 'hidden',
  ...SHADOW.raised,
},  formContainer: { flex: 1, backgroundColor: COLORS.background },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, ...SHADOW.card },
  formTitle: { fontSize: FONT.h2, fontWeight: '800', color: COLORS.ink },
  closeBtnIcon: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.borderSoft, borderRadius: 16 },
 
  formScroll: { padding: SPACING.md, paddingBottom: SPACING.lg },
  formCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: FONT.small, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.4 },

  photoUploadWrap: { alignItems: 'center', marginBottom: SPACING.sm },
  photoCameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.surface },
  photoHint: { fontSize: FONT.tiny, color: COLORS.muted, marginTop: 6, fontWeight: '600' },

  inputWrapper: { marginBottom: SPACING.sm },
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

  // Register Student button (header)
  registerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondarySoft, borderWidth: 1, borderColor: COLORS.secondary, paddingHorizontal: SPACING.lg, height: TOUCH_TARGET, borderRadius: RADIUS.sm, gap: 6 },
  registerBtnText: { color: COLORS.secondary, fontSize: FONT.small, fontWeight: '700' },

  // Register Student modal
  registerHeader: { backgroundColor: COLORS.secondary, borderBottomWidth: 0 },
  registerHeaderIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  registerHeaderSub: { fontSize: FONT.tiny, color: '#EFF6FF', fontWeight: '600', marginTop: 2 },
  closeBtnIconLight: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 18 },
  registerInfoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, backgroundColor: COLORS.secondarySoft, borderWidth: 1, borderColor: COLORS.secondary, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
  registerInfoText: { flex: 1, fontSize: FONT.tiny, color: COLORS.body, lineHeight: 18, fontWeight: '500' },

  passwordInputField: { paddingRight: 44 },
  passwordEyeBtn: { position: 'absolute', right: SPACING.md, height: '100%', justifyContent: 'center', alignItems: 'center' },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8 },
  generateBtnText: { fontSize: FONT.tiny, color: COLORS.secondary, fontWeight: '700' },

  genderPillRow: { flexDirection: 'row', gap: SPACING.sm },
  genderPill: { flex: 1, height: TOUCH_TARGET, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  genderPillActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  genderPillText: { fontSize: FONT.small, fontWeight: '700', color: COLORS.body },
  genderPillTextActive: { color: '#fff' },

  registerSubmitBtn: { flexDirection: 'row', backgroundColor: COLORS.secondary, height: 56, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xs, ...SHADOW.button },

  // Registration success / credentials card
  successCard: { backgroundColor: COLORS.surface, width: '100%', maxWidth: 460, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center', ...SHADOW.raised },
  successIconWrap: { width: 68, height: 68, borderRadius: 34, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft },
  successTitle: { fontSize: FONT.h2, fontWeight: '800', color: COLORS.ink, marginBottom: 6 },
  successSub: { fontSize: FONT.small, color: COLORS.muted, textAlign: 'center', fontWeight: '500', lineHeight: 20, marginBottom: SPACING.lg },
  credentialsBox: { width: '100%', backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.lg },
  credentialRow: { paddingVertical: SPACING.md },
  credentialDivider: { height: 1, backgroundColor: COLORS.borderSoft },
  credentialLabel: { fontSize: FONT.tiny, color: COLORS.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  credentialValue: { fontSize: FONT.body, color: COLORS.ink, fontWeight: '700' },
  shareBtn: { flexDirection: 'row', width: '100%', backgroundColor: COLORS.secondary, height: 52, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.lg, gap: 8, ...SHADOW.button },
  shareBtnText: { color: '#fff', fontWeight: '800', fontSize: FONT.body },
  doneBtnOutline: { width: '100%', height: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.sm },
  doneBtnOutlineText: { color: COLORS.body, fontWeight: '700' },
});