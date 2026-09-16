import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import RNBlobUtil from 'react-native-blob-util';
import { API_BASE } from '../network/api';

import FileViewer from 'react-native-file-viewer';


const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueDark: '#2563EB', blueSoft: '#EFF6FF',
  amber: '#F59E0B', amberDark: '#D97706', amberSoft: '#FEF3C7',
  slate: '#64748B', slateDark: '#475569', slateSoft: '#F1F5F9',
};

// Reusable native-feeling shadow (elevation alone renders flat/web-like on iOS)
const cardShadow = {
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
  elevation: 2,
};
const floatShadow = {
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.16,
  shadowRadius: 20,
  elevation: 10,
};

const TEMPLATES = [
  { id: 1, name: 'Classic Crimson', color: '#c5221f' },
  { id: 2, name: 'Royal Navy', color: '#1e3a8a' },
  { id: 3, name: 'Emerald Excellence', color: '#065f46' },
  { id: 4, name: 'Imperial Violet', color: '#581c87' },
  { id: 5, name: 'Sapphire Exec', color: '#0369a1' },
  { id: 6, name: 'Corp Bronze', color: '#78350f' },
];

const DOC_META: Record<string, { icon: string; color: string; soft: string; label: string }> = {
  TC: { icon: 'file-minus', color: C.primary, soft: C.primarySoft, label: 'Transfer Certificate' },
  Bonafide: { icon: 'file-text', color: C.blue, soft: C.blueSoft, label: 'Bonafide' },
  CharacterCertificate: { icon: 'star', color: C.amber, soft: C.amberSoft, label: 'Character Cert' },
  IDCard: { icon: 'credit-card', color: C.slate, soft: C.slateSoft, label: 'ID Card' },
};

export default function CertificatesHistoryScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  // Data States
  const [logs, setLogs] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  // UI & List States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Generation Modal States
  const [showModal, setShowModal] = useState(false);
  const [docType, setDocType] = useState('TC');
  const [recipientCategory, setRecipientCategory] = useState<'student' | 'staff'>('student');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(1);
  const [generating, setGenerating] = useState(false);

  // Per-item reprint spinner instead of a blocking alert loop
  const [reprintingId, setReprintingId] = useState<string | null>(null);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    const sId = await AsyncStorage.getItem('schoolId');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    setSchoolId(sId);

    fetchDependencies(token);
    fetchLogs(token, filterType);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchDependencies = async (token: string | null) => {
    try {
      const [clsRes, staffRes] = await Promise.all([
        axios.get(`${API_BASE}/classes`, authHeaders(token)),
        axios.get(`${API_BASE}/staff?limit=500`, authHeaders(token))
      ]);
      const clsData = clsRes.data?.data || [];
      setClasses(clsData);
      setStaffList(staffRes.data?.data || []);
      if (clsData.length > 0) setSelectedClassId(clsData[0]._id);
    } catch (e) { console.error('Failed to load dependencies'); }
  };

  const fetchLogs = async (token: string | null = authToken, type: string = filterType, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = type ? { type } : {};
      const res = await axios.get(`${API_BASE}/certificates`, { params, ...authHeaders(token) });
      if (res.data?.success) setLogs(res.data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const fetchClassStudents = async (classId: string) => {
    try {
      const res = await axios.get(`${API_BASE}/students`, { params: { classId, limit: 500 }, ...authHeaders(authToken) });
      const list = res.data?.data || res.data?.students || [];
      setClassStudents(list);
      if (list.length > 0) setSelectedStudentId(list[0]._id);
      else setSelectedStudentId('');
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (selectedClassId && showModal && recipientCategory === 'student') {
      fetchClassStudents(selectedClassId);
    }
  }, [selectedClassId, showModal, recipientCategory]);

  const handleOpenModal = (type: string) => {
    setDocType(type);
    setRecipientCategory('student');
    setPurpose('');
    setRemarks('');
    setSelectedTemplateId(1);
    setActiveDropdown(null);
    setShowModal(true);
  };

  const handleGenerateDocument = async () => {
    if (recipientCategory === 'student' && !selectedStudentId) { Alert.alert('Error', 'Please select a student.'); return; }
    if (recipientCategory === 'staff' && !selectedStaffId) { Alert.alert('Error', 'Please select a staff member.'); return; }

    setGenerating(true);
    try {
      let endpoint = '/certificates/transfer-certificate';
      if (docType === 'Bonafide') endpoint = '/certificates/bonafide';
      if (docType === 'CharacterCertificate') endpoint = '/certificates/character-certificate';
      if (docType === 'IDCard') endpoint = '/certificates/id-card';

      const payload = {
        studentId: recipientCategory === 'student' ? selectedStudentId : undefined,
        staffId: recipientCategory === 'staff' ? selectedStaffId : undefined,
        purpose, remarks, templateId: selectedTemplateId,
      };

      await axios.post(`${API_BASE}${endpoint}`, payload, authHeaders(authToken));

      Alert.alert('Success', `${docType} generated successfully. Tap "Reprint PDF" in the list to view.`);
      setShowModal(false);
      fetchLogs(authToken, filterType, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to generate document.'); }
    finally { setGenerating(false); }
  };

const handleReprint = async (certId: string) => {
  if (!authToken) {
    Alert.alert(
      'Session expired',
      'Please log in again to view this document.'
    );
    return;
  }

  setReprintingId(certId);

  try {
    const url = `${API_BASE}/certificates/${certId}/reprint`;

    console.log('Reprint URL:', url);

    // Download PDF using Axios
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/pdf',
      },

      // IMPORTANT: receive binary PDF data
      responseType: 'arraybuffer',
      timeout: 60000,
    });

    console.log('Response status:', response.status);
    console.log('Content-Type:', response.headers['content-type']);

    if (response.status !== 200) {
      throw new Error('Failed to download PDF');
    }

    const contentType = response.headers['content-type'];

    // Check whether backend actually returned a PDF
    if (
      contentType &&
      !contentType.toLowerCase().includes('application/pdf')
    ) {
      console.log('Unexpected response:', response.data);

      throw new Error(
        'Server did not return a PDF file. Please check the reprint API.'
      );
    }

    // Convert ArrayBuffer → Base64
    const base64Data = RNBlobUtil.base64.encode(
      String.fromCharCode(
        ...new Uint8Array(response.data)
      )
    );

    const fileName = `certificate_${Date.now()}.pdf`;

    const filePath =
      Platform.OS === 'android'
        ? `${RNBlobUtil.fs.dirs.DocumentDir}/${fileName}`
        : `${RNBlobUtil.fs.dirs.DocumentDir}/${fileName}`;

    console.log('Saving PDF:', filePath);

    // Write PDF directly to storage
    await RNBlobUtil.fs.writeFile(
      filePath,
      base64Data,
      'base64'
    );

    // Verify file
    const exists = await RNBlobUtil.fs.exists(filePath);

    if (!exists) {
      throw new Error('PDF file could not be saved.');
    }

    const fileInfo = await RNBlobUtil.fs.stat(filePath);

    console.log('PDF file size:', fileInfo.size);

    if (Number(fileInfo.size) < 1000) {
      throw new Error(
        'Downloaded file is too small and may not be a valid PDF.'
      );
    }

    // Open PDF
await FileViewer.open(filePath, {
  showOpenWithDialog: true,
  showAppsSuggestions: false,
  displayName: fileName,
 
});

  } catch (error: any) {
    console.log('REPRINT COMPLETE ERROR:', error);

    let errorMessage =
      'Could not download the certificate.';

    if (error.response) {
      console.log('API Error Status:', error.response.status);
      console.log('API Error Data:', error.response.data);

      errorMessage =
        `Server error: ${error.response.status}`;
    } else if (error.message) {
      errorMessage = error.message;
    }

    Alert.alert(
      'Reprint Error',
      errorMessage
    );

  } finally {
    setReprintingId(null);
  }
};

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return logs;
    const q = searchQuery.toLowerCase().trim();
    return logs.filter(log => {
      const certNo = log.certificateNumber?.toLowerCase() || '';
      const stuName = log.studentId?.name?.toLowerCase() || '';
      const admNo = String(log.studentId?.admissionNo || '').toLowerCase();
      const stfName = log.staffId?.name?.toLowerCase() || '';
      return certNo.includes(q) || stuName.includes(q) || admNo.includes(q) || stfName.includes(q);
    });
  }, [logs, searchQuery]);

  const renderInlineDropdown = (fieldKey: string, label: string, options: {label: string, value: string}[], value: string, onSelect: (v: string) => void, zIndexOff = 0) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 + zIndexOff : 1 + zIndexOff }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || 'Select...'}</Text>
          <View style={[styles.chevronBadge, isOpen && { backgroundColor: C.primarySoft }]}>
            <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={isOpen ? C.primary : C.textMuted} />
          </View>
        </TouchableOpacity>
        {isOpen && (
          <View style={[styles.dropdownListContainer, floatShadow]}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
              {options.length === 0 ? (
                <Text style={{ padding: 16, color: C.textFaint, textAlign: 'center' }}>No data available</Text>
              ) : options.map((opt, i) => (
                <TouchableOpacity key={opt.value + i} style={styles.dropdownItem} onPress={() => { onSelect(opt.value); setActiveDropdown(null); }} activeOpacity={0.7}>
                  <Text style={[styles.dropdownItemText, value === opt.value && styles.textBrand]} numberOfLines={2}>{opt.label}</Text>
                  {value === opt.value && <Feather name="check" size={15} color={C.primary} />}
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
        <View style={styles.headerIconBadge}><Feather name="award" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Certificates & IDs</Text>
          <Text style={styles.subtitle}>Issue documents and view history</Text>
        </View>
      </View>

      {/* Quick Action Tiles */}
      <View style={styles.actionSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionScroller}>
          {(['TC', 'Bonafide', 'CharacterCertificate', 'IDCard'] as const).map(type => {
            const meta = DOC_META[type];
            return (
              <TouchableOpacity key={type} style={[styles.actionTile, cardShadow]} activeOpacity={0.8} onPress={() => handleOpenModal(type)}>
                <View style={[styles.actionIconWrap, { backgroundColor: meta.soft }]}>
                  <Feather name={meta.icon} size={18} color={meta.color} />
                </View>
                <Text style={styles.actionTileText}>{meta.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Filters */}
      <View style={styles.filterSection}>
        <View style={{ zIndex: 20 }}>
          {renderInlineDropdown('fType', 'DOCUMENT TYPE', [
            { label: 'All Documents', value: '' },
            { label: 'Transfer Certificate (TC)', value: 'TC' },
            { label: 'Bonafide Certificate', value: 'Bonafide' },
            { label: 'Character Certificate', value: 'CharacterCertificate' },
            { label: 'ID Card', value: 'IDCard' },
          ], filterType, (v) => { setFilterType(v); fetchLogs(authToken, v); })}
        </View>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={C.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, roll, cert no..."
            placeholderTextColor={C.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x-circle" size={16} color={C.textFaint} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchLogs(authToken, filterType, true)} colors={[C.primary]} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}><Feather name="folder-minus" size={30} color={C.textFaint} /></View>
              <Text style={styles.emptyTitle}>No documents found</Text>
              <Text style={styles.emptySubtitle}>Use the tiles above to generate a document.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isStudent = !!item.studentId;
            const recipientName = item.studentId?.name || item.staffId?.name || 'Unknown';
            const recipientMeta = isStudent
              ? `${item.studentId.className || ''} ${item.studentId.division || ''} • Adm: ${item.studentId.admissionNo || '-'}`
              : `Staff ID: ${item.staffId?.staffId || '-'}`;
            const meta = DOC_META[item.type] || DOC_META.TC;
            const isReprinting = reprintingId === item._id;

            return (
              <View style={[styles.card, cardShadow]}>
                <View style={[styles.cardAccent, { backgroundColor: meta.color }]} />
                <View style={styles.cardBody}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.certNo}>{item.certificateNumber}</Text>
                      <View style={styles.tagsRow}>
                        <View style={[styles.typeBadge, { backgroundColor: meta.soft }]}>
                          <Feather name={meta.icon} size={10} color={meta.color} />
                          <Text style={[styles.typeBadgeText, { color: meta.color }]}>{item.type}</Text>
                        </View>
                        <View style={styles.tmplBadge}><Text style={styles.tmplBadgeText}>Template {item.templateId || 1}</Text></View>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.dateText}>{item.issuedDate}</Text>
                      <Text style={styles.issuedByText}>By {item.issuedBy?.name || 'Admin'}</Text>
                    </View>
                  </View>

                  <View style={styles.recipientBox}>
                    <View style={styles.recipientAvatar}>
                      <Text style={styles.recipientAvatarText}>{recipientName.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recipientName}>{recipientName}</Text>
                      <Text style={styles.recipientMeta}>{recipientMeta}</Text>
                    </View>
                  </View>

                  {!!item.remarks && <Text style={styles.remarksText} numberOfLines={2}>Notes: {item.remarks}</Text>}

                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.reprintBtn} onPress={() => handleReprint(item._id)} disabled={isReprinting} activeOpacity={0.8}>
                      {isReprinting
                        ? <ActivityIndicator size="small" color={C.primaryDark} />
                        : <Feather name="printer" size={14} color={C.primaryDark} />}
                      <Text style={styles.reprintBtnText}>{isReprinting ? 'Opening...' : 'Reprint PDF'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* GENERATION MODAL — bottom sheet, not a centered web-style dialog */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalScrim} activeOpacity={1} onPress={() => setShowModal(false)} />
          <View style={[styles.sheetContainer, floatShadow]}>
            <View style={styles.sheetHandle} />
            <View style={styles.formHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.formHeaderIcon}><Feather name="file-plus" size={16} color={C.primary} /></View>
                <Text style={styles.formTitle}>Generate {docType === 'CharacterCertificate' ? 'Character Cert' : docType}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtnIcon} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={18} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>

              {docType === 'IDCard' && (
                <View style={styles.segmentControl}>
                  <TouchableOpacity style={[styles.segmentBtn, recipientCategory === 'student' && styles.segmentBtnActive]} onPress={() => setRecipientCategory('student')}>
                    <Text style={[styles.segmentText, recipientCategory === 'student' && styles.segmentTextActive]}>Student ID</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.segmentBtn, recipientCategory === 'staff' && styles.segmentBtnActive]} onPress={() => setRecipientCategory('staff')}>
                    <Text style={[styles.segmentText, recipientCategory === 'staff' && styles.segmentTextActive]}>Staff ID</Text>
                  </TouchableOpacity>
                </View>
              )}

              {recipientCategory === 'student' ? (
                <>
                  <View style={{ zIndex: 40 }}>
                    {renderInlineDropdown('fClass', 'Select Class *', classes.map(c => ({ label: `${c.className} ${c.division || ''}`, value: c._id })), selectedClassId, setSelectedClassId, 10)}
                  </View>
                  <View style={{ zIndex: 30 }}>
                    {renderInlineDropdown('fStudent', 'Select Student *', classStudents.map(s => ({ label: `${s.name} (Roll: ${s.rollNo || '-'})`, value: s._id })), selectedStudentId, setSelectedStudentId)}
                  </View>
                </>
              ) : (
                <View style={{ zIndex: 40 }}>
                  {renderInlineDropdown('fStaff', 'Select Staff Member *', staffList.map(s => ({ label: `${s.name} (${s.staffId})`, value: s._id })), selectedStaffId, setSelectedStaffId)}
                </View>
              )}

              <Text style={styles.inputLabel}>Template Design *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateScroll}>
                {TEMPLATES.map(t => {
                  const active = selectedTemplateId === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.templateCard, active && { borderColor: t.color, backgroundColor: `${t.color}12` }, active && cardShadow]}
                      onPress={() => setSelectedTemplateId(t.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.templateDot, { backgroundColor: t.color }]} />
                      <Text style={[styles.templateText, active && { color: t.color, fontWeight: '800' }]}>{t.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {docType !== 'IDCard' && (
                <>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Purpose / Reason</Text>
                    <TextInput style={styles.input} placeholder="e.g. Higher Education" placeholderTextColor={C.textFaint} value={purpose} onChangeText={setPurpose} />
                  </View>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Remarks on Certificate</Text>
                    <TextInput style={[styles.input, { height: 76, textAlignVertical: 'top', paddingTop: 12 }]} multiline placeholder="e.g. Bears good moral character..." placeholderTextColor={C.textFaint} value={remarks} onChangeText={setRemarks} />
                  </View>
                </>
              )}

              <TouchableOpacity style={[styles.saveBtnFull, floatShadow]} onPress={handleGenerateDocument} disabled={generating} activeOpacity={0.85}>
                {generating ? <ActivityIndicator color="#fff" /> : <><Feather name="printer" size={16} color="#fff" style={{ marginRight: 8 }} /><Text style={styles.saveBtnFullText}>Generate & PDF</Text></>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 21, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 2 },

  actionSection: { backgroundColor: C.surface, paddingBottom: 14, borderBottomWidth: 1, borderColor: C.border },
  actionScroller: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  actionTile: { alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, width: 92 },
  actionIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionTileText: { fontSize: 11, fontWeight: '700', color: C.text, textAlign: 'center' },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10, gap: 12 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 24, paddingHorizontal: 14, height: 46, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: C.text },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16, gap: 14 },
  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  // List Card — colored accent bar + soft native shadow (no borders needed)
  card: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 18, overflow: 'hidden' },
  cardAccent: { width: 5 },
  cardBody: { flex: 1, padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  certNo: { fontSize: 15, fontWeight: '800', color: C.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 7, letterSpacing: -0.2 },
  tagsRow: { flexDirection: 'row', gap: 6 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  tmplBadge: { backgroundColor: C.slateSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  tmplBadgeText: { fontSize: 10, fontWeight: '800', color: C.slateDark },
  dateText: { fontSize: 12, fontWeight: '700', color: C.text },
  issuedByText: { fontSize: 10, color: C.textMuted, marginTop: 4, fontWeight: '600' },

  recipientBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 14 },
  recipientAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  recipientAvatarText: { fontSize: 15, fontWeight: '800', color: C.primaryDark },
  recipientName: { fontSize: 14.5, fontWeight: '800', color: C.text },
  recipientMeta: { fontSize: 11.5, color: C.textMuted, marginTop: 2, fontWeight: '600' },
  remarksText: { fontSize: 12, color: C.textMuted, fontStyle: 'italic', marginTop: 10 },

  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  reprintBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primarySoft, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22, gap: 7 },
  reprintBtnText: { color: C.primaryDark, fontSize: 12.5, fontWeight: '800' },

  // Modal — bottom sheet
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: {backgroundColor: 'rgba(15,23,42,0.55)' },
  sheetContainer: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', paddingBottom: Platform.OS === 'ios' ? 24 : 0 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  formHeaderIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  formTitle: { fontSize: 16.5, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  closeBtnIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center' },
  formScroll: { paddingHorizontal: 20, paddingBottom: 20, gap: 16 },

  segmentControl: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 4, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  segmentBtnActive: { backgroundColor: C.primary, ...cardShadow },
  segmentText: { fontSize: 12.5, fontWeight: '700', color: C.textMuted },
  segmentTextActive: { color: '#fff' },

  templateScroll: { gap: 10 },
  templateCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: C.border },
  templateDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  templateText: { fontSize: 12, color: C.text, fontWeight: '600' },

  inputWrapper: { gap: 0 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 8, marginLeft: 2, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingHorizontal: 16, height: 48, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingHorizontal: 16, height: 48, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary, backgroundColor: C.surface },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600', flex: 1, marginRight: 8 },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  chevronBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center' },
  dropdownListContainer: { position: 'absolute', top: 70, left: 0, right: 0, backgroundColor: C.surface, borderRadius: 14, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13.5, color: C.text, fontWeight: '500', flex: 1, marginRight: 8 },
  textBrand: { color: C.primary, fontWeight: '700' },

  saveBtnFull: { backgroundColor: C.primary, flexDirection: 'row', height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});