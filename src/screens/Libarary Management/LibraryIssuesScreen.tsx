import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';

const BASE_URL = 'https://mern.schoolapi.dcstechnosis.com/api';
const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#ef4444', primaryDark: '#DC2626', primarySoft: '#FEF2F2',
};

const formatToYMD = (d: Date): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

export default function LibraryIssueScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [books, setBooks] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  const [borrowerType, setBorrowerType] = useState<'Student' | 'Staff'>('Student');
  const [borrowerId, setBorrowerId] = useState('');
  const [bookId, setBookId] = useState('');
  const [issueDate, setIssueDate] = useState<Date>(new Date());
  
  const defDue = new Date();
  defDue.setDate(defDue.getDate() + 14);
  const [dueDate, setDueDate] = useState<Date>(defDue);
  
  const [showIssuePicker, setShowIssuePicker] = useState(false);
  const [showDuePicker, setShowDuePicker] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchData(token);
  };

  const fetchData = async (token: string | null) => {
    try {
      const hdrs = { headers: { Authorization: `Bearer ${token}` } };
      const [bRes, stRes, sfRes] = await Promise.all([
        axios.get(`${BASE_URL}/library/books`, hdrs),
        axios.get(`${BASE_URL}/students?limit=500`, hdrs),
        axios.get(`${BASE_URL}/staff?limit=500`, hdrs),
      ]);
      if (bRes.data?.data) setBooks(bRes.data.data);
      if (stRes.data?.data) setStudents(stRes.data.data);
      if (sfRes.data?.data) setStaffList(sfRes.data.data);
    } catch (err) { console.error(err); }
  };

  const handleIssue = async () => {
    if (!bookId || !borrowerId || !dueDate) { Alert.alert('Error', 'Book, Borrower, and Due Date required'); return; }
    setSubmitting(true);
    try {
      await axios.post(`${BASE_URL}/library/issue`, {
        bookId, borrowerType, borrowerId,
        issueDate: formatToYMD(issueDate), dueDate: formatToYMD(dueDate)
      }, { headers: { Authorization: `Bearer ${authToken}` } });
      Alert.alert('Success', 'Book issued successfully');
      setBookId(''); setBorrowerId(''); fetchData(authToken);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to issue book'); } 
    finally { setSubmitting(false); }
  };

  const availableBooks = books.filter(b => b.availableCopies > 0);
  const borrowerOptions = borrowerType === 'Student' 
    ? students.map(s => ({ label: `${s.name} (${s.admissionNo || s.rollNo || ''})`, value: s._id }))
    : staffList.map(s => ({ label: `${s.name} (${s.staffId || ''})`, value: s._id }));

  const renderInlineDropdown = (fieldKey: string, label: string, options: any[], value: string, onSelect: (v: string) => void, zIndexOff = 0) => {
    const isOpen = activeDropdown === fieldKey;
    const selectedObj = options.find(o => o.value === value);
    return (
      <View style={[styles.inputWrapper, { zIndex: isOpen ? 50 + zIndexOff : 1 + zIndexOff }]}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setActiveDropdown(isOpen ? null : fieldKey)} activeOpacity={0.85}>
          <Text style={selectedObj ? styles.dropdownSelectedText : styles.dropdownPlaceholder} numberOfLines={1}>{selectedObj?.label || 'Select...'}</Text>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownListContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => (
                <TouchableOpacity key={opt.value + i} style={styles.dropdownItem} onPress={() => { onSelect(opt.value); setActiveDropdown(null); }}>
                  <Text style={[styles.dropdownItemText, value === opt.value && styles.textBrand]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={styles.headerIconBadge}><Feather name="log-out" size={20} color={C.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Issue Book</Text>
            <Text style={styles.subtitle}>Checkout library books to students or staff.</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={{ zIndex: 40, marginBottom: 16 }}>
              {renderInlineDropdown('fBook', 'Select Book to Issue *', availableBooks.map(b => ({ label: `${b.title} by ${b.author} (${b.availableCopies} left)`, value: b._id })), bookId, setBookId, 10)}
            </View>

            <View style={styles.segmentControl}>
              <TouchableOpacity style={[styles.segmentBtn, borrowerType === 'Student' && styles.segmentBtnActive]} onPress={() => { setBorrowerType('Student'); setBorrowerId(''); }}><Text style={[styles.segmentText, borrowerType === 'Student' && styles.segmentTextActive]}>Student</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.segmentBtn, borrowerType === 'Staff' && styles.segmentBtnActive]} onPress={() => { setBorrowerType('Staff'); setBorrowerId(''); }}><Text style={[styles.segmentText, borrowerType === 'Staff' && styles.segmentTextActive]}>Staff</Text></TouchableOpacity>
            </View>

            <View style={{ zIndex: 30, marginBottom: 16 }}>
              {renderInlineDropdown('fBorrower', `Select ${borrowerType} *`, borrowerOptions, borrowerId, setBorrowerId)}
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.inputLabel}>Issue Date</Text>
                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowIssuePicker(true)}>
                  <Text style={styles.datePickerText}>{issueDate.toLocaleDateString('en-GB')}</Text>
                  <Feather name="calendar" size={14} color={C.textMuted} />
                </TouchableOpacity>
                {showIssuePicker && <DateTimePicker value={issueDate} mode="date" display="default" onChange={(e, d) => { setShowIssuePicker(Platform.OS === 'ios'); if (d) setIssueDate(d); }} />}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Due Return Date *</Text>
                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDuePicker(true)}>
                  <Text style={styles.datePickerText}>{dueDate.toLocaleDateString('en-GB')}</Text>
                  <Feather name="calendar" size={14} color={C.textMuted} />
                </TouchableOpacity>
                {showDuePicker && <DateTimePicker value={dueDate} mode="date" display="default" onChange={(e, d) => { setShowDuePicker(Platform.OS === 'ios'); if (d) setDueDate(d); }} />}
              </View>
            </View>

            <TouchableOpacity style={styles.saveBtnFull} onPress={handleIssue} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>Confirm Checkout</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  scrollContent: { padding: 16 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, elevation: 1 },
  
  segmentControl: { flexDirection: 'row', backgroundColor: C.surfaceSoft, padding: 4, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 16, zIndex: 1 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segmentBtnActive: { backgroundColor: C.primary, elevation: 1 },
  segmentText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  segmentTextActive: { color: '#fff' },

  inputWrapper: { marginBottom: 0 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, textTransform: 'uppercase' },
  row: { flexDirection: 'row', marginBottom: 20, zIndex: 1 },
  
  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 48, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 14, color: C.text, fontWeight: '600' },

  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: C.surfaceSoft },
  dropdownHeaderActive: { borderColor: C.primary },
  dropdownSelectedText: { fontSize: 14, color: C.text, fontWeight: '600' },
  dropdownPlaceholder: { fontSize: 14, color: C.textFaint },
  dropdownListContainer: { position: 'absolute', top: 72, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, elevation: 6 },
  dropdownItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownItemText: { fontSize: 14, color: C.text, fontWeight: '500' },
  textBrand: { color: C.primary, fontWeight: '700' },

  saveBtnFull: { backgroundColor: C.primaryDark, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});