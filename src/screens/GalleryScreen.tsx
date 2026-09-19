import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, RefreshControl, ImageBackground, Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import {API_BASE} from '../network/api';
const C = {
  bg: '#F4F7F9', surface: '#FFFFFF', surfaceSoft: '#F9FAFB', border: '#ECEFF3',
  text: '#111827', textMuted: '#6B7280', textFaint: '#9CA3AF',
  primary: '#B3122A', primaryDark: '#C5221F', primarySoft: '#FDE8E8',
  blue: '#0EA5E9', blueSoft: '#E0F2FE',
  green: '#10B981', greenSoft: '#D1FAE5',
  slate: '#64748B', slateSoft: '#F1F5F9',
};

const formatToYMD = (d: Date): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

const parseSafeDate = (dStr: string) => {
  if (!dStr) return new Date();
  const d = new Date(dStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

export default function GalleryEventsScreen() {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Event Form Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const emptyForm = {
    title: '', description: '', eventDate: new Date(), location: 'School Campus',
    coverImage: '', isPublic: true,
  };
  const [form, setForm] = useState(emptyForm);

  // Gallery/Lightbox Modal
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newPhotoCaption, setNewPhotoCaption] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const permsRaw = await AsyncStorage.getItem('userPermissions');
    const superAdminRaw = await AsyncStorage.getItem('isSuperAdmin');
    if (permsRaw) setPermissions(JSON.parse(permsRaw));
    setIsSuperAdmin(superAdminRaw === 'true');
    setAuthToken(token);
    fetchEvents(token, search);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchEvents = async (token: string | null = authToken, q: string = search, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = q ? { search: q } : {};
      const res = await axios.get(`${API_BASE}/gallery/events`, { params, ...authHeaders(token) });
      if (res.data?.success) setEvents(res.data.data || []);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const hasPermission = useCallback((action: string) => {
    if (isSuperAdmin) return true;
    return permissions.some(p => p.module === 'gallery' && p.action === action);
  }, [permissions, isSuperAdmin]);

  const canCreate = hasPermission('create');
  const canUpdate = hasPermission('update');
  const canDelete = hasPermission('delete');

  // --- Event CRUD ---
  const handleSaveEvent = async () => {
    if (!form.title.trim()) { Alert.alert('Error', 'Event Title is required.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, eventDate: formatToYMD(form.eventDate) };
      if (editingId) {
        await axios.put(`${API_BASE}/gallery/events/${editingId}`, payload, authHeaders(authToken));
        Alert.alert('Success', 'Event updated successfully');
      } else {
        await axios.post(`${API_BASE}/gallery/events`, payload, authHeaders(authToken));
        Alert.alert('Success', 'Event created successfully');
      }
      setShowModal(false);
      fetchEvents(authToken, search, true);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Failed to save event'); } 
    finally { setSaving(false); }
  };

  const handleDeleteEvent = (id: string) => {
    Alert.alert('Delete Event', 'Are you sure you want to delete this event and all its photos?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/gallery/events/${id}`, authHeaders(authToken));
            fetchEvents(authToken, search, true);
          } catch (e) { Alert.alert('Error', 'Failed to delete event'); }
      }}
    ]);
  };

  // --- Gallery Photos ---
  const handleAddPhoto = async () => {
    if (!selectedEvent || !newPhotoUrl.trim()) { Alert.alert('Error', 'Photo URL is required'); return; }
    setUploadingPhoto(true);
    try {
      await axios.post(`${API_BASE}/gallery/events/${selectedEvent._id}/photos`, {
        photos: [{ url: newPhotoUrl.trim(), caption: newPhotoCaption.trim() }],
      }, authHeaders(authToken));
      
      setNewPhotoUrl(''); setNewPhotoCaption('');
      
      // Refresh active event
      const updated = await axios.get(`${API_BASE}/gallery/events/${selectedEvent._id}`, authHeaders(authToken));
      if (updated.data?.data) setSelectedEvent(updated.data.data);
      fetchEvents(authToken, search, true);
    } catch (e) { Alert.alert('Error', 'Failed to add photo'); } 
    finally { setUploadingPhoto(false); }
  };

  const handleDeletePhoto = (photoId: string) => {
    Alert.alert('Remove Photo', 'Delete this photo from the gallery?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          if (!selectedEvent) return;
          try {
            await axios.delete(`${API_BASE}/gallery/events/${selectedEvent._id}/photos/${photoId}`, authHeaders(authToken));
            const updated = await axios.get(`${API_BASE}/gallery/events/${selectedEvent._id}`, authHeaders(authToken));
            if (updated.data?.data) setSelectedEvent(updated.data.data);
            fetchEvents(authToken, search, true);
          } catch (e) { Alert.alert('Error', 'Failed to delete photo'); }
      }}
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBadge}><Feather name="image" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Gallery & Events</Text>
          <Text style={styles.subtitle}>Manage school events and photo albums.</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={C.textFaint} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search events by title..." 
            value={search} 
            onChangeText={setSearch} 
            onSubmitEditing={() => fetchEvents(authToken, search)}
          />
        </View>
        {canCreate && (
          <TouchableOpacity style={styles.addBtnFull} onPress={() => { setEditingId(null); setForm(emptyForm); setShowModal(true); }}>
            <Feather name="plus" size={14} color="#fff" /><Text style={styles.addBtnTextFull}>Create Event</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchEvents(authToken, search, true)} colors={[C.primary]} />}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="image" size={40} color={C.textFaint} /><Text style={styles.emptyTitle}>No Events Found</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <ImageBackground 
                source={{ uri: item.coverImage || 'https://placehold.co/600x400/eeeeee/9CA3AF?text=No+Cover+Image' }} 
                style={styles.coverImage} 
                imageStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
              >
                <View style={styles.coverOverlay}>
                  <View style={styles.dateBadge}>
                    <Feather name="calendar" size={12} color="#fff" style={{marginRight: 4}} />
                    <Text style={styles.dateBadgeText}>{item.eventDate}</Text>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                </View>
              </ImageBackground>

              <View style={styles.cardBody}>
                <Text style={styles.cardDesc} numberOfLines={2}>{item.description || 'No description provided.'}</Text>
                
                <View style={styles.locationRow}>
                  <Feather name="map-pin" size={12} color={C.primary} />
                  <Text style={styles.locationText} numberOfLines={1}>{item.location}</Text>
                </View>

                <View style={styles.galleryStrip}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                    <Feather name="camera" size={14} color={C.textMuted} />
                    <Text style={styles.galleryStripText}>Album Gallery</Text>
                  </View>
                  <TouchableOpacity style={styles.viewPhotosBtn} onPress={() => setSelectedEvent(item)}>
                    <Text style={styles.viewPhotosText}>View Photos ({item.photos?.length || 0})</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.cardActions}>
                  {canUpdate && <TouchableOpacity style={styles.iconBtnEdit} onPress={() => { setEditingId(item._id); setForm({ title: item.title, description: item.description || '', eventDate: parseSafeDate(item.eventDate), location: item.location || '', coverImage: item.coverImage || '', isPublic: item.isPublic }); setShowModal(true); }}><Feather name="edit-2" size={14} color={C.slate}/></TouchableOpacity>}
                  {canDelete && <TouchableOpacity style={styles.iconBtnDelete} onPress={() => handleDeleteEvent(item._id)}><Feather name="trash-2" size={14} color={C.primary}/></TouchableOpacity>}
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* EVENT FORM MODAL */}
      <Modal visible={showModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingId ? 'Edit Event' : 'Create School Event'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtnIcon}><Text style={{ fontSize: 22, color: '#c97979', fontWeight: '600' }}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Event Title *</Text>
                <TextInput style={styles.input} placeholder="e.g. Annual Sports Day 2026" value={form.title} onChangeText={t => setForm({...form, title: t})} />
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.inputLabel}>Event Date *</Text>
                  <TouchableOpacity style={styles.datePickerBtnForm} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.datePickerText}>{form.eventDate.toLocaleDateString('en-GB')}</Text>
                    <Feather name="calendar" size={14} color={C.textMuted} />
                  </TouchableOpacity>
                  {showDatePicker && <DateTimePicker value={form.eventDate} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if (d) setForm({ ...form, eventDate: d }); }} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Location</Text>
                  <TextInput style={styles.input} placeholder="e.g. Main Ground" value={form.location} onChangeText={t => setForm({...form, location: t})} />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Cover Image URL</Text>
                <TextInput style={styles.input} placeholder="https://..." value={form.coverImage} onChangeText={t => setForm({...form, coverImage: t})} autoCapitalize="none" />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} multiline placeholder="Event details..." value={form.description} onChangeText={t => setForm({...form, description: t})} />
              </View>

              <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveEvent} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnFullText}>{editingId ? 'Update' : 'Create'} Event</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* GALLERY LIGHTBOX MODAL */}
      <Modal visible={!!selectedEvent} animationType="slide" transparent>
        <SafeAreaView style={styles.fullScreenModalOverlay}>
          <View style={styles.fullScreenModalContainer}>
            
            <View style={styles.lightboxHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lightboxTitle} numberOfLines={1}>{selectedEvent?.title}</Text>
                <Text style={styles.lightboxSub}>{selectedEvent?.eventDate} • {selectedEvent?.location}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedEvent(null)} style={styles.closeBtnLight}><Feather name="x" size={24} color="#fff" /></TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <FlatList
                data={selectedEvent?.photos || []}
                keyExtractor={item => item._id}
                numColumns={2}
                columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
                contentContainerStyle={{ paddingVertical: 12, paddingBottom: 100 }}
                ListEmptyComponent={<View style={styles.emptyStateLight}><Feather name="image" size={40} color="rgba(255,255,255,0.3)" /><Text style={styles.emptyTitleLight}>No photos in this album</Text></View>}
                renderItem={({ item }) => (
                  <View style={styles.photoGridItem}>
                    <Image source={{ uri: item.url }} style={styles.gridImage} />
                    {!!item.caption && (
                      <View style={styles.captionOverlay}>
                        <Text style={styles.captionText} numberOfLines={2}>{item.caption}</Text>
                      </View>
                    )}
                    {canDelete && (
                      <TouchableOpacity style={styles.deletePhotoBtn} onPress={() => handleDeletePhoto(item._id)}>
                        <Feather name="trash-2" size={14} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              />

              {/* Add Photo Form at Bottom */}
              {canUpdate && (
                <View style={styles.addPhotoBar}>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    <TextInput style={[styles.input, { flex: 1, backgroundColor: '#fff', borderColor: 'transparent' }]} placeholder="Image URL (https://...)" value={newPhotoUrl} onChangeText={setNewPhotoUrl} autoCapitalize="none" />
                    <TextInput style={[styles.input, { flex: 1, backgroundColor: '#fff', borderColor: 'transparent' }]} placeholder="Caption (Optional)" value={newPhotoCaption} onChangeText={setNewPhotoCaption} />
                  </View>
                  <TouchableOpacity style={styles.uploadBtnFull} onPress={handleAddPhoto} disabled={uploadingPhoto}>
                    {uploadingPhoto ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="upload-cloud" size={16} color="#fff" style={{marginRight: 8}}/><Text style={styles.uploadBtnText}>Upload Photo to Album</Text></>}
                  </TouchableOpacity>
                </View>
              )}
            </KeyboardAvoidingView>

          </View>
        </SafeAreaView>
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

  filterSection: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text },
  addBtnFull: { backgroundColor: '#B3122A', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, height: 44, borderRadius: 10, marginLeft: 10, elevation: 2 },
  addBtnTextFull: { color: '#fff', fontSize: 13, fontWeight: '800', marginLeft: 6 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  emptyState: { alignItems: 'center', padding: 36, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },

  // Event Card
  card: { backgroundColor: C.surface, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border, elevation: 2, overflow: 'hidden' },
  coverImage: { width: '100%', height: 160, justifyContent: 'flex-end' },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.4)', padding: 16, justifyContent: 'flex-end' },
  dateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 6 },
  dateBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  
  cardBody: { padding: 16 },
  cardDesc: { fontSize: 13, color: C.textMuted, lineHeight: 20, marginBottom: 12 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  locationText: { fontSize: 12, fontWeight: '700', color: C.slate },

  galleryStrip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surfaceSoft, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  galleryStripText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  viewPhotosBtn: { backgroundColor: C.primarySoft, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  viewPhotosText: { color: C.primaryDark, fontSize: 11, fontWeight: '800' },

  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderColor: C.border, gap: 10 },
  iconBtnEdit: { padding: 8, backgroundColor: C.surfaceSoft, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  iconBtnDelete: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },

  // Event Form Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  compactModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row',backgroundColor: '#0F172A', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.surfaceSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  formTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  closeBtnIcon: { padding: 6, backgroundColor: C.border, borderRadius: 20 },
  formScroll: { padding: 20 },

  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, marginBottom: 6, marginLeft: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft, fontSize: 14, color: C.text },
  row: { flexDirection: 'row', marginBottom: 16 },
  
  datePickerBtnForm: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: C.surfaceSoft },
  datePickerText: { fontSize: 14, color: C.text, fontWeight: '600' },

  saveBtnFull: { backgroundColor: C.primary, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 2 },
  saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Lightbox Modal
  fullScreenModalOverlay: { flex: 1, backgroundColor: '#0F172A' },
  fullScreenModalContainer: { flex: 1 },
  lightboxHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: '#1E293B', borderBottomWidth: 1, borderBottomColor: '#334155' },
  lightboxTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  lightboxSub: { fontSize: 12, color: '#94A3B8', marginTop: 2, fontWeight: '600' },
  closeBtnLight: { padding: 8, backgroundColor: '#334155', borderRadius: 20, marginLeft: 16 },

  photoGridItem: { flex: 1, aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#334155', marginBottom: 10 },
  gridImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  captionOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15,23,42,0.7)', padding: 8 },
  captionText: { color: '#fff', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  deletePhotoBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: C.primary, padding: 6, borderRadius: 12, elevation: 3 },
  
  emptyStateLight: { alignItems: 'center', padding: 50, marginTop: 40 },
  emptyTitleLight: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginTop: 12 },

  addPhotoBar: { backgroundColor: '#1E293B', padding: 16, borderTopWidth: 1, borderTopColor: '#334155' },
  uploadBtnFull: { backgroundColor: C.primary, flexDirection: 'row', height: 46, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  uploadBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});