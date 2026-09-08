import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  Platform, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';

const API_BASE = 'https://mern.schoolapi.dcstechnosis.com/api';
const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
};

// --- Utilities ---
const getMonthStr = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const formatDisplayMonth = (d: Date): string => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

export default function ExpenseReportsScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);

  // States
  const [selectedYearStr, setSelectedYearStr] = useState(new Date().getFullYear().toString());
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(false);

  const [monthReport, setMonthReport] = useState<any[]>([]);
  const [categoryReport, setCategoryReport] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchReports(token, selectedYearStr, getMonthStr(selectedMonthDate));
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchReports = async (token: string | null = authToken, year: string = selectedYearStr, month: string = getMonthStr(selectedMonthDate), isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([
        axios.get(`${API_BASE}/expenses/reports/month-wise`, { params: { year }, ...authHeaders(token) }),
        axios.get(`${API_BASE}/expenses/reports/category-wise`, { params: { month }, ...authHeaders(token) }),
      ]);
      if (mRes.data?.success) setMonthReport(mRes.data.data || []);
      if (cRes.data?.success) setCategoryReport(cRes.data.data || []);
    } catch (err) { console.error('Failed to load expense reports', err); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const yearTotal = monthReport.reduce((acc, curr) => acc + (curr.total || 0), 0);
  const monthTotal = categoryReport.reduce((acc, curr) => acc + (curr.total || 0), 0);

  // Year Options (Current year - 2 to + 2)
  const currentY = new Date().getFullYear();
  const yearOptions = Array.from({length: 5}, (_, i) => String(currentY - 2 + i));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="pie-chart" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Expense Reports</Text>
          <Text style={styles.subtitle}>Month-wise trends & category-wise distribution.</Text>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchReports(authToken, selectedYearStr, getMonthStr(selectedMonthDate), true)} colors={[C.primary]} />}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : (
          <>
            {/* Category Wise Report */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Category Breakdown</Text>
                  <Text style={styles.sectionSub}>Total: ₹{monthTotal.toLocaleString('en-IN')}</Text>
                </View>
                
                {/* Month Picker */}
                <View>
                  <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowMonthPicker(true)}>
                    <Text style={styles.pickerBtnText}>{formatDisplayMonth(selectedMonthDate)}</Text>
                    <Feather name="calendar" size={12} color={C.textMuted} />
                  </TouchableOpacity>
                  {showMonthPicker && (
                    <DateTimePicker value={selectedMonthDate} mode="date" display="default" onChange={(e, d) => { setShowMonthPicker(Platform.OS === 'ios'); if (d) { setSelectedMonthDate(d); fetchReports(authToken, selectedYearStr, getMonthStr(d)); } }} />
                  )}
                </View>
              </View>

              {categoryReport.length === 0 ? (
                <View style={styles.emptyBox}><Text style={styles.emptyText}>No data for {formatDisplayMonth(selectedMonthDate)}</Text></View>
              ) : (
                <View style={styles.listContainer}>
                  <View style={styles.listHeaderRow}>
                    <Text style={[styles.listHeaderCell, { flex: 1.5 }]}>Category</Text>
                    <Text style={[styles.listHeaderCell, { flex: 1, textAlign: 'right' }]}>Total Exp.</Text>
                  </View>
                  {categoryReport.map((c: any, index: number) => (
                    <View key={c.category || index} style={styles.listDataRow}>
                      <View style={{ flex: 1.5, alignItems: 'flex-start' }}>
                        <View style={styles.badge}><Text style={styles.badgeText}>{c.category}</Text></View>
                      </View>
                      <Text style={[styles.listDataCell, styles.dangerText, { flex: 1, textAlign: 'right' }]}>
                        ₹{c.total?.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Month Wise Report */}
            <View style={[styles.sectionCard, { zIndex: 100 }]}>
              <View style={[styles.sectionHeader, { zIndex: 100 }]}>
                <View>
                  <Text style={styles.sectionTitle}>Month-Wise Expenses</Text>
                  <Text style={styles.sectionSub}>Total: ₹{yearTotal.toLocaleString('en-IN')}</Text>
                </View>
                
                {/* Custom Inline Dropdown for Year */}
                <View style={{ position: 'relative', zIndex: 100 }}>
                  <TouchableOpacity style={styles.pickerBtn} onPress={() => setActiveDropdown(!activeDropdown)}>
                    <Text style={styles.pickerBtnText}>{selectedYearStr}</Text>
                    <Feather name="chevron-down" size={12} color={C.textMuted} />
                  </TouchableOpacity>
                  {activeDropdown && (
                    <View style={styles.dropdownListContainer}>
                      {yearOptions.map(y => (
                        <TouchableOpacity key={y} style={styles.dropdownItem} onPress={() => { setSelectedYearStr(y); setActiveDropdown(false); fetchReports(authToken, y, getMonthStr(selectedMonthDate)); }}>
                          <Text style={[styles.dropdownItemText, selectedYearStr === y && { color: C.primary, fontWeight: '700' }]}>{y}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {monthReport.length === 0 ? (
                <View style={styles.emptyBox}><Text style={styles.emptyText}>No monthly data for {selectedYearStr}</Text></View>
              ) : (
                <View style={styles.listContainer}>
                  <View style={styles.listHeaderRow}>
                    <Text style={[styles.listHeaderCell, { flex: 1 }]}>Month</Text>
                    <Text style={[styles.listHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Approved Amount</Text>
                  </View>
                  {monthReport.map((m: any, index: number) => (
                    <View key={m.month || index} style={styles.listDataRow}>
                      <Text style={[styles.listDataCell, { flex: 1, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>{m.month}</Text>
                      <Text style={[styles.listDataCell, styles.dangerText, { flex: 1.5, textAlign: 'right' }]}>
                        ₹{m.total?.toLocaleString('en-IN')}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  scrollContent: { padding: 16, paddingBottom: 40 },

  sectionCard: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border, elevation: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  sectionSub: { fontSize: 12, color: C.textMuted, fontWeight: '700', marginTop: 2 },

  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  pickerBtnText: { fontSize: 12, fontWeight: '700', color: C.text },

  dropdownListContainer: { position: 'absolute', top: 35, right: 0, width: 100, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '500', textAlign: 'center' },

  emptyBox: { padding: 20, alignItems: 'center', backgroundColor: C.surfaceSoft, borderRadius: 10, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  emptyText: { fontSize: 13, fontWeight: '600', color: C.textMuted, textAlign: 'center' },

  listContainer: { backgroundColor: C.surfaceSoft, borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  listHeaderRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: C.border },
  listHeaderCell: { fontSize: 11, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  listDataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  listDataCell: { fontSize: 13, color: C.text, fontWeight: '600' },
  dangerText: { color: C.primaryDark, fontWeight: '800', fontSize: 15 },
  
  badge: { backgroundColor: C.blueSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '800', color: C.blue },
});