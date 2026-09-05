import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';
const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  amber: '#F59E0B', amberDark: '#D97706', amberSoft: '#FEF3C7',
};

export default function LibraryReportsScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [mostIssued, setMostIssued] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchReports(token);
  };

  const fetchReports = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const hdrs = { headers: { Authorization: `Bearer ${token}` } };
      const [ovRes, miRes] = await Promise.all([
        axios.get(`${BASE_URL}/library/reports/overdue`, hdrs),
        axios.get(`${BASE_URL}/library/reports/most-issued`, hdrs),
      ]);
      if (ovRes.data?.success) setOverdue(ovRes.data.data || []);
      if (miRes.data?.success) setMostIssued(miRes.data.data || []);
    } catch (err) { console.error('Failed to load library reports'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="pie-chart" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Library Analytics</Text>
          <Text style={styles.subtitle}>Overdue books and popular titles.</Text>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchReports(authToken, true)} colors={[C.primary]} />}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : (
          <>
            {/* Overdue Books */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <Feather name="alert-triangle" size={16} color={C.primaryDark} />
                  <Text style={styles.sectionTitle}>Overdue Books</Text>
                </View>
                <View style={styles.badgeDanger}><Text style={styles.badgeTextDanger}>{overdue.length} Items</Text></View>
              </View>

              {overdue.length === 0 ? (
                <View style={styles.emptyBox}><Text style={styles.emptyText}>No overdue books at this time.</Text></View>
              ) : (
                <View style={styles.listContainer}>
                  <View style={styles.listHeaderRow}>
                    <Text style={[styles.listHeaderCell, { flex: 1.5 }]}>Book & Borrower</Text>
                    <Text style={[styles.listHeaderCell, { flex: 1, textAlign: 'right' }]}>Due Date</Text>
                  </View>
                  {overdue.map((ov: any, index: number) => (
                    <View key={ov._id || index} style={styles.listDataRow}>
                      <View style={{ flex: 1.5 }}>
                        <Text style={[styles.listDataCell, { fontWeight: '700' }]}>{ov.bookId?.title || 'Unknown'}</Text>
                        <Text style={styles.subText}>{ov.borrowerName} ({ov.borrowerType})</Text>
                      </View>
                      <Text style={[styles.listDataCell, styles.dangerText, { flex: 1, textAlign: 'right' }]}>{ov.dueDate}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Most Issued Books */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <Feather name="trending-up" size={16} color={C.amberDark} />
                  <Text style={styles.sectionTitle}>Most Popular Books</Text>
                </View>
              </View>

              {mostIssued.length === 0 ? (
                <View style={styles.emptyBox}><Text style={styles.emptyText}>No circulation history recorded yet.</Text></View>
              ) : (
                <View style={styles.listContainer}>
                  <View style={styles.listHeaderRow}>
                    <Text style={[styles.listHeaderCell, { flex: 1.5 }]}>Book Title</Text>
                    <Text style={[styles.listHeaderCell, { flex: 1, textAlign: 'right' }]}>Issued</Text>
                  </View>
                  {mostIssued.map((mi: any, index: number) => (
                    <View key={mi.bookId || index} style={styles.listDataRow}>
                      <View style={{ flex: 1.5 }}>
                        <Text style={[styles.listDataCell, { fontWeight: '700', color: C.primaryDark }]} numberOfLines={1}>{mi.title}</Text>
                        <Text style={styles.subText} numberOfLines={1}>{mi.author}</Text>
                      </View>
                      <Text style={[styles.listDataCell, { flex: 1, textAlign: 'right', fontWeight: '800' }]}>{mi.issueCount}x</Text>
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
  badgeDanger: { backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeTextDanger: { fontSize: 11, fontWeight: '800', color: C.primaryDark },
  emptyBox: { padding: 20, alignItems: 'center', backgroundColor: C.surfaceSoft, borderRadius: 10, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  emptyText: { fontSize: 13, fontWeight: '600', color: C.textMuted, textAlign: 'center' },
  listContainer: { backgroundColor: C.surfaceSoft, borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  listHeaderRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: C.border },
  listHeaderCell: { fontSize: 11, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  listDataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  listDataCell: { fontSize: 13, color: C.text, fontWeight: '600' },
  dangerText: { color: C.primaryDark, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  subText: { fontSize: 11, color: C.textMuted, marginTop: 2, fontWeight: '600' },
});