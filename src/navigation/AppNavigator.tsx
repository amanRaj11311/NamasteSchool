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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import ClassHomeworkScreen from "../screens/ClassManagement/HomeworkScreen";
import ClassDiaryScreen from "../screens/ClassManagement/ClassDiary";
import ClassAttendanceScreen from '../screens/ClassManagement/ClassAttendanceScreen';
import ClassExamsScreen from "../screens/ClassManagement/ClassExamScreen";
import ApplyLeaveScreen from '../screens/Leave Management/ApplyLeavesScreen';
import LeaveTypesScreen from '../screens/Leave Management/LeaveTypeScreen';
import LeaveBalancesScreen from '../screens/Leave Management/LeavesBalanceScreen';
import NoticeBoardScreen from '../screens/communicaton/noticeboard';
import ChatScreen from '../screens/communicaton/ChatScreen';
import AcademicSessionsScreen from '../screens/academic sessions/AcademicSessionScreen';
import ClassLevelsScreen from '../screens/academic sessions/ClassLevel';
import PromotionsDashboardScreen from '../screens/academic sessions/StudentPromotion';
import FeesScreen from '../screens/FeeManagementScreen/AssignFeesScreen';
import FeeStructureScreen from '../screens/FeeManagementScreen/FeeStructure';
import PaymentHistoryScreen from '../screens/FeeManagementScreen/PaymentHistory';
import FeeReportsScreen from '../screens/FeeManagementScreen/FeeReport';
import SalaryStructureScreen from '../screens/Salary Management/SalaryStructure';
import AdvancesScreen from '../screens/Salary Management/Advances';
import SalaryReportsScreen from '../screens/Salary Management/PayrollScreen';
import SalaryScreen from '../screens/Salary Management/PayrollScreen';
import ExpensesScreen from '../screens/Expense Management/ExpenseList';
import ExpenseCategoriesScreen from '../screens/Expense Management/ExpenseCategories';
import ExpenseReportsScreen from '../screens/Expense Management/ExpensesReport';
import GalleryEventsScreen from '../screens/GalleryScreen';
import CertificatesScreen from '../screens/Certificate';
import LibraryCatalogScreen from '../screens/Libarary Management/LibraryCatalogScreen';
import LibraryIssueScreen from '../screens/Libarary Management/LibraryIssuesScreen';
import LibraryReturnsScreen from '../screens/Libarary Management/LibraryReportScreen';
import LibraryReportsScreen from '../screens/Libarary Management/LibraryReturnScreen';
import ClassResultsScreen from '../screens/ClassManagement/ResultScreen';
import SchoolLogo from '../assets/logo.png';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

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
          { routeName: "Class Attendance", label: "Attendance", icon: "check-square", component: ClassAttendanceScreen, module: "attendance" },
          { routeName: "Homework", label: "Homework", icon: "edit-3", component: ClassHomeworkScreen, module: "homework" },
          { routeName: "Exams", label: "Exams", icon: "award", component: ClassExamsScreen, module: "exams" },
          { routeName: "Diary", label: "Class Diary", icon: "book-open", component: ClassDiaryScreen, module: "diary" },
          { routeName: "Results", label: "Results", icon: "bar-chart-2", component: ClassResultsScreen, module: "results" },
        ]
      },
      { routeName: "Subjects", label: "Subjects", icon: "book", component: SubjectsScreen, module: "subjects" },
      { routeName: "Students", label: "Students Directory", icon: "users", component: AddStudentScreen, module: "students" },
      {routeName: "Gallery", label: "Gallery & Events", icon: "layers", component: GalleryEventsScreen, module: "classlevels"},
      {routeName: "Certificates", label: "Certificates", icon: "award", component: CertificatesScreen, module: "classlevels"},

      {
        label: "Staff Management", icon: "user-check", module: "staff_group",
        children: [
          { routeName: "Staff", label: "Staff Directory", icon: "users", component: StaffScreen, module: "staff" },
          { routeName: "Staff Attendance", label: "Attendance", icon: "clock", component: AttendanceScreen, module: "attendance" },
          { routeName: "Staff Timetable", label: "Time Table", icon: "calendar", component: TimetableScreen, module: "timetable" },
        ]
      },
      {
        label: "Library Manager", 
        icon: "book", 
        module: "library_group", 
        children: [
          { 
            routeName: "LibraryCatalog", 
            label: "Book Catalog", 
            icon: "list", 
            component: LibraryCatalogScreen, 
            module: "library" 
          },
          { 
            routeName: "LibraryIssue", 
            label: "Issue Book", 
            icon: "external-link", 
            component: LibraryIssueScreen, 
            module: "libraryIssue" 
          },
          { 
            routeName: "LibraryReturns", 
            label: "Returns & Fines", 
            icon: "rotate-ccw", 
            component: LibraryReturnsScreen, 
            module: "libraryIssue" 
          },
          { 
            routeName: "LibraryReports", 
            label: "Analytics & Reports", 
            icon: "pie-chart", 
            component: LibraryReportsScreen, 
            module: "library" 
          }
        ]
      },
      {
        
        label: "Academic & Promotion",
        icon: "compass",
        module: "Academic_group",
        children: [
          {
            routeName: "academic",
            label: "Academic Sessions",
            icon: "calendar",
            component: AcademicSessionsScreen,
            module: "Academic",
          },
          {
            routeName: "class-level-orders",
            label: "Class Level Orders",
            icon: "layers",
            component: ClassLevelsScreen,
            module: "Academic",
          },
          {
            routeName: "student-promotion",
            label: "Student Promotion",
            icon: "arrow-up-circle",
            component: PromotionsDashboardScreen,
            module: "Academic",
          },
          
        ],
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
       
        label: "Financials",
        icon: "dollar-sign",
        module: "finance_group",
        children: [
          {
            label: "Fees Management",
            icon: "credit-card",
            module: "fees",
            children: [
              { routeName: "CollectAssignFees", label: "Collect / Assign Fees", icon: "plus-circle", component: FeesScreen, module: "fees" },
              { routeName: "FeeStructure", label: "Fee Structure", icon: "sliders", component: FeeStructureScreen, module: "fees" },
              { routeName: "PaymentHistory", label: "Payment History", icon: "file-text", component: PaymentHistoryScreen, module: "fees" },
              { routeName: "FeeReports", label: "Fee Reports", icon: "bar-chart-2", component: FeeReportsScreen, module: "fees" },
            ],
          },
          {
            label: "Salary Management",
            
            icon: "trending-up",
            module: "salary",
            children: [
              { routeName: "Payroll", label: "Payroll", icon: "credit-card", component: SalaryScreen, module: "salary" },
              { routeName: "SalaryStructure", label: "Salary Structure", icon: "sliders", component: SalaryStructureScreen, module: "salary" },
              { routeName: "Advances", label: "Advances", icon: "dollar-sign", component: AdvancesScreen, module: "salary" },
              { routeName: "SalaryReports", label: "Salary Reports", icon: "bar-chart-2", component:SalaryReportsScreen, module: "salary" },
            ],
          },
          {
            label: "Expense Management",
            icon: "trending-down",
            module: "expense",
            children: [
              { routeName: "ExpensesList", label: "Expenses List", icon: "clipboard", component: ExpensesScreen, module: "expense" },
              { routeName: "Categories", label: "Categories", icon: "tag", component: ExpenseCategoriesScreen, module: "expense" },
              { routeName: "ExpenseReports", label: "Expense Reports", icon: "bar-chart-2", component: ExpenseReportsScreen, module: "expense" },
            ],
          },
        ],
      },
      
      {
        label: "Communication", icon: "message-square", module: "communication_group",
        children: [
          { routeName: "Notice Board", label: "Notice Board", icon: "volume-2", component: NoticeBoardScreen, module: "communication" },
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

// Flat route list for the Navigator (works at any nesting depth)
const getAllRoutes = (items: MenuItem[]): MenuItem[] => {
  const routes: MenuItem[] = [];

  items.forEach((item) => {
    if (item.children && item.children.length > 0) {
      routes.push(...getAllRoutes(item.children));
    } else if (item.routeName && item.component) {
      routes.push(item);
    }
  });

  return routes;
};

const FLAT_ROUTES: MenuItem[] = MENU_STRUCTURE.flatMap((section) =>
  getAllRoutes(section.items)
);

function hasReadPermission(permissions: Permission[], isSuperAdmin: boolean, module: string): boolean {
  if (isSuperAdmin) return true;
  return permissions.some((p) => p.module === module && (p.action === 'read' || p.action === 'readOwn'));
}


function containsRoute(item: MenuItem, routeName: string): boolean {
  if (item.routeName === routeName) return true;
  if (item.children && item.children.length > 0) {
    return item.children.some((child) => containsRoute(child, routeName));
  }
  return false;
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

const HeaderRightAvatar = () => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userName, setUserName] = useState("User");
  const [userEmail, setUserEmail] = useState("");
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

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
              <View style={[styles.profileDropdown, { top: insets.top + (Platform.OS === 'ios' ? 56 : 52) }]}>
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

function DrawerMenuNode({
  item,
  depth,
  path,
  currentRouteName,
  expandedGroups,
  toggleGroup,
  navigation,
}: {
  item: MenuItem;
  depth: number;
  path: string;
  currentRouteName: string;
  expandedGroups: Record<string, boolean>;
  toggleGroup: (key: string) => void;
  navigation: any;
}) {
  const nodeKey = `${path}/${item.label}`;
  const hasChildren = !!item.children && item.children.length > 0;
  const isActive = containsRoute(item, currentRouteName);

  // --- Leaf route (has routeName + component, no children) ---
  if (!hasChildren) {
    const active = item.routeName === currentRouteName;

    if (depth === 0) {
      return (
        <TouchableOpacity
          style={[styles.drawerItem, active && styles.drawerItemActive]}
          onPress={() => item.routeName && navigation.navigate(item.routeName)}
        >
          <View style={[styles.drawerIconBox, active && styles.drawerIconBoxActive]}>
            <Feather name={item.icon as any} size={16} color={active ? "#ffffff" : "#ef4444"} />
          </View>
          <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>{item.label}</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.childDrawerItem, active && styles.childDrawerItemActive]}
        onPress={() => item.routeName && navigation.navigate(item.routeName)}
      >
        <Feather name={item.icon as any} size={14} color={active ? "#ef4444" : "#9CA3AF"} style={{ marginRight: 12 }} />
        <Text style={[styles.childDrawerItemText, active && styles.childDrawerItemTextActive]}>{item.label}</Text>
        {active && <View style={styles.childActiveDot} />}
      </TouchableOpacity>
    );
  }

  // --- Group node (has children, at any depth) — toggles only ---
  const isExpanded = !!expandedGroups[nodeKey];

  return (
    <View>
      {depth === 0 ? (
        <TouchableOpacity
          style={[styles.drawerItem, isActive && styles.drawerItemActive]}
          onPress={() => toggleGroup(nodeKey)}
        >
          <View style={[styles.drawerIconBox, isActive && styles.drawerIconBoxActive]}>
            <Feather name={item.icon as any} size={16} color={isActive ? "#ffffff" : "#ef4444"} />
          </View>
          <Text style={[styles.drawerItemText, isActive && styles.drawerItemTextActive]}>{item.label}</Text>
          <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={isActive ? "#ef4444" : "#9CA3AF"} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.childDrawerItem, isActive && styles.childDrawerItemActive]}
          onPress={() => toggleGroup(nodeKey)}
        >
          <Feather name={item.icon as any} size={14} color={isActive ? "#ef4444" : "#9CA3AF"} style={{ marginRight: 12 }} />
          <Text style={[styles.childDrawerItemText, isActive && styles.childDrawerItemTextActive, { flex: 1 }]}>{item.label}</Text>
          <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={isActive ? "#ef4444" : "#9CA3AF"} />
        </TouchableOpacity>
      )}

      {isExpanded && (
        <View style={styles.childrenContainer}>
          {item.children!.map((child) => (
            <DrawerMenuNode
              key={child.label}
              item={child}
              depth={depth + 1}
              path={nodeKey}
              currentRouteName={currentRouteName}
              expandedGroups={expandedGroups}
              toggleGroup={toggleGroup}
              navigation={navigation}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function CustomDrawerContent(props: any) {
  const [userName, setUserName] = useState("Loading...");
  const [userRole, setUserRole] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const insets = useSafeAreaInsets();

  const currentRouteName = props.state.routeNames[props.state.index];

  useEffect(() => {
    (async () => {
      const name = await AsyncStorage.getItem("userName");
      const role = await AsyncStorage.getItem("userRole");
      if (name) setUserName(name); 
      if (role) setUserRole(role);

      // Auto-expand every ancestor group (at any depth) that leads to the
      // currently active route — e.g. opening a screen under
      // Financials -> Fees Management now expands BOTH levels, not just one.
      const toExpand: Record<string, boolean> = {};
      const walk = (items: MenuItem[], path: string) => {
        items.forEach((node) => {
          if (node.children && node.children.length > 0) {
            const nodeKey = `${path}/${node.label}`;
            if (containsRoute(node, currentRouteName)) {
              toExpand[nodeKey] = true;
            }
            walk(node.children, nodeKey);
          }
        });
      };
      props.filteredMenu.forEach((section: MenuSection) => walk(section.items, section.section));

      setExpandedGroups((prev) => ({ ...prev, ...toExpand }));
    })();
  }, [currentRouteName, props.filteredMenu]);

  const toggleGroup = (nodeKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
  };

  return (
    <SafeAreaView style={styles.drawerContainer}>
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }} showsVerticalScrollIndicator={false}>
        
        <View style={[styles.logoHeader, { paddingTop: insets.top + 18 }]}>
          <View style={styles.logoImageContainer}>
            <Image source={SchoolLogo} style={styles.logoImage} resizeMode="contain" />
          </View>
          <View style={styles.logoTextContainer}>
            <Text style={styles.logoTitle}>Namaste School</Text>
            <Text style={styles.logoSubtitle}>MANAGEMENT SYSTEM</Text>
          </View>
        </View>

        <View style={styles.separator} />

        {/* Menu Rendering — recursive, any depth */}
        <View style={styles.menuContainer}>
          {props.filteredMenu.map((section: MenuSection) => (
            <View key={section.section}>
              <Text style={styles.sectionHeaderTitle}>{section.section}</Text>

              {section.items.map((item) => (
                <DrawerMenuNode
                  key={item.label}
                  item={item}
                  depth={0}
                  path={section.section}
                  currentRouteName={currentRouteName}
                  expandedGroups={expandedGroups}
                  toggleGroup={toggleGroup}
                  navigation={props.navigation}
                />
              ))}
            </View>
          ))}
        </View>
      </DrawerContentScrollView>

    
      <View style={[styles.footerContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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

function NoModulesAssignedScreen({ navigation }: { navigation: any }) {
  return (
    <SafeAreaView style={styles.noAccessContainer}>
      <View style={styles.noAccessIconCircle}>
        <Feather name="shield-off" size={32} color="#ef4444" />
      </View>
      <Text style={styles.noAccessTitle}>No Modules Assigned</Text>
      <Text style={styles.noAccessMessage}>
        Your account doesn't have access to any modules yet. Please contact
        your school administrator to assign the required permissions to
        your role.
      </Text>
      <TouchableOpacity
        style={styles.noAccessLogoutBtn}
        onPress={() => handleGlobalLogout(navigation)}
      >
        <Feather name="log-out" size={16} color="#ffffff" style={{ marginRight: 8 }} />
        <Text style={styles.noAccessLogoutText}>Logout</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------
// 4. Drawer Root (Evaluates RBAC dynamically)
// ---------------------------------------------------------------------
function DrawerRoot() {
  const navigation = useNavigation<any>();

  // menuLoading distinguishes "still resolving permissions" from
  // "resolved, and it's genuinely empty" — the old code used
  // `!filteredMenu || visibleRoutes.length === 0` for both cases, which is
  // why an empty-permissions user never left the loading spinner.
  const [menuLoading, setMenuLoading] = useState(true);
  const [filteredMenu, setFilteredMenu] = useState<MenuSection[] | null>(null);
  const [visibleRoutes, setVisibleRoutes] = useState<MenuItem[]>([]);

  useEffect(() => {
    const loadMenu = async () => {
      try {
        const [permsRaw, superAdminRaw] = await Promise.all([
          AsyncStorage.getItem("userPermissions"),
          AsyncStorage.getItem("isSuperAdmin"),
        ]);

        let permissions: Permission[] = [];

        try {
          permissions = permsRaw ? JSON.parse(permsRaw) : [];
        } catch (error) {
          console.error("Failed to parse user permissions:", error);
          permissions = [];
        }

        const isSuperAdmin = superAdminRaw === "true";

        const filterMenuItems = (items: MenuItem[]): MenuItem[] => {
          return items
            .map((item) => {
              // If the item has children, recursively filter them
              if (item.children && item.children.length > 0) {
                const validChildren = filterMenuItems(item.children);

                if (validChildren.length === 0) {
                  return null;
                }

                return {
                  ...item,
                  children: validChildren,
                };
              }

              // Only actual screens with routeName + component are valid routes
              if (
                item.routeName &&
                item.component &&
                hasReadPermission(
                  permissions,
                  isSuperAdmin,
                  item.module
                )
              ) {
                return item;
              }

              return null;
            })
            .filter(Boolean) as MenuItem[];
        };

        const finalMenu: MenuSection[] = MENU_STRUCTURE
          .map((section) => {
            const validItems = filterMenuItems(section.items);

            return {
              section: section.section,
              items: validItems,
            };
          })
          .filter((section) => section.items.length > 0);

        // Get only valid leaf routes (works at any nesting depth)
        const getVisibleRoutes = (items: MenuItem[]): MenuItem[] => {
          const routes: MenuItem[] = [];

          items.forEach((item) => {
            if (item.children && item.children.length > 0) {
              routes.push(...getVisibleRoutes(item.children));
            } else if (item.routeName && item.component) {
              routes.push(item);
            }
          });

          return routes;
        };

        const routes = finalMenu.flatMap((section) =>
          getVisibleRoutes(section.items)
        );

        if (routes.length === 0) {
          console.warn("No accessible routes found for this user's permissions");
        }

        setFilteredMenu(finalMenu);
        setVisibleRoutes(routes);
      } catch (error) {
        console.error("Error loading navigation menu:", error);
        setFilteredMenu([]);
        setVisibleRoutes([]);
      } finally {
        // Always stop "loading" once resolution finishes — whether or not
        // any routes came out of it. An empty result is a valid, final
        // state, not a reason to keep spinning.
        setMenuLoading(false);
      }
    };

    loadMenu();
  }, []);

  if (menuLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={{ marginTop: 12, color: "#6B7280" }}>
          Loading accessible modules...
        </Text>
      </View>
    );
  }

  if (!filteredMenu || visibleRoutes.length === 0) {
    return <NoModulesAssignedScreen navigation={navigation} />;
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

  // --- No modules assigned ---
  noAccessContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4F7F9", paddingHorizontal: 32 },
  noAccessIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#FEE2E2", justifyContent: "center", alignItems: "center", marginBottom: 20 },
  noAccessTitle: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 10, textAlign: "center" },
  noAccessMessage: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 21, marginBottom: 28 },
  noAccessLogoutBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#ef4444", paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },
  noAccessLogoutText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  
  // --- Native App Bar Avatar ---
  headerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
  headerAvatarText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  
  // --- Profile Dropdown Modal ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  profileDropdown: { position: 'absolute', right: 16, width: 260, backgroundColor: '#ffffff', borderRadius: 16, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  profileDropdownHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dropdownName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  dropdownEmail: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '600' },
  dropdownDivider: { height: 1, backgroundColor: '#E5E7EB', marginBottom: 8 },
  dropdownLogoutBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: '#FEF2F2', borderRadius: 10, marginTop: 8, justifyContent: 'center' },
  dropdownLogoutText: { color: '#ef4444', fontSize: 14, fontWeight: '800', marginLeft: 8 },

  // --- Drawer Styling ---
  logoHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 24 },
  logoImageContainer: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#fff', shadowColor: '#ef4444', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  logoImage: { width: 36, height: 36, borderRadius: 8 },
  logoTextContainer: { marginLeft: 16, flex: 1 },
  logoTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },
  logoSubtitle: { fontSize: 10, color: '#9CA3AF', fontWeight: '800', marginTop: 3, letterSpacing: 0.8 },
  separator: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 20, marginBottom: 16 },
  
  // --- Menu Styling ---
  menuContainer: { paddingHorizontal: 16, paddingBottom: 40 },
sectionHeaderTitle: {
  fontSize: 10,
  fontWeight: '800',
  color: '#9CA3AF',
  letterSpacing: 1,
  marginTop: 8, // 20 se kam
  marginBottom: 10,
  marginLeft: 12,
},  
  drawerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  drawerItemActive: { backgroundColor: '#FEF2F2' },
  drawerIconBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  drawerIconBoxActive: { backgroundColor: '#ef4444' },
  drawerItemText: { fontSize: 14, fontWeight: '700', color: '#4B5563', flex: 1 },
  drawerItemTextActive: { color: '#ef4444' },
  
  childrenContainer: { marginLeft: 28, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: '#F3F4F6', marginBottom: 8, marginTop: 4 },
  childDrawerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },
  childDrawerItemActive: { backgroundColor: '#F9FAFB' },
  childDrawerItemText: { fontSize: 13, fontWeight: '600', color: '#6B7280', flex: 1 },
  childDrawerItemTextActive: { color: '#ef4444', fontWeight: '800' },
  childActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },

  
footerContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 16, // 20 → 16
  paddingTop: 16,
  borderTopWidth: 1,
  marginLeft:24,
  borderTopColor: '#F3F4F6',
  backgroundColor: '#F9FAFB',
},  footerTextContainer: { flex: 1 },
  footerName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  footerRoleBadge: { backgroundColor: '#E0F2FE', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  footerRole: { fontSize: 10, fontWeight: '800', color: '#ef4444', textTransform: 'uppercase' },
  footerLogoutBtn: { padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#FEE2E2', shadowColor: '#ef4444', shadowOpacity: 0.1, shadowRadius: 4, elevation: 1 },
});