import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';

const API_BASE = 'https://mern.schoolapi.dcstechnosis.com/api';
const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
};

const todayStr = new Date().toISOString().split('T')[0];

export default function LibraryReturnsScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [statusFilter, setStatusFilter] = useState('Issued');
  const [activeDropdown, setActiveDropdown] = useState(false);

  // Return Modal
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [fineAmount, setFineAmount] = useState('0');
  const [finePaid, setFinePaid] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchIssues(token, statusFilter);
  };

  const fetchIssues = async (token: string | null = authToken, stat: string = statusFilter, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = stat ? { status: stat } : {};
      const res = await axios.get(`${API_BASE}/library/issues`, { params, headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) setIssues(res.data.data || []);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const handleReturnConfirm = async () => {
    if (!selectedIssue) return;
    setSubmitting(true);
    try {
      await axios.patch(`${API_BASE}/library/issue/${selectedIssue._id}/return`, {
        fineAmount: parseFloat(fineAmount) || 0,
        finePaid: !!finePaid,
      }, { headers: { Authorization: `Bearer ${authToken}` } });
      Alert.alert('Success', 'Book returned successfully');
      setSelectedIssue(null);
      fetchIssues(authToken, statusFilter, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to return book'); } 
    finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="rotate-ccw" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Returns & Fines</Text>
          <Text style={styles.subtitle}>Process returns and calculate fines.</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={{ zIndex: 10 }}>
          <Text style={styles.inputLabel}>FILTER STATUS</Text>
          <TouchableOpacity style={styles.dropdownHeader} onPress={() => setActiveDropdown(!activeDropdown)} activeOpacity={0.85}>
            <Text style={styles.dropdownSelectedText}>{statusFilter === 'Issued' ? 'Currently Issued' : statusFilter === 'Returned' ? 'Returned History' : 'All Statuses'}</Text>
            <Feather name={activeDropdown ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
          </TouchableOpacity>
          {activeDropdown && (
            <View style={styles.dropdownListContainer}>
              {[ {label: 'Currently Issued', value: 'Issued'}, {label: 'Returned History', value: 'Returned'}, {label: 'All Statuses', value: ''} ].map(opt => (
                <TouchableOpacity key={opt.value} style={styles.dropdownItem} onPress={() => { setStatusFilter(opt.value); setActiveDropdown(false); fetchIssues(authToken, opt.value); }}>
                  <Text style={styles.dropdownItemText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={issues}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchIssues(authToken, statusFilter, true)} colors={[C.primary]} />}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="inbox" size={40} color={C.textFaint} /><Text style={styles.emptyTitle}>No Records Found</Text></View>}
          renderItem={({ item }) => {
            const isOverdue = item.status === 'Issued' && item.dueDate < todayStr;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.bookId?.title || 'Unknown'}</Text>
                    <Text style={styles.isbnText}>ISBN: {item.bookId?.isbn || '-'}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: isOverdue ? C.primarySoft : item.status === 'Returned' ? C.greenSoft : C.blueSoft }]}>
                    <Text style={[styles.statusText, { color: isOverdue ? C.primaryDark : item.status === 'Returned' ? C.green : C.blue }]}>{isOverdue ? 'Overdue' : item.status}</Text>
                  </View>
                </View>

                <View style={styles.borrowerRow}>
                  <Feather name="user" size={14} color={C.textMuted} style={{marginRight: 6}} />
                  <Text style={styles.borrowerText}>{item.borrowerName}</Text>
                  <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>{item.borrowerType}</Text></View>
                </View>

                <View style={styles.dateGrid}>
                  <View style={styles.dateBox}><Text style={styles.dateLbl}>ISSUE DATE</Text><Text style={styles.dateVal}>{item.issueDate}</Text></View>
                  <View style={styles.dateBox}><Text style={styles.dateLbl}>DUE DATE</Text><Text style={[styles.dateVal, isOverdue && {color: C.primaryDark}]}>{item.dueDate}</Text></View>
                </View>

                {item.status !== 'Returned' ? (
                  <TouchableOpacity style={styles.returnBtn} onPress={() => { setSelectedIssue(item); setFineAmount(isOverdue ? '50' : '0'); setFinePaid(true); }}>
                    <Text style={styles.returnBtnText}>Return Book</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.returnedText}>Returned on: {item.returnDate}</Text>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Return Modal */}
      <Modal visible={!!selectedIssue} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Return Book</Text>
              <TouchableOpacity onPress={() => setSelectedIssue(null)} style={styles.closeBtnIcon}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>{selectedIssue?.bookId?.title}</Text>
                <Text style={styles.infoSub}>Borrowed by {selectedIssue?.borrowerName} ({selectedIssue?.borrowerType})</Text>
                <Text style={styles.infoDue}>Due Date: {selectedIssue?.dueDate}</Text>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Overdue Fine (₹)</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={fineAmount} onChangeText={setFineAmount} />
              </View>

              <TouchableOpacity style={styles.toggleRow} onPress={() => setFinePaid(!finePaid)}>
                <Feather name={finePaid ? "check-square" : "square"} size={18} color={finePaid ? C.primary : C.textMuted} />
                <Text style={styles.toggleText}>Fine Collected / Paid</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleReturnConfirm} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Confirm Return</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  
  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, backgroundColor: C.surfaceSoft },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600' },
  dropdownListContainer: { position: 'absolute', top: 68, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6 },
  dropdownItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 14, color: C.text, fontWeight: '500' },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  isbnText: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },

  borrowerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  borrowerText: { fontSize: 13, fontWeight: '700', color: C.text, flex: 1 },
  typeBadge: { backgroundColor: C.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 10, fontWeight: '700', color: C.textMuted },

  dateGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  dateBox: { flex: 1 },
  dateLbl: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  dateVal: { fontSize: 13, fontWeight: '800', color: C.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  returnBtn: { backgroundColor: C.primarySoft, borderWidth: 1, borderColor: '#FECACA', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  returnBtnText: { color: C.primaryDark, fontSize: 13, fontWeight: '800' },
  returnedText: { fontSize: 11, color: C.textMuted, fontStyle: 'italic', textAlign: 'right' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  closeBtnIcon: { padding: 6, backgroundColor: C.border, borderRadius: 20 },
  formScroll: { padding: 20 },

  infoBox: { backgroundColor: C.surfaceSoft, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  infoTitle: { fontSize: 15, fontWeight: '800', color: C.primaryDark, marginBottom: 4 },
  infoSub: { fontSize: 12, color: C.text, fontWeight: '600' },
  infoDue: { fontSize: 11, color: C.textMuted, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  inputWrapper: { marginBottom: 16 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, backgroundColor: C.surfaceSoft, fontSize: 16, color: C.text, fontWeight: '800' },
  
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  toggleText: { fontSize: 13, fontWeight: '700', color: C.text },

  saveBtnFull: { backgroundColor: C.primary, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});