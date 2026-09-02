import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  ActivityIndicator, 
  RefreshControl, 
  Animated 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';

const AUDIENCES = ['All', 'Staff', 'Student', 'Guardian'];
const CATEGORIES = ['General', 'Academic', 'Event', 'Urgent', 'Exam'];
const STATUSES = ['Published', 'Draft', 'Inactive'];

interface Notice {
  _id: string;
  title: string;
  sendTo: string[] | string;
  category: string;
  status: string;
  noticeDate: string;
  submissionDate?: string;
  description: string;
  isPinned: boolean;
  attachments?: any[];
  createdBy?: { name: string };
  schoolId?: string;
}

interface SchoolBranch {
  _id: string;
  name?: string;
  branchName?: string;
  [key: string]: any;
}

interface UploadedAttachment {
  name: string;
  filePath: string;
  url: string;
  fileType: string;
  size: number;
}

const toYMD = (d: Date) => {
  // Pad local date values to maintain YYYY-MM-DD reliably
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Parses a 'YYYY-MM-DD' string into a LOCAL Date. Using `new Date(ymdString)`
// directly parses as UTC midnight, which can shift the displayed date by
// one day depending on device timezone. This avoids that shift.
const parseYMD = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

// ERROR HANDLING:
// Centralized error handler maps all potential API errors (Network, 4xx, 5xx) to actionable frontend messages.
const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    }
    
    const status = error.response.status;
    const data = error.response.data;

    let backendMsg: string | null = null;
    if (data) {
      if (data.message) backendMsg = String(data.message);
      else if (data.error) backendMsg = String(data.error);
      else if (Array.isArray(data.errors)) backendMsg = data.errors.join('. ');
    }

    if (status === 400) return backendMsg || 'Invalid request. Please check the entered information.';
    if (status === 401) return 'Your session has expired. Please login again.';
    if (status === 403) return "You don't have permission to perform this action.";
    if (status === 404) return backendMsg || 'Notice not found. It may have already been deleted.';
    if (status === 409) return backendMsg || 'This notice already exists or conflicts with existing data.';
    if (status === 422) return backendMsg || 'Please check the entered information.';
    if (status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (status >= 500) return 'Something went wrong on the server. Please try again later.';

    return backendMsg || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

// ---------- Lightweight toast ----------
type ToastState = { visible: boolean; message: string; type: 'error' | 'success' };

function useToast() {
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    setToast({ visible: true, message, type });
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => hide(), 3500);
  }, [anim]);

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
      setToast(t => ({ ...t, visible: false }))
    );
  }, [anim]);

  const ToastView = () =>
    toast.visible ? (
      <Animated.View
        style={[
          styles.toast,
          toast.type === 'error' ? styles.toastError : styles.toastSuccess,
          { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
        ]}
      >
        <Feather name={toast.type === 'error' ? 'alert-circle' : 'check-circle'} size={18} color="#fff" />
        <Text style={styles.toastText} numberOfLines={2}>{toast.message}</Text>
        <TouchableOpacity onPress={hide} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Feather name="x" size={16} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    ) : null;

  return { show, ToastView };
}

export default function NoticeBoardScreen() {
  const { show: showToast, ToastView } = useToast();

  const [permissions, setPermissions] = useState<any[]>([]);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [filterAudience, setFilterAudience] = useState('All');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilterDropdown, setActiveFilterDropdown] = useState<string | null>(null);

  const [isFormVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '', sendTo: 'All', category: 'General', status: 'Published',
    noticeDate: toYMD(new Date()), submissionDate: '', description: '', isPinned: false,
    schoolId: '',
  });
  
  const [file, setFile] = useState<any>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showNoticeDatePicker, setShowNoticeDatePicker] = useState(false);
  const [showSubmissionDatePicker, setShowSubmissionDatePicker] = useState(false);

  // OPTIMIZATION: 
  // Authentication, School, and Role data loaded precisely once into state during initialization.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loggedInSchoolId, setLoggedInSchoolId] = useState<string | null>(null);
  const [branches, setBranches] = useState<SchoolBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [activeBranchDropdown, setActiveBranchDropdown] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedAttachment, setUploadedAttachment] = useState<UploadedAttachment | null>(null);

  // ROLE FIX: Single source of truth evaluating Multi-School Admin capacity
  const canSelectSchool = isAdmin || isSuperAdmin;

  useEffect(() => { 
    initialize(); 
  }, []);

  const initialize = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const permsRaw = await AsyncStorage.getItem('userPermissions');
      const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
      const roleRaw = await AsyncStorage.getItem('userRole');
      const storedSchoolId = await AsyncStorage.getItem('userSchoolId');

      if (permsRaw) setPermissions(JSON.parse(permsRaw));
      
      const isSuperAdminUser = superAdminRaw === 'true' || roleRaw === 'SUPER ADMIN';
      const isAdminUser = roleRaw === 'ADMIN' || roleRaw?.toUpperCase().includes('ADMIN') === true;
      
      setIsSuperAdmin(isSuperAdminUser);
      setIsAdmin(isAdminUser);
      setAuthToken(token);
      setLoggedInSchoolId(storedSchoolId);

      const canSelect = isAdminUser || isSuperAdminUser;

      fetchNotices(token);
      
      if (canSelect) {
        fetchBranches(token);
      }
    } catch (error) {
      showToast('Session error occurred while initializing.', 'error');
    }
  };

  const fetchBranches = async (token: string | null) => {
    setBranchesLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/schools/public`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (res.data && res.data.success === false) {
        throw new Error(res.data.message || 'School list could not be found.');
      }

      const list = res.data?.data?.schools || res.data?.data || [];
      setBranches(list);
    } catch (error: unknown) {
      showToast(getErrorMessage(error, 'School list could not be found.'), 'error');
    } finally {
      setBranchesLoading(false);
    }
  };

  const fetchNotices = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      let url = `${BASE_URL}/notices?`;
      if (filterAudience !== 'All') url += `sendTo=${filterAudience}&`;
      if (filterCategory) url += `category=${filterCategory}&`;
      if (filterStatus) url += `status=${filterStatus}&`;
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}`;

      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      
      if (res.data && res.data.success === false) {
        throw new Error(res.data.message || 'Could not load notices.');
      }

      setNotices(res.data?.data || []);
    } catch (error: unknown) {
      showToast(getErrorMessage(error, 'Could not load notices.'), 'error');
    } finally { 
      setLoading(false); 
      setRefreshing(false); 
    }
  };

  // Trigger notice fetch only when specific filters change, omitting searchQuery to avoid keystroke spam.
  useEffect(() => {
    if (authToken) {
      fetchNotices(authToken, false);
    }
  }, [filterAudience, filterCategory, filterStatus]);

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'noticeboard' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const openForm = (notice?: Notice) => {
    if (notice) {
      setEditingId(notice._id);
      setFormData({
        title: notice.title,
        sendTo: Array.isArray(notice.sendTo) ? notice.sendTo[0] : (notice.sendTo || 'All'),
        category: notice.category,
        status: notice.status,
        noticeDate: notice.noticeDate?.split('T')[0] || toYMD(new Date()),
        submissionDate: notice.submissionDate?.split('T')[0] || '',
        description: notice.description || '',
        isPinned: notice.isPinned,
        // ROLE FIX: Existing notice maintains its original schoolId explicitly
        schoolId: notice.schoolId || '',
      });
    } else {
      setEditingId(null);
      setFormData({
        title: '', sendTo: 'All', category: 'General', status: 'Published',
        // Default Publish Date is set here AND is treated as a valid,
        // already-selected value — no picker interaction required.
        noticeDate: toYMD(new Date()), submissionDate: '', description: '', isPinned: false,
        // ROLE FIX: New Notice initializes schoolId depending on capabilities
        schoolId: canSelectSchool ? '' : (loggedInSchoolId || ''),
      });
    }
    setFile(null); 
    setUploadedAttachment(null); 
    setActiveDropdown(null); 
    setActiveBranchDropdown(false); 
    setFormVisible(true);
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewingNotice, setViewingNotice] = useState<Notice | null>(null);

  const performDelete = async (id: string) => {
    try {
      const res = await axios.delete(`${BASE_URL}/notices/${id}`, { 
        headers: { Authorization: `Bearer ${authToken}` } 
      });

      if (res.data && res.data.success === false) {
        throw new Error(res.data.message || 'Failed to delete notice.');
      }

      showToast('Notice deleted successfully.', 'success');
      fetchNotices(authToken, true);
    } catch (error: unknown) {
      showToast(getErrorMessage(error, 'Failed to delete notice.'), 'error');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  // ROLE FIX: Resuable helper to definitively resolve the targeted schoolId 
  // relying entirely on the role source of truth (canSelectSchool).
  const resolveSchoolId = useCallback(() => {
    if (canSelectSchool) {
      return formData.schoolId;
    }
    return loggedInSchoolId || '';
  }, [canSelectSchool, formData.schoolId, loggedInSchoolId]);

  const handleSave = async () => {
    if (saving) return; // Prevent double-submit

    // 1. Validate Title
    if (!formData.title.trim()) {
      showToast("Notice title is required.", "error");
      return;
    }

    // 2. Validate Publish Date — driven purely by the stored form value,
    // not by whether the user opened/touched the date picker. The
    // auto-populated "today" default counts as a valid selection.
    if (!formData.noticeDate?.trim()) {
      showToast("Publish date is required.", "error");
      return;
    }

    // NOTE: Deadline (submissionDate) is intentionally NOT validated here.
    // It is optional — do not add a required check for it.

    // 3. Validate School 
    const targetSchoolId = resolveSchoolId();
    if (!targetSchoolId) {
      if (canSelectSchool) {
        showToast("Please select a school before saving the notice.", "error");
      } else {
        showToast("School information is missing. Please login again.", "error");
      }
      return;
    }

    // 4. Validate Attachment state
    if (uploadingFile) {
      showToast("Please wait for the attachment to finish uploading.", "error");
      return;
    }

    setSaving(true);

    try {
      // 5. Construct Payload (Preserving exact backend schema names)
      // submissionDate is only included when it actually has a value —
      // an empty Deadline is fully omitted from the payload rather than
      // sent as an empty/invalid string.
      const jsonPayload: Record<string, any> = {
        schoolId: targetSchoolId,
        title: formData.title.trim(),
        sendTo: [formData.sendTo],
        channels: ["NoticeBoard"],
        noticeDate: formData.noticeDate,
        description: formData.description,
        status: formData.status,
        category: formData.category,
        isPinned: formData.isPinned,
        attachments: uploadedAttachment ? [uploadedAttachment] : [],
      };

      if (formData.submissionDate?.trim()) {
        jsonPayload.submissionDate = formData.submissionDate;
      }

      const url = editingId ? `${BASE_URL}/notices/${editingId}` : `${BASE_URL}/notices`;
      const method = editingId ? 'put' : 'post';

      const response = await axios({
        method,
        url,
        data: jsonPayload,
        headers: { 
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json"
        }
      });

      if (response.data && response.data.success === false) {
        throw new Error(response.data.message || 'Failed to save notice.');
      }

      showToast(editingId ? "Notice updated successfully." : "Notice created successfully.", "success");
      setFormVisible(false);
      fetchNotices(authToken, true);

    } catch (error: unknown) {
      showToast(getErrorMessage(error, "Unable to create notice. Please try again."), "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePickFile = async () => {
    try {
      const [result] = await pick({ type: [types.allFiles] });
      setFile(result);
      await uploadPickedFile(result);
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        return; 
      }
      showToast('Could not open the file picker. Please try again.', 'error');
    }
  };

  const uploadPickedFile = async (picked: any) => {
    setUploadingFile(true);
    setUploadedAttachment(null);
    
    try {
      const formPayload = new FormData();
      formPayload.append('file', {
        uri: picked.uri,
        type: picked.type || 'application/octet-stream',
        name: picked.name,
      } as any);

      const res = await axios.post(`${BASE_URL}/upload`, formPayload, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.data?.success) {
        setUploadedAttachment({
          name: res.data.name,
          filePath: res.data.filePath,
          url: res.data.url,
          fileType: res.data.fileType,
          size: res.data.size,
        });
      } else {
        throw new Error(res.data?.message || 'Upload did not report success.');
      }
    } catch (error: unknown) {
      showToast(getErrorMessage(error, 'Could not upload the attachment. Please try again.'), 'error');
      setFile(null); // Clear invalid state
    } finally {
      setUploadingFile(false);
    }
  };

  const removeAttachment = () => {
    setFile(null);
    setUploadedAttachment(null);
  };

  const onChangeNoticeDate = (event: any, selectedDate?: Date) => {
    setShowNoticeDatePicker(Platform.OS === 'ios');
    if (event.type === 'dismissed' || !selectedDate) return;
    setFormData({ ...formData, noticeDate: toYMD(selectedDate) });
  };

  const onChangeSubmissionDate = (event: any, selectedDate?: Date) => {
    setShowSubmissionDatePicker(Platform.OS === 'ios');
    if (event.type === 'dismissed' || !selectedDate) return;
    setFormData({ ...formData, submissionDate: toYMD(selectedDate) });
  };

  const renderInlineDropdown = (fieldKey: 'category' | 'status' | 'sendTo', label: string, options: string[], isFilter = false) => {
    const isOpen = (isFilter ? activeFilterDropdown : activeDropdown) === fieldKey;
    const val = isFilter ? (fieldKey === 'category' ? filterCategory : filterStatus) : formData[fieldKey];

    const closeConflictsAndToggle = () => {
      if (isFilter) {
        setActiveFilterDropdown(isOpen ? null : fieldKey);
      } else {
        setActiveBranchDropdown(false);
        setActiveDropdown(isOpen ? null : fieldKey);
      }
    };

    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1, flex: isFilter ? 1 : undefined, marginBottom: isFilter ? 0 : 16 }]}>
        {!isFilter && <Text style={styles.inputLabel}>{label}</Text>}
        <TouchableOpacity
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive, isFilter && { height: 42 }]}
          onPress={closeConflictsAndToggle}
          activeOpacity={0.75}
        >
          <Text style={val ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{val || label}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#8A8F98" />
        </TouchableOpacity>
        {isOpen && (
          <View style={[styles.dropdownListContainer, isFilter && { top: 46 }]}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 160 }}>
              {isFilter && (
                <TouchableOpacity style={styles.dropdownItem} onPress={() => { if (fieldKey === 'category') setFilterCategory(''); else setFilterStatus(''); setActiveFilterDropdown(null); }}>
                  <Text style={styles.dropdownItemText}>All {label}s</Text>
                </TouchableOpacity>
              )}
              {options.map((opt, i) => (
                <TouchableOpacity key={opt} style={[styles.dropdownItem, i !== options.length - 1 && styles.borderBottom]} onPress={() => {
                  if (isFilter) { fieldKey === 'category' ? setFilterCategory(opt) : setFilterStatus(opt); setActiveFilterDropdown(null); }
                  else { setFormData({ ...formData, [fieldKey]: opt }); setActiveDropdown(null); }
                }}>
                  <Text style={[styles.dropdownItemText, val === opt && styles.textAccent]}>{opt}</Text>
                  {val === opt && <Feather name="check" size={14} color="#EF4444" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notice Board</Text>
        <Text style={styles.subtitle}>Publish announcements for Staff, Students, and Guardians.</Text>
      </View>

      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
          {AUDIENCES.map(aud => (
            <TouchableOpacity key={aud} style={[styles.audiencePill, filterAudience === aud && styles.audiencePillActive]} onPress={() => setFilterAudience(aud)} activeOpacity={0.8}>
              <Text style={[styles.audiencePillText, filterAudience === aud && styles.audiencePillTextActive]}>{aud === 'All' ? 'All Notices' : `For ${aud}`}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, zIndex: 10 }}>
          {renderInlineDropdown('category', 'Category', CATEGORIES, true)}
          {renderInlineDropdown('status', 'Status', STATUSES, true)}
        </View>
        <View style={[styles.searchContainer, { marginTop: 10 }]}>
          <Feather name="search" size={16} color="#9CA3AF" />
          <TextInput style={styles.searchInput} placeholder="Search notices by title..." placeholderTextColor="#9CA3AF" value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={() => fetchNotices(authToken, true)} />
        </View>
        {hasPermission('create') && (
          <TouchableOpacity style={styles.addBtnFull} onPress={() => openForm()} activeOpacity={0.9}>
            <Feather name="plus" size={17} color="#fff" /><Text style={styles.addBtnTextFull}>Create Notice</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#EF4444" /></View>
      ) : (
        <FlatList
          data={notices}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchNotices(authToken, true)} colors={['#EF4444']} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="bell-off" size={38} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>No Notices Found</Text>
              <TouchableOpacity onPress={() => fetchNotices(authToken, true)} style={{ marginTop: 12 }}>
                <Text style={{ color: '#3B82F6', fontWeight: 'bold' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    {item.isPinned && <Feather name="map-pin" size={13} color="#EF4444" />}
                    <View style={styles.catBadge}><Text style={styles.catBadgeText}>{item.category}</Text></View>
                    <View style={[styles.statusBadge, item.status === 'Published' ? styles.bgGreen : styles.bgGray]}>
                      <Text style={[styles.statusText, item.status === 'Published' ? styles.textGreen : styles.textGray]}>{item.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                </View>
              </View>

              <Text style={styles.cardDesc} numberOfLines={3}>{item.description}</Text>

              <View style={styles.cardFooter}>
                <View style={styles.footerItem}>
                  <Feather name="calendar" size={12} color="#8A8F98" />
                  <Text style={styles.dateText}>{item.noticeDate?.split('T')[0]}</Text>
                </View>
                <View style={styles.footerItem}>
                  <Feather name="users" size={12} color="#8A8F98" />
                  <Text style={styles.dateText}>To: {Array.isArray(item.sendTo) ? item.sendTo.join(', ') : item.sendTo}</Text>
                </View>
              </View>

              <View style={styles.cardActions}>
                {item.attachments && item.attachments.length > 0 && (
                  <TouchableOpacity style={styles.attachBtn}><Feather name="paperclip" size={13} color="#3B82F6" /><Text style={styles.attachText}>Attachment</Text></TouchableOpacity>
                )}
                <View style={{ flexDirection: 'row', marginLeft: 'auto', gap: 8 }}>
                  <TouchableOpacity style={styles.iconBtnView} onPress={() => setViewingNotice(item)} activeOpacity={0.75}><Feather name="eye" size={14} color="#3B82F6" /></TouchableOpacity>
                  {hasPermission('update') && (
                    <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openForm(item)} activeOpacity={0.75}><Feather name="edit-2" size={14} color="#10B981" /></TouchableOpacity>
                  )}
                  {hasPermission('delete') && (
                    <TouchableOpacity style={styles.iconBtnDelete} onPress={() => setConfirmDeleteId(item._id)} activeOpacity={0.75}><Feather name="trash-2" size={14} color="#EF4444" /></TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Delete confirmation Modal */}
      <Modal visible={!!confirmDeleteId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconWrap}><Feather name="trash-2" size={22} color="#EF4444" /></View>
            <Text style={styles.confirmTitle}>Delete Notice</Text>
            <Text style={styles.confirmBody}>This action can't be undone. Are you sure you want to delete this notice?</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setConfirmDeleteId(null)}><Text style={styles.confirmCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.confirmDeleteBtn} onPress={() => confirmDeleteId && performDelete(confirmDeleteId)}><Text style={styles.confirmDeleteText}>Delete</Text></TouchableOpacity>
            </View>
          </View>
          {/* Toast rendered inside this Modal's own layer so it isn't hidden behind it */}
          <ToastView />
        </View>
      </Modal>

      {/* Notice Detail (View) Modal */}
      <Modal visible={!!viewingNotice} transparent animationType="fade" onRequestClose={() => setViewingNotice(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalContainer}>
            <View style={styles.detailHeader}>
              <View style={styles.detailHeaderIconWrap}>
                <Feather name="eye" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.detailTitle}>Notice Announcement Detail</Text>
                <Text style={styles.detailSubtitle}>Review targeted audience, dispatch channels, dates, and attachments.</Text>
              </View>
              <TouchableOpacity onPress={() => setViewingNotice(null)} style={styles.closeBtnIcon} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color="#4B5563" />
              </TouchableOpacity>
            </View>

            {viewingNotice && (
              <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <View style={[styles.detailPill, styles.detailPillAudience]}>
                    <Feather name="globe" size={12} color="#EF4444" />
                    <Text style={[styles.detailPillText, { color: '#EF4444' }]}>
                      For {Array.isArray(viewingNotice.sendTo) ? viewingNotice.sendTo.join(', ') : viewingNotice.sendTo}
                    </Text>
                  </View>
                  <View style={[styles.detailPill, styles.detailPillChannel]}>
                    <Feather name="bell" size={12} color="#6366F1" />
                    <Text style={[styles.detailPillText, { color: '#6366F1' }]}>Notice Board</Text>
                  </View>
                  <View style={styles.detailPillNeutral}>
                    <Text style={styles.detailPillNeutralText}>{viewingNotice.category}</Text>
                  </View>
                  <View style={[styles.detailPill, viewingNotice.status === 'Published' ? styles.bgGreen : styles.bgGray]}>
                    <Text style={[styles.detailPillText, viewingNotice.status === 'Published' ? styles.textGreen : styles.textGray]}>{viewingNotice.status}</Text>
                  </View>
                </View>

                <Text style={styles.detailNoticeTitle}>{viewingNotice.title}</Text>

                <View style={styles.detailInfoCard}>
                  <View style={styles.detailInfoRow}>
                    <Feather name="calendar" size={13} color="#EF4444" />
                    <Text style={styles.detailInfoLabel}>Publish Date:</Text>
                    <Text style={styles.detailInfoValue}>{viewingNotice.noticeDate?.split('T')[0]}</Text>
                  </View>
                  {!!viewingNotice.submissionDate && (
                    <View style={styles.detailInfoRow}>
                      <Feather name="clock" size={13} color="#F59E0B" />
                      <Text style={styles.detailInfoLabel}>Submission Deadline:</Text>
                      <Text style={styles.detailInfoValue}>{viewingNotice.submissionDate?.split('T')[0]}</Text>
                    </View>
                  )}
                  <View style={styles.detailInfoRow}>
                    <Feather name="user" size={13} color="#3B82F6" />
                    <Text style={styles.detailInfoLabel}>Posted By:</Text>
                    <Text style={styles.detailInfoValue}>{viewingNotice.createdBy?.name || 'N/A'}</Text>
                  </View>
                </View>

                <View style={styles.detailDescCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Feather name="align-left" size={13} color="#EF4444" />
                    <Text style={styles.detailDescLabel}>Notice Description & Content</Text>
                  </View>
                  <Text style={styles.detailDescText}>{viewingNotice.description || 'No description provided.'}</Text>
                </View>

                {!!viewingNotice.attachments?.length && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={styles.detailDescLabel}>Attachments</Text>
                    {viewingNotice.attachments.map((att: any, idx: number) => (
                      <View key={idx} style={styles.attachBtn}>
                        <Feather name="paperclip" size={13} color="#3B82F6" />
                        <Text style={styles.attachText} numberOfLines={1}>{att.name || `Attachment ${idx + 1}`}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}

            <View style={styles.detailFooter}>
              <TouchableOpacity style={styles.detailCloseBtn} onPress={() => setViewingNotice(null)} activeOpacity={0.85}>
                <Text style={styles.detailCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ToastView />
        </View>
      </Modal>

      {/* Form Modal */}
      <Modal visible={isFormVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>{editingId ? 'Edit Notice' : 'Add New Notice'}</Text>
                <Text style={styles.formSubtitle}>{editingId ? 'Update the details below' : 'Fill in the details to publish'}</Text>
              </View>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}><Feather name="x" size={20} color="#4B5563" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>

              {renderInlineDropdown('sendTo', 'Target Audience *', AUDIENCES)}

              {/* ROLE FIX: School picker rendered strictly based on multi-school permission (canSelectSchool) */}
              {canSelectSchool && (
                <View style={[styles.inputWrapper, { zIndex: activeBranchDropdown ? 60 : 1 }]}>
                  <Text style={styles.inputLabel}>School *</Text>
                  <TouchableOpacity
                    style={[styles.dropdownHeader, activeBranchDropdown && styles.dropdownHeaderActive]}
                    onPress={() => {
                      setActiveDropdown(null);
                      setActiveBranchDropdown(o => !o);
                    }}
                    activeOpacity={0.75}
                    disabled={branchesLoading}
                  >
                    {branchesLoading ? (
                      <ActivityIndicator size="small" color="#8A8F98" />
                    ) : (
                      <Text style={formData.schoolId ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
                        {branches.find(b => b._id === formData.schoolId)?.name
                          || branches.find(b => b._id === formData.schoolId)?.branchName
                          || 'Select school'}
                      </Text>
                    )}
                    <Feather name={activeBranchDropdown ? 'chevron-up' : 'chevron-down'} size={16} color="#8A8F98" />
                  </TouchableOpacity>
                  {activeBranchDropdown && (
                    <View style={styles.dropdownListContainer}>
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 160 }}>
                        {branches.length === 0 && !branchesLoading && (
                          <View style={styles.dropdownItem}><Text style={styles.dropdownItemText}>No schools found</Text></View>
                        )}
                        {branches.map((b, i) => (
                          <TouchableOpacity
                            key={b._id}
                            style={[styles.dropdownItem, i !== branches.length - 1 && styles.borderBottom]}
                            onPress={() => { setFormData({ ...formData, schoolId: b._id }); setActiveBranchDropdown(false); }}
                          >
                            <Text style={[styles.dropdownItemText, formData.schoolId === b._id && styles.textAccent]}>
                              {b.name || b.branchName || b._id}
                            </Text>
                            {formData.schoolId === b._id && <Feather name="check" size={14} color="#EF4444" />}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Notice Title *</Text>
                <TextInput style={styles.input} placeholder="Clear notice title..." placeholderTextColor="#9CA3AF" value={formData.title} onChangeText={t => setFormData({ ...formData, title: t })} />
              </View>

              <View style={[styles.row, { zIndex: 10 }]}>
                <View style={{ flex: 1, marginRight: 10 }}>{renderInlineDropdown('category', 'Category *', CATEGORIES)}</View>
                <View style={{ flex: 1 }}>{renderInlineDropdown('status', 'Status *', STATUSES)}</View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Publish Date *</Text>
                  <TouchableOpacity style={[styles.input, styles.dateInput]} onPress={() => setShowNoticeDatePicker(true)} activeOpacity={0.75}>
                    <Text style={formData.noticeDate ? styles.dateValueText : styles.dropdownPlaceholder}>{formData.noticeDate || 'Select date'}</Text>
                    <Feather name="calendar" size={15} color="#8A8F98" />
                  </TouchableOpacity>
                  {showNoticeDatePicker && (
                    <DateTimePicker
                      value={formData.noticeDate ? parseYMD(formData.noticeDate) : new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onChangeNoticeDate}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Deadline (Optional)</Text>
                  <TouchableOpacity style={[styles.input, styles.dateInput]} onPress={() => setShowSubmissionDatePicker(true)} activeOpacity={0.75}>
                    <Text style={formData.submissionDate ? styles.dateValueText : styles.dropdownPlaceholder}>{formData.submissionDate || 'Select date'}</Text>
                    <Feather name="calendar" size={15} color="#8A8F98" />
                  </TouchableOpacity>
                  {showSubmissionDatePicker && (
                    <DateTimePicker
                      value={formData.submissionDate ? parseYMD(formData.submissionDate) : new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onChangeSubmissionDate}
                    />
                  )}
                </View>
              </View>

              <TouchableOpacity style={styles.toggleRow} onPress={() => setFormData({ ...formData, isPinned: !formData.isPinned })} activeOpacity={0.75}>
                <Feather name={formData.isPinned ? 'check-square' : 'square'} size={18} color={formData.isPinned ? '#EF4444' : '#9CA3AF'} />
                <Text style={styles.toggleLabel}>Pin Notice (Stays at top)</Text>
              </TouchableOpacity>

              <View style={{ marginBottom: 16 }}>
                <Text style={styles.inputLabel}>Detailed Content</Text>
                <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top', paddingTop: 12 }]} multiline value={formData.description} onChangeText={t => setFormData({ ...formData, description: t })} placeholder="Write the full notice here..." placeholderTextColor="#9CA3AF" />
              </View>

              <Text style={styles.inputLabel}>Document Attachment</Text>
              <TouchableOpacity style={styles.uploadBtn} onPress={handlePickFile} activeOpacity={0.75} disabled={uploadingFile}>
                {uploadingFile ? (
                  <ActivityIndicator size="small" color="#6B7280" />
                ) : uploadedAttachment ? (
                  <Feather name="check-circle" size={16} color="#16A34A" />
                ) : (
                  <Feather name="upload-cloud" size={16} color="#6B7280" />
                )}
                <Text style={styles.uploadText} numberOfLines={1}>
                  {uploadingFile ? 'Uploading...' : file ? file.name : 'Choose File (PDF, Image)'}
                </Text>
                {file && !uploadingFile && (
                  <TouchableOpacity onPress={removeAttachment} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="x-circle" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={[styles.saveBtnFull, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.9}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Submit Announcement</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
          {/* Toast rendered inside this Modal's own layer so it isn't hidden behind the form */}
          <ToastView />
        </KeyboardAvoidingView>
      </Modal>

      {/* Fallback toast for when no Modal is open (e.g. delete-list errors) */}
      <ToastView />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6F8' },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingTop: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#EEF0F2' },
  title: { fontSize: 24, fontWeight: '800', color: '#101317', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: '#767C87', marginTop: 4 },

  filterSection: { padding: 16, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#EEF0F2', zIndex: 10 },
  audiencePill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22, backgroundColor: '#F5F6F8', borderWidth: 1, borderColor: '#EEF0F2' },
  audiencePillActive: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  audiencePillText: { fontSize: 13, fontWeight: '700', color: '#565C66' },
  audiencePillTextActive: { color: '#EF4444' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F6F8', borderWidth: 1, borderColor: '#EEF0F2', borderRadius: 12, paddingHorizontal: 14, height: 42 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13, color: '#101317' },
  addBtnFull: { backgroundColor: '#EF4444', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 13, borderRadius: 12, marginTop: 12, shadowColor: '#EF4444', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  addBtnTextFull: { color: '#fff', fontWeight: '800', marginLeft: 8, fontSize: 14 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 14 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#F1F2F4', shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  catBadge: { backgroundColor: '#F3E8FF', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7 },
  catBadgeText: { fontSize: 10, fontWeight: '800', color: '#9333EA', letterSpacing: 0.2 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7 },
  bgGreen: { backgroundColor: '#DCFCE7' }, textGreen: { color: '#16A34A', fontWeight: '800', fontSize: 10 },
  bgGray: { backgroundColor: '#F1F2F4' }, textGray: { color: '#565C66', fontWeight: '800', fontSize: 10 },
  statusText: { fontSize: 10, letterSpacing: 0.2 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#101317', lineHeight: 21 },
  cardDesc: { fontSize: 13, color: '#565C66', marginTop: 8, lineHeight: 19 },
  cardFooter: { flexDirection: 'row', gap: 16, marginTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F2F4' },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { fontSize: 12, color: '#767C87', fontWeight: '600' },

  cardActions: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  attachBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 5 },
  attachText: { color: '#3B82F6', fontSize: 12, fontWeight: '700' },
  iconBtnView: { padding: 9, backgroundColor: '#EFF6FF', borderRadius: 10, borderWidth: 1, borderColor: '#DBEAFE' },
  iconBtnEdit: { padding: 9, backgroundColor: '#ECFDF5', borderRadius: 10, borderWidth: 1, borderColor: '#D1FAE5' },
  iconBtnDelete: { padding: 9, backgroundColor: '#FEF2F2', borderRadius: 10, borderWidth: 1, borderColor: '#FEE2E2' },

  emptyState: { alignItems: 'center', padding: 44, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1.5, borderColor: '#EEF0F2', borderStyle: 'dashed', marginTop: 20 },
  emptyStateText: { color: '#767C87', marginTop: 10, fontWeight: '600', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,17,20,0.55)', justifyContent: 'center', padding: 18 },
  compactModalContainer: { backgroundColor: '#fff', borderRadius: 22, maxHeight: '90%', elevation: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, backgroundColor: '#FAFAFB', borderBottomWidth: 1, borderBottomColor: '#EEF0F2' },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#101317' },
  formSubtitle: { fontSize: 12, color: '#8A8F98', marginTop: 3 },
  closeBtnIcon: { padding: 7, backgroundColor: '#EEF0F2', borderRadius: 20 },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#565C66', marginBottom: 7, marginLeft: 2 },
  input: { borderWidth: 1.3, borderColor: '#E7E9EC', borderRadius: 12, paddingHorizontal: 14, height: 46, backgroundColor: '#fff', fontSize: 14, color: '#101317' },
  dateInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateValueText: { fontSize: 13, color: '#101317', fontWeight: '500' },
  row: { flexDirection: 'row', marginBottom: 16, zIndex: 2 },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.3, borderColor: '#E7E9EC', borderRadius: 12, paddingHorizontal: 14, height: 46, backgroundColor: '#fff' },
  dropdownHeaderActive: { borderColor: '#EF4444' },
  dropdownSelectedText: { fontSize: 13, color: '#101317', fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 13, color: '#9CA3AF' },
  dropdownListContainer: { position: 'absolute', top: 74, left: 0, right: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EEF0F2', borderRadius: 12, elevation: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 13 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: '#F5F6F8' },
  dropdownItemText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  textAccent: { color: '#EF4444', fontWeight: '700' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.3, borderColor: '#E7E9EC', borderStyle: 'dashed', borderRadius: 12, padding: 14, backgroundColor: '#FAFAFB', gap: 9 },
  uploadText: { fontSize: 13, color: '#565C66', flex: 1 },

  saveBtnFull: { backgroundColor: '#EF4444', height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: '#EF4444', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Delete confirm
  confirmCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', alignSelf: 'center', width: '100%', maxWidth: 340 },
  confirmIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  confirmTitle: { fontSize: 17, fontWeight: '800', color: '#101317', marginBottom: 6 },
  confirmBody: { fontSize: 13, color: '#767C87', textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  confirmActions: { flexDirection: 'row', gap: 10, width: '100%' },
  confirmCancelBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#F5F6F8', justifyContent: 'center', alignItems: 'center' },
  confirmCancelText: { fontWeight: '700', color: '#565C66', fontSize: 14 },
  confirmDeleteBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
  confirmDeleteText: { fontWeight: '700', color: '#fff', fontSize: 14 },

  // Notice Detail (View) Modal
  detailModalContainer: { backgroundColor: '#fff', borderRadius: 22, maxHeight: '85%', elevation: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24 },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: '#EEF0F2' },
  detailHeaderIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
  detailTitle: { fontSize: 17, fontWeight: '800', color: '#101317' },
  detailSubtitle: { fontSize: 12, color: '#8A8F98', marginTop: 3, lineHeight: 16 },
  detailScroll: { padding: 20, paddingTop: 16 },
  detailPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  detailPillAudience: { backgroundColor: '#FEF2F2' },
  detailPillChannel: { backgroundColor: '#EEF2FF' },
  detailPillText: { fontSize: 12, fontWeight: '700' },
  detailPillNeutral: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E7E9EC' },
  detailPillNeutralText: { fontSize: 12, fontWeight: '700', color: '#565C66' },
  detailNoticeTitle: { fontSize: 20, fontWeight: '800', color: '#101317', marginBottom: 14 },
  detailInfoCard: { backgroundColor: '#FAFAFB', borderWidth: 1, borderColor: '#EEF0F2', borderRadius: 14, padding: 14, marginBottom: 14, gap: 10 },
  detailInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  detailInfoLabel: { fontSize: 12, color: '#767C87', fontWeight: '600' },
  detailInfoValue: { fontSize: 12, color: '#101317', fontWeight: '800' },
  detailDescCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#EEF0F2', borderRadius: 14, padding: 14 },
  detailDescLabel: { fontSize: 12, fontWeight: '700', color: '#565C66' },
  detailDescText: { fontSize: 13, color: '#374151', lineHeight: 19 },
  detailFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#EEF0F2', alignItems: 'flex-end' },
  detailCloseBtn: { backgroundColor: '#565C66', paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12 },
  detailCloseBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Toast
  toast: { position: 'absolute', bottom: 24, left: 16 , right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8, zIndex: 9999 },
  toastError: { backgroundColor: '#DC2626' },
  toastSuccess: { backgroundColor: '#16A34A' },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },
});