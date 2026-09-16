import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet,SafeAreaView, ScrollView, ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';

const C = {
  bg: '#F4F6F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#101828', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#E11D2E', primaryDark: '#B91424', primarySoft: '#FEECEC',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberSoft: '#FEF3C7',
};

const shadow = {
  shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
};

export default function HostelReportsScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchReport(token);
  };

  const fetchReport = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/hostel/reports/occupancy`, { headers: { Authorization: `Bearer ${token}` } });
      setReport(res.data?.data || null);
    } catch (err: any) {
      console.error('Occupancy report fetch failed:', err.response?.status, err.response?.data || err.message);
      setReport(null);
      if (!isRefresh) {
        Alert.alert('Couldn\u2019t load report', err.response?.data?.message || 'Check your connection and pull down to try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const summary = report?.summary;
  const occupancyPct = summary?.totalCapacity ? Math.round(((summary.occupiedBeds || 0) / summary.totalCapacity) * 100) : 0;

  // status helper for block rows: full / near-full / available
  const blockStatus = (occupied: number, capacity: number) => {
    if (!capacity) return { label: 'No Beds', color: C.textFaint, dot: C.textFaint };
    if (occupied >= capacity) return { label: 'Full', color: C.primaryDark, dot: C.primary };
    const pct = Math.round((occupied / capacity) * 100);
    if (pct >= 80) return { label: 'Near Full', color: '#B45309', dot: C.amber };
    return { label: 'Available', color: '#0F9D58', dot: C.green };
  };

  return (
    <SafeAreaView style={styles.container}>

      {/* PAGE HEADER */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Occupancy Reports</Text>
        <Text style={styles.pageSubtitle}>Live snapshot across all hostel blocks</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchReport(authToken, true)} colors={[C.primary]} tintColor={C.primary} />}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={styles.loadingText}>Loading occupancy report\u2026</Text>
          </View>
        ) : !report ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBadge}><Feather name="bar-chart-2" size={22} color={C.textFaint} /></View>
            <Text style={styles.emptyTitle}>No Report Data</Text>
            <Text style={styles.emptySubtitle}>Pull down to refresh, or check back once blocks have occupancy data.</Text>
          </View>
        ) : (
          <>
            {/* Overview banner (progress bar now sits inside the card) */}
            <View style={styles.overviewCard}>
              <View style={styles.overviewTopRow}>
                <View style={styles.overviewTextCol}>
                  <Text style={styles.overviewLabel}>OVERALL OCCUPANCY</Text>
                  <Text style={styles.overviewValue}>{occupancyPct}%</Text>
                  <Text style={styles.overviewSub}>{summary?.occupiedBeds || 0} of {summary?.totalCapacity || 0} beds filled</Text>
                </View>
                <View style={styles.overviewRing}>
                  <Feather name="pie-chart" size={26} color="#fff" />
                </View>
              </View>
              <View style={styles.overviewProgressTrack}>
                <View style={[styles.overviewProgressFill, { width: `${occupancyPct}%` }]} />
              </View>
            </View>

            {/* KPI Cards Grid */}
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <View style={[styles.kpiIconBadge, { backgroundColor: C.blueSoft }]}><Feather name="layers" size={15} color={C.blue} /></View>
                <Text style={styles.kpiLabel}>TOTAL BLOCKS</Text>
                <Text style={styles.kpiValue}>{summary?.totalBlocks || 0}</Text>
              </View>
              <View style={styles.kpiCard}>
                <View style={[styles.kpiIconBadge, { backgroundColor: C.surfaceSoft }]}><Feather name="grid" size={15} color={C.text} /></View>
                <Text style={styles.kpiLabel}>TOTAL BEDS</Text>
                <Text style={styles.kpiValue}>{summary?.totalCapacity || 0}</Text>
              </View>
              <View style={styles.kpiCard}>
                <View style={[styles.kpiIconBadge, { backgroundColor: C.primarySoft }]}><Feather name="user-check" size={15} color={C.primaryDark} /></View>
                <Text style={[styles.kpiLabel, { color: C.primaryDark }]}>OCCUPIED BEDS</Text>
                <Text style={[styles.kpiValue, { color: C.primaryDark }]}>{summary?.occupiedBeds || 0}</Text>
              </View>
              <View style={styles.kpiCard}>
                <View style={[styles.kpiIconBadge, { backgroundColor: C.greenSoft }]}><Feather name="check-circle" size={15} color={C.green} /></View>
                <Text style={[styles.kpiLabel, { color: C.green }]}>VACANT BEDS</Text>
                <Text style={[styles.kpiValue, { color: C.green }]}>{summary?.vacantBeds || 0}</Text>
              </View>
            </View>

            {/* List Data */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderText}>BLOCK-WISE BREAKDOWN</Text>
            </View>
            <View style={styles.listContainer}>
              <View style={styles.listHeaderRow}>
                <Text style={[styles.listHeaderCell, { flex: 2.4 }]}>Block</Text>
                <Text style={[styles.listHeaderCell, { flex: 1, textAlign: 'center' }]}>Beds</Text>
                <Text style={[styles.listHeaderCell, { flex: 1, textAlign: 'center' }]}>Occ.</Text>
                <Text style={[styles.listHeaderCell, { flex: 1, textAlign: 'right' }]}>Avail.</Text>
              </View>
              {(report.blocks || []).length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={styles.emptySubtitle}>No blocks to display.</Text>
                </View>
              ) : (
                (report.blocks || []).map((b: any, i: number) => {
                  const status = blockStatus(b.occupied || 0, b.capacity || 0);
                  return (
                    <View key={i} style={[styles.listDataRow, i % 2 === 1 && { backgroundColor: C.surfaceSoft }]}>
                      <View style={[styles.rowAccent, { backgroundColor: status.dot }]} />
                      <View style={{ flex: 2.4 }}>
                        <Text style={styles.blockName} numberOfLines={1}>{b.name}</Text>
                        <View style={styles.blockMetaRow}>
                          <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
                          <Text style={[styles.blockMeta, { color: status.color }]}>{status.label}</Text>
                          <Text style={styles.blockMeta}>· {b.gender} · {b.totalRooms} Rooms</Text>
                        </View>
                      </View>
                      <Text style={[styles.listDataCell, { flex: 1, textAlign: 'center' }]}>{b.capacity}</Text>
                      <Text style={[styles.listDataCell, { flex: 1, textAlign: 'center', color: C.primaryDark }]}>{b.occupied}</Text>
                      <Text style={[styles.listDataCell, { flex: 1, textAlign: 'right', color: C.green }]}>{b.available}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Header
  pageHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: C.surface },
  pageTitle: { fontSize: 19, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  pageSubtitle: { fontSize: 12.5, color: C.textMuted, fontWeight: '500', marginTop: 2 },

  center: { padding: 60, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
  scrollContent: { padding: 16, paddingTop: 16, paddingBottom: 40 },

  emptyState: { padding: 50, alignItems: 'center', gap: 4 },
  emptyIconBadge: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.surfaceSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: C.border },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  emptySubtitle: { fontSize: 12, color: C.textMuted, fontWeight: '500', textAlign: 'center', paddingHorizontal: 20 },

  overviewCard: { backgroundColor: C.primary, borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 14, elevation: 5 },
  overviewTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overviewTextCol: { flex: 1 },
  overviewLabel: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.6, marginBottom: 6 },
  overviewValue: { fontSize: 32, fontWeight: '800', color: '#fff' },
  overviewSub: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  overviewRing: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  overviewProgressTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden', marginTop: 18 },
  overviewProgressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 999 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  kpiCard: { width: '48%', backgroundColor: C.surface, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border, ...shadow },
  kpiIconBadge: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  kpiLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, marginBottom: 4, letterSpacing: 0.5 },
  kpiValue: { fontSize: 22, fontWeight: '800', color: C.text },

  sectionHeaderRow: { marginBottom: 10, paddingHorizontal: 2 },
  sectionHeaderText: { fontSize: 11, fontWeight: '800', color: C.textMuted, letterSpacing: 0.8 },

  listContainer: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', ...shadow },
  listHeaderRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderColor: C.border },
  listHeaderCell: { fontSize: 10, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  listDataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: C.border },
  rowAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  blockName: { fontSize: 14, fontWeight: '800', color: C.text },
  blockMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  blockMeta: { fontSize: 10, color: C.textMuted, fontWeight: '700' },
  listDataCell: { fontSize: 14, fontWeight: '800', color: C.textMuted },
});