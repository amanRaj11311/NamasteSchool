import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
  Platform,
  StatusBar,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import axios from "axios";
import { API_BASE } from "../network/api";

const HEADER_DISPLAY_MODE: 'TITLE' | 'PILLS' = 'TITLE';
const DRAWER_MAX_HEIGHT_RATIO = 0.82;
const DRAWER_CHROME_HEIGHT = 150;


import LoginScreen from "../authentication/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import DashboardScreen from "../screens/DashboardScreen"
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
import ClassResultsScreen from '../screens/ClassManagement/ResultScreen';
import ApplyLeaveScreen from '../screens/Leave Management/ApplyLeavesScreen';
import LeaveTypesScreen from '../screens/Leave Management/LeaveTypeScreen';
import LeaveBalancesScreen from '../screens/Leave Management/LeavesBalanceScreen';
import NoticeBoardScreen from '../screens/communicaton/noticeboard';
import ChatScreen from '../screens/communicaton/ChatScreen';
import AcademicSessionsScreen from '../screens/academic sessions/AcademicSessionScreen';
import ClassLevelsScreen from '../screens/academic sessions/ClassLevel';
import PromotionHistoryScreen from '../screens/academic sessions/PromotionHistoryScreen';
import HolidaysAdminScreen from '../screens/academic sessions/HolidaysAdminScreen';
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
import EnquiriesScreen from '../screens/Admission Crm/EnquiriesScreen';
import EnquiryFunnelReportScreen from '../screens/Admission Crm/EnquiriesReportScreen';
import MarketplaceCatalogScreen from '../screens/Marketplace/MarketplaceCatalogScreen';
import MarketplaceSellersScreen from '../screens/Marketplace/MarketplaceSellersScreen';
import MarketplaceContactLogsScreen from '../screens/Marketplace/MarketplaceContactLogsScreen';

// Student / Parent portal screens
import StudentAttendanceScreen from '../screens/student Screen/StudentAttendanceScreen';
import StudentHolidaysScreen from '../screens/student Screen/StudentHolidaysScreen';
import StudentNoticesScreen from '../screens/student Screen/StudentNoticesScreen';
import StudentResultsScreen from '../screens/student Screen/StudentResultsScreen';
import StudentHomeworkScreen from '../screens/student Screen/StudentHomeworkScreen';
import StudentLeaveScreen from '../screens/student Screen/StudentLeaveScreen';
import StudentFeesScreen from '../screens/student Screen/StudentFeesScreen';

// Library Imports 
import LibraryCatalogScreen from '../screens/Libarary Management/LibraryCatalogScreen';
import LibraryIssueScreen from '../screens/Libarary Management/LibraryIssuesScreen';
import LibraryReturnsScreen from '../screens/Libarary Management/LibraryReturnScreen';
import LibraryReportsScreen from '../screens/Libarary Management/LibraryReportScreen';

// Hostel Imports
import HostelBlocksRoomsScreen from '../screens/Hostel Management/HostelBlocksRoomsScreen';
import HostelAllocationScreen from '../screens/Hostel Management/HostelAllocationScreen';
import HostelReportsScreen from '../screens/Hostel Management/HostelReportsScreen';

import SchoolLogo from '../assets/logo.png';

// Outer stack: Login -> the app shell. Inner ("content") stack: the actual
// module screens. Keeping these separate is what lets the drawer live
// outside react-navigation's own Drawer.Navigator.
const Stack = createNativeStackNavigator();
const ContentStack = createNativeStackNavigator();

type Permission = { module: string; action: string };
type MenuItem = {
  routeName?: string;
  label: string;
  icon: string;
  component?: React.ComponentType<any>;
  module?: string;
  children?: MenuItem[];
  alwaysShow?: boolean;
  superAdminOnly?: boolean;
};
type MenuSection = { section: string; items: MenuItem[] };
type SchoolLite = { _id: string; name: string; code?: string };
type UserMode = 'admin' | 'student' | 'parent';


const ADMIN_MENU: MenuSection[] = [
  {
    section: "Overview",
    items: [
      { routeName: "Home", label: "Home", icon: "home", component: HomeScreen, module: "dashboard", alwaysShow: true },
      { routeName: "Dashboard", label: "Dashboard", icon: "grid", component: DashboardScreen, module: "dashboard", alwaysShow: true },
    ],
  },
  {
    section: "Management",
    items: [
      { routeName: "Schools", label: "School Branches", icon: "git-branch", component: SchoolsScreen, module: "schools" },
      {
        label: "Classes Manager", icon: "monitor", module: "classes",
        children: [
          { routeName: "Classes", label: "Classes", icon: "layers", component: ClassesScreen, module: "classes" },
          { routeName: "Class Timetable", label: "Class Timetable", icon: "calendar", component: ClassTimetableScreen, module: "timetable" },
          { routeName: "Class Attendance", label: "Class Attendance", icon: "check-square", component: ClassAttendanceScreen, module: "attendance" },
          { routeName: "Class Exams", label: "Class Exams", icon: "edit-2", component: ClassExamsScreen, module: "exams" },
          { routeName: "Class Results", label: "Class Results", icon: "bar-chart-2", component: ClassResultsScreen, module: "results" },
          { routeName: "Class Diary", label: "Class Diary", icon: "book-open", component: ClassDiaryScreen, module: "diary" },
          { routeName: "Homework", label: "Homework", icon: "edit-3", component: ClassHomeworkScreen, module: "homework" },
        ],
      },
      { routeName: "Subjects", label: "Add Subject", icon: "book", component: SubjectsScreen, module: "subjects" },
      {
        label: "Staff Management", icon: "user-check", module: "staff",
        children: [
          { routeName: "Staff", label: "Add Staff", icon: "user-plus", component: StaffScreen, module: "staff" },
          { routeName: "StaffAttendance", label: "Attendance", icon: "clock", component: AttendanceScreen, module: "attendance" },
          { routeName: "StaffTimetable", label: "Time Table", icon: "calendar", component: TimetableScreen, module: "timetable" },
        ],
      },
      { routeName: "Students", label: "Add Student", icon: "users", component: AddStudentScreen, module: "students" },
      {
        label: "Academic & Promotion", icon: "compass", module: "promotions",
        children: [
          { routeName: "AcademicSessions", label: "Academic Sessions", icon: "calendar", component: AcademicSessionsScreen, module: "academicYears", alwaysShow: true },
          { routeName: "ClassLevels", label: "Class Levels Order", icon: "layers", component: ClassLevelsScreen, module: "classLevels", alwaysShow: true },
          { routeName: "StudentPromotion", label: "Student Promotion", icon: "arrow-up-circle", component: PromotionsDashboardScreen, module: "promotions", alwaysShow: true },
          { routeName: "PromotionHistory", label: "Promotion History", icon: "clock", component: PromotionHistoryScreen, module: "promotions", alwaysShow: true },
          { routeName: "HolidaysManager", label: "Holidays Manager", icon: "sun", component: HolidaysAdminScreen, module: "holidays", alwaysShow: true },
        ],
      },
      {
        label: "Leave Management", icon: "briefcase", module: "leave",
        children: [
          { routeName: "Leaves", label: "Apply / My Leaves", icon: "file-minus", component: ApplyLeaveScreen, module: "leave" },
          { routeName: "LeaveTypes", label: "Leave Types", icon: "list", component: LeaveTypesScreen, module: "leaveType" },
          { routeName: "LeaveBalances", label: "Leave Balances", icon: "pie-chart", component: LeaveBalancesScreen, module: "leaveBalance" },
        ],
      },
      {
        label: "Fees Management", icon: "credit-card", module: "fees",
        children: [
          { routeName: "CollectAssignFees", label: "Collect / Assign Fees", icon: "plus-circle", component: FeesScreen, module: "fees" },
          { routeName: "FeeStructure", label: "Fee Structure", icon: "sliders", component: FeeStructureScreen, module: "feeStructure" },
          { routeName: "PaymentHistory", label: "Payment History", icon: "file-text", component: PaymentHistoryScreen, module: "fees" },
          { routeName: "FeeReports", label: "Fee Reports", icon: "bar-chart-2", component: FeeReportsScreen, module: "fees" },
        ],
      },
      {
        label: "Salary Management", icon: "trending-up", module: "salary",
        children: [
          { routeName: "Payroll", label: "Payroll", icon: "credit-card", component: SalaryScreen, module: "salary" },
          { routeName: "SalaryStructure", label: "Salary Structure", icon: "sliders", component: SalaryStructureScreen, module: "salaryStructure" },
          { routeName: "Advances", label: "Advances", icon: "dollar-sign", component: AdvancesScreen, module: "salaryAdvance" },
          { routeName: "SalaryReports", label: "Salary Reports", icon: "bar-chart-2", component: SalaryReportsScreen, module: "salary" },
        ],
      },
      {
        label: "Expense Management", icon: "trending-down", module: "expense",
        children: [
          { routeName: "ExpensesList", label: "Expenses List", icon: "clipboard", component: ExpensesScreen, module: "expense" },
          { routeName: "ExpenseCategories", label: "Categories", icon: "tag", component: ExpenseCategoriesScreen, module: "expenseCategory" },
          { routeName: "ExpenseReports", label: "Expense Reports", icon: "bar-chart-2", component: ExpenseReportsScreen, module: "expense" },
        ],
      },
      { routeName: "Certificates", label: "Certificates & ID Cards", icon: "award", component: CertificatesScreen, module: "certificates" },
      {
        label: "Hostel Management", icon: "home", module: "hostel",
        children: [
          { routeName: "HostelBlocksRooms", label: "Blocks & Rooms", icon: "box", component: HostelBlocksRoomsScreen, module: "hostel" },
          { routeName: "HostelAllocation", label: "Room Allocation", icon: "log-in", component: HostelAllocationScreen, module: "hostel" },
          { routeName: "HostelReports", label: "Hostel Reports", icon: "pie-chart", component: HostelReportsScreen, module: "hostel" },
        ],
      },
      {
        label: "Library Management", icon: "book", module: "library",
        children: [
          { routeName: "LibraryCatalog", label: "Book Catalog", icon: "list", component: LibraryCatalogScreen, module: "library" },
          { routeName: "LibraryIssue", label: "Issue Book", icon: "external-link", component: LibraryIssueScreen, module: "libraryIssue" },
          { routeName: "LibraryReturns", label: "Returns & Fines", icon: "rotate-ccw", component: LibraryReturnsScreen, module: "libraryIssue" },
          { routeName: "LibraryReports", label: "Library Reports", icon: "pie-chart", component: LibraryReportsScreen, module: "library" },
        ],
      },
      {
        label: "Admission CRM", icon: "message-circle", module: "enquiry",
        children: [
          { routeName: "Enquiries", label: "Enquiries Pipeline", icon: "user-plus", component: EnquiriesScreen, module: "enquiry" },
          { routeName: "EnquiryFunnelReport", label: "Funnel Analytics", icon: "pie-chart", component: EnquiryFunnelReportScreen, module: "enquiry" },
        ],
      },
      { routeName: "Gallery", label: "Gallery & Events", icon: "image", component: GalleryEventsScreen, module: "gallery" },
      {
        label: "Marketplace", icon: "shopping-bag", module: "marketplace", alwaysShow: true,
        children: [
          { routeName: "MarketplaceCatalog", label: "Catalog", icon: "shopping-bag", component: MarketplaceCatalogScreen, module: "marketplace", alwaysShow: true },
          { routeName: "MarketplaceSellers", label: "Sellers", icon: "briefcase", component: MarketplaceSellersScreen, superAdminOnly: true },
          { routeName: "MarketplaceContactLogs", label: "Contact Logs", icon: "clipboard", component: MarketplaceContactLogsScreen, superAdminOnly: true },
        ],
      },
      {
        label: "Communication", icon: "message-square", module: "communication",
        children: [
          { routeName: "NoticeBoard", label: "Notice Board", icon: "volume-2", component: NoticeBoardScreen, module: "communication" },
          { routeName: "Chat", label: "Chat / Messages", icon: "message-circle", component: ChatScreen, module: "communication", alwaysShow: true },
        ],
      },
      {
        label: "Roles & Permissions", icon: "shield",
        children: [
          { routeName: "Roles", label: "Roles", icon: "users", component: RolesScreen, module: "roles" },
          { routeName: "Permissions", label: "Permissions", icon: "key", component: PermissionsScreen, module: "permissions" },
        ],
      },
    ],
  },
  {
    section: "System",
    items: [
      { routeName: "Settings", label: "Settings", icon: "settings", component: SettingsScreen, module: "settings" },
    ],
  },
];

const C = {
  bg: '#F6F6F9',
  surface: '#FFFFFF',
  surfaceSoft: '#FBFBFD',
  surfaceSunken: '#F1F2F6',
  border: '#E8E9EF',
  borderStrong: '#DBDDE6',
  text: '#14161F',
  textMuted: '#6B7280',
  textFaint: '#9AA0AC',
  primary: '#B3122A',
  primaryBright: '#D2263F',
  primaryDeep: '#7A0C1D',
  primarySoft: '#FBEEEF',
  primaryTint: '#F3D6D9',
  ink: '#0D0F16',
  inkSoft: '#181B24',
  gold: '#C7A466',
  overlay: 'rgba(13,15,22,0.55)',
};

const BRAND_GRADIENT = [C.primary, C.primaryDeep];

// Web: STUDENT_NAV_SECTIONS
const STUDENT_MENU: MenuSection[] = [
  {
    section: "Overview",
    items: [
      { routeName: "Home", label: "Home", icon: "home", component: HomeScreen, alwaysShow: true },
      { routeName: "Dashboard", label: "Dashboard", icon: "grid", component: DashboardScreen, alwaysShow: true },
    ],
  },
  {
    section: "Academic Portal",
    items: [
      { routeName: "StudentAttendance", label: "My Attendance", icon: "check-square", component: StudentAttendanceScreen, alwaysShow: true },
      { routeName: "StudentHolidays", label: "Upcoming Holidays", icon: "sun", component: StudentHolidaysScreen, alwaysShow: true },
      { routeName: "StudentResults", label: "My Results", icon: "bar-chart-2", component: StudentResultsScreen, alwaysShow: true },
      { routeName: "StudentLeave", label: "Apply Leave", icon: "file-minus", component: StudentLeaveScreen, alwaysShow: true },
      { routeName: "StudentNotices", label: "Noticeboard", icon: "volume-2", component: StudentNoticesScreen, alwaysShow: true },
      { routeName: "StudentHomework", label: "Homework", icon: "edit-3", component: StudentHomeworkScreen, alwaysShow: true },
      { routeName: "ClassTimetable", label: "Class Timetable", icon: "calendar", component: ClassTimetableScreen, alwaysShow: true },
      { routeName: "StudentFees", label: "Fee Payments & Dues", icon: "credit-card", component: StudentFeesScreen, alwaysShow: true },
    ],
  },
];

// Web: PARENT_NAV_SECTIONS
const PARENT_MENU: MenuSection[] = [
  {
    section: "Overview",
    items: [
      { routeName: "Home", label: "Home", icon: "home", component: HomeScreen, alwaysShow: true },
      { routeName: "Dashboard", label: "Dashboard", icon: "grid", component: DashboardScreen, alwaysShow: true },
    ],
  },
  {
    section: "Parent Portal",
    items: [
      { routeName: "StudentAttendance", label: "Student Attendance", icon: "check-square", component: StudentAttendanceScreen, alwaysShow: true },
      { routeName: "StudentHolidays", label: "Upcoming Holidays", icon: "sun", component: StudentHolidaysScreen, alwaysShow: true },
      { routeName: "StudentResults", label: "Exam Results", icon: "bar-chart-2", component: StudentResultsScreen, alwaysShow: true },
      { routeName: "StudentLeave", label: "Apply Leave", icon: "file-minus", component: StudentLeaveScreen, alwaysShow: true },
      { routeName: "StudentNotices", label: "Noticeboard", icon: "volume-2", component: StudentNoticesScreen, alwaysShow: true },
      { routeName: "StudentHomework", label: "Homework", icon: "edit-3", component: StudentHomeworkScreen, alwaysShow: true },
      { routeName: "ClassTimetable", label: "Class Timetable", icon: "calendar", component: ClassTimetableScreen, alwaysShow: true },
      { routeName: "StudentFees", label: "Fees & Payment", icon: "credit-card", component: StudentFeesScreen, alwaysShow: true },
    ],
  },
];
const norm = (v?: string) => (v || '').toString().trim().toLowerCase();

const hasPermission = (perms: Permission[], isSuperAdmin: boolean, module?: string, action: string = 'read'): boolean => {
  if (isSuperAdmin) return true;
  if (!module) return false;
  const m = norm(module);
  return perms.some((p) => {
    if (norm(p.module) !== m) return false;
    const a = norm(p.action);
    if (a === norm(action)) return true;
    if (a === 'manage' || a === '*' || a === 'all') return true;
    if (norm(action) === 'read' && (a === 'readown' || a === 'readall' || a === 'view')) return true;
    return false;
  });
};

const hasModuleAccess = (perms: Permission[], isSuperAdmin: boolean, module?: string): boolean => {
  if (isSuperAdmin) return true;
  if (!module) return false;
  return perms.some((p) => norm(p.module) === norm(module));
};

const isAllowed = (perms: Permission[], isSuperAdmin: boolean, module?: string) =>
  hasPermission(perms, isSuperAdmin, module, 'read') || hasModuleAccess(perms, isSuperAdmin, module);


const filterMenuItems = (items: MenuItem[], perms: Permission[], isSuperAdmin: boolean, parentModule?: string): MenuItem[] => {
  return items
    .map((item) => {
      if (item.superAdminOnly && !isSuperAdmin) return null;

      const effectiveModule = item.module || parentModule;

      if (item.children && item.children.length > 0) {
        const visibleChildren = filterMenuItems(item.children, perms, isSuperAdmin, effectiveModule);
        if (visibleChildren.length === 0) return null;
        return { ...item, children: visibleChildren };
      }

      if (!item.routeName || !item.component) return null;
      if (item.alwaysShow || isSuperAdmin) return applyLabelOverrides(item, perms, isSuperAdmin);
      if (!isAllowed(perms, isSuperAdmin, effectiveModule)) return null;

      return applyLabelOverrides(item, perms, isSuperAdmin);
    })
    .filter(Boolean) as MenuItem[];
};

// Web parity: staff list without create rights is labelled "Staff Directory"
const applyLabelOverrides = (item: MenuItem, perms: Permission[], isSuperAdmin: boolean): MenuItem => {
  if (item.routeName === 'Staff' && !hasPermission(perms, isSuperAdmin, 'staff', 'create')) {
    return { ...item, label: 'Staff Directory' };
  }
  return item;
};

const getMenuForMode = (mode: UserMode): MenuSection[] => {
  if (mode === 'student') return STUDENT_MENU;
  if (mode === 'parent') return PARENT_MENU;
  return ADMIN_MENU;
};

const ASSET_BASE = API_BASE.replace(/\/api\/?$/, '');

export const resolveAssetUrl = (path?: string | null): string | null => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${ASSET_BASE}${path.startsWith('/') ? path : `/${path}`}`;
};

type SchoolContextType = {
  isSuperAdmin: boolean;
  schoolName: string;
  sessionName: string;
  schools: SchoolLite[];
  selectedSchoolId: string;
  loadingSchools: boolean;
  loadingSession: boolean;
  pickerVisible: boolean;
  openPicker: () => void;
  closePicker: () => void;
  selectSchool: (school: SchoolLite) => void;
  refreshSession: () => void;
  // Global school identity / branding (name, tagline, logo)
  brandName: string;
  brandTagline: string;
  brandLogoUrl: string | null;
  loadingBranding: boolean;
  refreshBranding: () => void;
};

export const SchoolContext = createContext<SchoolContextType>({
  isSuperAdmin: false, schoolName: '', sessionName: '', schools: [], selectedSchoolId: '',
  loadingSchools: false, loadingSession: false, pickerVisible: false,
  openPicker: () => { }, closePicker: () => { }, selectSchool: () => { }, refreshSession: () => { },
  brandName: '', brandTagline: '', brandLogoUrl: null, loadingBranding: false, refreshBranding: () => { },
});

export const useSchoolContext = () => useContext(SchoolContext);

const HeaderLayoutContext = createContext<{ headerBottom: number; reportHeaderBottom: (y: number) => void }>({
  headerBottom: 0, reportHeaderBottom: () => { },
});
const useHeaderLayout = () => useContext(HeaderLayoutContext);

function HeaderLayoutProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const androidStatusBarFallback = StatusBar.currentHeight ?? 0;
  const topInsetFallback = insets.top > 0 ? insets.top : androidStatusBarFallback;
  const platformHeaderFallback = Platform.select({ ios: 44, android: 56, default: 56 });
  const [headerBottom, setHeaderBottom] = useState(topInsetFallback + platformHeaderFallback);

  const reportHeaderBottom = useCallback((y: number) => {
    setHeaderBottom((prev) => (Math.abs(prev - y) > 0.5 ? y : prev));
  }, []);

  return (
    <HeaderLayoutContext.Provider value={{ headerBottom, reportHeaderBottom }}>
      {children}
    </HeaderLayoutContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  APP MENU (permission-filtered navigation model, shared)           */
/* ------------------------------------------------------------------ */

type AppMenuContextType = {
  loading: boolean;
  filteredMenu: MenuSection[];
  visibleRoutes: MenuItem[];
  mode: UserMode;
  profileName: string;
  profileSubtitle: string;
};

const AppMenuContext = createContext<AppMenuContextType>({
  loading: true, filteredMenu: [], visibleRoutes: [], mode: 'admin', profileName: '', profileSubtitle: '',
});
const useAppMenu = () => useContext(AppMenuContext);

function AppMenuProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [filteredMenu, setFilteredMenu] = useState<MenuSection[]>([]);
  const [visibleRoutes, setVisibleRoutes] = useState<MenuItem[]>([]);
  const [mode, setMode] = useState<UserMode>('admin');
  const [profileName, setProfileName] = useState('');
  const [profileSubtitle, setProfileSubtitle] = useState('');

  useEffect(() => {
    const loadMenu = async () => {
      try {
        const [permsRaw, superAdminRaw, userTypeRaw, userRoleRaw, userRaw, userNameRaw] = await Promise.all([
          AsyncStorage.getItem("userPermissions"),
          AsyncStorage.getItem("isSuperAdmin"),
          AsyncStorage.getItem("userType"),
          AsyncStorage.getItem("userRole"),
          AsyncStorage.getItem("user"),
          AsyncStorage.getItem("userName"),
        ]);

        let permissions: Permission[] = [];
        try { permissions = permsRaw ? JSON.parse(permsRaw) : []; } catch { permissions = []; }
        if (!Array.isArray(permissions)) permissions = [];

        let parsedUser: any = null;
        try { parsedUser = userRaw ? JSON.parse(userRaw) : null; } catch { }

        const isSuperAdmin = superAdminRaw === "true" || parsedUser?.isSuperAdmin === true;

        const typeVal = norm(userTypeRaw || parsedUser?.userType);
        const roleVal = norm(userRoleRaw || parsedUser?.role || parsedUser?.roleId?.name);

        let currentMode: UserMode = 'admin';
        if (typeVal === 'student' || roleVal === 'student') currentMode = 'student';
        else if (typeVal === 'parent' || roleVal === 'parent' || roleVal === 'guardian') currentMode = 'parent';
        setMode(currentMode);

        if (currentMode === 'student') {
          const student = parsedUser?.student;
          const name = student?.firstName
            ? `${student.firstName} ${student.lastName || ''}`.trim()
            : (userNameRaw || parsedUser?.name || 'Student');
          setProfileName(name);
          setProfileSubtitle(student?.admissionNumber || 'Student Portal');
        } else if (currentMode === 'parent') {
          setProfileName(userNameRaw || parsedUser?.name || 'Parent / Guardian');
          const childCount = parsedUser?.parent?.children?.length || 0;
          const primaryChild = parsedUser?.parent?.primaryStudent || parsedUser?.student;
          setProfileSubtitle(
            childCount > 1 ? `${childCount} Children`
              : primaryChild?.name ? primaryChild.name
                : 'Parent Portal'
          );
        }

        const baseMenu = getMenuForMode(currentMode);

        const finalMenu: MenuSection[] = baseMenu
          .map((section) => ({
            section: section.section,
            items: filterMenuItems(section.items, permissions, isSuperAdmin),
          }))
          .filter((section) => section.items.length > 0);

        const collectRoutes = (items: MenuItem[]): MenuItem[] => {
          const routes: MenuItem[] = [];
          items.forEach((item) => {
            if (item.children && item.children.length > 0) routes.push(...collectRoutes(item.children));
            else if (item.routeName && item.component) routes.push(item);
          });
          return routes;
        };

        const seen = new Set<string>();
        const routes = finalMenu
          .flatMap((section) => collectRoutes(section.items))
          .filter((r) => {
            if (seen.has(r.routeName!)) return false;
            seen.add(r.routeName!);
            return true;
          });

        setFilteredMenu(finalMenu);
        setVisibleRoutes(routes);
      } catch (error) {
        setFilteredMenu([]);
        setVisibleRoutes([]);
      } finally {
        setLoading(false);
      }
    };

    loadMenu();
  }, []);

  return (
    <AppMenuContext.Provider value={{ loading, filteredMenu, visibleRoutes, mode, profileName, profileSubtitle }}>
      {children}
    </AppMenuContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  DRAWER VISIBILITY + CROSS-NAVIGATOR NAV HANDLE                     */
/* ------------------------------------------------------------------ */

const DrawerVisibilityContext = createContext<{ visible: boolean; open: () => void; close: () => void }>({
  visible: false, open: () => { }, close: () => { },
});
const useDrawerVisibility = () => useContext(DrawerVisibilityContext);

function DrawerVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  return (
    <DrawerVisibilityContext.Provider value={{ visible, open, close }}>
      {children}
    </DrawerVisibilityContext.Provider>
  );
}

type AppNavContextType = {
  activeRoute: string;
  setActiveRoute: (r: string) => void;
  contentNavigationRef: React.MutableRefObject<any>;
  outerNavigation: any;
};
const AppNavContext = createContext<AppNavContextType>({
  activeRoute: '', setActiveRoute: () => { }, contentNavigationRef: { current: null }, outerNavigation: null,
});
const useAppNav = () => useContext(AppNavContext);

function AppNavProvider({ outerNavigation, children }: { outerNavigation: any; children: React.ReactNode }) {
  const [activeRoute, setActiveRoute] = useState('');
  const contentNavigationRef = useRef<any>(null);
  return (
    <AppNavContext.Provider value={{ activeRoute, setActiveRoute, contentNavigationRef, outerNavigation }}>
      {children}
    </AppNavContext.Provider>
  );
}
// Must match the keys used in LoginScreen.tsx
const SAVED_LOGIN_ENABLED = "savedLoginEnabled";
const SAVED_LOGIN_EMAIL = "savedLoginEmail";
const SAVED_LOGIN_PASSWORD = "savedLoginPassword";
const LOGIN_SAVE_ASKED_EMAIL = "loginSaveAskedEmail";

const SESSION_KEYS = [
  "userToken", "userId", "employeeId", "userName", "userEmail", "userRole",
  "isSuperAdmin", "userSchoolId", "userSchoolName", "userPermissions",
  "keepLoggedIn", "userDesignation", "userDepartment", "userDoj",
  "userBankAcc", "userBankName", "userBankIfsc", "userAvatar",
  "school", "selectedSchoolId", "userType",
];

const removeSavedLoginDetails = async () => {
  await Promise.all(
    [SAVED_LOGIN_ENABLED, SAVED_LOGIN_EMAIL, SAVED_LOGIN_PASSWORD].map((key) =>
      AsyncStorage.removeItem(key)
    )
  );
  await AsyncStorage.removeItem(LOGIN_SAVE_ASKED_EMAIL);
};
const navigateToLogin = (navigation: any) => {
  if (!navigation) {
    console.log("[navigateToLogin] navigation prop is undefined/null");
    return;
  }

  let root = navigation;
  let depth = 0;
  while (typeof root.getParent === "function" && root.getParent()) {
    root = root.getParent();
    depth++;
    if (depth > 10) break; // safety guard against an infinite loop
  }

  console.log("[navigateToLogin] root navigator keys:", Object.keys(root));
  console.log("[navigateToLogin] typeof root.reset:", typeof root.reset);

  if (typeof root.reset !== "function") {
    console.log("[navigateToLogin] root has no reset() — aborting");
    return;
  }

  root.reset({ index: 0, routes: [{ name: "Login" }] });
};

const performLogout = async (navigation: any) => {
  try {
    await Promise.all(SESSION_KEYS.map((key) => AsyncStorage.removeItem(key)));
    navigateToLogin(navigation);
  } catch (err: any) {
    Alert.alert("Logout failed", String(err?.message || err));
  }
};

const handleGlobalLogout = async (navigation: any) => {
  const savedEnabled = await AsyncStorage.getItem(SAVED_LOGIN_ENABLED);
  const savedExists = savedEnabled === "true";

  if (!savedExists) {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: () => performLogout(navigation) },
    ]);
    return;
  }

  Alert.alert(
    "Logout",
    "You have saved login details on this device. Keep them for next time, or remove them now?",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove Details",
        style: "destructive",
        onPress: async () => {
          await removeSavedLoginDetails();
          await performLogout(navigation);
        },
      },
      {
        text: "Keep Details",
        onPress: async () => {
          await performLogout(navigation);
        },
      },
    ]
  );
};

function SchoolProvider({ children }: { children: React.ReactNode }) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [schools, setSchools] = useState<SchoolLite[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const [brandName, setBrandName] = useState('');
  const [brandTagline, setBrandTagline] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [loadingBranding, setLoadingBranding] = useState(false);

  const fetchActiveSession = useCallback(async (token: string | null, schoolId?: string) => {
    try {
      setLoadingSession(true);
      const res = await axios.get(`${API_BASE}/academic-years`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) {
        const list = res.data.data || [];
        const scoped = schoolId ? list.filter((s: any) => (typeof s.schoolId === 'object' ? s.schoolId?._id : s.schoolId) === schoolId) : list;
        const active = scoped.find((s: any) => s.isActive) || scoped[0];
        setSessionName(active?.name || '');
      }
    } catch (error) { setSessionName(''); }
    finally { setLoadingSession(false); }
  }, []);

  const fetchBranding = useCallback(async (token: string | null) => {
    try {
      setLoadingBranding(true);
      const res = await axios.get(`${API_BASE}/settings`, { headers: { Authorization: `Bearer ${token}` } });
      const data = res.data?.data;
      if (data) {
        setBrandName(data.schoolName || '');
        setBrandTagline(data.tagline || '');
        setBrandLogoUrl(data.logoUrl || null);
        const resolvedUri = resolveAssetUrl(data.logoUrl);
        if (resolvedUri) {
          Image.prefetch(resolvedUri).catch(() => { });
        }
      }
    } catch (error) {
    } finally {
      setLoadingBranding(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [schoolRaw, superAdminRaw, token, savedSchoolId] = await Promise.all([
          AsyncStorage.getItem('school'), AsyncStorage.getItem('isSuperAdmin'),
          AsyncStorage.getItem('userToken'), AsyncStorage.getItem('selectedSchoolId'),
        ]);

        fetchBranding(token);

        const superAdmin = superAdminRaw === 'true';
        setIsSuperAdmin(superAdmin);

        if (!superAdmin) {
          let parsedSchool: any = null;
          try { parsedSchool = schoolRaw ? JSON.parse(schoolRaw) : null; } catch { }
          if (parsedSchool?.name) {
            setSchoolName(parsedSchool.name);
            setSelectedSchoolId(parsedSchool._id || '');
            fetchActiveSession(token, parsedSchool._id);
          }
          return;
        }

        setLoadingSchools(true);
        const res = await axios.get(`${API_BASE}/schools`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.data?.success) {
          const list: SchoolLite[] = (res.data.data || []).map((s: any) => ({ _id: s._id, name: s.name, code: s.code }));
          setSchools(list);
          const initialId = savedSchoolId && list.some((s) => s._id === savedSchoolId) ? savedSchoolId : list[0]?._id || '';
          setSelectedSchoolId(initialId);
          const initialSchool = list.find((s) => s._id === initialId);
          setSchoolName(initialSchool ? initialSchool.name : 'All Schools');
          if (initialId) fetchActiveSession(token, initialId);
        }
      } catch (error) { console.error('Failed to initialize school context:', error); }
      finally { setLoadingSchools(false); }
    })();
  }, [fetchActiveSession, fetchBranding]);

  const selectSchool = useCallback(async (school: SchoolLite) => {
    setSelectedSchoolId(school._id); setSchoolName(school.name); setPickerVisible(false);
    try {
      await AsyncStorage.setItem('selectedSchoolId', school._id);
      const token = await AsyncStorage.getItem('userToken');
      fetchActiveSession(token, school._id);
    } catch (error) { }
  }, [fetchActiveSession]);

  const refreshSession = useCallback(async () => {
    const token = await AsyncStorage.getItem('userToken');
    fetchActiveSession(token, selectedSchoolId || undefined);
  }, [fetchActiveSession, selectedSchoolId]);

  const refreshBranding = useCallback(async () => {
    const token = await AsyncStorage.getItem('userToken');
    fetchBranding(token);
  }, [fetchBranding]);

  return (
    <SchoolContext.Provider value={{
      isSuperAdmin, schoolName, sessionName, schools, selectedSchoolId, loadingSchools, loadingSession,
      pickerVisible, openPicker: () => setPickerVisible(true), closePicker: () => setPickerVisible(false), selectSchool, refreshSession,
      brandName, brandTagline, brandLogoUrl, loadingBranding, refreshBranding,
    }}>
      {children}
      <SchoolSwitcherModal />
    </SchoolContext.Provider>
  );
}

function SchoolSwitcherModal() {
  const { isSuperAdmin, schools, selectedSchoolId, loadingSchools, pickerVisible, closePicker, selectSchool } = useSchoolContext();
  const { headerBottom } = useHeaderLayout();
  const { width: windowWidth } = useWindowDimensions();

  if (!isSuperAdmin) return null;
  const containerWidth = Math.min(windowWidth * 0.92, 480);
  const horizontalMargin = (windowWidth - containerWidth) / 2;

  return (
    <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={closePicker}>
      <TouchableWithoutFeedback onPress={closePicker}>
        <View style={styles.pickerOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.pickerContainer, { marginTop: headerBottom, marginHorizontal: horizontalMargin, width: containerWidth }]}>
              <View style={styles.pickerHeader}>
                <Feather name="briefcase" size={15} color={C.primary} />
                <Text style={styles.pickerHeaderText}>Select School Branch</Text>
                <TouchableOpacity onPress={closePicker} hitSlop={8} style={{ marginLeft: 'auto' }}><Feather name="x" size={18} color="#9CA3AF" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: '60%' }} showsVerticalScrollIndicator={false}>
                {loadingSchools ? (
                  <ActivityIndicator style={{ padding: 24 }} color={C.primary} />
                ) : schools.length === 0 ? (
                  <Text style={styles.pickerEmptyText}>No schools found.</Text>
                ) : (
                  schools.map((s, idx) => (
                    <TouchableOpacity key={s._id} style={[styles.pickerItem, idx !== schools.length - 1 && styles.pickerItemBorder]} onPress={() => selectSchool(s)}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerItemText, selectedSchoolId === s._id && styles.pickerItemTextActive]} numberOfLines={1}>{s.name}</Text>
                        {!!s.code && <Text style={styles.pickerItemSub}>{s.code}</Text>}
                      </View>
                      {selectedSchoolId === s._id && <Feather name="check" size={16} color={C.primary} />}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function HeaderSchoolInfo({ availableWidth }: { availableWidth: number }) {
  const { isSuperAdmin, schoolName, sessionName, loadingSchools, loadingSession, openPicker, refreshSession } = useSchoolContext();
  const safeWidth = availableWidth > 0 ? availableWidth : 200;
  const sessionPillMaxWidth = safeWidth * 0.5;
  const schoolPillMaxWidth = safeWidth * 0.62;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.headerPillsRow}>
      <TouchableOpacity activeOpacity={0.7} onPress={refreshSession}>
        <LinearGradient colors={['#F9FAFB', '#F3F4F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.pillBase, styles.sessionPill, { maxWidth: sessionPillMaxWidth }]}>
          <Feather name="calendar" size={12} color="#6B7280" />
          {loadingSession ? <ActivityIndicator size="small" color="#9CA3AF" /> : <Text style={styles.sessionPillText} numberOfLines={1}>{sessionName || 'No Session'}</Text>}
          <Feather name="chevron-down" size={12} color="#9CA3AF" />
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity activeOpacity={isSuperAdmin ? 0.7 : 1} onPress={() => isSuperAdmin && openPicker()} disabled={!isSuperAdmin}>
        <LinearGradient colors={['#FEF2F2', '#FEE2E2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.pillBase, styles.schoolPill, { maxWidth: schoolPillMaxWidth }]}>
          <View style={styles.schoolPillIconWrap}><Feather name="home" size={11} color="#ffffff" /></View>
          <Text style={styles.schoolPillText} numberOfLines={1}>{loadingSchools ? 'Loading...' : schoolName || 'Select School'}</Text>
          {isSuperAdmin && <Feather name="chevron-down" size={12} color={C.primary} />}
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

function AppHeader({ navigation, route, options }: { navigation: any, route: any, options: any }) {
  const insets = useSafeAreaInsets();
  const { reportHeaderBottom } = useHeaderLayout();
  const { open: openDrawer } = useDrawerVisibility();
  const { setActiveRoute, contentNavigationRef } = useAppNav();
  const containerRef = useRef<View>(null);
  const [middleWidth, setMiddleWidth] = useState(0);

  const title = options?.title || route?.name || 'Home';

  useEffect(() => {
    contentNavigationRef.current = navigation;
    if (route?.name) setActiveRoute(route.name);
  }, [navigation, route?.name, contentNavigationRef, setActiveRoute]);

  const handleContainerLayout = useCallback(() => {
    containerRef.current?.measureInWindow((_x, y, _width, height) => {
      if (height > 0) reportHeaderBottom(y + height);
    });
  }, [reportHeaderBottom]);

  const handleMiddleLayout = useCallback((e: any) => {
    setMiddleWidth(e.nativeEvent.layout.width);
  }, []);

  return (
    <View ref={containerRef} onLayout={handleContainerLayout} style={[styles.appHeader, { paddingTop: insets.top }]}>
      <View style={styles.appHeaderRow}>
        <TouchableOpacity onPress={openDrawer} style={styles.headerIconBtn} hitSlop={8} activeOpacity={0.7}>
          <Feather name="menu" size={22} color={C.primary} />
        </TouchableOpacity>

        <View style={styles.appHeaderMiddle} onLayout={handleMiddleLayout}>
          {HEADER_DISPLAY_MODE === 'TITLE' ? (
            <Text style={styles.headerModuleTitle} numberOfLines={1}>{title}</Text>
          ) : (
            <HeaderSchoolInfo availableWidth={middleWidth} />
          )}
        </View>

        <HeaderRightAvatar />
      </View>
    </View>
  );
}

const DrawerMenuIcon = ({ active, icon }: { active: boolean; icon: string }) =>
  active ? (
    <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.drawerIconBox}>
      <Feather name={icon as any} size={16} color="#ffffff" />
    </LinearGradient>
  ) : (
    <View style={styles.drawerIconBox}><Feather name={icon as any} size={16} color={C.primary} /></View>
  );

const containsRoute = (item: MenuItem, routeName: string): boolean => {
  if (item.routeName === routeName) return true;
  if (item.children && item.children.length > 0) {
    return item.children.some((child) => containsRoute(child, routeName));
  }
  return false;
};

const getInitials = (name: string) => {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};


const HeaderRightAvatar = () => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userName, setUserName] = useState("User");
  const [userEmail, setUserEmail] = useState("");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { headerBottom } = useHeaderLayout();
  const { width: windowWidth } = useWindowDimensions();

  useEffect(() => {
    (async () => {
      try {
        const [name, email, userRaw, avatarRaw] = await Promise.all([
          AsyncStorage.getItem("userName"),
          AsyncStorage.getItem("userEmail"),
          AsyncStorage.getItem("user"),
          AsyncStorage.getItem("userAvatar"),
        ]);

        let parsedUser: any = null;

        try {
          parsedUser = userRaw ? JSON.parse(userRaw) : null;
        } catch {
          parsedUser = null;
        }

        const nameValue =
          name ||
          parsedUser?.name ||
          "User";

        const emailValue =
          email ||
          parsedUser?.email ||
          "";

        // Priority:
        // 1. userAvatar from AsyncStorage
        // 2. avatar from user object
        // 3. photo from user object
        const avatarValue =
          avatarRaw ||
          parsedUser?.avatar ||
          parsedUser?.photo ||
          null;

        setUserName(nameValue);
        setUserEmail(emailValue);
        setUserAvatar(avatarValue);
        setAvatarFailed(false);
      } catch (error) {
        console.log("Failed to load profile avatar:", error);
      }
    })();
  }, []);

  const resolvedAvatarUri = resolveAssetUrl(userAvatar);

  const dropdownWidth = Math.min(windowWidth * 0.68, 240);
  const edgeMargin = Math.max(insets.right, 16);

  const avatarContent = resolvedAvatarUri && !avatarFailed ? (
    <Image
      source={{ uri: resolvedAvatarUri }}
      style={styles.headerAvatarImage}
      resizeMode="cover"
      onError={() => {
        setAvatarFailed(true);
      }}
    />
  ) : (
    <Text style={styles.headerAvatarText}>
      {getInitials(userName)}
    </Text>
  );

  return (
    <View style={{ zIndex: 9999 }}>
      <TouchableOpacity
        onPress={() => setShowProfileMenu(true)}
        style={{ marginRight: 16 }}
        activeOpacity={0.8}
      >
        <View style={styles.headerAvatar}>
          {avatarContent}
        </View>
      </TouchableOpacity>

      <Modal
        visible={showProfileMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowProfileMenu(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setShowProfileMenu(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.profileDropdown,
                  {
                    top: headerBottom,
                    right: edgeMargin,
                    width: dropdownWidth,
                  },
                ]}
              >
                <View style={styles.profileDropdownHeader}>
                  <View
                    style={[
                      styles.headerAvatar,
                      {
                        width: 46,
                        height: 46,
                        borderRadius: 23,
                        marginRight: 14,
                      },
                    ]}
                  >
                    {avatarContent}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={styles.dropdownName}
                      numberOfLines={1}
                    >
                      {userName}
                    </Text>

                    <Text
                      style={styles.dropdownEmail}
                      numberOfLines={1}
                    >
                      {userEmail || "user@namaste.com"}
                    </Text>
                  </View>
                </View>

                <View style={styles.dropdownDivider} />

                <TouchableOpacity
                  style={styles.dropdownLogoutBtn}
                  onPress={() => {
                    setShowProfileMenu(false);
                    navigation.navigate("Settings");
                  }}
                >
                  <Feather
                    name="settings"
                    size={18}
                    color="#374151"
                  />

                  <Text
                    style={[
                      styles.dropdownLogoutText,
                      {
                        color: "#374151",
                      },
                    ]}
                  >
                    Settings
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dropdownLogoutBtn}
                  onPress={() => {
                    setShowProfileMenu(false);
                    handleGlobalLogout(navigation);
                  }}
                >
                  <Feather
                    name="log-out"
                    size={16}
                    color={C.primary}
                  />

                  <Text style={styles.dropdownLogoutText}>
                    Secure Logout
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};



function DrawerMenuNode({ item, depth, path, currentRouteName, expandedGroups, toggleGroup, onNavigate }: { item: MenuItem; depth: number; path: string; currentRouteName: string; expandedGroups: Record<string, boolean>; toggleGroup: (key: string) => void; onNavigate: (routeName: string) => void; }) {
  const nodeKey = `${path}/${item.label}`;
  const hasChildren = !!item.children && item.children.length > 0;
  const isActive = containsRoute(item, currentRouteName);

  if (!hasChildren) {
    const active = item.routeName === currentRouteName;
    if (depth === 0) {
      return (
        <TouchableOpacity activeOpacity={0.7} style={[styles.drawerItem, active && styles.drawerItemActive]} onPress={() => item.routeName && onNavigate(item.routeName)}>
          <DrawerMenuIcon active={active} icon={item.icon} />
          <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>{item.label}</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity activeOpacity={0.7} style={[styles.childDrawerItem, active && styles.childDrawerItemActive]} onPress={() => item.routeName && onNavigate(item.routeName)}>
        <Feather name={item.icon as any} size={14} color={active ? C.primary : "#9CA3AF"} style={{ marginRight: 12 }} />
        <Text style={[styles.childDrawerItemText, active && styles.childDrawerItemTextActive]}>{item.label}</Text>
        {active && <View style={styles.childActiveDot} />}
      </TouchableOpacity>
    );
  }

  const isExpanded = !!expandedGroups[nodeKey];

  return (
    <View>
      {depth === 0 ? (
        <TouchableOpacity activeOpacity={0.7} style={[styles.drawerItem, isActive && styles.drawerItemActive]} onPress={() => toggleGroup(nodeKey)}>
          <DrawerMenuIcon active={isActive} icon={item.icon} />
          <Text style={[styles.drawerItemText, isActive && styles.drawerItemTextActive]}>{item.label}</Text>
          <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={isActive ? C.primary : "#9CA3AF"} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity activeOpacity={0.7} style={[styles.childDrawerItem, isActive && styles.childDrawerItemActive]} onPress={() => toggleGroup(nodeKey)}>
          <Feather name={item.icon as any} size={14} color={isActive ? "#ef4444" : "#9CA3AF"} style={{ marginRight: 12 }} />
          <Text style={[styles.childDrawerItemText, isActive && styles.childDrawerItemTextActive, { flex: 1 }]}>{item.label}</Text>
          <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={isActive ? "#ef4444" : "#9CA3AF"} />
        </TouchableOpacity>
      )}

      {isExpanded && (
        <View style={styles.childrenContainer}>
          {item.children!.map((child) => (
            <DrawerMenuNode key={child.label} item={child} depth={depth + 1} path={nodeKey} currentRouteName={currentRouteName} expandedGroups={expandedGroups} toggleGroup={toggleGroup} onNavigate={onNavigate} />
          ))}
        </View>
      )}
    </View>
  );
}


function CustomDrawerPanel() {
  const { visible, close } = useDrawerVisibility();
  const { filteredMenu, mode, profileName, profileSubtitle } = useAppMenu();
  const { activeRoute, contentNavigationRef, outerNavigation } = useAppNav();
  const { brandName, brandTagline, brandLogoUrl } = useSchoolContext();
  const { headerBottom } = useHeaderLayout();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [rendered, setRendered] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [userName, setUserName] = useState("User");
  const [userRole, setUserRole] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);

  const drawerWidth = Math.min(windowWidth * 0.72, 320);
  const offscreenX = -(drawerWidth + insets.left + 24);
  const translateX = useRef(new Animated.Value(offscreenX)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const panelTop = Math.max(headerBottom - 10, insets.top);
  const availableHeight = Math.max(windowHeight - panelTop - insets.bottom - 24, 160);
  const maxPanelHeight = Math.min(availableHeight, windowHeight * DRAWER_MAX_HEIGHT_RATIO);
  const maxMenuScrollHeight = Math.max(maxPanelHeight - DRAWER_CHROME_HEIGHT, 80);

  useEffect(() => {
    (async () => {
      const name = await AsyncStorage.getItem("userName");
      const role = await AsyncStorage.getItem("userRole");
      if (name) setUserName(name);
      if (role) setUserRole(role);
    })();
  }, []);

  useEffect(() => {
    setLogoFailed(false);
  }, [brandLogoUrl]);

  useEffect(() => {
    if (visible) setRendered(true);
  }, [visible]);

  useEffect(() => {
    if (!rendered) return;
    if (visible) {
      translateX.setValue(offscreenX);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, damping: 18, mass: 0.9, stiffness: 190 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: offscreenX, duration: 200, useNativeDriver: true }),
      ]).start(() => setRendered(false));
    }
  }, [visible, rendered]);

  // Auto-expand whichever group holds the active route, each time the drawer opens.
  useEffect(() => {
    if (!visible) return;
    const toExpand: Record<string, boolean> = {};
    const walk = (items: MenuItem[], path: string) => {
      items.forEach((node) => {
        if (node.children && node.children.length > 0) {
          const nodeKey = `${path}/${node.label}`;
          if (containsRoute(node, activeRoute)) toExpand[nodeKey] = true;
          walk(node.children, nodeKey);
        }
      });
    };
    filteredMenu.forEach((section) => walk(section.items, section.section));
    setExpandedGroups((prev) => ({ ...prev, ...toExpand }));
  }, [visible, filteredMenu, activeRoute]);

  const toggleGroup = (nodeKey: string) => setExpandedGroups((prev) => ({ ...prev, [nodeKey]: !prev[nodeKey] }));

  const handleNavigate = (routeName: string) => {
    contentNavigationRef.current?.navigate(routeName);
    close();
  };

  const handleLogout = () => {
    close();
    handleGlobalLogout(contentNavigationRef.current || outerNavigation);
  };

  if (!rendered) return null;

  const resolvedLogoUri = mode === 'admin' ? resolveAssetUrl(brandLogoUrl) : null;
  const logoSource = resolvedLogoUri && !logoFailed ? { uri: resolvedLogoUri } : SchoolLogo;

  const brandTitle = mode === 'student' ? (profileName || 'Student')
    : mode === 'parent' ? (profileName || 'Parent / Guardian')
      : (brandName || 'Namaste School');
  const brandSubtitle = mode === 'student' ? (profileSubtitle || 'Student Portal')
    : mode === 'parent' ? (profileSubtitle || 'Parent Portal')
      : (brandTagline || 'MANAGEMENT SYSTEM');

  return (
    <Modal transparent visible={rendered} animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity }]}>
        <TouchableWithoutFeedback onPress={close}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </Animated.View>

      <Animated.View
        style={[
          styles.drawerPanel,
          {
            top: panelTop,
            left: Math.max(insets.left, 0) + 12,
            width: drawerWidth,
            maxHeight: maxPanelHeight,
            transform: [{ translateX }],
          },
        ]}
      >
        <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.drawerBrandRow}>
          <View style={styles.drawerLogoCard}>
            <Image source={logoSource} style={styles.drawerLogo} resizeMode="contain" onError={() => setLogoFailed(true)} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.drawerBrandTitle} numberOfLines={1}>{brandTitle}</Text>
            <Text style={styles.drawerBrandSubtitle} numberOfLines={1}>{brandSubtitle}</Text>
          </View>
          <TouchableOpacity onPress={close} hitSlop={8} style={styles.drawerCloseBtn} activeOpacity={0.7}>
            <Feather name="x" size={16} color="#ffffff" />
          </TouchableOpacity>
        </LinearGradient>

        <ScrollView
          style={{ maxHeight: maxMenuScrollHeight }}
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.drawerMenuScrollContent}
        >
          {filteredMenu.map((section) => (
            <View key={section.section}>
              <Text style={styles.sectionHeaderTitle}>{section.section}</Text>
              {section.items.map((item) => (
                <DrawerMenuNode key={item.label} item={item} depth={0} path={section.section} currentRouteName={activeRoute} expandedGroups={expandedGroups} toggleGroup={toggleGroup} onNavigate={handleNavigate} />
              ))}
            </View>
          ))}
        </ScrollView>

        <View style={styles.drawerFooter}>
          <View style={styles.footerAvatar}><Text style={styles.footerAvatarText}>{getInitials(userName)}</Text></View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.footerName} numberOfLines={1}>{userName}</Text>
            <View style={styles.footerRoleBadge}><Text style={styles.footerRole}>{userRole || mode}</Text></View>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.footerLogoutBtn} hitSlop={8} activeOpacity={0.7}>
            <Feather name="log-out" size={17} color={C.primary} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

function NoModulesAssignedScreen({ navigation }: { navigation: any }) {
  return (
    <SafeAreaView style={styles.noAccessContainer}>
      <View style={styles.noAccessIconCircle}><Feather name="shield-off" size={32} color={C.primary} /></View>
      <Text style={styles.noAccessTitle}>No Modules Assigned</Text>
      <Text style={styles.noAccessMessage}>Your account doesn't have access to any modules yet. Please contact your school administrator.</Text>
      <TouchableOpacity style={styles.noAccessLogoutBtn} onPress={() => handleGlobalLogout(navigation)}>
        <Feather name="log-out" size={16} color="#ffffff" style={{ marginRight: 8 }} />
        <Text style={styles.noAccessLogoutText}>Logout</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/*  APP SHELL — content stack + floating drawer, sharing context       */
/* ------------------------------------------------------------------ */

function AppShellInner({ outerNavigation }: { outerNavigation: any }) {
  const { loading, visibleRoutes } = useAppMenu();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={{ marginTop: 12, color: "#6B7280" }}>Loading accessible modules...</Text>
      </View>
    );
  }

  if (visibleRoutes.length === 0) return <NoModulesAssignedScreen navigation={outerNavigation} />;

  return (
    <>
      <ContentStack.Navigator
        initialRouteName={visibleRoutes[0].routeName}
        screenOptions={{ header: (props) => <AppHeader {...props} /> }}
      >
        {visibleRoutes.map((m) => (
          <ContentStack.Screen key={m.routeName} name={m.routeName!} component={m.component!} options={{ title: m.label }} />
        ))}
      </ContentStack.Navigator>
      <CustomDrawerPanel />
    </>
  );
}

function AppShell({ navigation }: { navigation: any }) {
  return (
    <AppMenuProvider>
      <SchoolProvider>
        <HeaderLayoutProvider>
          <DrawerVisibilityProvider>
            <AppNavProvider outerNavigation={navigation}>
              <AppShellInner outerNavigation={navigation} />
            </AppNavProvider>
          </DrawerVisibilityProvider>
        </HeaderLayoutProvider>
      </SchoolProvider>
    </AppMenuProvider>
  );
}

export default function AppNavigator({ initialRoute }: { initialRoute: string }) {
  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="DrawerRoot" component={AppShell} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({

  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4F7F9" },

  noAccessContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4F7F9", paddingHorizontal: 32 },

  noAccessIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#FEE2E2", justifyContent: "center", alignItems: "center", marginBottom: 20 },

  noAccessTitle: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 10, textAlign: "center" },

  noAccessMessage: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 21, marginBottom: 28 },

  noAccessLogoutBtn: { flexDirection: "row", alignItems: "center", backgroundColor: C.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },

  noAccessLogoutText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },

  placeholderContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4F7F9", paddingHorizontal: 32 },

  placeholderIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#FEE2E2", justifyContent: "center", alignItems: "center", marginBottom: 18 },

  placeholderTitle: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 8, textAlign: "center" },

  placeholderMessage: { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 20 },

  appHeader: {

    backgroundColor: C.surface,

    borderBottomWidth: 1,

    borderBottomColor: C.border,

    shadowColor: '#0F172A',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.05,

    shadowRadius: 8,

    elevation: 3,

  },

  appHeaderRow: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 12 },

  appHeaderMiddle: { flex: 1, flexShrink: 1, minWidth: 0, overflow: 'hidden', marginHorizontal: 8, justifyContent: 'center' },

  headerModuleTitle: {

    fontSize: 18,

    fontWeight: '800',

    color: C.text,

    letterSpacing: 0.2,

    marginLeft: 4,

  },

  headerIconBtn: {

    width: 38,

    height: 38,

    borderRadius: 12,

    justifyContent: 'center',

    alignItems: 'center',

    backgroundColor: C.primarySoft,

  },

  headerAvatarImage: {

    width: '100%',

    height: '100%',

    borderRadius: 18,

  },

  headerAvatar: {

    width: 32 ,

    height: 32,

    borderRadius: 18,

    backgroundColor: C.primary,

    justifyContent: 'center',

    alignItems: 'center',

    borderWidth: 2,

    borderColor: '#FFFFFF',

    shadowColor: C.primary,

    shadowOpacity: 0.20,

    shadowRadius: 8,

    elevation: 3,

  },

  headerAvatarText: {

    color: '#FFFFFF',

    fontSize: 13,

    fontWeight: '800',

  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' },

  profileDropdown: { position: 'absolute', backgroundColor: '#ffffff', borderRadius: 16, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10, borderWidth: 1, borderColor: '#F3F4F6' },

  profileDropdownHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },

  dropdownName: { fontSize: 16, fontWeight: '800', color: '#111827' },

  dropdownEmail: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '600' },

  dropdownDivider: { height: 1, backgroundColor: '#E5E7EB', marginBottom: 8 },

  dropdownLogoutBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: '#FEF2F2', borderRadius: 10, marginTop: 8, justifyContent: 'center' },

  dropdownLogoutText: { color: C.primary, fontSize: 14, fontWeight: '800', marginLeft: 8 },

  headerPillsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },

  pillBase: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 999, overflow: 'hidden' },

  sessionPill: { borderWidth: 1, borderColor: '#E5E7EB' },

  sessionPillText: { fontSize: 12, fontWeight: '700', color: '#374151' },

  schoolPill: {

    borderWidth: 1,

    borderColor: C.primaryTint,

    backgroundColor: C.primarySoft,

  },

  schoolPillIconWrap: {

    width: 18,

    height: 18,

    borderRadius: 9,

    backgroundColor: C.primary,

    justifyContent: 'center',

    alignItems: 'center',

  },

  schoolPillText: {

    fontSize: 12,

    fontWeight: '800',

    color: C.primary,

    flexShrink: 1,

  },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.5)' },

  pickerContainer: { backgroundColor: '#ffffff', borderRadius: 16, padding: 14, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16, borderWidth: 1, borderColor: '#F3F4F6' },

  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },

  pickerHeaderText: { fontSize: 13, fontWeight: '800', color: '#111827' },

  pickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6 },

  pickerItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },

  pickerItemText: { fontSize: 14, fontWeight: '600', color: '#374151' },

  pickerItemTextActive: { color: C.primary, fontWeight: '800' },

  pickerItemSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2, fontWeight: '600' },

  pickerEmptyText: { textAlign: 'center', padding: 20, color: '#9CA3AF', fontWeight: '500' },

  // --- Floating drawer panel ---

  backdrop: { backgroundColor: C.overlay },

  drawerPanel: {

    position: 'absolute',

    backgroundColor: '#ffffff',

    borderRadius: 22,

    overflow: 'hidden',

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 18 },

    shadowOpacity: 0.28,

    shadowRadius: 30,

    elevation: 24,

    borderWidth: 1,

    borderColor: 'rgba(255,255,255,0.6)',

  },

  drawerBrandRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },

  drawerLogoCard: {

    width: 46, height: 46, borderRadius: 13, backgroundColor: '#ffffff',

    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',

    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,

  },

  drawerLogo: { width: 36, height: 36, borderRadius: 8 },

  drawerBrandTitle: { fontSize: 15, fontWeight: '800', color: '#ffffff', letterSpacing: 0.2 },

  drawerBrandSubtitle: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.88)', letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 3 },

  drawerCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },

  drawerMenuScrollContent: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },

  sectionHeaderTitle: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1, marginTop: 8, marginBottom: 10, marginLeft: 12 },

  drawerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },

  drawerItemActive: {

    backgroundColor: C.primarySoft,

  },

  drawerItemTextActive: {

    color: C.primary,

  },

  drawerIconBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', marginRight: 14, overflow: 'hidden' },

  drawerItemText: { fontSize: 14, fontWeight: '700', color: '#4B5563', flex: 1 },

  childrenContainer: { marginLeft: 28, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: '#F3F4F6', marginBottom: 8, marginTop: 4 },

  childDrawerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },

  childDrawerItemActive: { backgroundColor: '#F9FAFB' },

  childDrawerItemText: { fontSize: 13, fontWeight: '600', color: '#6B7280', flex: 1 },

  childDrawerItemTextActive: {

    color: C.primary,

    fontWeight: '800',

  },

  childActiveDot: {

    width: 6,

    height: 6,

    borderRadius: 3,

    backgroundColor: C.primary,

  },

  drawerFooter: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#FBFBFD' },

  footerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },

  footerAvatarText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },

  footerName: { fontSize: 14, fontWeight: '800', color: '#111827' },

  footerRoleBadge: { backgroundColor: '#E0F2FE', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6 },

  footerRole: { fontSize: 10, fontWeight: '800', color: C.primary, textTransform: 'uppercase' },

  footerLogoutBtn: { padding: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#FEE2E2', shadowColor: C.primary, shadowOpacity: 0.1, shadowRadius: 4, elevation: 1 },

});