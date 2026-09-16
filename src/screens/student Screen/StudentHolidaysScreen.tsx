import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import axios from 'axios';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';

// ---------------------------------------------------------------------------
// Design tokens — premium red/coral brand system
// ---------------------------------------------------------------------------
const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenDark: '#059669', greenSoft: '#D1FAE5',
  amber: '#F59E0B', amberDark: '#D97706', amberSoft: '#FEF3C7',
  purple: '#A855F7', purpleDark: '#7E22CE', purpleSoft: '#F3E8FF',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

// Safe Date Formatting
const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
};

const getDaysRemaining = (startDateStr: string) => {
  if (!startDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(startDateStr);
  target.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export default function StudentHolidaysScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [holidays, setHolidays] = useState<any[]>([]);
  
  const [filterType, setFilterType] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchHolidays(token);
  };

  const fetchHolidays = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/holidays`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) setHolidays(res.data.data || []);
    } catch (err) { console.error('Failed to load holidays'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'National': return { bg: C.primarySoft, text: C.primaryDark, icon: 'flag' };
      case 'Festival': return { bg: C.amberSoft, text: C.amberDark, icon: 'star' };
      case 'Vacation': return { bg: C.greenSoft, text: C.greenDark, icon: 'sun' };
      case 'Special': return { bg: C.blueSoft, text: C.blue, icon: 'award' };
      default: return { bg: C.slateSoft, text: C.slate, icon: 'calendar' };
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingHolidays = holidays.filter((h) => h.endDate >= todayStr).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const nextHoliday = upcomingHolidays[0] || null;
  const daysUntilNext = nextHoliday ? getDaysRemaining(nextHoliday.startDate) : null;

  const filteredHolidays = holidays.filter((h) => {
    const matchesType = filterType === 'All' || h.type === filterType;
    const matchesSearch = !searchQuery || h.title?.toLowerCase().includes(searchQuery.toLowerCase()) || h.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="umbrella" size={20} color={C.amberDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>School Holidays</Text>
          <Text style={styles.subtitle}>Vacation schedule & closures.</Text>
        </View>
        <View style={styles.countBadge}><Text style={styles.countBadgeText}>{holidays.length} Total</Text></View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchHolidays(authToken, true)} colors={[C.primary]} />}
      >
        {/* HERO BANNER - Next Upcoming Holiday */}
        {nextHoliday && (
          <LinearGradient colors={['#F59E0B', '#D97706']} start={{x:0, y:0}} end={{x:1, y:1}} style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View style={styles.heroBadge}><Feather name="bell" size={10} color="#fff" style={{marginRight:4}}/><Text style={styles.heroBadgeText}>Upcoming</Text></View>
              <View style={styles.heroTypeBadge}><Text style={styles.heroTypeBadgeText}>{nextHoliday.type}</Text></View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>{nextHoliday.title}</Text>
                <Text style={styles.heroDesc} numberOfLines={2}>{nextHoliday.description || 'Enjoy your school break!'}</Text>
                <View style={styles.heroDateRow}>
                  <Feather name="calendar" size={12} color="rgba(255,255,255,0.7)" style={{marginRight: 6}} />
                  <Text style={styles.heroDateText}>{formatDateDisplay(nextHoliday.startDate)}{nextHoliday.startDate !== nextHoliday.endDate ? ` — ${formatDateDisplay(nextHoliday.endDate)}` : ''}</Text>
                </View>
              </View>

              <View style={styles.heroCountdownBox}>
                <Text style={styles.heroCountdownLbl}>Countdown</Text>
                <Text style={styles.heroCountdownVal}>
                  {daysUntilNext === 0 ? 'Today!' : daysUntilNext === 1 ? 'Tmrw!' : `${daysUntilNext} Days`}
                </Text>
              </View>
            </View>
          </LinearGradient>
        )}

        {/* SEARCH & FILTERS */}
        <View style={styles.filterSection}>
          <View style={styles.searchContainer}>
            <Feather name="search" size={16} color={C.textFaint} />
            <TextInput 
              style={styles.searchInput} 
              placeholder="Search holidays..." 
              value={searchQuery} 
              onChangeText={setSearchQuery} 
            />
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
            {['All', 'Festival', 'National', 'Vacation', 'Special'].map((t) => (
              <TouchableOpacity 
                key={t} 
                style={[styles.filterPill, filterType === t ? styles.filterPillActive : styles.filterPillInactive]}
                onPress={() => setFilterType(t)}
              >
                <Text style={[styles.filterPillText, filterType === t ? styles.filterPillTextActive : styles.filterPillTextInactive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* HOLIDAYS GRID */}
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={C.amber} /></View>
        ) : filteredHolidays.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="calendar" size={40} color={C.textFaint} />
            <Text style={styles.emptyTitle}>No Holidays Found</Text>
            <Text style={styles.emptySubtitle}>No holidays matching your search criteria.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filteredHolidays.map((holiday, idx) => {
              const isPast = holiday.endDate < todayStr;
              const isToday = holiday.startDate <= todayStr && holiday.endDate >= todayStr;
              const dLeft = getDaysRemaining(holiday.startDate);
              const styleMeta = getTypeStyle(holiday.type);

              return (
                <View key={holiday._id || idx} style={[styles.card, isToday && { borderLeftColor: C.amber, borderLeftWidth: 4 }, isPast && { opacity: 0.65 }]}>
                  <View style={styles.cardHeader}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                      <View style={[styles.typeBadge, { backgroundColor: styleMeta.bg }]}>
                        <Feather name={styleMeta.icon} size={10} color={styleMeta.text} style={{marginRight: 4}} />
                        <Text style={[styles.typeBadgeText, { color: styleMeta.text }]}>{holiday.type}</Text>
                      </View>
                      {isToday && <View style={[styles.typeBadge, { backgroundColor: C.primary }]}><Text style={[styles.typeBadgeText, { color: '#fff' }]}>Live Today!</Text></View>}
                      {isPast && <View style={[styles.typeBadge, { backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border }]}><Text style={[styles.typeBadgeText, { color: C.textMuted }]}>Past</Text></View>}
                    </View>
                    <View style={styles.durationBadge}><Text style={styles.durationBadgeText}>{holiday.totalDays} {holiday.totalDays === 1 ? 'Day' : 'Days'}</Text></View>
                  </View>

                  <Text style={styles.cardTitle}>{holiday.title}</Text>
                  {!!holiday.description && <Text style={styles.cardDesc} numberOfLines={2}>{holiday.description}</Text>}

                  <View style={styles.cardFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Feather name="calendar" size={14} color={C.amberDark} style={{marginRight: 6}} />
                      <Text style={styles.cardDateText}>{formatDateDisplay(holiday.startDate)}{holiday.startDate !== holiday.endDate ? ` - ${formatDateDisplay(holiday.endDate)}` : ''}</Text>
                    </View>
                    {!isPast && dLeft !== null && dLeft > 0 && (
                      <Text style={styles.cardDaysLeft}>In {dLeft} days</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
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

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.amberSoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  countBadge: { backgroundColor: C.surfaceSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: C.text },

  scrollContent: { padding: 16, paddingBottom: 40 },

  // Hero Card
  heroCard: { borderRadius: 16, padding: 20, elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, marginBottom: 20 },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  heroBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  heroTypeBadge: { backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  heroTypeBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 6 },
  heroDesc: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 12, fontWeight: '500' },
  heroDateRow: { flexDirection: 'row', alignItems: 'center' },
  heroDateText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
  
  heroCountdownBox: { backgroundColor: 'rgba(0,0,0,0.15)', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginLeft: 16, alignItems: 'center', justifyContent: 'center' },
  heroCountdownLbl: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginBottom: 4 },
  heroCountdownVal: { fontSize: 18, fontWeight: '900', color: '#fff' },

  // Filters
  filterSection: { backgroundColor: C.surface, borderRadius: 16, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: C.border, elevation: 1 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44, marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text },
  filterPillsScroll: { gap: 8 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterPillActive: { backgroundColor: C.amber, borderColor: C.amber },
  filterPillInactive: { backgroundColor: C.surface, borderColor: C.border },
  filterPillText: { fontSize: 12, fontWeight: '700' },
  filterPillTextActive: { color: '#fff' },
  filterPillTextInactive: { color: C.textMuted },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  // Grid
  grid: { gap: 14 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  durationBadge: { backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  durationBadgeText: { fontSize: 10, fontWeight: '800', color: C.text },
  
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: C.textMuted, lineHeight: 20, marginBottom: 14 },
  
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  cardDateText: { fontSize: 12, fontWeight: '700', color: C.text, flexShrink: 1 },
  cardDaysLeft: { fontSize: 11, fontWeight: '800', color: C.amberDark },
});