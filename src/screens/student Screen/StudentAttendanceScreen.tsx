import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  ActivityIndicator, RefreshControl, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import axios from 'axios';
import { API_BASE } from '../../network/api';


const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#B3122A', primaryDark: '#C5221F', primarySoft: '#FDE8E8',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenDark: '#059669', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberDark: '#D97706', amberSoft: '#FEF3C7',
  purple: '#A855F7', purpleSoft: '#F3E8FF',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

const MONTH_NAMES = [
  { val: '04', name: 'Apr' }, { val: '05', name: 'May' }, { val: '06', name: 'Jun' },
  { val: '07', name: 'Jul' }, { val: '08', name: 'Aug' }, { val: '09', name: 'Sep' },
  { val: '10', name: 'Oct' }, { val: '11', name: 'Nov' }, { val: '12', name: 'Dec' },
  { val: '01', name: 'Jan' }, { val: '02', name: 'Feb' }, { val: '03', name: 'Mar' },
];

export default function StudentAttendanceScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Filters
  const currentYearNum = new Date().getFullYear();
  const [yearMode, setYearMode] = useState<'current' | 'last' | 'all'>('current');
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Data States
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [childrenList, setChildrenList] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  // UI States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const userRole = await AsyncStorage.getItem('userRole');
    setAuthToken(token);

    // If Parent, fetch children to populate selector
    if (userRole === 'Parent') {
      try {
        const childRes = await axios.get(`${API_BASE}/parent/children`, { headers: { Authorization: `Bearer ${token}` } });
        if (childRes.data?.data?.length > 0) {
          setChildrenList(childRes.data.data);
          setSelectedChildId(childRes.data.data[0]._id);
          fetchAttendance(token, childRes.data.data[0]._id, yearMode, selectedMonth);
          return;
        }
      } catch (e) { console.warn("Could not fetch children"); }
    }

    // Otherwise, standard student fetch
    fetchAttendance(token, null, yearMode, selectedMonth);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchAttendance = async (token: string | null = authToken, childId: string | null = selectedChildId, yMode: string = yearMode, sMonth: string = selectedMonth, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params: any = {};
      if (childId) params.studentId = childId;
      if (sMonth) params.month = sMonth;
      else if (yMode === 'current') params.year = String(currentYearNum);
      else if (yMode === 'last') params.year = String(currentYearNum - 1);

      const res = await axios.get(`${API_BASE}/attendance/my-student-attendance`, { params, ...authHeaders(token) });
      if (res.data?.success) setAttendanceData(res.data);
    } catch (err) { console.error('Failed to load attendance'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const handleYearModeChange = (mode: 'current' | 'last' | 'all') => {
    setYearMode(mode);
    setSelectedMonth('');
    fetchAttendance(authToken, selectedChildId, mode, '');
  };

  const handleMonthChange = (monthKey: string) => {
    const newMonth = selectedMonth === monthKey ? '' : monthKey;
    setSelectedMonth(newMonth);
    fetchAttendance(authToken, selectedChildId, yearMode, newMonth);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Present': return { bg: C.greenSoft, text: C.greenDark, icon: 'check-circle' };
      case 'Absent': return { bg: C.primarySoft, text: C.primaryDark, icon: 'x-circle' };
      case 'Leave': return { bg: C.amberSoft, text: C.amberDark, icon: 'calendar' };
      case 'Half-Day': return { bg: C.blueSoft, text: C.blue, icon: 'clock' };
      case 'Holiday': return { bg: C.purpleSoft, text: C.purple, icon: 'sun' };
      default: return { bg: C.slateSoft, text: C.slate, icon: 'minus' };
    }
  };

  const stats = attendanceData?.stats || { totalDays: 0, workingDays: 0, presentDays: 0, absentDays: 0, leaveDays: 0, halfDays: 0, holidays: 0, percentage: 0 };
  const student = attendanceData?.student || {};

  const gradientColors = stats.percentage >= 75
    ? ['#059669', '#10b981']
    : stats.percentage >= 60
      ? ['#d97706', '#f59e0b']
      : ['#dc2626', '#ef4444'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="calendar" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My Attendance</Text>
          <Text style={styles.subtitle}>View monthly, yearly, and overall stats.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAttendance(authToken, selectedChildId, yearMode, selectedMonth, true)} colors={[C.primary]} />}
      >
        {/* Optional Child Selector for Parents */}
        {childrenList.length > 0 && (
          <View style={[styles.inputWrapper, { zIndex: 100, marginBottom: 16 }]}>
            <Text style={styles.inputLabel}>SELECT CHILD</Text>
            <TouchableOpacity style={[styles.dropdownHeader, activeDropdown === 'child' && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(activeDropdown === 'child' ? null : 'child')} activeOpacity={0.85}>
              <Text style={styles.dropdownSelectedText} numberOfLines={1}>{childrenList.find(c => c._id === selectedChildId)?.name || 'Select Child'}</Text>
              <Feather name={activeDropdown === 'child' ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
            </TouchableOpacity>
            {activeDropdown === 'child' && (
              <View style={styles.dropdownListContainer}>
                {childrenList.map((c) => (
                  <TouchableOpacity key={c._id} style={styles.dropdownItem} onPress={() => { setSelectedChildId(c._id); setActiveDropdown(null); fetchAttendance(authToken, c._id, yearMode, selectedMonth); }}>
                    <Text style={styles.dropdownItemText}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Student Info Bar */}
        <View style={styles.infoBar}>
          <View style={styles.infoBadge}><Feather name="user" size={12} color={C.blue} /><Text style={styles.infoBadgeText}>Student Panel</Text></View>
          {!!student.rollNo && <Text style={styles.rollText}>Roll No: {student.rollNo}</Text>}
        </View>

        {/* Year Filter Pills */}
        <View style={styles.pillScrollerWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillScroller}>
            <TouchableOpacity style={[styles.pillBtn, yearMode === 'current' ? styles.pillBtnActive : styles.pillBtnInactive]} onPress={() => handleYearModeChange('current')}>
              <Text style={[styles.pillText, yearMode === 'current' ? styles.pillTextActive : styles.pillTextInactive]}>Current Year ({currentYearNum})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pillBtn, yearMode === 'last' ? styles.pillBtnActive : styles.pillBtnInactive]} onPress={() => handleYearModeChange('last')}>
              <Text style={[styles.pillText, yearMode === 'last' ? styles.pillTextActive : styles.pillTextInactive]}>Last Year ({currentYearNum - 1})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pillBtn, yearMode === 'all' ? styles.pillBtnActive : styles.pillBtnInactive]} onPress={() => handleYearModeChange('all')}>
              <Text style={[styles.pillText, yearMode === 'all' ? styles.pillTextActive : styles.pillTextInactive]}>All Time</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : (
          <>
            {/* OVERALL PERCENTAGE HERO CARD */}
            <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <Text style={styles.heroTitle}>ATTENDANCE SCORE</Text>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>{stats.percentage >= 75 ? 'Excellent' : stats.percentage >= 60 ? 'Average' : 'Low'}</Text>
                </View>
              </View>
              <View style={styles.heroScoreRow}>
                <Text style={styles.heroScoreText}>{stats.percentage}%</Text>
                <Text style={styles.heroScoreSub}>overall</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, stats.percentage)}%` }]} />
              </View>
              <View style={styles.heroFooter}>
                <Text style={styles.heroFooterText}>Total Days: {stats.totalDays}</Text>
                <Text style={styles.heroFooterText}>Working Days: {stats.workingDays}</Text>
              </View>
            </LinearGradient>

            {/* METRICS GRID */}
            <View style={styles.metricsGrid}>
              <View style={[styles.metricCard, { borderLeftColor: C.green }]}>
                <View style={styles.metricHeader}><Feather name="check-circle" size={14} color={C.green} /><Text style={styles.metricTitle}>Present</Text></View>
                <Text style={styles.metricVal}>{stats.presentDays}</Text>
              </View>
              <View style={[styles.metricCard, { borderLeftColor: C.primary }]}>
                <View style={styles.metricHeader}><Feather name="x-circle" size={14} color={C.primary} /><Text style={styles.metricTitle}>Absent</Text></View>
                <Text style={styles.metricVal}>{stats.absentDays}</Text>
              </View>
              <View style={[styles.metricCard, { borderLeftColor: C.amber }]}>
                <View style={styles.metricHeader}><Feather name="calendar" size={14} color={C.amber} /><Text style={styles.metricTitle}>Leave</Text></View>
                <Text style={styles.metricVal}>{stats.leaveDays}</Text>
              </View>
              <View style={[styles.metricCard, { borderLeftColor: C.purple }]}>
                <View style={styles.metricHeader}><Feather name="sun" size={14} color={C.purple} /><Text style={styles.metricTitle}>Holidays</Text></View>
                <Text style={styles.metricVal}>{stats.holidays}</Text>
              </View>
            </View>

            {/* MONTH FILTER PILLS */}
            <View style={styles.monthScrollerWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthScroller}>
                <TouchableOpacity style={[styles.monthBtn, !selectedMonth ? styles.monthBtnActive : styles.monthBtnInactive]} onPress={() => handleMonthChange('')}>
                  <Text style={[styles.monthText, !selectedMonth ? styles.monthTextActive : styles.monthTextInactive]}>All Months</Text>
                </TouchableOpacity>
                {MONTH_NAMES.map((m) => {
                  const targetYear = ['01', '02', '03'].includes(m.val)
                    ? yearMode === 'last' ? currentYearNum : currentYearNum + 1
                    : yearMode === 'last' ? currentYearNum - 1 : currentYearNum;
                  const monthKey = `${targetYear}-${m.val}`;
                  const isSelected = selectedMonth === monthKey;

                  return (
                    <TouchableOpacity key={monthKey} style={[styles.monthBtn, isSelected ? styles.monthBtnActive : styles.monthBtnInactive]} onPress={() => handleMonthChange(monthKey)}>
                      <Text style={[styles.monthText, isSelected ? styles.monthTextActive : styles.monthTextInactive]}>{m.name} {targetYear}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* MONTHLY SUMMARY LIST */}
            {attendanceData?.monthlySummary?.length > 0 && (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Feather name="pie-chart" size={16} color={C.primary} /><Text style={styles.sectionTitle}>Monthly Performance</Text>
                </View>
                {attendanceData.monthlySummary.map((m: any, idx: number) => {
                  const d = new Date(`${m.month}-01`);
                  const mName = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
                  const isSel = selectedMonth === m.month;

                  return (
                    <TouchableOpacity key={idx} style={[styles.monthRow, isSel && styles.monthRowActive]} onPress={() => handleMonthChange(m.month)}>
                      <Text style={styles.monthRowName}>{mName}</Text>
                      <View style={styles.monthRowStats}>
                        <Text style={styles.statP}>P: {m.present}</Text>
                        <Text style={styles.statA}>A: {m.absent}</Text>
                        <Text style={styles.statL}>L: {m.leave}</Text>
                      </View>
                      <View style={[styles.monthRowScore, { backgroundColor: m.percentage >= 75 ? C.green : m.percentage >= 60 ? C.amber : C.primary }]}>
                        <Text style={styles.monthRowScoreText}>{m.percentage}%</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* DAILY LOGS */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="list" size={16} color={C.blue} />
                  <Text style={styles.sectionTitle}>Daily Attendance Log</Text>
                </View>
                <View style={styles.logCountBadge}><Text style={styles.logCountText}>{attendanceData?.records?.length || 0} Records</Text></View>
              </View>

              {attendanceData?.records?.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="calendar" size={40} color={C.textFaint} />
                  <Text style={styles.emptyTitle}>No Records Found</Text>
                  <Text style={styles.emptySubtitle}>No attendance marked for the selected period.</Text>
                </View>
              ) : (
                (attendanceData?.records || []).map((r: any, i: number) => {
                  const dObj = new Date(r.date);
                  const dayName = isNaN(dObj.getTime()) ? '' : dObj.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayNum = isNaN(dObj.getTime()) ? '' : dObj.getDate();
                  const sc = getStatusColor(r.status);

                  return (
                    <View key={i} style={styles.logCard}>
                      <View style={styles.logDateBox}>
                        <Text style={styles.logDateNum}>{dayNum}</Text>
                        <Text style={styles.logDateDay}>{dayName}</Text>
                      </View>

                      <View style={styles.logDetailsCol}>
                        <Text style={styles.logDateFull}>{r.date}</Text>
                        {(r.remarks || r.timeIn || r.timeOut) && (
                          <Text style={styles.logRemarks} numberOfLines={2}>
                            {r.remarks ? `${r.remarks} ` : ''}
                            {r.timeIn ? `[In: ${r.timeIn}] ` : ''}
                            {r.timeOut ? `[Out: ${r.timeOut}]` : ''}
                          </Text>
                        )}
                      </View>

                      <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                        <Feather name={sc.icon} size={12} color={sc.text} style={{ marginRight: 4 }} />
                        <Text style={[styles.statusPillText, { color: sc.text }]}>{r.status}</Text>
                      </View>
                    </View>
                  );
                })
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  scrollContent: { padding: 16, paddingBottom: 40 },

  infoBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  infoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.blueSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 4 },
  infoBadgeText: { fontSize: 11, fontWeight: '800', color: C.blue },
  rollText: { fontSize: 12, fontWeight: '700', color: C.textMuted, backgroundColor: C.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },

  pillScrollerWrap: { marginBottom: 16 },
  pillScroller: { gap: 8 },
  pillBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  pillBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  pillBtnInactive: { backgroundColor: C.surface, borderColor: C.border },
  pillText: { fontSize: 12, fontWeight: '700' },
  pillTextActive: { color: '#fff' },
  pillTextInactive: { color: C.textMuted },

  // Hero Card
  heroCard: { borderRadius: 20, padding: 20, elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, marginBottom: 20 },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  heroTitle: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
  heroBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  heroBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  heroScoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 16 },
  heroScoreText: { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  heroScoreSub: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  progressTrack: { height: 8, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 4 },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  heroFooterText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },

  // Metrics Grid
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  metricCard: { flex: 1, minWidth: '45%', backgroundColor: C.surface, padding: 14, borderRadius: 16, borderLeftWidth: 4, elevation: 1, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8 },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  metricTitle: { fontSize: 11, fontWeight: '800', color: C.textMuted },
  metricVal: { fontSize: 22, fontWeight: '900', color: C.text },

  // Month Pills
  monthScrollerWrap: { backgroundColor: C.surface, borderRadius: 16, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  monthScroller: { gap: 8 },
  monthBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  monthBtnActive: { backgroundColor: C.primary },
  monthBtnInactive: { backgroundColor: C.bg },
  monthText: { fontSize: 12, fontWeight: '700' },
  monthTextActive: { color: '#fff' },
  monthTextInactive: { color: C.textMuted },

  // Sections
  sectionCard: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: C.border, elevation: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginLeft: 8 },
  logCountBadge: { backgroundColor: C.blueSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  logCountText: { fontSize: 10, fontWeight: '800', color: C.blue },

  // Monthly Row
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  monthRowActive: { backgroundColor: C.primarySoft, borderRadius: 8, paddingHorizontal: 8 },
  monthRowName: { flex: 1.5, fontSize: 14, fontWeight: '800', color: C.text },
  monthRowStats: { flex: 2, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 },
  statP: { fontSize: 12, fontWeight: '700', color: C.greenDark, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  statA: { fontSize: 12, fontWeight: '700', color: C.primaryDark, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  statL: { fontSize: 12, fontWeight: '700', color: C.amberDark, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  monthRowScore: { backgroundColor: C.green, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, minWidth: 44, alignItems: 'center' },
  monthRowScoreText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  // Daily Log
  logCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  logDateBox: { width: 44, height: 44, backgroundColor: C.surface, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border, marginRight: 12 },
  logDateNum: { fontSize: 16, fontWeight: '900', color: C.text },
  logDateDay: { fontSize: 9, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase' },
  logDetailsCol: { flex: 1 },
  logDateFull: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 2 },
  logRemarks: { fontSize: 11, color: C.textMuted, fontWeight: '500' },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusPillText: { fontSize: 10, fontWeight: '800' },

  emptyState: { alignItems: 'center', padding: 30 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  // Dropdown for Child Selection
  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, marginBottom: 6, letterSpacing: 0.5 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, backgroundColor: C.surface },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '700' },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 13, color: C.text, fontWeight: '600' },
});