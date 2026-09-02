import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
  Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createDrawerNavigator, DrawerContentScrollView } from "@react-navigation/drawer";
import { useNavigation } from "@react-navigation/native";
import Feather from "react-native-vector-icons/Feather";

// --- Screen Imports ---
import LoginScreen from "../authentication/LoginScreen";
import DashboardScreen from "../screens/DashboardScreen";
import SchoolsScreen from "../screens/SchoolScreen";
import SubjectsScreen from "../screens/SubjectsScreen";
import StaffScreen from "../screens/StaffManagement/StaffScreen";
import AttendanceScreen from "../screens/StaffManagement/Staff_AttendanceScreen";
import TimetableScreen from "../screens/StaffManagement/Staff_TimeTableScreen";
import RolesScreen from "../screens/RoleScreen";
import PermissionsScreen from "../screens/PermissionScreen";
import SettingsScreen from "../screens/SettingScreen";
import AddStudentScreen from "../screens/AddStudentScreen";
import ClassTimetableScreen from "../screens/ClassManagement/ClassTimetableScreen";
import ClassesScreen from "../screens/ClassManagement/ClassScreen";
import ApplyLeaveScreen from '../screens/Leave Management/ApplyLeavesScreen';
import LeaveTypesScreen from '../screens/Leave Management/LeaveTypeScreen';
import LeaveBalancesScreen from '../screens/Leave Management/LeavesBalanceScreen';
import NoticeBoardScreen from '../screens/communicaton/noticeboard';
import ChatScreen from '../screens/communicaton/ChatScreen';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();


const PlaceholderScreen = ({ route }: any) => (
  <View style={styles.loadingContainer}>
    <Feather name="box" size={40} color="#D1D5DB" style={{ marginBottom: 10 }} />
    <Text style={{ fontSize: 18, fontWeight: '800', color: '#374151' }}>{route.name}</Text>
    <Text style={{ color: '#6B7280', marginTop: 4, fontWeight: '500' }}>Module screen coming soon</Text>
  </View>
);

// --- Types ---
type Permission = { module: string; action: string };
type MenuItem = { routeName?: string; label: string; icon: string; component?: React.ComponentType<any>; module: string; children?: MenuItem[]; };
type MenuSection = { section: string; items: MenuItem[]; };


const MENU_STRUCTURE: MenuSection[] = [
  {
    section: "OVERVIEW",
    items: [
      { routeName: "Dashboard", label: "Dashboard", icon: "grid", component: DashboardScreen, module: "dashboard" }
    ]
  },
  {
    section: "MANAGEMENT",
    items: [
      { routeName: "Schools", label: "School Branches", icon: "git-branch", component: SchoolsScreen, module: "schools" },
      {
        label: "Classes Manager", icon: "monitor", module: "classes_group", // Group wrappers don't need exact modules, children dictate visibility
        children: [
          { routeName: "Classes", label: "Classes Overview", icon: "layers", component: ClassesScreen, module: "classes" },
          { routeName: "Class TimeTable", label: "Class Timetable", icon: "calendar", component: ClassTimetableScreen, module: "timetable" },
          { routeName: "Class Attendance", label: "Attendance", icon: "check-square", component: PlaceholderScreen, module: "attendance" },
          { routeName: "Homework", label: "Homework", icon: "edit-3", component: PlaceholderScreen, module: "homework" },
          { routeName: "Exams", label: "Exams", icon: "award", component: PlaceholderScreen, module: "exams" },
          { routeName: "Diary", label: "Class Diary", icon: "book-open", component: PlaceholderScreen, module: "diary" },
        ]
      },
      { routeName: "Subjects", label: "Subjects", icon: "book", component: SubjectsScreen, module: "subjects" },
      { routeName: "Students", label: "Students Directory", icon: "users", component: AddStudentScreen, module: "students" },
      {
        label: "Staff Management", icon: "user-check", module: "staff_group",
        children: [
          { routeName: "Staff", label: "Staff Directory", icon: "users", component: StaffScreen, module: "staff" },
          { routeName: "Staff Attendance", label: "Attendance", icon: "clock", component: AttendanceScreen, module: "attendance" },
          { routeName: "Staff Timetable", label: "Time Table", icon: "calendar", component: TimetableScreen, module: "timetable" },
        ]
      },
      {
        label: "Leave Management", icon: "briefcase", module: "leave_group",
        children: [
          { routeName: "Leaves", label: "Apply / My Leaves", icon: "file-minus", component: ApplyLeaveScreen, module: "leave" },
          { routeName: "Leave Types", label: "Leave Types", icon: "list", component: LeaveTypesScreen, module: "leavetype" },
          { routeName: "Leave Balances", label: "Leave Balances", icon: "pie-chart", component: LeaveBalancesScreen, module: "leavebalance" },
        ]
      },
      {
        label: "Financials", icon: "dollar-sign", module: "finance_group",
        children: [
          { routeName: "Fees", label: "Fees Collection", icon: "plus-circle", component: PlaceholderScreen, module: "fees" },
          { routeName: "Salary", label: "Salary Records", icon: "credit-card", component: PlaceholderScreen, module: "salary" },
          { routeName: "Expense", label: "Expenses", icon: "trending-down", component: PlaceholderScreen, module: "expense" },
        ]
      },
      {
        label: "Communication", icon: "message-square", module: "communication_group",
        children: [
          { routeName: "Notice Board", label: "Notice Board", icon: "clipboard", component: NoticeBoardScreen, module: "communication" },
          { routeName: "Chat", label: "Chat / Messages", icon: "message-circle", component: ChatScreen, module: "communication" },
        ]
      },
      {
        label: "Roles & Permissions", icon: "shield", module: "roles_group",
        children: [
          { routeName: "Roles", label: "Roles Management", icon: "users", component: RolesScreen, module: "roles" },
          { routeName: "Permissions", label: "System Permissions", icon: "key", component: PermissionsScreen, module: "permissions" },
        ]
      }
    ]
  },
  {
    section: "SYSTEM CONFIG",
    items: [
      { routeName: "Settings", label: "System Settings", icon: "settings", component: SettingsScreen, module: "settings" }
    ]
  }
];

// Flat route list for the Navigator
const FLAT_ROUTES: MenuItem[] = [];
MENU_STRUCTURE.forEach(section => {
  section.items.forEach(item => {
    if (item.children) item.children.forEach(child => FLAT_ROUTES.push(child));
    else FLAT_ROUTES.push(item);
  });
});

// --- Core RBAC Check ---
// A module is visible ONLY if the user has 'read' or 'readOwn' for it.
function hasReadPermission(permissions: Permission[], isSuperAdmin: boolean, module: string): boolean {
  if (isSuperAdmin) return true;
  return permissions.some((p) => p.module === module && (p.action === 'read' || p.action === 'readOwn'));
}

const getInitials = (name: string) => {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

const handleGlobalLogout = (navigation: any) => {
  Alert.alert("Logout", "Are you sure you want to logout?", [
    { text: "Cancel", style: "cancel" },
    { 
      text: "Logout", 
      style: "destructive", 
      onPress: async () => {
        await AsyncStorage.clear();
        navigation.replace('Login');
      }
    }
  ]);
};

// ---------------------------------------------------------------------
// 1. Right Header Component (App Bar Avatar)
// Resolves the Status Bar overlap by using native navigation headers
// ---------------------------------------------------------------------
const HeaderRightAvatar = () => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userName, setUserName] = useState("User");
  const [userEmail, setUserEmail] = useState("");
  const navigation = useNavigation<any>();

  useEffect(() => {
    (async () => {
      const name = await AsyncStorage.getItem("userName");
      const email = await AsyncStorage.getItem("userEmail");
      if (name) setUserName(name);
      if (email) setUserEmail(email);
    })();
  }, []);

  return (
    <View style={{ zIndex: 9999 }}>
      <TouchableOpacity onPress={() => setShowProfileMenu(true)} style={{ marginRight: 16 }}>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{getInitials(userName)}</Text>
        </View>
      </TouchableOpacity>

      <Modal visible={showProfileMenu} transparent={true} animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowProfileMenu(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.profileDropdown}>
                <View style={styles.profileDropdownHeader}>
                  <View style={[styles.headerAvatar, { width: 46, height: 46, borderRadius: 23, marginRight: 14 }]}>
                    <Text style={[styles.headerAvatarText, { fontSize: 18 }]}>{getInitials(userName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropdownName} numberOfLines={1}>{userName}</Text>
                    <Text style={styles.dropdownEmail} numberOfLines={1}>{userEmail || 'user@namaste.com'}</Text>
                  </View>
                </View>
                
                <View style={styles.dropdownDivider} />
                
                <TouchableOpacity 
                  style={styles.dropdownLogoutBtn} 
                  onPress={() => { setShowProfileMenu(false); handleGlobalLogout(navigation); }}
                >
                  <Feather name="log-out" size={16} color="#ef4444" />
                  <Text style={styles.dropdownLogoutText}>Secure Logout</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

// ---------------------------------------------------------------------
// 2. Custom Drawer Content
// ---------------------------------------------------------------------
function CustomDrawerContent(props: any) {
  const [userName, setUserName] = useState("Loading...");
  const [userRole, setUserRole] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const currentRouteName = props.state.routeNames[props.state.index];

  useEffect(() => {
    (async () => {
      const name = await AsyncStorage.getItem("userName");
      const role = await AsyncStorage.getItem("userRole");
      if (name) setUserName(name); 
      if (role) setUserRole(role);

      // Auto-expand the active group
      props.filteredMenu.forEach((section: MenuSection) => {
        section.items.forEach(item => {
          if (item.children && item.children.some(c => c.routeName === currentRouteName)) {
            setExpandedGroups(prev => ({ ...prev, [item.label]: true }));
          }
        });
      });
    })();
  }, [currentRouteName, props.filteredMenu]);

  const toggleGroup = (groupLabel: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupLabel]: !prev[groupLabel] }));
  };

  return (
    <SafeAreaView style={styles.drawerContainer}>
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }} showsVerticalScrollIndicator={false}>
        
        {/* Logo Section */}
        <View style={styles.logoHeader}>
          <View style={styles.logoImageContainer}>
            <Image source={{ uri: 'https://ui-avatars.com/api/?name=NS&background=fff&color=ef4444&rounded=true&bold=true' }} style={styles.logoImage} />
          </View>
          <View style={styles.logoTextContainer}>
            <Text style={styles.logoTitle}>Namaste School</Text>
            <Text style={styles.logoSubtitle}>MANAGEMENT SYSTEM</Text>
          </View>
        </View>

        <View style={styles.separator} />

        {/* Menu Rendering */}
        <View style={styles.menuContainer}>
          {props.filteredMenu.map((section: MenuSection) => (
            <View key={section.section}>
              <Text style={styles.sectionHeaderTitle}>{section.section}</Text>
              
              {section.items.map((item) => {
                const hasChildren = item.children && item.children.length > 0;
                const isChildActive = hasChildren && item.children!.some(c => c.routeName === currentRouteName);
                const isItemActive = item.routeName === currentRouteName || isChildActive;
                const isExpanded = expandedGroups[item.label];

                return (
                  <View key={item.label}>
                    {/* Parent Menu Item */}
                    <TouchableOpacity
                      style={[styles.drawerItem, isItemActive && styles.drawerItemActive]}
                      onPress={() => {
                        if (hasChildren) toggleGroup(item.label);
                        else props.navigation.navigate(item.routeName);
                      }}
                    >
                      <View style={[styles.drawerIconBox, isItemActive ? styles.drawerIconBoxActive : null]}>
                        <Feather name={item.icon as any} size={16} color={isItemActive ? "#ffffff" : "#ef4444"} />
                      </View>
                      <Text style={[styles.drawerItemText, isItemActive && styles.drawerItemTextActive]}>{item.label}</Text>
                      {hasChildren && <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={isItemActive ? "#ef4444" : "#9CA3AF"} />}
                    </TouchableOpacity>

                    {/* Children Sub-Menu */}
                    {hasChildren && isExpanded && (
                      <View style={styles.childrenContainer}>
                        {item.children!.map((child) => {
                          const childActive = currentRouteName === child.routeName;
                          return (
                            <TouchableOpacity key={child.label} style={[styles.childDrawerItem, childActive && styles.childDrawerItemActive]} onPress={() => props.navigation.navigate(child.routeName)}>
                              <Feather name={child.icon as any} size={14} color={childActive ? "#ef4444" : "#9CA3AF"} style={{ marginRight: 12 }} />
                              <Text style={[styles.childDrawerItemText, childActive && styles.childDrawerItemTextActive]}>{child.label}</Text>
                              {childActive && <View style={styles.childActiveDot} />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </DrawerContentScrollView>

      {/* Clean Bottom Footer */}
      <View style={styles.footerContainer}>
        <View style={styles.footerTextContainer}>
          <Text style={styles.footerName} numberOfLines={1}>{userName}</Text>
          <View style={styles.footerRoleBadge}><Text style={styles.footerRole}>{userRole}</Text></View>
        </View>
        <TouchableOpacity onPress={() => handleGlobalLogout(props.navigation)} style={styles.footerLogoutBtn}>
          <Feather name="log-out" size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------
// 3. Drawer Root (Evaluates RBAC dynamically)
// ---------------------------------------------------------------------
function DrawerRoot() {
  const [filteredMenu, setFilteredMenu] = useState<MenuSection[] | null>(null);
  const [visibleRoutes, setVisibleRoutes] = useState<MenuItem[]>([]);

  useEffect(() => {
    (async () => {
      const [permsRaw, superAdminRaw] = await Promise.all([
        AsyncStorage.getItem("userPermissions"),
        AsyncStorage.getItem("isSuperAdmin"),
      ]);

      const permissions: Permission[] = permsRaw ? JSON.parse(permsRaw) : [];
      const isSuperAdmin = superAdminRaw === "true";

      const finalMenu: MenuSection[] = [];
      const tempRoutes: MenuItem[] = [];

      MENU_STRUCTURE.forEach(section => {
        const validItems: MenuItem[] = [];
        
        section.items.forEach(item => {
          if (item.children) {
            // Group: Filter children based on read/readOwn permission
            const validChildren = item.children.filter(child => hasReadPermission(permissions, isSuperAdmin, child.module));
            
            // If at least one child is accessible, render the group
            if (validChildren.length > 0) {
              validItems.push({ ...item, children: validChildren });
              validChildren.forEach(c => tempRoutes.push(c));
            }
          } else {
            // Single Item: Check permission directly
            if (hasReadPermission(permissions, isSuperAdmin, item.module)) {
              validItems.push(item);
              tempRoutes.push(item);
            }
          }
        });

        if (validItems.length > 0) {
          finalMenu.push({ section: section.section, items: validItems });
        }
      });

      setFilteredMenu(finalMenu.length > 0 ? finalMenu : [MENU_STRUCTURE[0]]);
      setVisibleRoutes(tempRoutes.length > 0 ? tempRoutes : [FLAT_ROUTES[0]]);
    })();
  }, []);

  if (!filteredMenu) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#ef4444" /></View>;
  }

  return (
    <Drawer.Navigator
      initialRouteName={visibleRoutes[0].routeName}
      drawerContent={(props) => <CustomDrawerContent {...props} filteredMenu={filteredMenu} />}
      screenOptions={{
        headerStyle: { 
          backgroundColor: "#ffffff",
          elevation: 2, // Android shadow
          shadowColor: '#000', // iOS shadow
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
        },
        headerTintColor: "#111827",
        headerTitleStyle: { fontWeight: '800', fontSize: 18 },
        headerRight: () => <HeaderRightAvatar />, // Red avatar integrated securely inside the native App Bar
        drawerStyle: { width: 320, backgroundColor: '#ffffff' }
      }}
    >
      {visibleRoutes.map((m) => (
        <Drawer.Screen key={m.routeName} name={m.routeName!} component={m.component!} options={{ title: m.label }} />
      ))}
    </Drawer.Navigator>
  );
}

export default function AppNavigator({ initialRoute }: { initialRoute: string }) {
  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="DrawerRoot" component={DrawerRoot} />
    </Stack.Navigator>
  );
}

// ---------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------
const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4F7F9" },
  drawerContainer: { flex: 1, backgroundColor: '#ffffff' },
  
  // --- Native App Bar Avatar ---
  headerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
  headerAvatarText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  
  // --- Profile Dropdown Modal ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  profileDropdown: { position: 'absolute', top: Platform.OS === 'ios' ? 100 : 60, right: 16, width: 260, backgroundColor: '#ffffff', borderRadius: 16, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  profileDropdownHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dropdownName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  dropdownEmail: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '600' },
  dropdownDivider: { height: 1, backgroundColor: '#E5E7EB', marginBottom: 8 },
  dropdownLogoutBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: '#FEF2F2', borderRadius: 10, marginTop: 8, justifyContent: 'center' },
  dropdownLogoutText: { color: '#ef4444', fontSize: 14, fontWeight: '800', marginLeft: 8 },

  // --- Drawer Branding ---
  logoHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 30, paddingBottom: 24 },
  logoImageContainer: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#fff', shadowColor: '#ef4444', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6, justifyContent: 'center', alignItems: 'center' },
  logoImage: { width: 36, height: 36, borderRadius: 8 },
  logoTextContainer: { marginLeft: 16, flex: 1 },
  logoTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },
  logoSubtitle: { fontSize: 10, color: '#9CA3AF', fontWeight: '800', marginTop: 3, letterSpacing: 0.8 },
  separator: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 20, marginBottom: 16 },
  
  // --- Menu Styling ---
  menuContainer: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionHeaderTitle: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1, marginTop: 20, marginBottom: 10, marginLeft: 12 },
  
  drawerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  drawerItemActive: { backgroundColor: '#FEF2F2' },
  drawerIconBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  drawerIconBoxActive: { backgroundColor: '#ef4444' },
  drawerItemText: { fontSize: 14, fontWeight: '700', color: '#4B5563', flex: 1 },
  drawerItemTextActive: { color: '#ef4444' },
  
  // --- Nested Children ---
  childrenContainer: { marginLeft: 28, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: '#F3F4F6', marginBottom: 8, marginTop: 4 },
  childDrawerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },
  childDrawerItemActive: { backgroundColor: '#F9FAFB' },
  childDrawerItemText: { fontSize: 13, fontWeight: '600', color: '#6B7280', flex: 1 },
  childDrawerItemTextActive: { color: '#ef4444', fontWeight: '800' },
  childActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },

  // --- Clean Footer ---
  footerContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#F9FAFB' },
  footerTextContainer: { flex: 1 },
  footerName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  footerRoleBadge: { backgroundColor: '#E0F2FE', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  footerRole: { fontSize: 10, fontWeight: '800', color: '#0284C7', textTransform: 'uppercase' },
  footerLogoutBtn: { padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#FEE2E2', shadowColor: '#ef4444', shadowOpacity: 0.1, shadowRadius: 4, elevation: 1 },
});