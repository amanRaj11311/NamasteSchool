import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, Modal, Linking, Platform, FlatList
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const CATEGORIES = ['All', 'General', 'Academic', 'Exam', 'Event', 'Urgent'];

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
};

export default function StudentNoticesScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [selectedNotice, setSelectedNotice] = useState<any>(null);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchNotices(token);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchNotices = async (token: string | null = authToken, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/notices`, authHeaders(token));
      if (res.data?.success) setNotices(res.data.data || []);
    } catch (err) { console.error('Failed to load notices'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const getCategoryStyle = (cat: string) => {
    switch (cat) {
      case 'Urgent': return { bg: C.primarySoft, text: C.primaryDark, icon: 'alert-triangle' };
      case 'Exam': return { bg: C.purpleSoft, text: C.purpleDark, icon: 'edit-3' };
      case 'Event': return { bg: C.greenSoft, text: C.greenDark, icon: 'calendar' };
      case 'Academic': return { bg: C.blueSoft, text: C.blueDark, icon: 'book-open' };
      default: return { bg: C.slateSoft, text: C.slateDark, icon: 'bell' };
    }
  };

  const displayedNotices = useMemo(() => {
    const filtered = notices.filter((n) => {
      const matchesCat = categoryFilter === 'All' || n.category === categoryFilter;
      const matchesSearch = !searchQuery || n.title?.toLowerCase().includes(searchQuery.toLowerCase()) || n.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });

    const pinned = filtered.filter(n => n.isPinned);
    const normal = filtered.filter(n => !n.isPinned);
    return [...pinned, ...normal];
  }, [notices, categoryFilter, searchQuery]);

  const openAttachment = async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="message-square" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Noticeboard</Text>
          <Text style={styles.subtitle}>School circulars & announcements.</Text>
        </View>
        <View style={styles.countBadge}><Text style={styles.countBadgeText}>{notices.length} Published</Text></View>
      </View>

      {/* Filters & Search */}
      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={C.textFaint} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search notices..." 
            value={searchQuery} 
            onChangeText={setSearchQuery} 
          />
        </View>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity 
              key={cat} 
              style={[styles.filterPill, categoryFilter === cat ? styles.filterPillActive : styles.filterPillInactive]}
              onPress={() => setCategoryFilter(cat)}
            >
              <Text style={[styles.filterPillText, categoryFilter === cat ? styles.filterPillTextActive : styles.filterPillTextInactive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Notice List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : displayedNotices.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="bell-off" size={40} color={C.textFaint} />
          <Text style={styles.emptyTitle}>No Notices Found</Text>
          <Text style={styles.emptySubtitle}>No active circulars match your search criteria.</Text>
        </View>
      ) : (
        <FlatList
          data={displayedNotices}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchNotices(authToken, true)} colors={[C.primary]} />}
          renderItem={({ item }) => {
            const catStyle = getCategoryStyle(item.category);
            return (
              <TouchableOpacity 
                activeOpacity={0.85} 
                onPress={() => setSelectedNotice(item)}
                style={[styles.card, item.isPinned && styles.cardPinned]}
              >
                <View style={styles.cardHeader}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                    {item.isPinned && (
                      <View style={styles.pinnedBadge}><Feather name="map-pin" size={10} color="#fff" style={{marginRight: 4}} /><Text style={styles.pinnedBadgeText}>Pinned</Text></View>
                    )}
                    <View style={[styles.typeBadge, { backgroundColor: catStyle.bg }]}>
                      <Feather name={catStyle.icon as any} size={10} color={catStyle.text} style={{marginRight: 4}} />
                      <Text style={[styles.typeBadgeText, { color: catStyle.text }]}>{item.category || 'General'}</Text>
                    </View>
                  </View>
                  <Text style={styles.dateText}>{formatDateDisplay(item.noticeDate)}</Text>
                </View>

                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDesc} numberOfLines={2}>{item.description || 'Tap to view details.'}</Text>

                <View style={styles.cardFooter}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Feather name="user" size={12} color={C.textMuted} style={{marginRight: 6}} />
                    <Text style={styles.authorText} numberOfLines={1}>{item.createdBy?.name || 'Administration'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.readMoreText}>Read More</Text>
                    <Feather name="arrow-right" size={14} color={C.primary} style={{marginLeft: 4}} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* NOTICE DETAIL MODAL */}
      <Modal visible={!!selectedNotice} animationType="fade" transparent onRequestClose={() => setSelectedNotice(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.modalHeaderRed}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <View style={styles.modalCatBadge}><Text style={styles.modalCatBadgeText}>{selectedNotice?.category || 'Notice'}</Text></View>
                  <Text style={styles.modalDateText}>{formatDateDisplay(selectedNotice?.noticeDate)}</Text>
                </View>
                <Text style={styles.modalTitle} numberOfLines={2}>{selectedNotice?.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedNotice(null)} style={styles.closeBtnIconLight} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 18, color: '#fff' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.metaBox}>
                <View style={styles.metaRow}><Feather name="calendar" size={14} color={C.primaryDark} /><Text style={styles.metaText}>Published: <Text style={{fontWeight: '800'}}>{formatDateDisplay(selectedNotice?.noticeDate)}</Text></Text></View>
                {!!selectedNotice?.submissionDate && (
                  <View style={styles.metaRow}><Feather name="clock" size={14} color={C.amberDark} /><Text style={styles.metaText}>Expiry: <Text style={{fontWeight: '800'}}>{formatDateDisplay(selectedNotice?.submissionDate)}</Text></Text></View>
                )}
                <View style={styles.metaRow}><Feather name="user" size={14} color={C.blueDark} /><Text style={styles.metaText}>By: <Text style={{fontWeight: '800'}}>{selectedNotice?.createdBy?.name || 'Administration'}</Text></Text></View>
              </View>

              <Text style={styles.modalDescription}>{selectedNotice?.description || 'No additional details provided.'}</Text>

              {selectedNotice?.attachments && selectedNotice.attachments.length > 0 && (
                <View style={styles.attachmentsSection}>
                  <Text style={styles.attachmentsTitle}><Feather name="paperclip" size={14} color={C.primary} style={{marginRight: 6}} /> Attachments ({selectedNotice.attachments.length})</Text>
                  <View style={{ gap: 8 }}>
                    {selectedNotice.attachments.map((att: any, i: number) => (
                      <TouchableOpacity key={i} style={styles.attachmentCard} onPress={() => openAttachment(att.url)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <Feather name="file-text" size={18} color={C.primary} style={{marginRight: 10}} />
                          <Text style={styles.attachmentName} numberOfLines={1}>{att.name || `Document ${i + 1}`}</Text>
                        </View>
                        <View style={styles.downloadBtn}><Feather name="download" size={14} color={C.primaryDark} /><Text style={styles.downloadBtnText}>View</Text></View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.doneBtnFull} onPress={() => setSelectedNotice(null)}>
                <Text style={styles.doneBtnFullText}>Close Notice</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  countBadge: { backgroundColor: C.surfaceSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: C.text },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44, marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text },
  filterPillsScroll: { gap: 8 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterPillActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterPillInactive: { backgroundColor: C.surface, borderColor: C.border },
  filterPillText: { fontSize: 12, fontWeight: '700' },
  filterPillTextActive: { color: '#fff' },
  filterPillTextInactive: { color: C.textMuted },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardPinned: { borderLeftWidth: 4, borderLeftColor: C.primary, backgroundColor: '#FAFAFA' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  pinnedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  pinnedBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  dateText: { fontSize: 11, fontWeight: '700', color: C.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: C.textMuted, lineHeight: 20, marginBottom: 14 },
  
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderColor: C.border },
  authorText: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  readMoreText: { fontSize: 12, fontWeight: '800', color: C.primary },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  modalHeaderRed: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 20, backgroundColor: C.primary },
  modalCatBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  modalCatBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  modalDateText: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#fff', lineHeight: 24 },
  closeBtnIconLight: { padding: 4, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 20 },
  
  formScroll: { padding: 20 },
  
  metaBox: { backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 20, gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 12, color: C.textMuted, fontWeight: '500' },

  modalDescription: { fontSize: 14, color: C.text, lineHeight: 24, fontWeight: '500', marginBottom: 24 },

  attachmentsSection: { borderTopWidth: 1, borderColor: C.border, paddingTop: 20 },
  attachmentsTitle: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 12 },
  attachmentCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12 },
  attachmentName: { fontSize: 13, fontWeight: '700', color: C.text },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#FECACA' },
  downloadBtnText: { fontSize: 11, fontWeight: '800', color: C.primaryDark },

  modalFooter: { padding: 16, borderTopWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSoft },
  doneBtnFull: { backgroundColor: '#111827', height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  doneBtnFullText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});