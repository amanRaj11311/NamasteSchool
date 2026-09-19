import React, { useState, useEffect, useCallback,} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput,
  Modal, ScrollView, Alert, ActivityIndicator, RefreshControl, Image, Linking
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
};

const CATEGORIES = ['Uniform', 'Dress', 'Bag', 'Table', 'Furniture', 'Stationery', 'Shoes', 'Sports', 'Other'];

const resolveImageUrl = (url?: string) => {
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  const base = API_BASE.replace(/\/api\/?$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
};

export default function MarketplaceCatalogScreen() {
  const navigation = useNavigation<any>();
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data States
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contactingId, setContactingId] = useState<string | null>(null);

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  // Modal State
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    setAuthToken(token);
    fetchCatalog(token, 1, searchQuery, categoryFilter);
  };

  const authHeaders = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

  const fetchCatalog = async (token: string | null = authToken, p: number = page, q: string = searchQuery, cat: string = categoryFilter, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params: any = { page: p, limit: 24 };
      if (q) params.search = q;
      if (cat) params.category = cat;

      const res = await axios.get(`${API_BASE}/marketplace/catalog`, { params, ...authHeaders(token) });
      if (res.data?.success) {
        setItems(p === 1 ? res.data.data : [...items, ...res.data.data]);
        setPagination(res.data.pagination || { page: 1, pages: 1, total: 0 });
        setPage(p);
      }
    } catch (err: any) { Alert.alert('Error', err.response?.data?.message || 'Failed to load catalog'); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const handleRefresh = useCallback(() => {
    fetchCatalog(authToken, 1, searchQuery, categoryFilter, true);
  }, [authToken, searchQuery, categoryFilter]);

  const handleLoadMore = () => {
    if (page < pagination.pages && !loading) {
      fetchCatalog(authToken, page + 1, searchQuery, categoryFilter);
    }
  };

  const openWhatsApp = async (product: any) => {
    const id = product._id || product.id;
    setContactingId(id);
    try {
      // Must log contact first
      const res = await axios.post(`${API_BASE}/marketplace/catalog/${id}/contact`, {}, authHeaders(authToken));
      const url = res.data?.data?.whatsappUrl;
      if (!url) throw new Error("WhatsApp link missing");
      
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert('Error', 'Cannot open WhatsApp.');
    } catch (err: any) { Alert.alert('Error', err.response?.data?.message || 'Could not start WhatsApp contact'); } 
    finally { setContactingId(null); }
  };

  const renderProduct = ({ item, index }: { item: any, index: number }) => {
    const imgUrl = resolveImageUrl(item.images?.[0]?.url);
    const hasDiscount = item.mrp && item.mrp > item.price;
    const isEven = index % 2 === 0;

    return (
      <TouchableOpacity 
        activeOpacity={0.85} 
        onPress={() => setSelectedProduct(item)}
        style={[styles.productCard, { marginLeft: isEven ? 0 : 8, marginRight: isEven ? 8 : 0 }]}
      >
        <View style={styles.imageContainer}>
          {imgUrl ? (
            <Image source={{ uri: imgUrl }} style={styles.productImage} resizeMode="cover" />
          ) : (
            <View style={styles.imagePlaceholder}><Feather name="image" size={32} color={C.textFaint} /></View>
          )}
          <View style={styles.catBadge}><Text style={styles.catBadgeText}>{item.category}</Text></View>
        </View>

        <View style={styles.productBody}>
          <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceText}>₹{Number(item.price || 0).toLocaleString("en-IN")}</Text>
            {hasDiscount && <Text style={styles.mrpText}>₹{Number(item.mrp).toLocaleString("en-IN")}</Text>}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        
        <View style={styles.headerIconBadge}><Feather name="shopping-bag" size={20} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Marketplace</Text>
          <Text style={styles.subtitle}>Uniforms, bags, stationery & more.</Text>
        </View>
      </View>

      {/* Search & Filters */}
      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={C.textFaint} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search products..." 
            value={searchQuery} 
            onChangeText={setSearchQuery}
            onSubmitEditing={() => fetchCatalog(authToken, 1, searchQuery, categoryFilter)}
            returnKeyType="search"
          />
        </View>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
          <TouchableOpacity 
            style={[styles.filterPill, categoryFilter === '' ? styles.filterPillActive : styles.filterPillInactive]}
            onPress={() => { setCategoryFilter(''); fetchCatalog(authToken, 1, searchQuery, ''); }}
          >
            <Text style={[styles.filterPillText, categoryFilter === '' ? styles.filterPillTextActive : styles.filterPillTextInactive]}>All</Text>
          </TouchableOpacity>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity 
              key={cat} 
              style={[styles.filterPill, categoryFilter === cat ? styles.filterPillActive : styles.filterPillInactive]}
              onPress={() => { setCategoryFilter(cat); fetchCatalog(authToken, 1, searchQuery, cat); }}
            >
              <Text style={[styles.filterPillText, categoryFilter === cat ? styles.filterPillTextActive : styles.filterPillTextInactive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.totalText}>{pagination.total || 0} items available</Text>
      </View>

      {/* Product Grid */}
      {loading && page === 1 ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="box" size={40} color={C.textFaint} />
          <Text style={styles.emptyTitle}>No Products Found</Text>
          <Text style={styles.emptySubtitle}>No items are listed matching your search or category.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id || item.id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          renderItem={renderProduct}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loading && page > 1 ? <ActivityIndicator style={{ margin: 20 }} color={C.primary} /> : null}
        />
      )}

      {/* PRODUCT DETAIL MODAL */}
      <Modal visible={!!selectedProduct} animationType="slide" transparent onRequestClose={() => setSelectedProduct(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.productModalContainer}>
            <View style={styles.modalHeaderRed}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1}}>
                <Feather name="box" size={18} color="#fff" />
                <Text style={styles.modalHeaderTitle} numberOfLines={1}>{selectedProduct?.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedProduct(null)} style={styles.closeBtnIconLight} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 18, color: '#fff' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
              
              <View style={styles.modalImageWrap}>
                {resolveImageUrl(selectedProduct?.images?.[0]?.url) ? (
                  <Image source={{ uri: resolveImageUrl(selectedProduct.images[0].url)! }} style={styles.modalImage} resizeMode="contain" />
                ) : (
                  <View style={styles.modalImagePlaceholder}><Feather name="image" size={40} color={C.textFaint} /></View>
                )}
              </View>

              <View style={styles.modalDetailsBox}>
                <View style={styles.modalCatBadge}><Text style={styles.modalCatBadgeText}>{selectedProduct?.category}</Text></View>
                
                <Text style={styles.modalProductTitle}>{selectedProduct?.title}</Text>
                
                <View style={styles.modalPriceRow}>
                  <Text style={styles.modalPrice}>₹{Number(selectedProduct?.price || 0).toLocaleString("en-IN")}</Text>
                  {selectedProduct?.mrp > selectedProduct?.price && (
                    <Text style={styles.modalMrp}>₹{Number(selectedProduct.mrp).toLocaleString("en-IN")}</Text>
                  )}
                </View>

                {!!selectedProduct?.description && <Text style={styles.modalDesc}>{selectedProduct.description}</Text>}

                {(selectedProduct?.sizes?.length > 0 || selectedProduct?.color) && (
                  <View style={styles.metaBox}>
                    {selectedProduct?.sizes?.length > 0 && <Text style={styles.metaText}><Text style={{fontWeight: '800'}}>Sizes: </Text>{selectedProduct.sizes.join(", ")}</Text>}
                    {!!selectedProduct?.color && <Text style={styles.metaText}><Text style={{fontWeight: '800'}}>Color: </Text>{selectedProduct.color}</Text>}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.whatsappBtn} 
                onPress={() => openWhatsApp(selectedProduct)} 
                disabled={contactingId === selectedProduct?._id}
              >
                {contactingId === selectedProduct?._id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <><Feather name="message-circle" size={18} color="#fff" style={{marginRight: 8}}/><Text style={styles.whatsappBtnText}>Contact on WhatsApp</Text></>
                )}
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
  backBtn: { padding: 4, marginRight: -4 },
  headerIconBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  filterSection: { padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border, zIndex: 10 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, height: 44, marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text },
  filterPillsScroll: { gap: 8 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterPillActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterPillInactive: { backgroundColor: C.surfaceSoft, borderColor: C.border },
  filterPillText: { fontSize: 12, fontWeight: '700' },
  filterPillTextActive: { color: '#fff' },
  filterPillTextInactive: { color: C.textMuted },

  statsRow: { paddingHorizontal: 16, marginTop: 16 },
  totalText: { fontSize: 13, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 },
  
  emptyState: { alignItems: 'center', padding: 40, marginTop: 20, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', marginHorizontal: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12.5, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  productCard: { flex: 1, backgroundColor: C.surface, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', elevation: 1 },
  imageContainer: { width: '100%', height: 140, backgroundColor: C.surfaceSoft, position: 'relative' },
  productImage: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  catBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.border },
  catBadgeText: { fontSize: 9, fontWeight: '800', color: C.primaryDark },
  
  productBody: { padding: 12 },
  productTitle: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 6, lineHeight: 18 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceText: { fontSize: 15, fontWeight: '900', color: C.greenDark },
  mrpText: { fontSize: 11, color: C.textMuted, textDecorationLine: 'line-through' },

  // Detail Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', padding: 16 },
  productModalContainer: { backgroundColor: C.surface, borderRadius: 20, maxHeight: '90%', elevation: 10, overflow: 'hidden' },
  modalHeaderRed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: C.primary },
  modalHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#fff', flex: 1 },
  closeBtnIconLight: { padding: 4, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 20 },
  
  modalScroll: { padding: 20 },
  modalImageWrap: { width: '100%', height: 220, backgroundColor: C.surfaceSoft, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 20 },
  modalImage: { width: '100%', height: '100%' },
  modalImagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  modalDetailsBox: { flex: 1 },
  modalCatBadge: { backgroundColor: C.primarySoft, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 12 },
  modalCatBadgeText: { fontSize: 11, fontWeight: '800', color: C.primaryDark },
  modalProductTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 10, lineHeight: 28 },
  
  modalPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  modalPrice: { fontSize: 24, fontWeight: '900', color: C.greenDark },
  modalMrp: { fontSize: 14, color: C.textMuted, textDecorationLine: 'line-through', fontWeight: '500' },
  
  modalDesc: { fontSize: 14, color: C.textMuted, lineHeight: 22, marginBottom: 20 },
  metaBox: { backgroundColor: C.surfaceSoft, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border, gap: 6 },
  metaText: { fontSize: 13, color: C.text },

  modalFooter: { padding: 16, borderTopWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSoft },
  whatsappBtn: { backgroundColor: C.greenDark, flexDirection: 'row', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  whatsappBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});