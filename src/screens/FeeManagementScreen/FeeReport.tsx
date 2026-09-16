import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  Platform, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { API_BASE } from '../../network/api';


const C = {
  bg: '#F3F5F9',
  surface: '#FFFFFF',
  surfaceSoft: '#F8F9FC',
  surfaceSunken: '#EEF1F6',
  border: '#E7EAF1',
  borderStrong: '#D9DEE8',
  text: '#0F1626',
  textMuted: '#5B667A',
  textFaint: '#9AA4B6',

  primary: '#E11D48',
  primaryDark: '#BE123C',
  primarySoft: '#FFF1F3',
  primaryBorder: '#FBD1D9',

  ink: '#111827',
  slate: '#334155',

  green: '#0F9D63',
  greenDark: '#0B7A4E',
  greenSoft: '#E7F8F1',
  greenBorder: '#BFEBD8',

  amber: '#B45309',
  amberDark: '#92400E',
  amberSoft: '#FEF3C7',
  amberBorder: '#FCE2A4',

  blue: '#2563EB',
  blueSoft: '#EAF1FE',
};

// --- Safe Date Utilities ---
const getFirstOfMonth = (): Date => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

const formatToYMD = (d: Date | null): string => {
  if (!d) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

const formatDisplayDate = (d: Date | null) => {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
};

export default function FeeReportsScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Filter States
  const [fromDate, setFromDate] = useState<Date>(getFirstOfMonth());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  // Data States
  const [summary, setSummary] = useState<any>(null);
  const [classWise, setClassWise] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);

  // UI States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');

    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);

    fetchClassesAndReports(token, fromDate, toDate);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchClassesAndReports = async (token: string | null = authToken, fDate: Date = fromDate, tDate: Date = toDate, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      // First fetch classes if we haven't already
      if (classes.length === 0) {
        const clsRes = await axios.get(`${API_BASE}/classes?limit=200`, authHeaders(token));
        if (clsRes.data?.success) setClasses(clsRes.data.data || []);
      }

      const params = { fromDate: formatToYMD(fDate), toDate: formatToYMD(tDate) };

      const [summaryRes, classRes] = await Promise.all([
        axios.get(`${API_BASE}/fees/reports/collection-summary`, { params, ...authHeaders(token) }),
        axios.get(`${API_BASE}/fees/reports/class-wise`, authHeaders(token)),
      ]);

      if (summaryRes.data?.success) setSummary(summaryRes.data.data);
      if (classRes.data?.success) setClassWise(classRes.data.data || []);

    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'fees' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const classNameFor = (id: string) => {
    const c = classes.find((cl) => cl._id === id);
    return c ? `${c.className} ${c.division || ''}` : 'Unassigned';
  };

  const totalOutstanding = classWise.reduce((sum, c) => sum + (c.totalDue || 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="bar-chart-2" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Fee Analytics & Reports</Text>
          <Text style={styles.subtitle}>Real-time collection breakdown and class-wise dues</Text>
        </View>
      </View>

      {/* Filter Section */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>COLLECTION DATE RANGE</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowFromPicker(true)} activeOpacity={0.85}>
            <Feather name="calendar" size={14} color={C.textMuted} style={{ marginRight: 6 }} />
            <Text style={styles.datePickerText}>{formatDisplayDate(fromDate)}</Text>
          </TouchableOpacity>
          {showFromPicker && (
            <DateTimePicker
              value={fromDate}
              mode="date"
              display="default"
              onChange={(e, d) => {
                setShowFromPicker(Platform.OS === 'ios');
                if (d) { setFromDate(d); fetchClassesAndReports(authToken, d, toDate); }
              }}
            />
          )}

          <View style={styles.dateDividerWrap}><View style={styles.dateDividerLine} /></View>

          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowToPicker(true)} activeOpacity={0.85}>
            <Feather name="calendar" size={14} color={C.textMuted} style={{ marginRight: 6 }} />
            <Text style={styles.datePickerText}>{formatDisplayDate(toDate)}</Text>
          </TouchableOpacity>
          {showToPicker && (
            <DateTimePicker
              value={toDate}
              mode="date"
              display="default"
              onChange={(e, d) => {
                setShowToPicker(Platform.OS === 'ios');
                if (d) { setToDate(d); fetchClassesAndReports(authToken, fromDate, d); }
              }}
            />
          )}
        </View>
      </View>

      {/* Dashboard Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchClassesAndReports(authToken, fromDate, toDate, true)} colors={[C.primary]} tintColor={C.primary} />}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : (
          <>
            {/* 4 KPI Cards Grid */}
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, { borderColor: C.greenBorder }]}>
                <View style={styles.kpiRow}>
                  <View style={[styles.iconCircle, { backgroundColor: C.greenSoft }]}><Feather name="briefcase" size={16} color={C.greenDark} /></View>
                  <Text style={styles.kpiLabel}>TOTAL COLLECTED</Text>
                </View>
                <Text style={[styles.kpiValue, { color: C.greenDark }]} numberOfLines={1} adjustsFontSizeToFit>
                  ₹{(summary?.totalCollected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
                <Text style={styles.kpiSubText}>Filtered range collection</Text>
              </View>

              <View style={[styles.kpiCard, { borderColor: C.amberBorder }]}>
                <View style={styles.kpiRow}>
                  <View style={[styles.iconCircle, { backgroundColor: C.amberSoft }]}><Feather name="clock" size={16} color={C.amberDark} /></View>
                  <Text style={styles.kpiLabel}>LATE FEE COLLECTED</Text>
                </View>
                <Text style={[styles.kpiValue, { color: C.amberDark }]} numberOfLines={1} adjustsFontSizeToFit>
                  ₹{(summary?.totalLateFee || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
                <Text style={styles.kpiSubText}>Penalty surcharges</Text>
              </View>

              <View style={[styles.kpiCard, { borderColor: C.primaryBorder }]}>
                <View style={styles.kpiRow}>
                  <View style={[styles.iconCircle, { backgroundColor: C.primarySoft }]}><Feather name="file-text" size={16} color={C.primaryDark} /></View>
                  <Text style={styles.kpiLabel}>TRANSACTIONS</Text>
                </View>
                <Text style={[styles.kpiValue, { color: C.primaryDark }]} numberOfLines={1} adjustsFontSizeToFit>
                  {summary?.transactionCount || 0}
                </Text>
                <Text style={styles.kpiSubText}>Recorded receipts</Text>
              </View>

              <View style={[styles.kpiCard, { borderColor: C.primaryBorder }]}>
                <View style={styles.kpiRow}>
                  <View style={[styles.iconCircle, { backgroundColor: C.primarySoft }]}><Feather name="alert-circle" size={16} color={C.primaryDark} /></View>
                  <Text style={styles.kpiLabel}>TOTAL OUTSTANDING</Text>
                </View>
                <Text style={[styles.kpiValue, { color: C.primaryDark }]} numberOfLines={1} adjustsFontSizeToFit>
                  ₹{totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
                <Text style={styles.kpiSubText}>Pending student dues</Text>
              </View>
            </View>

            {/* Collection Mode Breakdown */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.sectionIconBadge}><Feather name="credit-card" size={14} color={C.primary} /></View>
                  <Text style={styles.sectionTitle}>Collection by Mode</Text>
                </View>
                <View style={styles.countBadge}><Text style={styles.countBadgeText}>{(summary?.byMode || []).length} Modes</Text></View>
              </View>

              {(summary?.byMode || []).length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No payment transactions recorded in this date range.</Text>
                </View>
              ) : (
                <View style={styles.listContainer}>
                  <View style={styles.listHeaderRow}>
                    <Text style={[styles.listHeaderCell, { flex: 1.5 }]}>Mode</Text>
                    <Text style={[styles.listHeaderCell, { flex: 1, textAlign: 'center' }]}>Count</Text>
                    <Text style={[styles.listHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Total Amount</Text>
                  </View>
                  {summary.byMode.map((m: any, index: number) => (
                    <View key={m._id || index} style={[styles.listDataRow, index === summary.byMode.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 1.5 }}>
                        <View style={styles.modeBadge}><Text style={styles.modeBadgeText}>{m._id || 'Cash'}</Text></View>
                      </View>
                      <Text style={[styles.listDataCell, { flex: 1, textAlign: 'center' }]}>{m.count}</Text>
                      <Text style={[styles.listDataCell, styles.successText, { flex: 1.5, textAlign: 'right' }]}>
                        ₹{m.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Class-wise All-Time Summary */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.sectionIconBadge, { backgroundColor: C.greenSoft }]}><Feather name="users" size={14} color={C.greenDark} /></View>
                  <Text style={styles.sectionTitle}>Class-wise Breakdown (All Time)</Text>
                </View>
                <View style={[styles.countBadge, { backgroundColor: C.greenSoft }]}><Text style={[styles.countBadgeText, { color: C.greenDark }]}>{classWise.length} Classes</Text></View>
              </View>

              {classWise.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No fee assignments exist yet across classes.</Text>
                </View>
              ) : (
                <View style={styles.listContainer}>
                  <View style={styles.listHeaderRow}>
                    <Text style={[styles.listHeaderCell, { flex: 1.5 }]}>Class</Text>
                    <Text style={[styles.listHeaderCell, { flex: 1, textAlign: 'center' }]}>Students</Text>
                    <Text style={[styles.listHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Due</Text>
                  </View>
                  {classWise.map((c: any, index: number) => (
                    <View key={c.classId || index} style={[styles.listDataRow, index === classWise.length - 1 && { borderBottomWidth: 0 }]}>
                      <Text style={[styles.listDataCell, { flex: 1.5, fontWeight: '800' }]} numberOfLines={1}>
                        {classNameFor(c.classId)}
                      </Text>
                      <Text style={[styles.listDataCell, { flex: 1, textAlign: 'center' }]}>{c.studentCount}</Text>
                      <Text style={[styles.listDataCell, styles.dangerText, { flex: 1.5, textAlign: 'right' }]}>
                        ₹{c.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, paddingBottom: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.primaryBorder },
  title: { fontSize: 21, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 3, fontWeight: '500' },

  filterSection: { backgroundColor: C.surface, padding: 16, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  filterLabel: { fontSize: 10, fontWeight: '800', color: C.textFaint, letterSpacing: 0.5, marginBottom: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  datePickerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, height: 44, borderRadius: 12 },
  datePickerText: { fontSize: 13, fontWeight: '700', color: C.text },
  dateDividerWrap: { width: 22, alignItems: 'center' },
  dateDividerLine: { width: 10, height: 1.5, backgroundColor: C.borderStrong },

  scrollContent: { padding: 16, paddingBottom: 40 },

  // KPI Grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  kpiCard: {
    width: '48%', backgroundColor: C.surface, padding: 16, borderRadius: 18, borderWidth: 1, marginBottom: 12,
    shadowColor: '#0F1626', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  kpiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  kpiLabel: { fontSize: 9.5, fontWeight: '800', color: C.textFaint, letterSpacing: 0.5, flex: 1 },
  kpiValue: { fontSize: 21, fontWeight: '800', marginBottom: 4 },
  kpiSubText: { fontSize: 10, color: C.textMuted, fontWeight: '600' },

  // Section Cards
  sectionCard: {
    backgroundColor: C.surface, borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border,
    shadowColor: '#0F1626', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  sectionIconBadge: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  countBadge: { backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: C.primaryDark },

  emptyBox: { padding: 20, alignItems: 'center', backgroundColor: C.surfaceSoft, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  emptyText: { fontSize: 13, fontWeight: '600', color: C.textMuted, textAlign: 'center' },

  // Custom List/Grid Tables
  listContainer: { backgroundColor: C.surfaceSoft, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  listHeaderRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: C.surfaceSunken },
  listHeaderCell: { fontSize: 10.5, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  listDataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  listDataCell: { fontSize: 13, color: C.text, fontWeight: '600' },
  successText: { color: C.greenDark, fontWeight: '800' },
  dangerText: { color: C.primaryDark, fontWeight: '800' },

  modeBadge: { backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7, alignSelf: 'flex-start' },
  modeBadgeText: { fontSize: 11, fontWeight: '800', color: C.primaryDark },
});