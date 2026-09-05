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
  Pressable,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';
import { useNavigation } from '@react-navigation/native';
import { COLORS, RADIUS, SPACING, FONT, SHADOW, TOUCH_TARGET, isSmallDevice } from '../../constants/theme';

// --- Types ---
interface Permission {
  module: string;
  action: string;
}

interface School {
  _id: string;
  name: string;
  board: string;
  marksGradesMode: string;
  city: string;
  state: string;
  code: string;
  schoolTimeIn: string;
  schoolTimeOut: string;
  workingDays: string;
}

interface Staff {
  _id: string;
  name: string;
  staffType: string;
  staffId: string;
  primaryMobile?: string;
}

interface ClassObj {
  _id?: string;
  id?: string;
  schoolId: any;
  className: string;
  division: string;
  classTeacher: any;
  syllabus: string;
  evaluationType: string;
  description: string;
  studentCount?: number;
  boysCount?: number;
  girlsCount?: number;
}

const initialFormState = {
  schoolId: '',
  className: '',
  division: '',
  classTeacher: '',
  description: '',
  syllabus: '',
  evaluationType: '',
};

export default function ClassesScreen() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const isTablet = width >= 700;

  // Data States
  const [classes, setClasses] = useState<ClassObj[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');

  // Form Modals & State
  const [isFormVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<typeof initialFormState>(initialFormState);
  const [errors, setErrors] = useState<Partial<typeof initialFormState>>({});

  // Inline Dropdown Tracker
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // View Modal
  const [isViewVisible, setViewVisible] = useState(false);
  const [viewingClass, setViewingClass] = useState<ClassObj | null>(null);

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

      const [classesRes, schoolsRes, staffRes] = await Promise.all([
        axios.get(`${API_BASE}/classes`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/staff`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (classesRes.data?.success) setClasses(classesRes.data.data || []);
      if (schoolsRes.data?.success) setSchools(schoolsRes.data.data || []);
      if (staffRes.data?.success) setStaffList(staffRes.data.data || []);
    } catch (error) {
      console.error(error);
      if (!isRefresh) Alert.alert('Error', 'Could not load classes. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => fetchData(authToken, true), [authToken]);

  // RBAC Checker
  const hasPermission = useCallback(
    (action: string) => {
      if (isSuperAdmin) return true;
      return permissions.some((p) => p.module === 'classes' && p.action === action);
    },
    [permissions, isSuperAdmin]
  );

  // --- Derived Overview Stats ---
  const totalClasses = classes.length;
  const totalDivisions = classes.filter((c) => c.division).length;
  const assignedTeachers = new Set(
    classes.filter((c) => c.classTeacher).map((c) => (typeof c.classTeacher === 'object' ? c.classTeacher._id : c.classTeacher))
  ).size;

  // --- Filtering ---
  const filteredClasses = useMemo(
    () =>
      classes.filter(
        (c) =>
          c.className.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          (c.division && c.division.toLowerCase().includes(searchQuery.trim().toLowerCase())) ||
          (c.syllabus && c.syllabus.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      ),
    [classes, searchQuery]
  );

  // --- Actions ---
  const openAddForm = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setErrors({});
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const openEditForm = (cls: ClassObj) => {
    setEditingId(cls._id || cls.id || null);
    setFormData({
      schoolId: typeof cls.schoolId === 'object' ? cls.schoolId._id : cls.schoolId,
      className: cls.className,
      division: cls.division || '',
      classTeacher: typeof cls.classTeacher === 'object' ? cls.classTeacher._id : cls.classTeacher || '',
      description: cls.description || '',
      syllabus: cls.syllabus || '',
      evaluationType: cls.evaluationType || '',
    });
    setErrors({});
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const closeForm = () => {
    setActiveDropdown(null);
    setFormVisible(false);
  };

  const handleDelete = (id?: string) => {
    if (!id) return;
    Alert.alert('Delete Class', 'Are you sure you want to delete this class? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/classes/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            fetchData(authToken, true);
          } catch (error) {
            Alert.alert('Error', 'Failed to delete class.');
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    let newErrors: any = {};
    if (!formData.schoolId) newErrors.schoolId = 'School Branch is required';
    if (!formData.className.trim()) newErrors.className = 'Class Name is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        await axios.put(`${API_BASE}/classes/${editingId}`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert('Success', 'Class updated successfully.');
      } else {
        await axios.post(`${API_BASE}/classes`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert('Success', 'Class created successfully.');
      }
      closeForm();
      fetchData(authToken, true);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save class.');
    } finally {
      setSaving(false);
    }
  };

  // --- Inline Dropdown Handlers ---
  const toggleDropdown = (field: string) => setActiveDropdown(activeDropdown === field ? null : field);

  const handleSchoolSelect = (schoolId: string) => {
    const school = schools.find((s) => s._id === schoolId);
    setFormData({
      ...formData,
      schoolId,
      syllabus: school?.board || '',
      evaluationType: school?.marksGradesMode || '',
    });
    setErrors({ ...errors, schoolId: undefined });
    setActiveDropdown(null);
  };

  // Floating (absolute) dropdown so it overlays content instead of pushing
  // the layout around and fighting the parent ScrollView for touches.
  const renderInlineDropdown = (fieldKey: string, label: string, options: { label: string; value: string }[]) => {
    const isOpen = activeDropdown === fieldKey;
    const currentValue = formData[fieldKey as keyof typeof formData];
    const selectedObj = options.find((o) => o.value === currentValue);
    const hasError = !!errors[fieldKey as keyof typeof errors];

    return (
      <View style={[styles.inputWrapper, isOpen && { zIndex: 50 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive, hasError && styles.inputError]}
          onPress={() => toggleDropdown(fieldKey)}
          activeOpacity={0.75}
        >
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selectedObj?.label || 'Select...'}
          </Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.muted} />
        </TouchableOpacity>

        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={styles.dropdownScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {options.length === 0 ? (
                <View style={styles.dropdownEmpty}>
                  <Text style={styles.dropdownEmptyText}>No options available</Text>
                </View>
              ) : (
                options.map((opt, index) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.dropdownItem,
                      index !== options.length - 1 && styles.dropdownItemBorder,
                      currentValue === opt.value && styles.dropdownItemActive,
                    ]}
                    onPress={() => {
                      if (fieldKey === 'schoolId') handleSchoolSelect(opt.value);
                      else {
                        setFormData({ ...formData, [fieldKey]: opt.value });
                        setActiveDropdown(null);
                      }
                    }}
                  >
                    <Text style={[styles.dropdownItemText, currentValue === opt.value && styles.dropdownItemTextActive]} numberOfLines={1}>
                      {opt.label}
                    </Text>
                    {currentValue === opt.value && <Feather name="check" size={16} color={COLORS.primary} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        )}
        {hasError && <Text style={styles.errorText}>{errors[fieldKey as keyof typeof errors]}</Text>}
      </View>
    );
  };

  const teacherOptions = useMemo(
    () => [
      { label: 'Unassigned', value: '' },
      ...staffList
        .filter((s) => (s.staffType || '').toLowerCase() === 'teacher')
        .map((s) => ({ label: `${s.name} (${s.staffId})`, value: s._id })),
    ],
    [staffList]
  );

  const evaluationOptions = [
    { label: 'Marks', value: 'Marks' },
    { label: 'Grades', value: 'Grades' },
    { label: 'Both', value: 'Both' },
  ];

  // --- Render Card ---
  const renderCard = ({ item }: { item: ClassObj }) => {
    const teacherIsPopulated = typeof item.classTeacher === 'object' && item.classTeacher;
    const teacherName = teacherIsPopulated ? item.classTeacher.name : item.classTeacher ? 'Assigned' : 'Unassigned';
    const teacherId = teacherIsPopulated ? item.classTeacher.staffId : '';

    return (
      <View style={[styles.card, isTablet && styles.cardTablet]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.primaryBadge}>
              <Text style={styles.primaryBadgeText}>{item.className}</Text>
            </View>
            {item.division ? (
              <View style={styles.darkBadge}>
                <Text style={styles.darkBadgeText}>DIV {item.division}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.syllabusBadge}>
            <Feather name="book-open" size={12} color={COLORS.secondary} />
            <Text style={styles.syllabusBadgeText} numberOfLines={1}>
              {item.syllabus || 'N/A'}
            </Text>
          </View>
        </View>

        <View style={styles.teacherSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(teacherName || 'U').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.metaLabel}>CLASS TEACHER</Text>
            <Text style={styles.teacherName} numberOfLines={1}>
              {teacherName}
            </Text>
            {teacherId ? <Text style={styles.teacherId}>{teacherId}</Text> : null}
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.metaLabel}>EVALUATION MODE</Text>
            <View style={styles.pinkBadge}>
              <Text style={styles.pinkBadgeText} numberOfLines={1}>
                {item.evaluationType || 'N/A'}
              </Text>
            </View>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.metaLabel}>TOTAL STUDENTS</Text>
            <View style={styles.redOutlineBadge}>
              <Text style={styles.redOutlineBadgeText}>{item.studentCount || 0} Students</Text>
            </View>
          </View>
          <View style={styles.statBox}>
            <View style={styles.blueBadge}>
              <Feather name="user" size={10} color={COLORS.info} />
              <Text style={styles.blueBadgeText}>Boys: {item.boysCount || 0}</Text>
            </View>
          </View>
          <View style={styles.statBox}>
            <View style={styles.pinkLightBadge}>
              <Feather name="user" size={10} color={COLORS.pink} />
              <Text style={styles.pinkLightBadgeText}>Girls: {item.girlsCount || 0}</Text>
            </View>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.studentsBtn}
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate('Add Student', {
                classId: item._id || item.id,
                className: item.className,
                division: item.division,
              })
            }
          >
            <Feather name="users" size={14} color="#fff" />
            <Text style={styles.studentsBtnText} numberOfLines={1}>
              Students ({item.studentCount || 0})
            </Text>
          </TouchableOpacity>

          <View style={styles.actionBtnGroup}>
            {hasPermission('read') && (
              <TouchableOpacity
                style={styles.iconBtnPrimary}
                accessibilityLabel="View class details"
                onPress={() => {
                  setViewingClass(item);
                  setViewVisible(true);
                }}
              >
                <Feather name="eye" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            {hasPermission('update') && (
              <TouchableOpacity style={styles.iconBtnEdit} accessibilityLabel="Edit class" onPress={() => openEditForm(item)}>
                <Feather name="edit-2" size={16} color={COLORS.success} />
              </TouchableOpacity>
            )}
            {hasPermission('delete') && (
              <TouchableOpacity style={styles.iconBtnDelete} accessibilityLabel="Delete class" onPress={() => handleDelete(item._id || item.id)}>
                <Feather name="trash-2" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          <Feather name="book" size={20} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            School Classes
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Manage sections, teachers & rosters
          </Text>
        </View>
      </View>

      {/* Overview Cards (Scrollable horizontally) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.overviewScroll}>
        <View style={[styles.overviewCard, isTablet && styles.overviewCardTablet]}>
          <View style={[styles.overviewIconWrap, { backgroundColor: COLORS.secondarySoft }]}>
            <Feather name="grid" size={14} color={COLORS.secondary} />
          </View>
          <Text style={styles.overviewLabel}>TOTAL CLASSES</Text>
          <Text style={styles.overviewValue}>{totalClasses}</Text>
        </View>
        <View style={[styles.overviewCard, isTablet && styles.overviewCardTablet]}>
          <View style={[styles.overviewIconWrap, { backgroundColor: COLORS.primarySoft }]}>
            <Feather name="layers" size={14} color={COLORS.primary} />
          </View>
          <Text style={styles.overviewLabel}>DIVISIONS</Text>
          <Text style={styles.overviewValue}>{totalDivisions}</Text>
        </View>
        <View style={[styles.overviewCard, isTablet && styles.overviewCardTablet]}>
          <View style={[styles.overviewIconWrap, { backgroundColor: COLORS.successSoft }]}>
            <Feather name="user-check" size={14} color={COLORS.success} />
          </View>
          <Text style={styles.overviewLabel}>ASSIGNED TEACHERS</Text>
          <Text style={styles.overviewValue}>{assignedTeachers}</Text>
        </View>
        <View style={[styles.overviewCard, isTablet && styles.overviewCardTablet]}>
          <View style={[styles.overviewIconWrap, { backgroundColor: COLORS.warningSoft }]}>
            <Feather name="zap" size={14} color={COLORS.warning} />
          </View>
          <Text style={styles.overviewLabel}>SYLLABUS ENGINE</Text>
          <Text style={styles.overviewValueText}>Auto-Detected</Text>
        </View>
      </ScrollView>

      {/* Action Bar */}
      <View style={[styles.actionBar, compact && styles.actionBarCompact]}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={COLORS.faint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search classes by name, division..."
            placeholderTextColor={COLORS.faint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Clear search">
              <Feather name="x-circle" size={16} color={COLORS.faint} />
            </TouchableOpacity>
          )}
        </View>
        {hasPermission('create') && (
          <TouchableOpacity style={[styles.addBtn, compact && styles.addBtnCompact]} onPress={openAddForm} activeOpacity={0.9}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>Add New Class</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.showingText}>
        Showing {filteredClasses.length} of {totalClasses} class records
      </Text>

      {/* Class List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading classes…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredClasses}
          keyExtractor={(item, idx) => item._id || item.id || idx.toString()}
          renderItem={renderCard}
          numColumns={isTablet ? 2 : 1}
          key={isTablet ? 'tablet' : 'phone'}
          columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Feather name="inbox" size={26} color={COLORS.faint} />
              </View>
              <Text style={styles.emptyTitle}>No classes found</Text>
              <Text style={styles.emptySub}>Try a different search, or add your first class.</Text>
              {searchQuery.length > 0 && (
                <TouchableOpacity style={styles.emptyClearBtn} onPress={() => setSearchQuery('')}>
                  <Text style={styles.emptyClearBtnText}>Clear search</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* --- ADD/EDIT FORM MODAL --- */}
      <Modal visible={isFormVisible} transparent animationType="fade" onRequestClose={closeForm}>
        <View style={styles.formOverlay}>
          <View style={[styles.formModalContainer, isTablet && styles.formModalContainerTablet]}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderLeft}>
                <View style={styles.formHeaderIconWrap}>
                  <Feather name={editingId ? 'edit-2' : 'plus'} size={16} color={COLORS.primary} />
                </View>
                <Text style={styles.formTitle}>{editingId ? 'Edit Class Details' : 'Add New Class'}</Text>
              </View>
              <TouchableOpacity onPress={closeForm} style={styles.closeBtnIcon} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={COLORS.body} />
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Backdrop to close any open dropdown when tapping elsewhere in the form */}
                {activeDropdown && (
                  <Pressable style={styles.dropdownBackdrop} onPress={() => setActiveDropdown(null)} />
                )}

                <View style={styles.formCard}>
                  <Text style={styles.sectionTitle}>Class Details</Text>
                  <Text style={styles.sectionSub}>Only Class Name and School Branch are mandatory</Text>

                  {formData.syllabus ? (
                    <View style={styles.autoSyllabusBadge}>
                      <Feather name="check-circle" size={14} color={COLORS.success} />
                      <Text style={styles.autoSyllabusText}>Auto-Syllabus Active ({formData.syllabus})</Text>
                    </View>
                  ) : null}

                  {renderInlineDropdown(
                    'schoolId',
                    'School Branch *',
                    schools.map((s) => ({ label: s.name, value: s._id }))
                  )}

                  <View style={[styles.row, compact && styles.rowCompact]}>
                    <View style={[styles.inputWrapper, compact ? styles.rowCompactItem : { flex: 1, marginRight: SPACING.md }]}>
                      <Text style={styles.inputLabel}>
                        Class Name <Text style={styles.asterisk}>*</Text>
                      </Text>
                      <TextInput
                        style={[styles.input, errors.className && styles.inputError]}
                        placeholder="e.g. Class 10 or LKG"
                        placeholderTextColor={COLORS.faint}
                        value={formData.className}
                        onChangeText={(t) => {
                          setFormData({ ...formData, className: t });
                          setErrors({ ...errors, className: undefined });
                        }}
                      />
                      {errors.className && <Text style={styles.errorText}>{errors.className}</Text>}
                    </View>

                    <View style={[styles.inputWrapper, compact ? styles.rowCompactItem : { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Division (Optional)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. A, B, C"
                        placeholderTextColor={COLORS.faint}
                        value={formData.division}
                        onChangeText={(t) => setFormData({ ...formData, division: t })}
                        autoCapitalize="characters"
                      />
                    </View>
                  </View>

                  {renderInlineDropdown('classTeacher', 'Class Teacher (Optional)', teacherOptions)}
                  {renderInlineDropdown('evaluationType', 'Evaluation Mode (Optional)', evaluationOptions)}

                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Class Description & Notes (Optional)</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="Enter optional description or notes..."
                      placeholderTextColor={COLORS.faint}
                      multiline
                      value={formData.description}
                      onChangeText={(t) => setFormData({ ...formData, description: t })}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.saveBtnFull, saving && styles.saveBtnFullDisabled]}
                  onPress={handleSave}
                  activeOpacity={0.9}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="check" size={16} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.saveBtnFullText}>{editingId ? 'Save Changes' : 'Submit Class'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>

      {/* --- VIEW FULL SPECIFICATION MODAL --- */}
      <Modal visible={isViewVisible} transparent animationType="fade" onRequestClose={() => setViewVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.viewModalContainer, isTablet && styles.formModalContainerTablet]}>
            <View style={styles.viewHeaderRed}>
              <Text style={styles.viewTitle}>Class Full Specification</Text>
              <TouchableOpacity onPress={() => setViewVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: SPACING.xl }} showsVerticalScrollIndicator={false}>
              <Text style={styles.viewSub}>OVERVIEW</Text>
              <View style={styles.viewOverviewRow}>
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>{viewingClass?.className}</Text>
                </View>
                {viewingClass?.division ? (
                  <View style={styles.darkBadge}>
                    <Text style={styles.darkBadgeText}>Division {viewingClass.division}</Text>
                  </View>
                ) : null}
                <View style={[styles.syllabusBadge, { marginLeft: 'auto' }]}>
                  <Feather name="book-open" size={12} color={COLORS.secondary} />
                  <Text style={styles.syllabusBadgeText}>Syllabus: {viewingClass?.syllabus || 'N/A'}</Text>
                </View>
              </View>

              <Text style={styles.sectionHeaderRed}>SCHOOL & AFFILIATION</Text>
              <View style={styles.viewDetailsBox}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewLabel}>School Name</Text>
                    <Text style={styles.viewVal}>{typeof viewingClass?.schoolId === 'object' ? viewingClass?.schoolId.name : 'N/A'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewLabel}>School Code</Text>
                    <Text style={styles.viewVal}>{typeof viewingClass?.schoolId === 'object' ? viewingClass?.schoolId.code : 'N/A'}</Text>
                  </View>
                </View>
                <View style={[styles.row, { marginTop: SPACING.md }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewLabel}>Location</Text>
                    <Text style={styles.viewVal}>
                      {typeof viewingClass?.schoolId === 'object' ? `${viewingClass?.schoolId.city}, ${viewingClass?.schoolId.state}` : 'N/A'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewLabel}>School Schedule</Text>
                    <Text style={styles.viewVal}>
                      {typeof viewingClass?.schoolId === 'object'
                        ? `${viewingClass?.schoolId.schoolTimeIn} - ${viewingClass?.schoolId.schoolTimeOut}`
                        : 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.row, compact && styles.rowCompact]}>
                <View style={compact ? styles.rowCompactItem : { flex: 1, marginRight: SPACING.sm }}>
                  <Text style={styles.sectionHeaderRed}>TEACHER</Text>
                  <View style={styles.viewDetailsBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[styles.avatar, { width: 40, height: 40, borderRadius: 20 }]}>
                        <Text style={styles.avatarText}>
                          {typeof viewingClass?.classTeacher === 'object' ? viewingClass?.classTeacher?.name?.charAt(0)?.toUpperCase() : 'U'}
                        </Text>
                      </View>
                      <View style={{ marginLeft: SPACING.sm, flex: 1, minWidth: 0 }}>
                        <Text style={styles.viewVal} numberOfLines={1}>
                          {typeof viewingClass?.classTeacher === 'object' ? viewingClass?.classTeacher?.name : 'Unassigned'}
                        </Text>
                        {typeof viewingClass?.classTeacher === 'object' && <Text style={styles.viewLabel}>{viewingClass?.classTeacher?.staffId}</Text>}
                      </View>
                    </View>
                  </View>
                </View>
                <View style={compact ? styles.rowCompactItem : { flex: 1, marginLeft: SPACING.sm }}>
                  <Text style={styles.sectionHeaderRed}>EVALUATION</Text>
                  <View style={styles.viewDetailsBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Feather name="check-circle" size={16} color={COLORS.success} />
                      <Text style={[styles.viewVal, { marginLeft: 8 }]}>{viewingClass?.evaluationType || 'N/A'}</Text>
                    </View>
                    <Text style={styles.viewLabel}>Standard Grading Scheme</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.sectionHeaderRed}>DESCRIPTION & NOTES</Text>
              <View style={[styles.viewDetailsBox, { marginBottom: SPACING.xl }]}>
                <Text style={styles.viewText}>{viewingClass?.description || 'No description provided.'}</Text>
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
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: SPACING.md, color: COLORS.muted, fontSize: FONT.small, fontWeight: '600' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.xl,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  title: { fontSize: FONT.h1, fontWeight: '800', color: COLORS.ink },
  subtitle: { fontSize: FONT.tiny, color: COLORS.faint, marginTop: 2 },

  overviewScroll: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, gap: SPACING.md },
  overviewCard: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderFaint,
    minWidth: isSmallDevice ? 120 : 140,
    ...SHADOW.card,
  },
  overviewCardTablet: { minWidth: 170, paddingVertical: SPACING.lg },
  overviewIconWrap: { width: 26, height: 26, borderRadius: RADIUS.xs, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  overviewLabel: { fontSize: FONT.micro, fontWeight: '800', color: COLORS.muted, letterSpacing: 0.5, marginBottom: 6 },
  overviewValue: { fontSize: 26, fontWeight: '800', color: COLORS.ink },
  overviewValueText: { fontSize: FONT.h3, fontWeight: '700', color: COLORS.success, marginTop: 2 },

  actionBar: { flexDirection: 'row', paddingHorizontal: SPACING.lg, alignItems: 'center', gap: SPACING.md, zIndex: 10 },
  actionBarCompact: { flexDirection: 'column', alignItems: 'stretch' },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    height: TOUCH_TARGET,
    gap: SPACING.sm,
    ...SHADOW.card,
  },
  searchInput: { flex: 1, fontSize: FONT.body, color: COLORS.ink },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    height: TOUCH_TARGET,
    borderRadius: RADIUS.sm,
    gap: SPACING.xs,
    ...SHADOW.button,
  },
  addBtnCompact: { marginTop: SPACING.sm },
  addBtnText: { color: '#fff', fontSize: FONT.small, fontWeight: '700' },
  showingText: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, fontSize: FONT.tiny, color: COLORS.muted, fontWeight: '500', textAlign: 'right' },

  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl, paddingTop: SPACING.sm },
  columnWrapper: { gap: SPACING.lg },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderSoft, ...SHADOW.card },
  cardTablet: { flex: 1, maxWidth: '49%' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg, gap: SPACING.sm, flexWrap: 'wrap' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1, gap: SPACING.sm },
  primaryBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.pill },
  primaryBadgeText: { color: '#fff', fontSize: FONT.small, fontWeight: '800' },
  darkBadge: { backgroundColor: COLORS.ink, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill },
  darkBadgeText: { color: '#fff', fontSize: FONT.tiny, fontWeight: '700' },
  syllabusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.xs, gap: 4, maxWidth: 150 },
  syllabusBadgeText: { color: COLORS.secondary, fontSize: FONT.tiny, fontWeight: '800' },

  teacherSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    marginBottom: SPACING.lg,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  avatarText: { fontSize: FONT.h2, fontWeight: '800', color: '#fff' },
  metaLabel: { fontSize: FONT.micro, fontWeight: '800', color: COLORS.faint, marginBottom: 2, letterSpacing: 0.3 },
  teacherName: { fontSize: FONT.h3, fontWeight: '800', color: COLORS.ink },
  teacherId: { fontSize: FONT.tiny, color: COLORS.muted, fontWeight: '500' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },
  statBox: { width: '48%' },
  pinkBadge: { backgroundColor: COLORS.pinkSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.xs, alignSelf: 'flex-start', marginTop: 4 },
  pinkBadgeText: { color: '#DB2777', fontSize: FONT.tiny, fontWeight: '700' },
  redOutlineBadge: { backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: COLORS.primarySoftBorder, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.xs, alignSelf: 'flex-start', marginTop: 4 },
  redOutlineBadgeText: { color: COLORS.primary, fontSize: FONT.tiny, fontWeight: '700' },
  blueBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.infoSoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: RADIUS.xs, alignSelf: 'flex-start', gap: 4 },
  blueBadgeText: { color: COLORS.info, fontSize: FONT.tiny, fontWeight: '700' },
  pinkLightBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.pinkSoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: RADIUS.xs, alignSelf: 'flex-start', gap: 4 },
  pinkLightBadgeText: { color: COLORS.pink, fontSize: FONT.tiny, fontWeight: '700' },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.borderSoft, paddingTop: SPACING.lg, gap: SPACING.sm },
  studentsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, gap: 6, flexShrink: 1 },
  studentsBtnText: { color: '#fff', fontSize: FONT.small, fontWeight: '700' },
  actionBtnGroup: { flexDirection: 'row', gap: SPACING.sm },
  iconBtnPrimary: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.secondary, borderRadius: RADIUS.xs },
  iconBtnEdit: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.successSoft, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.successSoftBorder },
  iconBtnDelete: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.primarySoftBorder },

  emptyState: { alignItems: 'center', padding: SPACING.xxl, marginTop: SPACING.lg },
  emptyIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft },
  emptyTitle: { fontSize: FONT.h3, fontWeight: '800', color: COLORS.ink },
  emptySub: { fontSize: FONT.small, color: COLORS.muted, marginTop: 4, textAlign: 'center' },
  emptyClearBtn: { marginTop: SPACING.lg, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, backgroundColor: COLORS.primarySoft },
  emptyClearBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: FONT.small },

  // Form Modal
  formOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  formModalContainer: { width: '100%', maxWidth: 650, height: '85%', backgroundColor: COLORS.background, borderRadius: RADIUS.xl, overflow: 'hidden', ...SHADOW.raised },
  formModalContainerTablet: { maxWidth: 720, height: '80%' },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  formHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  formHeaderIconWrap: { width: 32, height: 32, borderRadius: RADIUS.xs, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center' },
  formTitle: { fontSize: FONT.h2, fontWeight: '800', color: COLORS.ink },
  closeBtnIcon: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.borderSoft, borderRadius: 18 },
  formScroll: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  dropdownBackdrop: { ...StyleSheet.absoluteFillObject, zIndex: 5 },
  formCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card },
  sectionTitle: { fontSize: FONT.h2, fontWeight: '800', color: COLORS.ink },
  sectionSub: { fontSize: FONT.small, color: COLORS.muted, marginBottom: SPACING.lg, marginTop: 2 },

  autoSyllabusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.successSoft, padding: SPACING.md, borderRadius: RADIUS.sm, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.successSoftBorder, gap: SPACING.sm },
  autoSyllabusText: { color: '#065F46', fontSize: FONT.small, fontWeight: '700' },

  inputWrapper: { marginBottom: SPACING.lg, position: 'relative' },
  inputLabel: { fontSize: FONT.small, fontWeight: '700', color: COLORS.body, marginBottom: 6, marginLeft: 2 },
  asterisk: { color: COLORS.primary },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: TOUCH_TARGET + 4, backgroundColor: COLORS.background, fontSize: FONT.body, color: COLORS.ink },
  textArea: { height: 84, paddingTop: 12, textAlignVertical: 'top' },
  inputError: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  errorText: { color: COLORS.primary, fontSize: FONT.tiny, marginTop: 4, fontWeight: '500' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowCompact: { flexDirection: 'column' },
  rowCompactItem: { width: '100%' },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: TOUCH_TARGET + 4, backgroundColor: COLORS.background },
  dropdownHeaderActive: { borderColor: COLORS.primary },
  dropdownSelectedText: { color: COLORS.ink, fontSize: FONT.body, fontWeight: '500' },
  dropdownPlaceholder: { color: COLORS.faint, fontSize: FONT.body },
  // Floats above surrounding fields instead of pushing the layout down,
  // which is what caused the overlap / stuck-touch glitches before.
  dropdownListContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    zIndex: 100,
    elevation: 12,
    ...SHADOW.raised,
  },
  dropdownScroll: { maxHeight: 220 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md, paddingHorizontal: SPACING.md },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  dropdownItemActive: { backgroundColor: COLORS.primarySoft },
  dropdownItemText: { fontSize: FONT.body, color: COLORS.body, fontWeight: '500', flexShrink: 1, marginRight: SPACING.sm },
  dropdownItemTextActive: { color: COLORS.primary, fontWeight: '700' },
  dropdownEmpty: { padding: SPACING.lg, alignItems: 'center' },
  dropdownEmptyText: { color: COLORS.faint, fontSize: FONT.small },

  saveBtnFull: { flexDirection: 'row', backgroundColor: COLORS.primary, height: 56, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xs, ...SHADOW.button },
  saveBtnFullDisabled: { opacity: 0.7 },
  saveBtnFullText: { color: '#fff', fontSize: FONT.h3, fontWeight: '800' },

  // View Full Spec Modal
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  viewModalContainer: { backgroundColor: COLORS.background, width: '100%', maxWidth: 650, borderRadius: RADIUS.xl, maxHeight: '85%', overflow: 'hidden', ...SHADOW.raised },
  viewHeaderRed: { backgroundColor: COLORS.primary, padding: SPACING.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewTitle: { color: '#fff', fontSize: FONT.h2, fontWeight: '800', letterSpacing: 0.3 },
  viewOverviewRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xl, flexWrap: 'wrap' },
  viewSub: { fontSize: FONT.tiny, color: COLORS.muted, fontWeight: '700', marginBottom: SPACING.sm, letterSpacing: 1 },

  sectionHeaderRed: { fontSize: FONT.tiny, fontWeight: '800', color: COLORS.primary, marginTop: SPACING.md, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  viewDetailsBox: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  viewLabel: { fontSize: FONT.tiny, color: COLORS.faint, fontWeight: '700', marginBottom: 4 },
  viewVal: { fontSize: FONT.body, color: COLORS.ink, fontWeight: '700' },
  viewText: { fontSize: FONT.body, color: COLORS.body, lineHeight: 22, fontWeight: '500' },
})