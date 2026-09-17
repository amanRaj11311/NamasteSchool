import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';

interface Conversation {
  _id: string;
  isGroupAdmin: boolean;
  name: string;
  photo?: string;
  online?: boolean;
  unreadCount?: number;
  lastMessage?: { content: string; createdAt: string };
  participants: any[];
}

interface Message {
  _id: string;
  sender: { _id: string; name: string; photo?: string };
  content: string;
  createdAt: string;
}

// -- helpers -----------------------------------------------------------

const initialsOf = (name?: string) =>
  (name || '#')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w.charAt(0).toUpperCase())
    .join('');

const formatDayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
};

export default function ChatScreen() {
  const insets = useSafeAreaInsets();

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Views
  const [activeTab, setActiveTab] = useState<'All' | 'Direct' | 'Groups'>('All');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msgInput, setMsgInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // New Chat Modal
  const [isNewChatModal, setNewChatModal] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const uid = await AsyncStorage.getItem('userId');
    setAuthToken(token);
    setCurrentUserId(uid);
    fetchConversations(token);
  };

  const fetchConversations = async (token: string | null) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) setConversations(res.data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (convId: string) => {
    try {
      const res = await axios.get(`${API_BASE}/chat/messages/${convId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.data?.success) setMessages(res.data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const openChat = (conv: Conversation) => {
    setActiveChat(conv);
    fetchMessages(conv._id);
  };

  const closeChat = () => {
    setActiveChat(null);
    setMessages([]);
    setMsgInput('');
  };

  const sendMessage = async () => {
    if (!msgInput.trim() || !activeChat || sending) return;
    const tempMsg = msgInput.trim();
    setMsgInput('');
    setSending(true);
    try {
      await axios.post(
        `${API_BASE}/chat/messages`,
        { conversationId: activeChat._id, content: tempMsg },
        { headers: { Authorization: `Bearer ${authToken}` } },
      );
      await fetchMessages(activeChat._id);
      fetchConversations(authToken);
    } catch (e) {
      console.error(e);
      setMsgInput(tempMsg);
    } finally {
      setSending(false);
    }
  };

  const openNewChatDirectory = async () => {
    setNewChatModal(true);
    try {
      const res = await axios.get(`${API_BASE}/staff?limit=50`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.data?.success) setStaffList(res.data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const startDirectChat = async (recipientId: string) => {
    setNewChatModal(false);
    try {
      const res = await axios.post(
        `${API_BASE}/chat/conversations/direct`,
        { recipientId },
        { headers: { Authorization: `Bearer ${authToken}` } },
      );
      if (res.data?.success) {
        fetchConversations(authToken);
        openChat(res.data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- Render Chat Interface (When a conversation is open) ---
  if (activeChat) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
        >
          {/* Header */}
          <View style={styles.chatHeader}>
            <TouchableOpacity
              onPress={closeChat}
              style={styles.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="arrow-left" size={22} color="#111827" />
            </TouchableOpacity>

            <View style={styles.avatarWrap}>
              {activeChat.photo ? (
                <Image source={{ uri: activeChat.photo }} style={styles.avatarImg} />
              ) : (
                <View style={[styles.avatar, { width: 40, height: 40, borderRadius: 20 }]}>
                  <Text style={styles.avatarText}>{initialsOf(activeChat.name)}</Text>
                </View>
              )}
              {activeChat.online && <View style={styles.onlineDot} />}
            </View>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.chatHeaderName} numberOfLines={1}>
                {activeChat.name}
              </Text>
              <Text style={styles.chatHeaderStatus}>
                {activeChat.online ? 'Active now' : `${activeChat.participants?.length || 0} members`}
              </Text>
            </View>

            <TouchableOpacity style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="more-vertical" size={20} color="#4B5563" />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item._id}
            contentContainerStyle={{ padding: 16, paddingBottom: 8, flexGrow: 1 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.center}>
                <Feather name="message-circle" size={36} color="#D1D5DB" />
                <Text style={{ color: '#9CA3AF', marginTop: 10, fontSize: 13 }}>
                  Say hello to start the conversation.
                </Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const isMe = item.sender._id === currentUserId;
              const prev = messages[index - 1];
              const showDaySeparator =
                !prev || formatDayLabel(prev.createdAt) !== formatDayLabel(item.createdAt);
              const showSenderName =
                !isMe && (!prev || prev.sender._id !== item.sender._id || showDaySeparator);

              return (
                <>
                  {showDaySeparator && (
                    <View style={styles.daySeparatorRow}>
                      <View style={styles.daySeparatorLine} />
                      <Text style={styles.daySeparatorText}>{formatDayLabel(item.createdAt)}</Text>
                      <View style={styles.daySeparatorLine} />
                    </View>
                  )}
                  <View style={[styles.msgWrapper, isMe ? styles.msgRight : styles.msgLeft]}>
                    {showSenderName && <Text style={styles.msgSenderName}>{item.sender.name}</Text>}
                    <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
                      <Text style={[styles.msgText, isMe && { color: '#fff' }]}>{item.content}</Text>
                    </View>
                    <Text style={styles.msgTime}>
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </>
              );
            }}
          />

          {/* Input bar — padded for the home indicator / gesture bar so it never
              collides with the bottom system UI, on both iOS and Android */}
          <View
            style={[
              styles.inputRow,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <TouchableOpacity style={styles.attachBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="plus" size={20} color="#6B7280" />
            </TouchableOpacity>
            <TextInput
              style={styles.chatInput}
              placeholder="Type a message..."
              placeholderTextColor="#9CA3AF"
              value={msgInput}
              onChangeText={setMsgInput}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!msgInput.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!msgInput.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // --- Render Conversation List (Default View) ---
  const filteredConvs = conversations
    .filter(c => {
      if (activeTab === 'Direct') return c.isGroupAdmin === false && c.participants.length <= 2;
      if (activeTab === 'Groups') return c.participants.length > 2 || c.isGroupAdmin;
      return true;
    })
    .filter(c => c.name?.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Team Chat</Text>
        <Text style={styles.subtitle}>1-to-1 direct messaging & team group channels</Text>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <TouchableOpacity style={styles.newChatBtn} onPress={openNewChatDirectory}>
            <Feather name="user-plus" size={14} color="#ef4444" />
            <Text style={styles.newChatText}>New 1-to-1 Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.newGroupBtn}>
            <Feather name="users" size={14} color="#fff" />
            <Text style={styles.newGroupText}>Create Group</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabContainer}>
        {(['All', 'Direct', 'Groups'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ef4444" />
        </View>
      ) : (
        <FlatList
          data={filteredConvs}
          keyExtractor={item => item._id}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="message-square" size={40} color="#D1D5DB" />
              <Text style={{ color: '#6B7280', marginTop: 10 }}>No conversations found.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.convCard} onPress={() => openChat(item)} activeOpacity={0.7}>
              <View style={styles.avatarWrap}>
                {item.photo ? (
                  <Image source={{ uri: item.photo }} style={[styles.avatarImg, { width: 48, height: 48, borderRadius: 24 }]} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(item.name)}</Text>
                  </View>
                )}
                {item.online && <View style={styles.onlineDot} />}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.convName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text
                  style={[styles.convLastMsg, !!item.unreadCount && { color: '#111827', fontWeight: '600' }]}
                  numberOfLines={1}
                >
                  {item.lastMessage?.content || 'No messages yet'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                {item.lastMessage && (
                  <Text style={styles.convTime}>{new Date(item.lastMessage.createdAt).toLocaleDateString()}</Text>
                )}
                {!!item.unreadCount && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{item.unreadCount > 9 ? '9+' : item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* New Chat Directory Modal */}
      <Modal visible={isNewChatModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.compactModalContainer, { paddingBottom: insets.bottom }]}>
            <View style={styles.modalHandle} />
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Select Staff Member</Text>
              <TouchableOpacity
                onPress={() => setNewChatModal(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={20} color="#4B5563" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={staffList}
              keyExtractor={item => item._id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <View style={styles.dirCard}>
                  <View style={[styles.avatar, { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E2' }]}>
                    <Text style={[styles.avatarText, { color: '#ef4444' }]}>{initialsOf(item.name)}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.convName}>{item.name}</Text>
                    <Text style={styles.convLastMsg}>{item.staffType}</Text>
                  </View>
                  <TouchableOpacity style={styles.startChatBtn} onPress={() => startDirectChat(item._id)}>
                    <Text style={styles.startChatText}>Chat</Text>
                    <Feather name="arrow-right" size={12} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F9' },
  center: { padding: 40, justifyContent: 'center', alignItems: 'center' },

  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#E5E7EB' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },

  filterSection: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#E5E7EB' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  newChatBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
    gap: 6,
  },
  newChatText: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
  newGroupBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 11,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    gap: 6,
    shadowColor: '#ef4444',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  newGroupText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  tabContainer: { flexDirection: 'row', paddingHorizontal: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tabBtn: { paddingVertical: 14, marginRight: 24, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#ef4444' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  tabTextActive: { color: '#111827', fontWeight: '800' },

  convCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E5E7EB' },
  avatarText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#fff',
  },
  convName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  convLastMsg: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  convTime: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  emptyState: { alignItems: 'center', padding: 40, marginTop: 20 },

  // Chat Interface
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  backBtn: { padding: 6, marginRight: 4, borderRadius: 20 },
  iconBtn: { padding: 6, borderRadius: 20 },
  chatHeaderName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  chatHeaderStatus: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },

  daySeparatorRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  daySeparatorLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  daySeparatorText: { fontSize: 11, fontWeight: '700', color: '#9CA3AF' },

  msgWrapper: { marginBottom: 12, maxWidth: '80%' },
  msgRight: { alignSelf: 'flex-end' },
  msgLeft: { alignSelf: 'flex-start' },
  msgSenderName: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginBottom: 4, marginLeft: 4 },
  msgBubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 },
  msgBubbleMe: {
    backgroundColor: '#ef4444',
    borderBottomRightRadius: 4,
    shadowColor: '#ef4444',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  msgBubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14.5, color: '#111827', lineHeight: 20 },
  msgTime: { fontSize: 10, color: '#9CA3AF', marginTop: 4, alignSelf: 'flex-end' },

  // Input bar: bottom padding is set dynamically with the safe-area inset
  // (see paddingBottom in the component) so it never sits under the
  // home-indicator / gesture bar and lifts cleanly above the keyboard.
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  attachBtn: { width: 36, height: 44, justifyContent: 'center', alignItems: 'center' },
  chatInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 100,
    fontSize: 14,
    color: '#111827',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#B3122A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#B3122A',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sendBtnDisabled: { backgroundColor: '#FCA5A5', shadowOpacity: 0, elevation: 0 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.6)', justifyContent: 'flex-end' },
  compactModalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
    elevation: 10,
    overflow: 'hidden',
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 10 },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalCloseBtn: { padding: 6, backgroundColor: '#F3F4F6', borderRadius: 20 },

  dirCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  startChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  startChatText: { color: '#B3122A', fontWeight: '700', fontSize: 12 },
});