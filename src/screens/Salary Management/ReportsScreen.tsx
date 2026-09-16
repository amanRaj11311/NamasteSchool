import React, { useState, useEffect } from 'react';
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
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

// --- Safe Date Utilities ---
const getMonthStr = (d: Date): string => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatDisplayMonth = (d: Date): string => {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

export default function SalaryReportsScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Filter States
  const [monthDate, setMonthDate] = useState<Date>(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const monthStr = getMonthStr(monthDate);

  // Data States
  const [monthWise, setMonthWise] = useState<any[]>([]);
  const [typeWise, setTypeWise] = useState<any[]>([]);
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchReports(token, monthStr);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchReports = async (token: string | null = authToken, selectedMonth: string = monthStr, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [monthRes, typeRes] = await Promise.all([
        axios.get(`${API_BASE}/salary/reports/month-wise`, authHeaders(token)),
        axios.get(`${API_BASE}/salary/reports/staff-type-wise`, { params: { month: selectedMonth }, ...authHeaders(token) }),
      ]);
      
      if (monthRes.data?.success) setMonthWise(monthRes.data.data || []);
      if (typeRes.data?.success) setTypeWise(typeRes.data.data || []);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="bar-chart-2" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Salary Reports</Text>
          <Text style={styles.subtitle}>Payout trends and staff-type breakdown.</Text>
        </View>
      </View>

      {/* Filter Section */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>SELECT MONTH</Text>
        <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowMonthPicker(true)}>
          <Feather name="calendar" size={14} color={C.textMuted} style={{marginRight: 8}} />
          <Text style={styles.datePickerText}>{formatDisplayMonth(monthDate)}</Text>
          <Feather name="chevron-down" size={14} color={C.textMuted} style={{marginLeft: 'auto'}} />
        </TouchableOpacity>
        {showMonthPicker && (
          <DateTimePicker 
            value={monthDate} 
            mode="date" 
            display="default" 
            onChange={(e, d) => { 
              setShowMonthPicker(Platform.OS === 'ios'); 
              if (d) { 
                setMonthDate(d); 
                fetchReports(authToken, getMonthStr(d)); 
              } 
            }} 
          />
        )}
      </View>

      {/* Dashboard Content */}
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchReports(authToken, monthStr, true)} colors={[C.primary]} />}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : (
          <>
            {/* Staff-type Breakdown */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <Feather name="users" size={16} color={C.primary} />
                  <Text style={styles.sectionTitle}>Staff-type Breakdown ({monthStr})</Text>
                </View>
              </View>

              {typeWise.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No payroll generated for this month.</Text>
                </View>
              ) : (
                <View style={styles.listContainer}>
                  <View style={styles.listHeaderRow}>
                    <Text style={[styles.listHeaderCell, { flex: 2 }]}>Type</Text>
                    <Text style={[styles.listHeaderCell, { flex: 1, textAlign: 'center' }]}>Staff</Text>
                    <Text style={[styles.listHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Net Paid</Text>
                  </View>
                  {typeWise.map((t: any, index: number) => (
                    <View key={t.staffType || index} style={styles.listDataRow}>
                      <Text style={[styles.listDataCell, { flex: 2, fontWeight: '700' }]} numberOfLines={1}>{t.staffType}</Text>
                      <Text style={[styles.listDataCell, { flex: 1, textAlign: 'center', color: C.textMuted }]}>{t.staffCount}</Text>
                      <Text style={[styles.listDataCell, styles.successText, { flex: 1.5, textAlign: 'right' }]}>
                        ₹{t.totalNetPay?.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Month-wise Payout (Historical) */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <Feather name="trending-up" size={16} color={C.blue} />
                  <Text style={styles.sectionTitle}>Month-wise Payout Trend</Text>
                </View>
              </View>

              {monthWise.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No payroll history exists yet.</Text>
                </View>
              ) : (
                <View style={styles.listContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={true} bounces={false}>
                    <View>
                      <View style={[styles.listHeaderRow, { width: 450 }]}>
                        <Text style={[styles.listHeaderCell, { width: 90 }]}>Month</Text>
                        <Text style={[styles.listHeaderCell, { width: 70, textAlign: 'center' }]}>Staff</Text>
                        <Text style={[styles.listHeaderCell, { width: 90, textAlign: 'right' }]}>Gross</Text>
                        <Text style={[styles.listHeaderCell, { width: 90, textAlign: 'right' }]}>LOP</Text>
                        <Text style={[styles.listHeaderCell, { width: 110, textAlign: 'right' }]}>Net Paid</Text>
                      </View>
                      {monthWise.map((m: any, index: number) => (
                        <View key={m._id || index} style={[styles.listDataRow, { width: 450 }]}>
                          <Text style={[styles.listDataCell, { width: 90, fontWeight: '800' }]}>{m._id}</Text>
                          <Text style={[styles.listDataCell, { width: 70, textAlign: 'center', color: C.textMuted }]}>{m.staffCount}</Text>
                          <Text style={[styles.listDataCell, { width: 90, textAlign: 'right' }]}>₹{m.totalGross?.toLocaleString('en-IN')}</Text>
                          <Text style={[styles.listDataCell, styles.dangerText, { width: 90, textAlign: 'right' }]}>₹{m.totalLop?.toLocaleString('en-IN')}</Text>
                          <Text style={[styles.listDataCell, styles.successText, { width: 110, textAlign: 'right' }]}>₹{m.totalNetPay?.toLocaleString('en-IN')}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  filterLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 8 },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, height: 44, borderRadius: 10 },
  datePickerText: { fontSize: 14, fontWeight: '700', color: C.text },

  scrollContent: { padding: 16, paddingBottom: 40 },

  // Section Cards
  sectionCard: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border, elevation: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text },

  emptyBox: { padding: 20, alignItems: 'center', backgroundColor: C.surfaceSoft, borderRadius: 10, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  emptyText: { fontSize: 13, fontWeight: '600', color: C.textMuted, textAlign: 'center' },

  // Custom List/Grid Tables
  listContainer: { backgroundColor: C.surfaceSoft, borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  listHeaderRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: C.border },
  listHeaderCell: { fontSize: 11, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  listDataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  listDataCell: { fontSize: 13, color: C.text, fontWeight: '600' },
  successText: { color: C.green, fontWeight: '800' },
  dangerText: { color: C.primary, fontWeight: '800' },
});