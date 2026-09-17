import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import axios from 'axios';
import { API_BASE } from '../network/api';
import { useSchoolContext, resolveAssetUrl } from '../navigation/AppNavigator';
const C = {
  bg: '#F6F6F9',
  surface: '#FFFFFF',
  surfaceSoft: '#FBFBFD',
  surfaceSunken: '#F1F2F6',
  border: '#E8E9EF',
  borderStrong: '#DBDDE6',

  text: '#14161F',
  textMuted: '#6B7280',
  textFaint: '#9AA0AC',

  // Brand red — used sparingly now, as an accent rather than a wash.
  primary: '#B3122A',
  primaryBright: '#D2263F',
  primaryDeep: '#7A0C1D',
  primarySoft: '#FBEEEF',
  primaryTint: '#F3D6D9',

  // Ink — the new anchor surface (header, dark buttons, active states).
  ink: '#0D0F16',
  inkSoft: '#181B24',
  inkFaint: 'rgba(255,255,255,0.62)',

  gold: '#C7A466',
  goldSoft: 'rgba(199,164,102,0.14)',

  blue: '#0EA5E9',
  blueSoft: '#E7F6FE',
  green: '#0F9D6B',
  greenSoft: '#E6F8F1',
  slate: '#475467',
  slateSoft: '#F1F3F7',
};

const HEADER_GRADIENT = ['#FFFFFF', '#FFFFFF'];
const BRAND_GRADIENT = [C.primary, C.primaryDeep];
const INK_GRADIENT = [C.ink, C.inkSoft];

const SHADOW_SM = {
  elevation: 1,
  shadowColor: '#0F172A',
  shadowOpacity: 0.05,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
};
const SHADOW_MD = {
  elevation: 3,
  shadowColor: '#0F172A',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
};
const SHADOW_LG = {
  elevation: 6,
  shadowColor: '#0F172A',
  shadowOpacity: 0.14,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 10 },
};
const SHADOW_BRAND = {
  elevation: 4,
  shadowColor: C.primary,
  shadowOpacity: 0.24,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
};

const ALLOCATION_POLICIES = [
  { label: 'High to Low Result Percent (Merit Order)', value: 'HighToLow' },
  { label: 'Balanced Round-Robin Mix', value: 'Balanced' },
  { label: 'Roll Number Order', value: 'RollNumber' },
  { label: 'Admission Date Order', value: 'AdmissionDate' },
];

type TabKey = 'branding' | 'academic' | 'security' | 'account';

// ---- Helper: build initials from a full name ("Rahul Sharma" -> "RS", "Rahul" -> "R") ----
const getInitials = (fullName: string) => {
  if (!fullName || !fullName.trim()) return 'U';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  const first = parts[0].charAt(0);
  const last = parts[parts.length - 1].charAt(0);
  return (first + last).toUpperCase();
};

export default function SettingsScreen() {
  const { refreshBranding } = useSchoolContext();

  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('account');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSection, setSavingSection] = useState<TabKey | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // States
  const [profile, setProfile] = useState({ name: '', email: '', role: '', avatarUrl: '' });
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false });

  const [academicSettings, setAcademicSettings] = useState({
    minOverallPercent: '33',
    minSubjectPercent: '33',
    maxSubjectsAllowedToFail: '0',
    allocationPolicy: 'HighToLow',
    defaultSectionCapacity: '35',
  });

  const [branding, setBranding] = useState({ schoolName: '', tagline: '', logoUrl: '' });
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    const uName = await AsyncStorage.getItem('userName') || '';
    const uEmail = await AsyncStorage.getItem('userEmail') || '';
    const uRole = await AsyncStorage.getItem('userRole') || 'User';
    const uAvatar = await AsyncStorage.getItem('userAvatarUrl') || '';

    const parsedPerms = permsRaw ? JSON.parse(permsRaw) : [];
    const superAdmin = superAdminRaw === 'true';

    if (permsRaw) setPermissions(parsedPerms);
    setIsSuperAdmin(superAdmin);
    setAuthToken(token);
    setActiveTab(superAdmin ? 'branding' : 'account');

    setProfile({ name: uName, email: uEmail, role: uRole, avatarUrl: uAvatar });
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
        setBranding({
          schoolName: s.schoolName || '',
          tagline: s.tagline || '',
          logoUrl: s.logoUrl || '',
        });
        setLogoLoadFailed(false);
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
    setSaving(true); setSavingSection('account');
    try {
      await axios.put(`${API_BASE}/auth/profile`, { name: profile.name, email: profile.email }, authHeaders(authToken));
      await AsyncStorage.setItem('userName', profile.name);
      await AsyncStorage.setItem('userEmail', profile.email);
      showToast('Profile updated successfully');
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to update profile'); }
    finally { setSaving(false); setSavingSection(null); }
  };

  const handleSavePassword = async () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) { Alert.alert('Error', 'All password fields are required.'); return; }
    if (passwords.new !== passwords.confirm) { Alert.alert('Error', 'New passwords do not match.'); return; }
    if (passwords.new.length < 8) { Alert.alert('Error', 'Password must be at least 8 characters long.'); return; }

    setSaving(true); setSavingSection('security');
    try {
      await axios.put(`${API_BASE}/auth/password`, { currentPassword: passwords.current, newPassword: passwords.new }, authHeaders(authToken));
      setPasswords({ current: '', new: '', confirm: '' });
      showToast('Password changed securely');
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to update password'); }
    finally { setSaving(false); setSavingSection(null); }
  };

  const handleSaveAcademic = async () => {
    setSaving(true); setSavingSection('academic');
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
    finally { setSaving(false); setSavingSection(null); }
  };

  const handleSaveBranding = async () => {
    if (!branding.schoolName.trim()) { Alert.alert('Error', 'School / Institution name is required.'); return; }
    setSaving(true); setSavingSection('branding');
    try {
      await axios.put(`${API_BASE}/settings`, {
        schoolName: branding.schoolName.trim(),
        tagline: branding.tagline.trim(),
        logoUrl: branding.logoUrl.trim(),
      }, authHeaders(authToken));
      showToast('Branding updated across all portals');
      setLogoLoadFailed(false);
      refreshBranding();
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to update branding'); }
    finally { setSaving(false); setSavingSection(null); }
  };

  // --- Dropdown Helper ---
  const renderInlineDropdown = (fieldKey: string, label: string, options: {label: string, value: string}[], value: string, onSelect: (v: string) => void) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity
          style={[styles.dropdownHeader, isOpen && styles.fieldFocused]}
          onPress={() => canUpdate && setActiveDropdown(isOpen ? null : fieldKey)}
          activeOpacity={0.85}
        >
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selectedObj?.label || 'Select...'}
          </Text>
          <View style={[styles.chevronBadge, isOpen && styles.chevronBadgeActive]}>
            <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={isOpen ? '#fff' : C.textMuted} />
          </View>
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 190 }} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => {
                const selected = value === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value + i}
                    style={[styles.dropdownItem, selected && styles.dropdownItemSelected, i === options.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}
                  >
                    <Text style={[styles.dropdownItemText, selected && styles.textBrand]} numberOfLines={2}>{opt.label}</Text>
                    {selected && <Feather name="check" size={15} color={C.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  // --- Reusable premium bits ---
  const SectionCard = ({ icon, title, subtitle, badge, children }: { icon: string; title: string; subtitle?: string; badge?: string; children: React.ReactNode }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.cardIconBadge}><Feather name={icon as any} size={17} color={C.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{title}</Text>
            {!!subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
          </View>
        </View>
        {!!badge && (
          <View style={styles.superAdminBadge}>
            <Feather name="shield" size={10} color={C.gold} />
            <Text style={styles.superAdminBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );

  const FieldInput = ({ fieldKey, label, icon, value, onChangeText, hint, ...rest }: any) => (
    <View style={styles.inputWrapper}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputIconRow, focusedField === fieldKey && styles.fieldFocused]}>
        <View style={styles.inputIconBadge}>
          <Feather name={icon} size={14} color={focusedField === fieldKey ? C.primary : C.textFaint} />
        </View>
        <TextInput
          style={styles.inputWithIcon}
          value={value}
          onChangeText={onChangeText}
          editable={canUpdate}
          placeholderTextColor={C.textFaint}
          onFocus={() => setFocusedField(fieldKey)}
          onBlur={() => setFocusedField(null)}
          {...rest}
        />
      </View>
      {!!hint && <Text style={styles.hintText}>{hint}</Text>}
    </View>
  );

  const GradientButton = ({ label, icon, onPress, busy, dark, disabled }: { label: string; icon: string; onPress: () => void; busy?: boolean; dark?: boolean; disabled?: boolean }) => (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} disabled={busy || disabled} style={disabled ? { opacity: 0.6 } : undefined}>
      <LinearGradient
        colors={dark ? INK_GRADIENT : BRAND_GRADIENT}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.saveBtnFull, dark ? SHADOW_MD : SHADOW_BRAND]}
      >
        {busy ? <ActivityIndicator color="#fff" size="small" /> : (
          <>
            <Feather name={icon as any} size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.saveBtnFullText}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );

  const ReadOnlyNotice = () => (
    !canUpdate ? (
      <View style={styles.readOnlyNotice}>
        <Feather name="lock" size={12} color={C.textMuted} />
        <Text style={styles.readOnlyNoticeText}>You have view-only access to this section</Text>
      </View>
    ) : null
  );

  if (loading) return (
    <View style={styles.center}>
      <View style={styles.loaderCard}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loaderText}>Loading settings…</Text>
      </View>
    </View>
  );

  // Resolve the logo URL and guard against it failing to load (e.g. bad path, 404, blocked network)
  const previewLogoUri = branding.logoUrl ? resolveAssetUrl(branding.logoUrl) : null;
  const showLogoImage = !!previewLogoUri && !logoLoadFailed;

  // Resolve the user's avatar URL (if any) and guard against load failure
  const previewAvatarUri = profile.avatarUrl ? resolveAssetUrl(profile.avatarUrl) : null;
  const showAvatarImage = !!previewAvatarUri && !avatarLoadFailed;
  const initials = getInitials(profile.name);

  const TABS: { key: TabKey; label: string; icon: string; visible: boolean }[] = [
    { key: 'branding', label: 'Branding', icon: 'image', visible: isSuperAdmin },
    { key: 'account', label: 'Account', icon: 'user', visible: true },
    { key: 'academic', label: 'Academic Rules', icon: 'book-open', visible: true },
    { key: 'security', label: 'Security', icon: 'shield', visible: true },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

        {/* Header — quiet, dark, premium. Red is now a small accent, not a wash. */}
        <LinearGradient colors={HEADER_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <View style={styles.headerGlow} pointerEvents="none" />
          <View style={styles.headerRow}>
            <View style={styles.headerIconRing}>
              <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerIconBadge}>
                <Feather name="settings" size={18} color="#fff" />
              </LinearGradient>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Settings</Text>
              <Text style={styles.subtitle}>Manage your system preferences and account</Text>
            </View>
          </View>
          <View style={styles.headerAccentBar} />
        </LinearGradient>

        {/* Tab Switcher — clean segmented control, red used only as a thin indicator */}
        <View style={styles.tabContainerWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
            {TABS.filter(t => t.visible).map(t => {
              const active = activeTab === t.key;
              return (
                <TouchableOpacity key={t.key} activeOpacity={0.85} onPress={() => setActiveTab(t.key)}>
                  <View style={[styles.tabBtn, active ? styles.tabBtnActive : styles.tabBtnInactive]}>
                    <Feather name={t.icon as any} size={14} color={active ? C.primary : C.textMuted} />
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                    {active && <View style={styles.tabIndicator} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Content Area */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ================= SCHOOL BRANDING TAB ================= */}
          {activeTab === 'branding' && isSuperAdmin && (
            <>
              <SectionCard icon="image" title="School Identity" subtitle="Global branding shown across every portal" badge="Super Admin">
                <Text style={styles.groupLabel}>General Information</Text>

                <FieldInput
                  fieldKey="schoolName"
                  label="School / Institution Name *"
                  icon="home"
                  value={branding.schoolName}
                  onChangeText={(t: string) => setBranding({ ...branding, schoolName: t })}
                  placeholder="e.g. Namaste School"
                  hint="Appears in the sidebar header, login screen, and reports."
                />

                <FieldInput
                  fieldKey="tagline"
                  label="Tagline / Subtitle"
                  icon="feather"
                  value={branding.tagline}
                  onChangeText={(t: string) => setBranding({ ...branding, tagline: t })}
                  placeholder="e.g. Management System"
                  hint="Displayed beneath the school name in the sidebar."
                />

                <View style={styles.divider} />
                <Text style={styles.groupLabel}>School Logo</Text>

                <View style={styles.logoUploadBox}>
                  <View style={styles.logoPreviewCircle}>
                    {showLogoImage ? (
                      <Image
                        source={{ uri: previewLogoUri! }}
                        style={styles.logoPreviewImage}
                        resizeMode="contain"
                        onError={(e) => {
                          console.log('Logo failed to load:', previewLogoUri, e.nativeEvent?.error);
                          setLogoLoadFailed(true);
                        }}
                      />
                    ) : (
                      <Feather name="image" size={24} color={C.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logoUploadTitle}>
                      {previewLogoUri ? (logoLoadFailed ? 'Logo failed to load' : 'Current logo') : 'No logo set'}
                    </Text>
                    <Text style={styles.logoUploadHint}>
                      {logoLoadFailed
                        ? 'Could not load this image. Check the URL is correct and publicly accessible.'
                        : 'Paste a direct image URL / CDN link below'}
                    </Text>
                  </View>
                </View>

                <FieldInput
                  fieldKey="logoUrl"
                  label="Logo Image URL"
                  icon="link"
                  value={branding.logoUrl}
                  onChangeText={(t: string) => { setBranding({ ...branding, logoUrl: t }); setLogoLoadFailed(false); }}
                  placeholder="/logo.png or https://..."
                  autoCapitalize="none"
                />

                <ReadOnlyNotice />
                {canUpdate && (
                  <GradientButton
                    label="Save School Branding"
                    icon="save"
                    onPress={handleSaveBranding}
                    busy={saving && savingSection === 'branding'}
                  />
                )}
              </SectionCard>

              {/* Live preview, mirrors the app drawer header */}
              <View style={styles.previewSectionLabel}>
                <Feather name="eye" size={13} color={C.textMuted} />
                <Text style={styles.previewSectionLabelText}>Live Preview</Text>
              </View>
              <LinearGradient colors={INK_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.previewDrawerCard, SHADOW_LG]}>
                <View style={styles.previewLogoBox}>
                  {showLogoImage ? (
                    <Image
                      source={{ uri: previewLogoUri! }}
                      style={styles.previewLogoImg}
                      resizeMode="contain"
                      onError={() => setLogoLoadFailed(true)}
                    />
                  ) : (
                    <Feather name="image" size={20} color={C.primary} />
                  )}
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
                  <Text style={styles.previewName} numberOfLines={1}>{branding.schoolName || 'Namaste School'}</Text>
                  <Text style={styles.previewTagline} numberOfLines={1}>{(branding.tagline || 'Management System').toUpperCase()}</Text>
                </View>
              </LinearGradient>
              <View style={styles.liveSyncNote}>
                <View style={styles.liveSyncIconBadge}>
                  <Feather name="zap" size={12} color={C.green} />
                </View>
                <Text style={styles.liveSyncNoteText}>Saving instantly updates the sidebar and header for every signed-in user.</Text>
              </View>
            </>
          )}

          {/* ================= ACCOUNT TAB ================= */}
          {activeTab === 'account' && (
            <View style={styles.card}>
              <View style={styles.profileBanner}>
                <LinearGradient colors={INK_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.avatarLarge, SHADOW_MD]}>
                  {showAvatarImage ? (
                    <Image
                      source={{ uri: previewAvatarUri! }}
                      style={styles.avatarImage}
                      resizeMode="cover"
                      onError={(e) => {
                        console.log('Avatar failed to load:', previewAvatarUri, e.nativeEvent?.error);
                        setAvatarLoadFailed(true);
                      }}
                    />
                  ) : (
                    <Text style={styles.avatarLargeText}>{initials}</Text>
                  )}
                </LinearGradient>
                <Text style={styles.profileName}>{profile.name || 'Your Name'}</Text>
                <Text style={styles.profileEmail}>{profile.email}</Text>
                <View style={styles.roleBadge}><Feather name="award" size={10} color={C.blue} /><Text style={styles.roleBadgeText}>{profile.role}</Text></View>
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.groupLabel}>Personal Details</Text>
                <FieldInput
                  fieldKey="fullName"
                  label="Full Name"
                  icon="user"
                  value={profile.name}
                  onChangeText={(t: string) => setProfile({ ...profile, name: t })}
                />
                <FieldInput
                  fieldKey="email"
                  label="Email Address"
                  icon="mail"
                  value={profile.email}
                  onChangeText={(t: string) => setProfile({ ...profile, email: t })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <ReadOnlyNotice />
                {canUpdate && (
                  <GradientButton label="Save Profile" icon="save" onPress={handleSaveProfile} busy={saving && savingSection === 'account'} />
                )}
              </View>
            </View>
          )}

          {/* ================= ACADEMIC TAB ================= */}
          {activeTab === 'academic' && (
            <SectionCard icon="award" title="Promotion & Allocation" subtitle="Rules used when evaluating results and assigning sections">
              <Text style={styles.groupLabel}>Promotion Criteria</Text>
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Min Overall %</Text>
                  <TextInput
                    style={[styles.input, focusedField === 'minOverall' && styles.fieldFocused]}
                    keyboardType="numeric"
                    value={academicSettings.minOverallPercent}
                    onChangeText={t => setAcademicSettings({ ...academicSettings, minOverallPercent: t })}
                    editable={canUpdate}
                    onFocus={() => setFocusedField('minOverall')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Min Subject %</Text>
                  <TextInput
                    style={[styles.input, focusedField === 'minSubject' && styles.fieldFocused]}
                    keyboardType="numeric"
                    value={academicSettings.minSubjectPercent}
                    onChangeText={t => setAcademicSettings({ ...academicSettings, minSubjectPercent: t })}
                    editable={canUpdate}
                    onFocus={() => setFocusedField('minSubject')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Max Fail Allowed</Text>
                  <TextInput
                    style={[styles.input, focusedField === 'maxFail' && styles.fieldFocused]}
                    keyboardType="numeric"
                    value={academicSettings.maxSubjectsAllowedToFail}
                    onChangeText={t => setAcademicSettings({ ...academicSettings, maxSubjectsAllowedToFail: t })}
                    editable={canUpdate}
                    onFocus={() => setFocusedField('maxFail')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Section Capacity</Text>
                  <TextInput
                    style={[styles.input, focusedField === 'sectionCap' && styles.fieldFocused]}
                    keyboardType="numeric"
                    value={academicSettings.defaultSectionCapacity}
                    onChangeText={t => setAcademicSettings({ ...academicSettings, defaultSectionCapacity: t })}
                    editable={canUpdate}
                    onFocus={() => setFocusedField('sectionCap')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              <View style={styles.divider} />
              <Text style={styles.groupLabel}>Section Allocation</Text>
              {renderInlineDropdown('allocationPolicy', 'Allocation Policy', ALLOCATION_POLICIES, academicSettings.allocationPolicy, (v) => setAcademicSettings({ ...academicSettings, allocationPolicy: v }))}

              <ReadOnlyNotice />
              {canUpdate && (
                <GradientButton label="Save Academic Rules" icon="settings" onPress={handleSaveAcademic} busy={saving && savingSection === 'academic'} />
              )}
            </SectionCard>
          )}

          {/* ================= SECURITY TAB ================= */}
          {activeTab === 'security' && (
            <SectionCard icon="lock" title="Change Password" subtitle="Use a strong password you don't use elsewhere">
              {[
                { key: 'current', label: 'Current Password' },
                { key: 'new', label: 'New Password' },
                { key: 'confirm', label: 'Confirm Password' }
              ].map((field) => (
                <View key={field.key} style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>{field.label}</Text>
                  <View style={[styles.pwdContainer, focusedField === field.key && styles.fieldFocused]}>
                    <View style={styles.inputIconBadge}>
                      <Feather name="lock" size={14} color={focusedField === field.key ? C.primary : C.textFaint} />
                    </View>
                    <TextInput
                      style={styles.pwdInput}
                      value={(passwords as any)[field.key]}
                      onChangeText={t => setPasswords({ ...passwords, [field.key]: t })}
                      secureTextEntry={!(showPwd as any)[field.key]}
                      editable={canUpdate}
                      placeholderTextColor={C.textFaint}
                      onFocus={() => setFocusedField(field.key)}
                      onBlur={() => setFocusedField(null)}
                    />
                    <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPwd({ ...showPwd, [field.key]: !(showPwd as any)[field.key] })}>
                      <Feather name={(showPwd as any)[field.key] ? "eye-off" : "eye"} size={16} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <View style={styles.securityTip}>
                <Feather name="info" size={12} color={C.blue} />
                <Text style={styles.securityTipText}>Minimum 8 characters. Mix letters, numbers, and symbols for a stronger password.</Text>
              </View>

              <ReadOnlyNotice />
              {canUpdate && (
                <GradientButton label="Update Password" icon="shield" onPress={handleSavePassword} busy={saving && savingSection === 'security'} dark />
              )}
            </SectionCard>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Success Toast */}
      {!!toastMsg && (
        <View style={styles.toastContainer}>
          <View style={styles.toastIconBadge}>
            <Feather name="check" size={13} color="#fff" />
          </View>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  loaderCard: { backgroundColor: C.surface, borderRadius: 20, paddingVertical: 28, paddingHorizontal: 36, alignItems: 'center', ...SHADOW_MD },
  loaderText: { marginTop: 12, fontSize: 13, fontWeight: '700', color: C.textMuted },

  // ---- Header: dark, quiet, one restrained red accent ----
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, overflow: 'hidden' },
headerGlow: {
  position: 'absolute',
  width: 220,
  height: 220,
  borderRadius: 110,
  backgroundColor: 'rgba(179, 18, 42, 0.03)',
  top: -110,
  right: -60,
},  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerIconRing: { width: 52, height: 52, borderRadius: 16, padding: 2, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerIconBadge: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
 title: {
  fontSize: 21,
  fontWeight: '800',
  color: C.text,
  letterSpacing: 0.2,
},

subtitle: {
  fontSize: 12.5,
  color: C.textMuted,
  marginTop: 3,
  fontWeight: '500',
},
  headerAccentBar: { height: 2, width: 44, backgroundColor: C.primary, borderRadius: 2, marginTop: 18 },

  // ---- Tabs: clean segmented control, red used only as thin indicator ----
  tabContainerWrapper: { backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, ...SHADOW_SM },
  tabScrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 8 },
  tabBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 9, borderRadius: 11, gap: 6, position: 'relative' },
  tabBtnInactive: { backgroundColor: 'transparent' },
  tabBtnActive: { backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primaryTint },
  tabText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  tabTextActive: { color: C.primaryDeep },
  tabIndicator: { position: 'absolute', bottom: -12, left: '30%', right: '30%', height: 2.5, backgroundColor: C.primary, borderRadius: 2 },

  scrollContent: { padding: 16, paddingBottom: 60 },

  card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 16, ...SHADOW_MD },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 18, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderColor: C.border },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, paddingRight: 10 },
  cardIconBadge: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: C.primaryTint },
  cardTitle: { fontSize: 15.5, fontWeight: '800', color: C.text, flexShrink: 1 },
  cardSubtitle: { fontSize: 11.5, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  cardBody: { padding: 20 },

  divider: { height: 1, backgroundColor: C.border, marginVertical: 18 },

  // Premium "Super Admin" badge — dark chip with gold accent instead of red-on-red
  superAdminBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.ink, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, gap: 5, borderWidth: 1, borderColor: C.goldSoft },
  superAdminBadgeText: { fontSize: 9, fontWeight: '800', color: C.gold, textTransform: 'uppercase', letterSpacing: 0.5 },

  groupLabel: { fontSize: 11.5, fontWeight: '800', color: C.slate, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.6 },

  profileBanner: { alignItems: 'center', padding: 32, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSoft },
  avatarLarge: { width: 84, height: 84, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 14, borderWidth: 3, borderColor: '#fff', overflow: 'hidden' },
  avatarLargeText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  avatarImage: { width: '100%', height: '100%' },
  profileName: { fontSize: 20, fontWeight: '800', color: C.text },
  profileEmail: { fontSize: 13, color: C.textMuted, fontWeight: '600', marginTop: 4 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.blueSoft, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 12, marginTop: 12, gap: 5, borderWidth: 1, borderColor: '#CBEEFB' },
  roleBadgeText: { fontSize: 11, fontWeight: '800', color: C.blue, textTransform: 'uppercase', letterSpacing: 0.3 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 7, marginLeft: 2, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text, fontWeight: '600' },
  inputIconRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.border, borderRadius: 12, backgroundColor: C.surfaceSoft, height: 50, paddingHorizontal: 8 },
  inputIconBadge: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.surfaceSunken, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  inputWithIcon: { flex: 1, fontSize: 14, color: C.text, fontWeight: '600', height: '100%' },
  hintText: { fontSize: 11, color: C.textFaint, marginTop: 7, marginLeft: 2, fontWeight: '500', lineHeight: 15 },
  row: { flexDirection: 'row' },

  fieldFocused: { borderColor: C.primary, backgroundColor: C.surface, ...SHADOW_SM },

  readOnlyNotice: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surfaceSunken, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginTop: 4, marginBottom: 4, alignSelf: 'flex-start' },
  readOnlyNoticeText: { fontSize: 11, color: C.textMuted, fontWeight: '600' },

  logoUploadBox: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, marginBottom: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.borderStrong, borderRadius: 16, backgroundColor: C.surfaceSoft, gap: 14 },
  logoPreviewCircle: { width: 62, height: 62, borderRadius: 18, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: C.primaryTint },
  logoPreviewImage: { width: '100%', height: '100%' },
  logoUploadTitle: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 3 },
  logoUploadHint: { fontSize: 11, color: C.textMuted, fontWeight: '600', lineHeight: 15 },

  pwdContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.border, borderRadius: 12, backgroundColor: C.surfaceSoft, height: 50, paddingHorizontal: 8 },
  pwdInput: { flex: 1, fontSize: 14, color: C.text, fontWeight: '600', height: '100%' },
  eyeBtn: { paddingHorizontal: 10, height: '100%', justifyContent: 'center' },

  securityTip: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.blueSoft, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#CBEEFB' },
  securityTipText: { flex: 1, fontSize: 11.5, color: '#0369A1', fontWeight: '600', lineHeight: 16 },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingLeft: 14, height: 50, backgroundColor: C.surfaceSoft },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600', flex: 1, marginRight: 10 },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint, flex: 1 },
  chevronBadge: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.surfaceSunken, justifyContent: 'center', alignItems: 'center' },
  chevronBadgeActive: { backgroundColor: C.primary },
  dropdownListContainer: { position: 'absolute', top: 76, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, overflow: 'hidden', ...SHADOW_MD },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemSelected: { backgroundColor: C.primarySoft },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '600', flex: 1, marginRight: 8 },
  textBrand: { color: C.primary, fontWeight: '800' },

  saveBtnFull: { flexDirection: 'row', height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  saveBtnFullText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },

  previewSectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginLeft: 2 },
  previewSectionLabelText: { fontSize: 11, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewDrawerCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 16, marginBottom: 10 },
  previewLogoBox: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  previewLogoImg: { width: 34, height: 34 },
  previewName: { fontSize: 16, fontWeight: '800', color: '#fff' },
  previewTagline: { fontSize: 10, color: 'rgba(255,255,255,0.72)', fontWeight: '800', marginTop: 3, letterSpacing: 0.6 },

  liveSyncNote: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.greenSoft, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#C9F3E2' },
  liveSyncIconBadge: { width: 26, height: 26, borderRadius: 8, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  liveSyncNoteText: { flex: 1, fontSize: 11.5, color: '#047857', fontWeight: '600', lineHeight: 16 },

  toastContainer: { position: 'absolute', bottom: 30, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: C.ink, paddingHorizontal: 18, paddingVertical: 12, paddingRight: 20, borderRadius: 30, gap: 10, ...SHADOW_LG },
  toastIconBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.green, justifyContent: 'center', alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});