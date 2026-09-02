import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import axios from 'axios';
import { API_BASE } from '../../network/api';
interface Conversation {
  _id: string;
  isGroupAdmin: boolean;
  name: string;
  photo?: string;
  lastMessage?: { content: string; createdAt: string };
  participants: any[];
}

interface Message {
  _id: string;
  sender: { _id: string; name: string };
  content: string;
  createdAt: string;
}

export default function ChatScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Views
  const [activeTab, setActiveTab] = useState<'All' | 'Direct' | 'Groups'>('All');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [msgInput, setMsgInput] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // New Chat Modal
  const [isNewChatModal, setNewChatModal] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const uid = await AsyncStorage.getItem('userId'); // Assuming saved on login
    setAuthToken(token); setCurrentUserId(uid);
    fetchConversations(token);
  };

  const fetchConversations = async (token: string | null) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/chat/conversations`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) setConversations(res.data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchMessages = async (convId: string) => {
    try {
      const res = await axios.get(`${API_BASE}/chat/messages/${convId}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (res.data?.success) setMessages(res.data.data || []);
    } catch (e) { console.error(e); }
  };

  const openChat = (conv: Conversation) => {
    setActiveChat(conv);
    fetchMessages(conv._id);
  };

  const sendMessage = async () => {
    if (!msgInput.trim() || !activeChat) return;
    const tempMsg = msgInput;
    setMsgInput(''); // Optimistic clear
    try {
      await axios.post(`${API_BASE}/chat/messages`, { conversationId: activeChat._id, content: tempMsg }, { headers: { Authorization: `Bearer ${authToken}` } });
      fetchMessages(activeChat._id); // Refresh messages
      fetchConversations(authToken); // Refresh last message in list
    } catch (e) { console.error(e); setMsgInput(tempMsg); }
  };

  const openNewChatDirectory = async () => {
    setNewChatModal(true);
    try {
      const res = await axios.get(`${API_BASE}/staff?limit=50`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (res.data?.success) setStaffList(res.data.data || []);
    } catch (e) { console.error(e); }
  };

  const startDirectChat = async (recipientId: string) => {
    setNewChatModal(false);
    try {
      const res = await axios.post(`${API_BASE}/chat/conversations/direct`, { recipientId }, { headers: { Authorization: `Bearer ${authToken}` } });
      if (res.data?.success) {
        fetchConversations(authToken);
        openChat(res.data.data);
      }
    } catch (e) { console.error(e); }
  };

  // --- Render Chat Interface (When a conversation is open) ---
  if (activeChat) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setActiveChat(null)} style={{padding: 8, marginRight: 8}}><Feather name="arrow-left" size={24} color="#111827" /></TouchableOpacity>
            <View style={[styles.avatar, {width: 40, height: 40, borderRadius: 20}]}><Text style={styles.avatarText}>{activeChat.name?.charAt(0) || '#'}</Text></View>
            <Text style={styles.chatHeaderName} numberOfLines={1}>{activeChat.name}</Text>
          </View>
          
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item._id}
            contentContainerStyle={{padding: 16}}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({animated: true})}
            renderItem={({ item }) => {
              const isMe = item.sender._id === currentUserId;
              return (
                <View style={[styles.msgWrapper, isMe ? styles.msgRight : styles.msgLeft]}>
                  {!isMe && <Text style={styles.msgSenderName}>{item.sender.name}</Text>}
                  <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
                    <Text style={[styles.msgText, isMe && {color: '#fff'}]}>{item.content}</Text>
                  </View>
                  <Text style={styles.msgTime}>{new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
                </View>
              );
            }}
          />

          <View style={styles.inputRow}>
            <TextInput style={styles.chatInput} placeholder="Type a message..." value={msgInput} onChangeText={setMsgInput} multiline />
            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
              <Feather name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // --- Render Conversation List (Default View) ---
  const filteredConvs = conversations.filter(c => {
    if (activeTab === 'Direct') return c.isGroupAdmin === false && c.participants.length <= 2; // Approximation for direct
    if (activeTab === 'Groups') return c.participants.length > 2 || c.isGroupAdmin;
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Team Chat</Text>
        <Text style={styles.subtitle}>1 to 1 Direct Messaging & Team Group Channels.</Text>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color="#9CA3AF" />
          <TextInput style={styles.searchInput} placeholder="Search conversations..." />
        </View>
        <View style={{flexDirection: 'row', gap: 10, marginTop: 12}}>
          <TouchableOpacity style={styles.newChatBtn} onPress={openNewChatDirectory}>
            <Feather name="user-plus" size={14} color="#ef4444" /><Text style={styles.newChatText}>New 1-to-1 Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.newChatBtn, {backgroundColor: '#ef4444', borderWidth: 0}]}>
            <Feather name="users" size={14} color="#fff" /><Text style={[styles.newChatText, {color: '#fff'}]}>Create Group</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabContainer}>
        {['All', 'Direct', 'Groups'].map(tab => (
          <TouchableOpacity key={tab} style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]} onPress={() => setActiveTab(tab as any)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#ef4444" /></View> : (
        <FlatList
          data={filteredConvs}
          keyExtractor={item => item._id}
          contentContainerStyle={{paddingBottom: 20}}
          ListEmptyComponent={<View style={styles.emptyState}><Feather name="message-square" size={40} color="#D1D5DB" /><Text style={{color: '#6B7280', marginTop: 10}}>No conversations found.</Text></View>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.convCard} onPress={() => openChat(item)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{item.name?.charAt(0) || '#'}</Text></View>
              <View style={{flex: 1, marginLeft: 12}}>
                <Text style={styles.convName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.convLastMsg} numberOfLines={1}>{item.lastMessage?.content || 'No messages yet'}</Text>
              </View>
              {item.lastMessage && <Text style={styles.convTime}>{new Date(item.lastMessage.createdAt).toLocaleDateString()}</Text>}
            </TouchableOpacity>
          )}
        />
      )}

      {/* New Chat Directory Modal */}
      <Modal visible={isNewChatModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.compactModalContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Select Staff Member</Text>
              <TouchableOpacity onPress={() => setNewChatModal(false)} style={{padding: 6, backgroundColor: '#F3F4F6', borderRadius: 20}}><Feather name="x" size={20} color="#4B5563" /></TouchableOpacity>
            </View>
            <FlatList
              data={staffList}
              keyExtractor={item => item._id}
              contentContainerStyle={{padding: 16}}
              renderItem={({item}) => (
                <View style={styles.dirCard}>
                  <View style={[styles.avatar, {width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E2'}]}><Text style={[styles.avatarText, {color: '#ef4444'}]}>{item.name.charAt(0)}</Text></View>
                  <View style={{flex: 1, marginLeft: 12}}>
                    <Text style={styles.convName}>{item.name}</Text>
                    <Text style={styles.convLastMsg}>{item.staffType}</Text>
                  </View>
                  <TouchableOpacity style={styles.startChatBtn} onPress={() => startDirectChat(item._id)}>
                    <Text style={styles.startChatText}>Chat <Feather name="arrow-right"/></Text>
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
  title: { fontSize: 24, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  
  filterSection: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#E5E7EB' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#111827' },
  newChatBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FEE2E2', backgroundColor: '#FEF2F2', gap: 6 },
  newChatText: { color: '#ef4444', fontWeight: '700', fontSize: 13 },

  tabContainer: { flexDirection: 'row', paddingHorizontal: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tabBtn: { paddingVertical: 14, marginRight: 20, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#ef4444' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  tabTextActive: { color: '#111827' },

  convCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  convName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  convLastMsg: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  convTime: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },

  emptyState: { alignItems: "center", padding: 40, marginTop: 20 },

  // Chat Interface
  chatHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', elevation: 2 },
  chatHeaderName: { fontSize: 18, fontWeight: '800', color: '#111827', marginLeft: 12, flex: 1 },
  
  msgWrapper: { marginBottom: 12, maxWidth: '80%' },
  msgRight: { alignSelf: 'flex-end' },
  msgLeft: { alignSelf: 'flex-start' },
  msgSenderName: { fontSize: 10, color: '#6B7280', marginBottom: 4, marginLeft: 4 },
  msgBubble: { padding: 12, borderRadius: 16 },
  msgBubbleMe: { backgroundColor: '#ef4444', borderBottomRightRadius: 4 },
  msgBubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14, color: '#111827', lineHeight: 20 },
  msgTime: { fontSize: 9, color: '#9CA3AF', marginTop: 4, alignSelf: 'flex-end' },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  chatInput: { flex: 1, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, maxHeight: 100, fontSize: 14, color: '#111827' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', marginLeft: 10, marginBottom: 2 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.6)', justifyContent: 'flex-end' },
  compactModalContainer: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%', elevation: 10, overflow: 'hidden' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  
  dirCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  startChatBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#FEE2E2' },
  startChatText: { color: '#ef4444', fontWeight: '700', fontSize: 12 },
});