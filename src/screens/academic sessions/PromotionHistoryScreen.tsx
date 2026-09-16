import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList,
  TextInput, ActivityIndicator, RefreshControl, Platform, ScrollView, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';
const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueDark: '#0284C7', blueSoft: '#E0F2FE',
  green: '#10B981', greenDark: '#059669', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberDark: '#D97706', amberSoft: '#FEF3C7',
  slate: '#64748B', slateDark: '#475569', slateSoft: '#F1F5F9',
};

const DECISION_FILTERS = ['ALL', 'Promoted', 'Detained', 'Passed Out'];

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
};

export default function PromotionHistoryScreen() {
  const navigation = useNavigation<any>();
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDecision, setFilterDecision] = useState('ALL');

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchHistory(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchHistory = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/promotions/history/all`, authHeaders(token));
      const rows = res.data?.data;
      if (Array.isArray(rows)) setHistory(rows);
      else setHistory([]);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to load promotion history');
      setHistory([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return history.filter((h) => {
      if (filterDecision !== 'ALL' && h.decision !== filterDecision) return false;
      if (!searchQuery.trim()) return true;
      
      const q = searchQuery.toLowerCase();
      const sName = (h.studentName || h.studentId?.name || '').toLowerCase();
      const sRoll = (h.rollNo || '').toLowerCase();
      const sYear = (h.academicYearName || h.academicYearId?.name || '').toLowerCase();
      const sClass = (h.className || h.classId?.className || '').toLowerCase();
      
      return sName.includes(q) || sRoll.includes(q) || sYear.includes(q) || sClass.includes(q);
    });
  }, [history, filterDecision, searchQuery]);

  const getDecisionStyle = (decision: string) => {
    switch (decision) {
      case 'Promoted': return { bg: C.greenSoft, text: C.greenDark, icon: 'arrow-up-circle' };
      case 'Passed Out': return { bg: C.blueSoft, text: C.blueDark, icon: 'award' };
      case 'Detained': return { bg: C.primarySoft, text: C.primaryDark, icon: 'x-circle' };
      default: return { bg: C.slateSoft, text: C.slateDark, icon: 'help-circle' };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{top:10, bottom:10, left:10, right:10}}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={styles.headerIconBadge}><Feather name="history" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Promotion History</Text>
          <Text style={styles.subtitle}>Archived session logs & results.</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={C.textFaint} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search student, roll, session..." 
            placeholderTextColor={C.textFaint}
            value={searchQuery} 
            onChangeText={setSearchQuery} 
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x-circle" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
          {DECISION_FILTERS.map((status) => (
            <TouchableOpacity 
              key={status} 
              style={[styles.filterPill, filterDecision === status ? styles.filterPillActive : styles.filterPillInactive]}
              onPress={() => setFilterDecision(status)}
            >
              <Text style={[styles.filterPillText, filterDecision === status ? styles.filterPillTextActive : styles.filterPillTextInactive]}>
                {status === 'ALL' ? 'All Decisions' : status}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.totalText}>{filteredLogs.length} Records Found</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchHistory(authToken, true)} colors={[C.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="folder" size={40} color={C.textFaint} />
              <Text style={styles.emptyTitle}>No Promotion Logs Found</Text>
              <Text style={styles.emptySubtitle}>Archived records will appear here after promotion execution.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const decStyle = getDecisionStyle(item.decision);
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.studentName} numberOfLines={1}>{item.studentName || item.studentId?.name || 'Student'}</Text>
                    <Text style={styles.rollNo}>Roll: {item.rollNo || '—'}</Text>
                  </View>
                  <View style={[styles.decisionBadge, { backgroundColor: decStyle.bg }]}>
                    <Feather name={decStyle.icon as any} size={12} color={decStyle.text} style={{marginRight: 4}} />
                    <Text style={[styles.decisionBadgeText, { color: decStyle.text }]}>{item.decision}</Text>
                  </View>
                </View>

                <View style={styles.metaGrid}>
                  <View style={styles.metaRow}>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLbl}>ACADEMIC SESSION</Text>
                      <View style={styles.sessionBadge}>
                        <Text style={styles.sessionBadgeText}>{item.academicYearName || item.academicYearId?.name || 'Session'}</Text>
                      </View>
                    </View>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLbl}>RESULT PERCENTAGE</Text>
                      <Text style={styles.resultText}>{item.overallPercent || item.resultSummary?.overallPercent || 0}%</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLbl}>CLASS & DIVISION</Text>
                      <Text style={styles.metaVal}>{item.className || item.classId?.className} {item.division || item.classId?.division ? `- ${item.division || item.classId?.division}` : ''}</Text>
                    </View>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLbl}>PROMOTED ON</Text>
                      <Text style={styles.metaVal}>{formatDateDisplay(item.promotedAt || item.createdAt)}</Text>
                    </View>
                  </View>
                </View>

                {!!item.overrideNote && (
                  <View style={styles.overrideBox}>
                    <Text style={styles.overrideTitle}>Override Note:</Text>
                    <Text style={styles.overrideText}>{item.overrideNote}</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  backBtn: { padding: 4, marginRight: -4 },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44, marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text, fontWeight: '500' },
  filterPillsScroll: { gap: 8 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterPillActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterPillInactive: { backgroundColor: C.surface, borderColor: C.border },
  filterPillText: { fontSize: 12, fontWeight: '700' },
  filterPillTextActive: { color: '#fff' },
  filterPillTextInactive: { color: C.textMuted },

  statsRow: { paddingHorizontal: 16, marginTop: 16 },
  totalText: { fontSize: 13, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 },
  
  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: C.textMuted, marginTop: 4, textAlign: 'center', lineHeight: 20 },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  studentName: { fontSize: 17, fontWeight: '900', color: C.text, marginBottom: 4 },
  rollNo: { fontSize: 12, color: C.textMuted, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  decisionBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  decisionBadgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },

  metaGrid: { backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  metaRow: { flexDirection: 'row', marginBottom: 10, gap: 10 },
  metaCol: { flex: 1 },
  metaLbl: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  metaVal: { fontSize: 13, fontWeight: '700', color: C.text },
  
  sessionBadge: { alignSelf: 'flex-start', backgroundColor: C.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FECACA' },
  sessionBadgeText: { fontSize: 10, fontWeight: '800', color: C.primaryDark },
  resultText: { fontSize: 16, fontWeight: '900', color: C.primaryDark, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  overrideBox: { marginTop: 12, padding: 10, backgroundColor: '#FFFBEB', borderRadius: 8, borderWidth: 1, borderColor: '#FEF3C7', borderLeftWidth: 4, borderLeftColor: C.amber },
  overrideTitle: { fontSize: 10, fontWeight: '800', color: C.amberDark, textTransform: 'uppercase', marginBottom: 2 },
  overrideText: { fontSize: 12, color: C.text, fontWeight: '600', fontStyle: 'italic' },
});