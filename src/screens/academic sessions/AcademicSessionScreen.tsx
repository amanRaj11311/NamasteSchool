import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  SafeAreaView,
  Alert,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Feather from "react-native-vector-icons/Feather";
import axios from "axios";
import { API_BASE } from "../../network/api";

interface Permission {
  module: string;
  action: string;
}

interface School {
  _id: string;
  name: string;
}

interface PromotionCriteria {
  minOverallPercent: number;
  minSubjectPercent: number;
  maxSubjectsAllowedToFail: number;
  minAttendancePercent: number | null;
}

interface AcademicYear {
  _id: string;
  schoolId?: any; // Can be string or populated object
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  status: string;
  promotionCriteria: PromotionCriteria;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  schoolId: string;
  sessionName: string;
  startDate: string;
  endDate: string;
  minOverallPercent: string;
  minSubjectPercent: string;
  maxSubjectsAllowedToFail: string;
  minAttendancePercent: string;
}

const emptyForm: FormState = {
  schoolId: "",
  sessionName: "",
  startDate: "",
  endDate: "",
  minOverallPercent: "33",
  minSubjectPercent: "33",
  maxSubjectsAllowedToFail: "0",
  minAttendancePercent: "",
};

/* --------------------------------- Helpers -------------------------------- */
function toInputDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function formatReadableDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function durationInDays(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

/* ================================ Component ================================ */
export default function AcademicSessionsScreen() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [sessions, setSessions] = useState<AcademicYear[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filtering
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Forms
  const [isFormVisible, setFormVisible] = useState(false);
  const [isViewVisible, setViewVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<AcademicYear | null>(null);
  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem("userToken");
    const permsRaw = await AsyncStorage.getItem("userPermissions");
    const superAdminRaw = await AsyncStorage.getItem("isSuperAdmin");
    
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === "true");
    setAuthToken(token);

    fetchData(token);
  };

  const fetchData = async (token: string | null, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [sessionsRes, schoolsRes] = await Promise.all([
        axios.get(`${API_BASE}/academic-years`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (sessionsRes.data?.success) {
        const list = sessionsRes.data.data || [];
        list.sort((a: AcademicYear, b: AcademicYear) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        setSessions(list);
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

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some((p) => p.module === 'academic' && p.action === action);
  }, [permissions, isSuperAdmin]);

  // --- Derived Data ---
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.name.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  const activeSession = useMemo(() => sessions.find((s) => s.isActive) || null, [sessions]);

  const avgOverallThreshold = useMemo(() => {
    if (sessions.length === 0) return 0;
    const total = sessions.reduce((sum, s) => sum + (s.promotionCriteria?.minOverallPercent || 0), 0);
    return Math.round(total / sessions.length);
  }, [sessions]);

  // --- Actions ---
  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setFormErrors({});
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const openEdit = (record: AcademicYear) => {
    setEditingId(record._id);
    setFormData({
      schoolId: typeof record.schoolId === 'object' ? record.schoolId?._id : record.schoolId || '',
      sessionName: record.name,
      startDate: toInputDate(record.startDate),
      endDate: toInputDate(record.endDate),
      minOverallPercent: String(record.promotionCriteria?.minOverallPercent ?? ""),
      minSubjectPercent: String(record.promotionCriteria?.minSubjectPercent ?? ""),
      maxSubjectsAllowedToFail: String(record.promotionCriteria?.maxSubjectsAllowedToFail ?? ""),
      minAttendancePercent: record.promotionCriteria?.minAttendancePercent === null || record.promotionCriteria?.minAttendancePercent === undefined
          ? "" : String(record.promotionCriteria.minAttendancePercent),
    });
    setFormErrors({});
    setActiveDropdown(null);
    setFormVisible(true);
  };

  const handleDelete = (record: AcademicYear) => {
    Alert.alert("Delete Session", `Are you sure you want to delete '${record.name}'?`, [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/academic-years/${record._id}`, { headers: { Authorization: `Bearer ${authToken}` } });
            fetchData(authToken, true);
            Alert.alert("Success", "Academic session deleted.");
          } catch (error) { Alert.alert("Error", "Could not delete session."); }
        }
      }
    ]);
  };

  const handleActivate = async (record: AcademicYear) => {
    if (record.isActive) return;
    setActivatingId(record._id);
    try {
      await axios.post(`${API_BASE}/academic-years/${record._id}/activate`, {}, { headers: { Authorization: `Bearer ${authToken}` } });
      fetchData(authToken, true);
      Alert.alert("Success", `${record.name} is now the active session.`);
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.message || "Could not activate this session.");
    } finally {
      setActivatingId(null);
    }
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!formData.schoolId) errors.schoolId = "School Branch is required.";
    if (!formData.sessionName.trim()) errors.sessionName = "Session name is required.";
    
    if (!formData.startDate) errors.startDate = "Start date required.";
    else if (!isValidDateString(formData.startDate)) errors.startDate = "Format: YYYY-MM-DD";
    
    if (!formData.endDate) errors.endDate = "End date required.";
    else if (!isValidDateString(formData.endDate)) errors.endDate = "Format: YYYY-MM-DD";
    
    if (formData.startDate && formData.endDate && isValidDateString(formData.startDate) && isValidDateString(formData.endDate) && new Date(formData.startDate).getTime() >= new Date(formData.endDate).getTime()) {
      errors.endDate = "End date must be after start date.";
    }

    const pct = (key: keyof FormState) => {
      const raw = formData[key];
      if (raw === "") return;
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0 || n > 100) errors[key] = "Between 0 and 100.";
    };
    pct("minOverallPercent");
    pct("minSubjectPercent");
    pct("minAttendancePercent");

    if (formData.maxSubjectsAllowedToFail !== "" && (Number.isNaN(Number(formData.maxSubjectsAllowedToFail)) || Number(formData.maxSubjectsAllowedToFail) < 0)) {
      errors.maxSubjectsAllowedToFail = "Whole number 0 or more.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    
    const payload = {
      schoolId: formData.schoolId,
      name: formData.sessionName.trim(), 
      year: formData.sessionName.trim(),
      startDate: formData.startDate,
      endDate: formData.endDate,
      promotionCriteria: {
        minOverallPercent: Number(formData.minOverallPercent) || 0,
        minSubjectPercent: Number(formData.minSubjectPercent) || 0,
        maxSubjectsAllowedToFail: Number(formData.maxSubjectsAllowedToFail) || 0,
        minAttendancePercent: formData.minAttendancePercent.trim() === "" ? null : Number(formData.minAttendancePercent),
      },
    };

    try {
      if (editingId) {
        await axios.put(`${API_BASE}/academic-years/${editingId}`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert("Success", "Session updated successfully.");
      } else {
        await axios.post(`${API_BASE}/academic-years`, payload, { headers: { Authorization: `Bearer ${authToken}` } });
        Alert.alert("Success", "Session created successfully.");
      }
      setFormVisible(false);
      fetchData(authToken, true);
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.message || "Failed to save session.");
    }
  };

  // --- Inline Dropdown UI ---
  const toggleDropdown = (field: string) => setActiveDropdown(activeDropdown === field ? null : field);

  const renderInlineDropdown = (fieldKey: keyof FormState, label: string, options: {label: string, value: string}[]) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === formData[fieldKey]);

    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 : 1 }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity 
          style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive, formErrors[fieldKey] && styles.inputError]} 
          onPress={() => toggleDropdown(fieldKey)}
          activeOpacity={0.8}
        >
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selectedObj?.label || `Select...`}
          </Text>
          <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
        </TouchableOpacity>
        
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={styles.dropdownScroll} showsVerticalScrollIndicator={false}>
              {options.map((opt, index) => (
                <TouchableOpacity 
                  key={opt.value} 
                  style={[styles.dropdownItem, index !== options.length - 1 && styles.dropdownItemBorder]}
                  onPress={() => {
                    setFormData({ ...formData, [fieldKey]: opt.value });
                    setFormErrors({...formErrors, [fieldKey]: undefined});
                    setActiveDropdown(null);
                  }}
                >
                  <Text style={[styles.dropdownItemText, formData[fieldKey] === opt.value && styles.dropdownItemTextActive]}>
                    {opt.label}
                  </Text>
                  {formData[fieldKey] === opt.value && <Feather name="check" size={16} color="#ef4444" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        {formErrors[fieldKey] && <Text style={styles.errorText}>{formErrors[fieldKey]}</Text>}
      </View>
    );
  };

  // --- Render Card ---
  const renderCard = ({ item }: { item: AcademicYear }) => {
    const schoolName = typeof item.schoolId === 'object' ? item.schoolId?.name : 'Unknown School';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.titleRow}>
            <View style={[styles.statusDot, item.isActive ? {backgroundColor: '#10B981'} : {backgroundColor: '#9CA3AF'}]} />
            <Text style={styles.cardName}>{item.name}</Text>
          </View>
          <View style={item.isActive ? styles.badgeActive : styles.badgeInactive}>
            <Text style={item.isActive ? styles.badgeActiveText : styles.badgeInactiveText}>
              {item.isActive ? 'ACTIVE' : 'INACTIVE'}
            </Text>
          </View>
        </View>

        <Text style={styles.schoolSubText}><Feather name="map-pin" size={12}/> {schoolName}</Text>

        <View style={styles.datesRow}>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>Start Date</Text>
            <Text style={styles.dateValue}>{formatReadableDate(item.startDate)}</Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>End Date</Text>
            <Text style={styles.dateValue}>{formatReadableDate(item.endDate)}</Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>Duration</Text>
            <Text style={styles.dateValue}>{durationInDays(item.startDate, item.endDate)} Days</Text>
          </View>
        </View>

        <View style={styles.criteriaGrid}>
          <View style={styles.criteriaTile}>
            <Text style={styles.criteriaK}>Overall %</Text>
            <Text style={styles.criteriaV}>{item.promotionCriteria?.minOverallPercent ?? "—"}%</Text>
          </View>
          <View style={styles.criteriaTile}>
            <Text style={styles.criteriaK}>Subject %</Text>
            <Text style={styles.criteriaV}>{item.promotionCriteria?.minSubjectPercent ?? "—"}%</Text>
          </View>
          <View style={styles.criteriaTile}>
            <Text style={styles.criteriaK}>Max Fails</Text>
            <Text style={styles.criteriaV}>{item.promotionCriteria?.maxSubjectsAllowedToFail ?? "—"}</Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <View style={styles.actionBtnGroup}>
            <TouchableOpacity style={styles.iconBtnPrimary} onPress={() => { setViewingRecord(item); setViewVisible(true); }}>
              <Feather name="eye" size={14} color="#fff" />
            </TouchableOpacity>
            {hasPermission('update') && (
              <TouchableOpacity style={styles.iconBtnEdit} onPress={() => openEdit(item)}>
                <Feather name="edit-2" size={14} color="#10B981" />
              </TouchableOpacity>
            )}
            {hasPermission('delete') && (
              <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDelete(item)}>
                <Feather name="trash-2" size={14} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>

          {!item.isActive && hasPermission('update') && (
            <TouchableOpacity 
              style={styles.activateBtn} 
              onPress={() => handleActivate(item)}
              disabled={activatingId === item._id}
            >
              {activatingId === item._id ? <ActivityIndicator size="small" color="#10B981" /> : <Feather name="check-circle" size={14} color="#10B981" />}
              <Text style={styles.activateBtnText}>Set Active</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Title, Subtitle, and Add Button */}
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Academic Sessions</Text>
          <Text style={styles.subtitle} numberOfLines={2}>Define sessions, active terms, and promotions.</Text>
        </View>
        {hasPermission('create') && (
          <TouchableOpacity style={styles.headerAddBtn} onPress={openCreate} activeOpacity={0.85}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.headerAddBtnText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Horizontal Scrollable KPI Grid */}
      <View style={styles.kpiWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.kpiScrollContent}
        >
          <View style={styles.kpiCard}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#E0F2FE' }]}><Feather name="calendar" size={14} color="#0ea5e9" /></View>
              <Text style={styles.kpiValue}>{loading ? "—" : sessions.length}</Text>
            </View>
            <Text style={styles.kpiLabel}>TOTAL SESSIONS</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}><Feather name="check-circle" size={14} color="#10B981" /></View>
              <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{loading ? "—" : activeSession ? activeSession.name : "None"}</Text>
            </View>
            <Text style={styles.kpiLabel}>ACTIVE SESSION</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}><Feather name="clock" size={14} color="#F59E0B" /></View>
              <Text style={styles.kpiValue}>{loading || !activeSession ? "—" : `${durationInDays(activeSession.startDate, activeSession.endDate)}D`}</Text>
            </View>
            <Text style={styles.kpiLabel}>ACTIVE DURATION</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#F3E8FF' }]}><Feather name="percent" size={14} color="#D946EF" /></View>
              <Text style={styles.kpiValue}>{loading ? "—" : `${avgOverallThreshold}%`}</Text>
            </View>
            <Text style={styles.kpiLabel}>AVG OVERALL %</Text>
          </View>
        </ScrollView>
      </View>

      {/* Search Bar */}
      <View style={styles.actionBar}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color="#9CA3AF" />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search sessions..." 
            placeholderTextColor="#9CA3AF"
            value={searchQuery} 
            onChangeText={setSearchQuery} 
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Feather name="x-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#B3122A" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#B3122A']} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="calendar" size={36} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>No sessions found.</Text>
            </View>
          }
        />
      )}

      {/* --- ADD/EDIT COMPACT MODAL --- */}
      <Modal visible={isFormVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingId ? 'Edit Session' : 'Add Session'}</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtnIcon}>
                <Feather name="x" size={20} color="#4B5563" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              
              {renderInlineDropdown('schoolId', 'School Branch *', schools.map(s => ({label: s.name, value: s._id})))}

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Session Name / Year <Text style={styles.asterisk}>*</Text></Text>
                <TextInput style={[styles.input, formErrors.sessionName && styles.inputError]} placeholder="e.g. 2026-2027" value={formData.sessionName} onChangeText={t => { setFormData({...formData, sessionName: t}); setFormErrors({...formErrors, sessionName: undefined}); }} />
                {formErrors.sessionName && <Text style={styles.errorText}>{formErrors.sessionName}</Text>}
              </View>

              <View style={styles.row}>
                <View style={[styles.inputWrapper, {flex: 1, marginRight: 10}]}>
                  <Text style={styles.inputLabel}>Start Date <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={[styles.input, formErrors.startDate && styles.inputError]} placeholder="YYYY-MM-DD" value={formData.startDate} onChangeText={t => { setFormData({...formData, startDate: t}); setFormErrors({...formErrors, startDate: undefined}); }} />
                  {formErrors.startDate && <Text style={styles.errorText}>{formErrors.startDate}</Text>}
                </View>
                <View style={[styles.inputWrapper, {flex: 1}]}>
                  <Text style={styles.inputLabel}>End Date <Text style={styles.asterisk}>*</Text></Text>
                  <TextInput style={[styles.input, formErrors.endDate && styles.inputError]} placeholder="YYYY-MM-DD" value={formData.endDate} onChangeText={t => { setFormData({...formData, endDate: t}); setFormErrors({...formErrors, endDate: undefined}); }} />
                  {formErrors.endDate && <Text style={styles.errorText}>{formErrors.endDate}</Text>}
                </View>
              </View>

              <Text style={styles.sectionDividerText}>PROMOTION CRITERIA</Text>
              
              <View style={styles.row}>
                <View style={[styles.inputWrapper, {flex: 1, marginRight: 8}]}>
                  <Text style={styles.inputLabel}>Overall %</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.minOverallPercent} onChangeText={t => setFormData({...formData, minOverallPercent: t})} />
                </View>
                <View style={[styles.inputWrapper, {flex: 1, marginRight: 8}]}>
                  <Text style={styles.inputLabel}>Subject %</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.minSubjectPercent} onChangeText={t => setFormData({...formData, minSubjectPercent: t})} />
                </View>
                <View style={[styles.inputWrapper, {flex: 1}]}>
                  <Text style={styles.inputLabel}>Max Fails</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.maxSubjectsAllowedToFail} onChangeText={t => setFormData({...formData, maxSubjectsAllowedToFail: t})} />
                </View>
              </View>
              
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Min Attendance % (Optional)</Text>
                <TextInput style={styles.input} placeholder="Leave blank if not enforced" keyboardType="numeric" value={formData.minAttendancePercent} onChangeText={t => setFormData({...formData, minAttendancePercent: t})} />
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSave} activeOpacity={0.85}>
                <Text style={styles.saveBtnFullText}>{editingId ? 'Update Session' : 'Create Session'}</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- VIEW MODAL --- */}
      <Modal visible={isViewVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.viewModalContainer}>
            <View style={styles.viewHeaderRed}>
              <Text style={styles.viewTitle}>Session Specification</Text>
              <TouchableOpacity onPress={() => setViewVisible(false)}><Feather name="x" size={24} color="#fff" /></TouchableOpacity>
            </View>

            <ScrollView style={{padding: 20}}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16}}>
                <Text style={styles.viewName}>{viewingRecord?.name}</Text>
                <View style={viewingRecord?.isActive ? styles.badgeActive : styles.badgeInactive}>
                  <Text style={viewingRecord?.isActive ? styles.badgeActiveText : styles.badgeInactiveText}>{viewingRecord?.isActive ? 'ACTIVE' : 'INACTIVE'}</Text>
                </View>
              </View>

              <Text style={styles.sectionHeaderRed}><Feather name="calendar" /> TIMELINE METADATA</Text>
              <View style={styles.viewDetailsBox}>
                <View style={styles.row}>
                  <View style={{flex: 1}}><Text style={styles.viewLabel}>Start Date:</Text><Text style={styles.viewVal}>{viewingRecord ? formatReadableDate(viewingRecord.startDate) : 'N/A'}</Text></View>
                  <View style={{flex: 1}}><Text style={styles.viewLabel}>End Date:</Text><Text style={styles.viewVal}>{viewingRecord ? formatReadableDate(viewingRecord.endDate) : 'N/A'}</Text></View>
                </View>
                <View style={[styles.row, {marginTop: 12}]}>
                  <View style={{flex: 1}}><Text style={styles.viewLabel}>Duration:</Text><Text style={styles.viewVal}>{viewingRecord ? durationInDays(viewingRecord.startDate, viewingRecord.endDate) : 0} Days</Text></View>
                </View>
              </View>

              <Text style={styles.sectionHeaderRed}><Feather name="award" /> PROMOTION CRITERIA</Text>
              <View style={styles.viewDetailsBox}>
                <View style={styles.row}>
                  <View style={{flex: 1}}><Text style={styles.viewLabel}>Min Overall %:</Text><Text style={styles.viewVal}>{viewingRecord?.promotionCriteria?.minOverallPercent ?? "—"}%</Text></View>
                  <View style={{flex: 1}}><Text style={styles.viewLabel}>Min Subject %:</Text><Text style={styles.viewVal}>{viewingRecord?.promotionCriteria?.minSubjectPercent ?? "—"}%</Text></View>
                </View>
                <View style={[styles.row, {marginTop: 12}]}>
                  <View style={{flex: 1}}><Text style={styles.viewLabel}>Max Allowed Fails:</Text><Text style={styles.viewVal}>{viewingRecord?.promotionCriteria?.maxSubjectsAllowedToFail ?? "—"}</Text></View>
                  <View style={{flex: 1}}><Text style={styles.viewLabel}>Min Attendance:</Text><Text style={styles.viewVal}>{viewingRecord?.promotionCriteria?.minAttendancePercent ? `${viewingRecord.promotionCriteria.minAttendancePercent}%` : 'Not enforced'}</Text></View>
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
  container: { flex: 1, backgroundColor: '#F4F7F9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header with Add Button
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: 16, 
    paddingBottom: 10, 
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F3'
  },
  headerTextContainer: { flex: 1, paddingRight: 10 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '500' },
  headerAddBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#B3122A', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 10, 
    gap: 4,
    shadowColor: '#B3122A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  headerAddBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  
  // Scrollable KPI Grid
  kpiWrapper: { backgroundColor: '#F4F7F9', paddingVertical: 12 },
  kpiScrollContent: { paddingHorizontal: 16, gap: 10 },
  kpiCard: { 
    width: 135, 
    backgroundColor: '#fff', 
    padding: 12, 
    borderRadius: 14, 
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  kpiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 18, fontWeight: '800', color: '#111827', flex: 1 },
  kpiLabel: { fontSize: 9.5, fontWeight: '800', color: '#6B7280', letterSpacing: 0.5 },

  // Search Bar (Full Width)
  actionBar: { paddingHorizontal: 16, marginBottom: 4 },
  searchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    borderRadius: 12, 
    paddingHorizontal: 12, 
    height: 46, 
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#111827' },

  // Cards
  listContent: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#F0F1F3', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cardName: { fontSize: 17, fontWeight: '800', color: '#111827' },
  schoolSubText: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginBottom: 14, marginLeft: 18 },
  
  badgeActive: { backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#D1FAE5' },
  badgeActiveText: { color: '#059669', fontSize: 10.5, fontWeight: '800' },
  badgeInactive: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  badgeInactiveText: { color: '#6B7280', fontSize: 10.5, fontWeight: '700' },

  datesRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#F0F1F3', marginBottom: 12 },
  dateBox: { alignItems: 'flex-start' },
  dateLabel: { fontSize: 10, color: '#6B7280', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  dateValue: { fontSize: 12.5, color: '#111827', fontWeight: '700' },

  criteriaGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  criteriaTile: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F0F1F3', borderRadius: 10, padding: 10, alignItems: 'center' },
  criteriaK: { fontSize: 9.5, textTransform: 'uppercase', color: '#6B7280', fontWeight: '700', marginBottom: 4 },
  criteriaV: { fontWeight: '800', color: '#B3122A', fontSize: 14 },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 16 },
  actionBtnGroup: { flexDirection: 'row', gap: 8 },
  iconBtnPrimary: { padding: 8, backgroundColor: '#E0F2FE', borderRadius: 8, borderWidth: 1, borderColor: '#BAE6FD' },
  iconBtnEdit: { padding: 8, backgroundColor: '#ECFDF5', borderRadius: 8, borderWidth: 1, borderColor: '#D1FAE5' },
  iconBtnDelete: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FEE2E2' },

  activateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6, borderWidth: 1, borderColor: '#D1FAE5' },
  activateBtnText: { color: '#059669', fontSize: 12, fontWeight: '700' },

  emptyState: { alignItems: "center", padding: 40, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#E5E7EB", borderStyle: "dashed", marginTop: 10 },
  emptyStateText: { color: '#6B7280', marginTop: 12, fontWeight: '600', fontSize: 14 },

  // Modal Form (Compact Floating)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: '#fff', borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F1F3' },
  formTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  closeBtnIcon: { padding: 6, backgroundColor: '#F3F4F6', borderRadius: 20 },
  formScroll: { padding: 20 },
  
  sectionDividerText: { fontSize: 11, fontWeight: '800', color: '#B3122A', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12, marginTop: 4 },
  
  inputWrapper: { marginBottom: 14, zIndex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#4B5563', marginBottom: 6, marginLeft: 2 },
  asterisk: { color: '#B3122A' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 44, backgroundColor: '#F9FAFB', fontSize: 13.5, color: '#111827' },
  inputError: { borderColor: '#B3122A', backgroundColor: '#FEF2F2' },
  errorText: { color: '#B3122A', fontSize: 11.5, marginTop: 4, fontWeight: '500' },
  row: { flexDirection: 'row', justifyContent: 'space-between', zIndex: 2 },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 44, backgroundColor: '#F9FAFB' },
  dropdownHeaderActive: { borderColor: '#B3122A', backgroundColor: '#FEF2F2' },
  dropdownSelectedText: { color: '#111827', fontSize: 13.5, fontWeight: '500' },
  dropdownPlaceholder: { color: '#9CA3AF', fontSize: 13.5 },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden', elevation: 5, zIndex: 100 },
  dropdownScroll: { maxHeight: 150 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14 },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dropdownItemText: { fontSize: 13.5, color: '#374151', fontWeight: '500' },
  dropdownItemTextActive: { color: '#B3122A', fontWeight: '700' },

  saveBtnFull: { backgroundColor: '#B3122A', height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2, shadowColor: '#B3122A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  saveBtnFullText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },

  // View Full Spec Modal
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  viewModalContainer: { backgroundColor: '#F9FAFB', width: '100%', borderRadius: 24, maxHeight: '85%', overflow: 'hidden', elevation: 10 },
  viewHeaderRed: { backgroundColor: '#B3122A', padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewTitle: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  viewName: { fontSize: 22, fontWeight: '800', color: '#111827' },
  
  sectionHeaderRed: { fontSize: 11, fontWeight: '800', color: '#B3122A', marginTop: 10, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  viewDetailsBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#F0F1F3', marginBottom: 12 },
  viewLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '700', marginBottom: 4 },
  viewVal: { fontSize: 13, color: '#111827', fontWeight: '700' },
});