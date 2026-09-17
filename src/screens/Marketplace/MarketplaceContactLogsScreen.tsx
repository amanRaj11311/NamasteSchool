import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput,
  ActivityIndicator, RefreshControl, Platform, Alert
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
  slate: '#64748B', slateDark: '#475569', slateSoft: '#F1F5F9',
};

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  } catch { return dateStr; }
};

export default function MarketplaceContactLogsScreen() {
  const navigation = useNavigation<any>();
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const pageSize = 15;

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const isSuper = await AsyncStorage.getItem('isSuperAdmin');
    
    if (isSuper !== 'true') {
      Alert.alert('Access Denied', 'Only Super Admins can view marketplace contact logs.');
      navigation.goBack();
      return;
    }
    
    setAuthToken(token);
    fetchLogs(token, 1, '');
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchLogs = async (token: string | null = authToken, p: number = page, q: string = searchQuery, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params: any = { page: p, limit: pageSize };
      if (q) params.search = q;

      const res = await axios.get(`${API_BASE}/marketplace/admin/contact-logs`, { params, ...authHeaders(token) });
      if (res.data?.success) {
        setLogs(p === 1 ? res.data.data : [...logs, ...res.data.data]);
        setPagination(res.data.pagination || { page: 1, pages: 1, total: 0 });
        setPage(p);
      }
    } catch (err: any) { Alert.alert('Error', err.response?.data?.message || 'Failed to load contact logs'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const handleRefresh = useCallback(() => {
    fetchLogs(authToken, 1, searchQuery, true);
  }, [authToken, searchQuery]);

  const handleLoadMore = () => {
    if (page < pagination.pages && !loading) {
      fetchLogs(authToken, page + 1, searchQuery);
    }
  };

  const handleSearchSubmit = () => {
    setPage(1);
    fetchLogs(authToken, 1, searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setPage(1);
    fetchLogs(authToken, 1, '');
  };

  const renderLogCard = ({ item }: { item: any }) => (
    <View style={styles.card}>
      {/* Date & Time Header */}
      <View style={styles.cardHeader}>
        <View style={styles.dateBadge}>
          <Feather name="clock" size={12} color={C.slateDark} style={{marginRight: 6}} />
          <Text style={styles.dateText}>{formatDateTime(item.contactedAt)}</Text>
        </View>
      </View>

      {/* Product & Seller Section */}
      <View style={styles.productSection}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <View style={styles.catBadge}><Text style={styles.catBadgeText}>{item.productCategory || 'Product'}</Text></View>
          <Text style={styles.productTitle} numberOfLines={2}>{item.productTitle || 'Unknown Product'}</Text>
          <Text style={styles.sellerText} numberOfLines={1}>
            <Text style={{fontWeight: '700', color: C.textMuted}}>Seller:</Text> {item.sellerBusinessName || '—'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.priceText}>
            {item.productPrice != null ? `₹${Number(item.productPrice).toLocaleString('en-IN')}` : '—'}
          </Text>
        </View>
      </View>

      {/* Contacted By Section */}
      <View style={styles.buyerSection}>
        <Text style={styles.sectionLbl}>CONTACTED BY</Text>
        
        <View style={styles.infoRow}>
          <Feather name="user" size={14} color={C.blueDark} />
          <Text style={styles.infoText} numberOfLines={1}>
            <Text style={{fontWeight: '800'}}>{item.contactedByName || '—'}</Text> 
            {!!item.contactedByRole && ` (${item.contactedByRole})`}
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Feather name="home" size={14} color={C.blueDark} />
          <Text style={styles.infoText} numberOfLines={1}>{item.schoolName || '—'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Feather name="mail" size={14} color={C.blueDark} />
          <Text style={styles.infoText} numberOfLines={1}>{item.contactedByEmail || '—'}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{top:10, bottom:10, left:10, right:10}}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={styles.headerIconBadge}><Feather name="clipboard" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Contact Logs</Text>
          <Text style={styles.subtitle}>Marketplace lead tracking.</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={C.textFaint} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search person, school, product..." 
            placeholderTextColor={C.textFaint}
            value={searchQuery} 
            onChangeText={setSearchQuery} 
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={handleClearSearch} hitSlop={{top:10, bottom:10, left:10, right:10}}>
              <Feather name="x-circle" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.totalText}>{pagination.total || 0} Contacts Logged</Text>
      </View>

      {/* List */}
      {loading && page === 1 ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : logs.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="inbox" size={40} color={C.textFaint} />
          <Text style={styles.emptyTitle}>No Logs Found</Text>
          <Text style={styles.emptySubtitle}>No one has contacted any sellers yet, or no records match your search.</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={item => item._id || item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} />}
          renderItem={renderLogCard}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loading && page > 1 ? <ActivityIndicator style={{ margin: 20 }} color={C.primary} /> : null}
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

  filterSection: { padding: 16, paddingBottom: 0, backgroundColor: C.bg },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 48, elevation: 1 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text, fontWeight: '500' },

  statsRow: { paddingHorizontal: 16, marginTop: 16 },
  totalText: { fontSize: 12, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 },
  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', marginHorizontal: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center', lineHeight: 20 },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  
  cardHeader: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.slateSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  dateText: { fontSize: 11, fontWeight: '700', color: C.slateDark, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  productSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 16, borderBottomWidth: 1, borderColor: C.border },
  catBadge: { alignSelf: 'flex-start', backgroundColor: C.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 6 },
  catBadgeText: { fontSize: 9, fontWeight: '800', color: C.primaryDark, textTransform: 'uppercase' },
  productTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 4, lineHeight: 20 },
  sellerText: { fontSize: 12, color: C.text },
  priceText: { fontSize: 16, fontWeight: '900', color: C.greenDark, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginTop: 20 },

  buyerSection: { backgroundColor: C.blueSoft, padding: 12, borderRadius: 10, marginTop: 16, borderWidth: 1, borderColor: '#BAE6FD' },
  sectionLbl: { fontSize: 10, fontWeight: '900', color: C.blueDark, letterSpacing: 0.5, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  infoText: { fontSize: 13, color: C.blueDark, flex: 1 },
});