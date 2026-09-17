import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';


const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#B3122A', primaryDark: '#C5221F', primarySoft: '#FDE8E8',
  blue: '#0EA5E9', blueDark: '#0284C7', blueSoft: '#E0F2FE',
  green: '#10B981', greenDark: '#059669', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberDark: '#D97706', amberSoft: '#FEF3C7',
  purple: '#A855F7', purpleDark: '#7E22CE', purpleSoft: '#F3E8FF',
  slate: '#64748B', slateDark: '#475569', slateSoft: '#F1F5F9',
};

export default function EnquiryFunnelReportScreen() {
  const navigation = useNavigation<any>();
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [funnel, setFunnel] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchFunnel(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchFunnel = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/enquiries/reports/funnel`, authHeaders(token));
      if (res.data?.success) setFunnel(res.data.data || []);
    } catch (err) { console.error('Failed to load funnel report'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const totalEnquiries = funnel.reduce((acc, curr) => acc + (curr.count || 0), 0);
  const totalAdmitted = funnel.find((f) => f.status === 'Admitted')?.count || 0;
  const conversionRate = totalEnquiries > 0 ? Math.round((totalAdmitted / totalEnquiries) * 100) : 0;

  const getStageColor = (status: string) => {
    switch (status) {
      case 'New': return C.blue;
      case 'Contacted': return C.purple;
      case 'Campus Visit': return C.amber;
      case 'Application Submitted': return C.slate;
      case 'Admitted': return C.green;
      case 'Rejected': return C.primary;
      default: return C.textMuted;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{top:10, bottom:10, left:10, right:10}}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={styles.headerIconBadge}><Feather name="pie-chart" size={20} color={C.purpleDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Funnel Analytics</Text>
          <Text style={styles.subtitle}>Stage-wise breakdown of conversions.</Text>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchFunnel(authToken, true)} colors={[C.purpleDark]} />}
      >
        {/* KPI Grid */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { borderColor: '#BAE6FD', backgroundColor: C.blueSoft }]}>
            <View style={styles.kpiHeader}><Feather name="users" size={14} color={C.blueDark} /><Text style={[styles.kpiLabel, { color: C.blueDark }]}>TOTAL LEADS</Text></View>
            <Text style={[styles.kpiValue, { color: C.blueDark }]}>{totalEnquiries}</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: '#A7F3D0', backgroundColor: C.greenSoft }]}>
            <View style={styles.kpiHeader}><Feather name="user-check" size={14} color={C.greenDark} /><Text style={[styles.kpiLabel, { color: C.greenDark }]}>ADMITTED</Text></View>
            <Text style={[styles.kpiValue, { color: C.greenDark }]}>{totalAdmitted}</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: '#E9D5FF', backgroundColor: C.purpleSoft, flexBasis: '100%' }]}>
            <View style={styles.kpiHeader}><Feather name="activity" size={14} color={C.purpleDark} /><Text style={[styles.kpiLabel, { color: C.purpleDark }]}>OVERALL CONVERSION RATE</Text></View>
            <Text style={[styles.kpiValue, { color: C.purpleDark, fontSize: 32 }]}>{conversionRate}%</Text>
          </View>
        </View>

        {/* Funnel Breakdown */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="bar-chart-2" size={16} color={C.purpleDark} style={{marginRight: 8}} />
            <Text style={styles.cardTitle}>Pipeline Stages Breakdown</Text>
          </View>

          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={C.purpleDark} /></View>
          ) : funnel.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="pie-chart" size={40} color={C.textFaint} />
              <Text style={styles.emptyTitle}>No Data Found</Text>
            </View>
          ) : (
            <View style={styles.funnelContainer}>
              {funnel.map((fn) => {
                const pct = totalEnquiries > 0 ? Math.round((fn.count / totalEnquiries) * 100) : 0;
                const barColor = getStageColor(fn.status);

                return (
                  <View key={fn.status} style={styles.stageRow}>
                    <View style={styles.stageHeader}>
                      <Text style={styles.stageName}>{fn.status}</Text>
                      <Text style={[styles.stageCount, { color: barColor }]}>{fn.count} ({pct}%)</Text>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  backBtn: { padding: 4, marginRight: -4 },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.purpleSoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  scrollContent: { padding: 16, paddingBottom: 40 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  kpiCard: { flex: 1, minWidth: '45%', padding: 16, borderRadius: 14, borderWidth: 1, elevation: 1 },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  kpiLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  kpiValue: { fontSize: 28, fontWeight: '900' },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text },

  emptyState: { alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: C.textMuted, marginTop: 12 },

  funnelContainer: { gap: 16 },
  stageRow: { backgroundColor: C.surfaceSoft, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  stageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  stageName: { fontSize: 14, fontWeight: '700', color: C.text },
  stageCount: { fontSize: 14, fontWeight: '900' },
  
  progressBarBg: { height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
});