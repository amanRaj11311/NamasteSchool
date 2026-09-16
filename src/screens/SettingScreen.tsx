import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import {API_BASE} from '../network/api';

const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

const ALLOCATION_POLICIES = [
  { label: 'High to Low Result Percent (Merit Order)', value: 'HighToLow' },
  { label: 'Balanced Round-Robin Mix', value: 'Balanced' },
  { label: 'Roll Number Order', value: 'RollNumber' },
  { label: 'Admission Date Order', value: 'AdmissionDate' },
];

export default function SettingsScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Tabs: 'academic' | 'security' | 'account'
  const [activeTab, setActiveTab] = useState<'academic' | 'security' | 'account'>('account');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // States
  const [profile, setProfile] = useState({ name: '', email: '', role: '' });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false });
  
  const [academicSettings, setAcademicSettings] = useState({
    minOverallPercent: '33',
    minSubjectPercent: '33',
    maxSubjectsAllowedToFail: '0',
    allocationPolicy: 'HighToLow',
    defaultSectionCapacity: '35',
  });

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    const uName = await AsyncStorage.getItem('userName') || '';
    const uEmail = await AsyncStorage.getItem('userEmail') || '';
    const uRole = await AsyncStorage.getItem('userRole') || 'User';
    
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    
    setProfile({ name: uName, email: uEmail, role: uRole });
    fetchSettings(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchSettings = async (token: string | null = authToken) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/settings`, authHeaders(token));
      if (res.data?.data) {
        const s = res.data.data;
        setAcademicSettings({
          minOverallPercent: String(s.promotionCriteria?.minOverallPercent ?? 33),
          minSubjectPercent: String(s.promotionCriteria?.minSubjectPercent ?? 33),
          maxSubjectsAllowedToFail: String(s.promotionCriteria?.maxSubjectsAllowedToFail ?? 0),
          allocationPolicy: s.allocationPolicy || 'HighToLow',
          defaultSectionCapacity: String(s.defaultSectionCapacity || 35),
        });
      }
    } catch (e) { console.error('Failed to load settings', e); }
    finally { setLoading(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'settings' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const canUpdate = hasPermission('update');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // --- Handlers ---
  const handleSaveProfile = async () => {
    if (!profile.name.trim() || !profile.email.trim()) { Alert.alert('Error', 'Name and Email are required.'); return; }
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/auth/profile`, { name: profile.name, email: profile.email }, authHeaders(authToken));
      await AsyncStorage.setItem('userName', profile.name);
      await AsyncStorage.setItem('userEmail', profile.email);
      showToast('Profile updated successfully');
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to update profile'); }
    finally { setSaving(false); }
  };

  const handleSavePassword = async () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) { Alert.alert('Error', 'All password fields are required.'); return; }
    if (passwords.new !== passwords.confirm) { Alert.alert('Error', 'New passwords do not match.'); return; }
    if (passwords.new.length < 8) { Alert.alert('Error', 'Password must be at least 8 characters long.'); return; }
    
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/auth/password`, { currentPassword: passwords.current, newPassword: passwords.new }, authHeaders(authToken));
      setPasswords({ current: '', new: '', confirm: '' });
      showToast('Password changed securely');
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to update password'); }
    finally { setSaving(false); }
  };

  const handleSaveAcademic = async () => {
    setSaving(true);
    try {
      const payload = {
        promotionCriteria: {
          minOverallPercent: Number(academicSettings.minOverallPercent),
          minSubjectPercent: Number(academicSettings.minSubjectPercent),
          maxSubjectsAllowedToFail: Number(academicSettings.maxSubjectsAllowedToFail),
        },
        allocationPolicy: academicSettings.allocationPolicy,
        defaultSectionCapacity: Number(academicSettings.defaultSectionCapacity),
      };
      await axios.put(`${API_BASE}/settings`, payload, authHeaders(authToken));
      showToast('Academic rules updated');
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to save academic settings'); }
    finally { setSaving(false); }
  };

  // --- Dropdown Helper ---
  const renderInlineDropdown = (fieldKey: string, label: string, options: {label: string, value: string}[], value: string, onSelect: (v: string) => void) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => canUpdate && setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || 'Select...'}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => (
                <TouchableOpacity key={opt.value + i} style={styles.dropdownItem} onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}>
                  <Text style={[styles.dropdownItemText, value === opt.value && styles.textBrand]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIconBadge}><Feather name="settings" size={20} color={C.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.subtitle}>Manage your system preferences and account.</Text>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainerWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
            <TouchableOpacity style={[styles.tabBtn, activeTab === 'account' && styles.tabBtnActive]} onPress={() => setActiveTab('account')}>
              <Feather name="user" size={14} color={activeTab === 'account' ? '#fff' : C.textMuted} />
              <Text style={[styles.tabText, activeTab === 'account' && styles.tabTextActive]}>Account Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, activeTab === 'academic' && styles.tabBtnActive]} onPress={() => setActiveTab('academic')}>
              <Feather name="book-open" size={14} color={activeTab === 'academic' ? '#fff' : C.textMuted} />
              <Text style={[styles.tabText, activeTab === 'academic' && styles.tabTextActive]}>Academic Rules</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, activeTab === 'security' && styles.tabBtnActive]} onPress={() => setActiveTab('security')}>
              <Feather name="shield" size={14} color={activeTab === 'security' ? '#fff' : C.textMuted} />
              <Text style={[styles.tabText, activeTab === 'security' && styles.tabTextActive]}>Security</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Content Area */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* ================= ACCOUNT TAB ================= */}
          {activeTab === 'account' && (
            <View style={styles.card}>
              <View style={styles.profileBanner}>
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarLargeText}>{profile.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.profileName}>{profile.name}</Text>
                <Text style={styles.profileEmail}>{profile.email}</Text>
                <View style={styles.roleBadge}><Feather name="award" size={10} color={C.blue}/><Text style={styles.roleBadgeText}>{profile.role}</Text></View>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <TextInput style={styles.input} value={profile.name} onChangeText={t => setProfile({...profile, name: t})} editable={canUpdate} />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput style={styles.input} value={profile.email} onChangeText={t => setProfile({...profile, email: t})} editable={canUpdate} keyboardType="email-address" autoCapitalize="none" />
                </View>
                {canUpdate && (
                  <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveProfile} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="save" size={16} color="#fff" style={{marginRight:8}}/><Text style={styles.saveBtnFullText}>Save Profile</Text></>}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ================= ACADEMIC TAB ================= */}
          {activeTab === 'academic' && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Feather name="award" size={18} color={C.primary} style={{marginRight: 8}}/>
                <Text style={styles.cardTitle}>Promotion & Allocation Config</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.inputLabel}>Min Overall %</Text>
                    <TextInput style={styles.input} keyboardType="numeric" value={academicSettings.minOverallPercent} onChangeText={t => setAcademicSettings({...academicSettings, minOverallPercent: t})} editable={canUpdate} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Min Subject %</Text>
                    <TextInput style={styles.input} keyboardType="numeric" value={academicSettings.minSubjectPercent} onChangeText={t => setAcademicSettings({...academicSettings, minSubjectPercent: t})} editable={canUpdate} />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.inputLabel}>Max Fail Allowed</Text>
                    <TextInput style={styles.input} keyboardType="numeric" value={academicSettings.maxSubjectsAllowedToFail} onChangeText={t => setAcademicSettings({...academicSettings, maxSubjectsAllowedToFail: t})} editable={canUpdate} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Section Capacity</Text>
                    <TextInput style={styles.input} keyboardType="numeric" value={academicSettings.defaultSectionCapacity} onChangeText={t => setAcademicSettings({...academicSettings, defaultSectionCapacity: t})} editable={canUpdate} />
                  </View>
                </View>

                {renderInlineDropdown('allocationPolicy', 'Section Allocation Policy', ALLOCATION_POLICIES, academicSettings.allocationPolicy, (v) => setAcademicSettings({...academicSettings, allocationPolicy: v}))}

                {canUpdate && (
                  <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveAcademic} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="settings" size={16} color="#fff" style={{marginRight:8}}/><Text style={styles.saveBtnFullText}>Save Academic Rules</Text></>}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ================= SECURITY TAB ================= */}
          {activeTab === 'security' && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Feather name="lock" size={18} color={C.primary} style={{marginRight: 8}}/>
                <Text style={styles.cardTitle}>Change Password</Text>
              </View>
              <View style={styles.cardBody}>
                {[
                  { key: 'current', label: 'Current Password' },
                  { key: 'new', label: 'New Password' },
                  { key: 'confirm', label: 'Confirm Password' }
                ].map((field) => (
                  <View key={field.key} style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>{field.label}</Text>
                    <View style={styles.pwdContainer}>
                      <TextInput 
                        style={styles.pwdInput} 
                        value={(passwords as any)[field.key]} 
                        onChangeText={t => setPasswords({...passwords, [field.key]: t})} 
                        secureTextEntry={!(showPwd as any)[field.key]}
                        editable={canUpdate}
                      />
                      <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPwd({...showPwd, [field.key]: !(showPwd as any)[field.key]})}>
                        <Feather name={(showPwd as any)[field.key] ? "eye-off" : "eye"} size={16} color={C.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {canUpdate && (
                  <TouchableOpacity style={[styles.saveBtnFull, {backgroundColor: C.text}]} onPress={handleSavePassword} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="shield" size={16} color="#fff" style={{marginRight:8}}/><Text style={styles.saveBtnFullText}>Update Password</Text></>}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Success Toast */}
      {!!toastMsg && (
        <View style={styles.toastContainer}>
          <Feather name="check-circle" size={16} color="#fff" style={{marginRight: 8}} />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  tabContainerWrapper: { backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  tabScrollContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  tabBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: C.border, gap: 6 },
  tabBtnActive: { backgroundColor: '#111827', borderColor: '#111827' },
  tabText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  tabTextActive: { color: '#fff' },

  scrollContent: { padding: 16, paddingBottom: 60 },

  card: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, elevation: 1, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  cardBody: { padding: 20 },

  profileBanner: { alignItems: 'center', padding: 30, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderColor: C.border },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 12, elevation: 5, shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 10 },
  avatarLargeText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 20, fontWeight: '800', color: C.text },
  profileEmail: { fontSize: 13, color: C.textMuted, fontWeight: '600', marginTop: 4 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.blueSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 10, gap: 4 },
  roleBadgeText: { fontSize: 11, fontWeight: '800', color: C.blue, textTransform: 'uppercase' },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text, fontWeight: '600' },
  row: { flexDirection: 'row' },

  pwdContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: C.surfaceSoft, height: 48 },
  pwdInput: { flex: 1, paddingHorizontal: 14, fontSize: 14, color: C.text, fontWeight: '600' },
  eyeBtn: { paddingHorizontal: 16, height: '100%', justifyContent: 'center' },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 72, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '600' },
  textBrand: { color: C.primary, fontWeight: '800' },

  saveBtnFull: { backgroundColor: C.primary, flexDirection: 'row', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  toastContainer: { position: 'absolute', bottom: 30, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30, elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8 },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});