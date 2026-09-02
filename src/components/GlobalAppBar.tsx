import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Modal, SafeAreaView, Platform 
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function GlobalAppBar({ navigation, title = "Dashboard" }: any) {
  const [showMenu, setShowMenu] = useState(false);
  
  // 🚀 DYNAMIC DATA STATE
  const [user, setUser] = useState({
    name: 'User',
    email: 'Loading...',
    role: 'Employee'
  });

  // Fetch from AsyncStorage on load
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const name = await AsyncStorage.getItem('userName') || 'User';
        const email = await AsyncStorage.getItem('userEmail') || '';
        const role = await AsyncStorage.getItem('userRole') || 'Employee';
        setUser({ name, email, role });
      } catch (error) {
        console.log("Error fetching user for AppBar", error);
      }
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    setShowMenu(false);
    await AsyncStorage.clear();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const initials = user.name.charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.appBar}>
        
        {/* Left Hamburger Icon */}
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.toggleDrawer()}>
          <MaterialCommunityIcons name="menu" size={26} color="#0F172A" />
        </TouchableOpacity>

        {/* Title */}
        <Text style={styles.titleText} numberOfLines={1}>{title}</Text>

        {/* Right Side: RED AVATAR */}
        <TouchableOpacity style={styles.avatarBtn} onPress={() => setShowMenu(true)}>
          <View style={styles.redAvatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </TouchableOpacity>

        {/* 🚀 DROPDOWN MENU FOR APPBAR */}
        <Modal visible={showMenu} transparent animationType="fade">
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
            <View style={styles.dropdownMenu}>
              
              <View style={styles.menuHeader}>
                <Text style={styles.menuName}>{user.name}</Text>
                <Text style={styles.menuRole}>{user.role}</Text>
                <Text style={styles.menuEmail}>{user.email}</Text>
              </View>

              <View style={styles.divider} />

              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
                <Text style={styles.logoutText}>Logout</Text>
              </TouchableOpacity>

            </View>
          </TouchableOpacity>
        </Modal>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FFFFFF' },
  appBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  iconBtn: { padding: 5 },
  titleText: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
    marginLeft: 15,
  },
  avatarBtn: { padding: 2 },
  redAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EF4444', // RED AVATAR
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  dropdownMenu: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 95 : 75,
    right: 15,
    width: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    paddingVertical: 10,
  },
  menuHeader: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  menuName: { fontSize: 16, fontWeight: 'bold', color: '#0F172A' },
  menuRole: { fontSize: 13, fontWeight: 'bold', color: '#3B82F6', marginTop: 2 },
  menuEmail: { fontSize: 12, color: '#64748B', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 5 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  logoutText: {
    color: '#EF4444',
    fontWeight: 'bold',
    marginLeft: 10,
    fontSize: 15,
  },
});