import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Image,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { API_BASE } from '../network/api';
type UserType = 'admin' | 'staff' | 'student' | 'parent';

interface Trend {
  date: string;
  present: number;
  absent: number;
  halfDay: number;
  leave: number;
  total: number;
}

interface StaffByType {
  _id: string;
  count: number;
}

interface Staff {
  _id: string;
  name: string;
  staffId: string;
  staffType: string;
  mobile?: string;
  joiningDate?: string;
  createdAt?: string;
}

interface School {
  _id: string;
  name: string;
  code?: string;
  city?: string;
  state?: string;
  board?: string;
  createdAt?: string;
}

interface Subject {
  _id: string;
  name: string;
  code: string;
  createdAt?: string;
}

interface Notice {
  _id: string;
  title: string;
  sendTo?: string[];
  channels?: string[];
  noticeDate: string;
  submissionDate?: string;
  description: string;
  category: string;
  status?: string;
  isPinned?: boolean;
  createdAt?: string;
}

interface LeaveApplication {
  _id: string;
  staff?: { _id: string; staffId: string; name: string };
  leaveType?: { _id: string; name: string };
  fromDate: string;
  toDate: string;
  totalDays: number;
  reason?: string;
  status: string;
  appliedOn?: string;
}

interface HomeworkItem {
  _id: string;
  title: string;
  description?: string;
  className: string;
  division?: string;
  subjectName: string;
  dueDate: string;
  dueTime?: string;
  maxMarks?: number;
}

interface SchedulePeriod {
  _id?: string;
  periodNumber?: number | string;
  subjectName?: string;
  className?: string;
  division?: string;
  startTime?: string;
  endTime?: string;
  room?: string;
  teacherName?: string;
}

interface AttendanceRecord {
  _id?: string;
  date: string;
  status: string;
  remarks?: string;
}

interface ExamResult {
  _id?: string;
  examName?: string;
  subjectName?: string;
  marksObtained?: number;
  maxMarks?: number;
  percentage?: number;
  grade?: string;
  date?: string;
}

interface Holiday {
  _id?: string;
  title?: string;
  name?: string;
  fromDate?: string;
  toDate?: string;
  date?: string;
  description?: string;
}

interface FeeComponent {
  name?: string;
  amount?: number;
  paid?: number;
}

interface FeePayment {
  _id?: string;
  amount?: number;
  paymentDate?: string;
  mode?: string;
  receiptNo?: string;
}

interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  totalPayroll: number;
  totalGeneralExpense: number;
}

interface BranchSummary {
  schoolId: string;
  name: string;
  code?: string;
  city?: string;
  totalStaff: number;
  totalStudents: number;
  totalClasses: number;
  todayAttendancePct: number;
}

// -- Student / Ward shapes -------------------------------------------------

interface StudentAttendance {
  percentage: number;
  monthlyPercentage?: number;
  totalMarkedDays?: number;
  totalDays?: number;
  presentDays: number;
  absentDays: number;
  halfDays?: number;
  leaveDays?: number;
  todayStatus: string;
  recentRecords: AttendanceRecord[];
}

interface StudentAcademics {
  totalExams?: number;
  averagePercentage: number;
  recentResults: ExamResult[];
}

interface StudentFees {
  studentFeeId?: string | null;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  discount?: number;
  status: string;
  structureName?: string;
  components?: FeeComponent[];
  recentPayments?: FeePayment[];
}

interface StudentProfile {
  id?: string;
  _id?: string;
  name: string;
  rollNo: string;
  admissionNo: string;
  gender?: string;
  dob?: string;
  photo?: string;
  className: string;
  division?: string;
  syllabus?: string;
  schoolName?: string;
  schoolCode?: string;
  classMatesCount?: number;
}

interface StudentData {
  profile: StudentProfile;
  attendance: StudentAttendance;
  academics: StudentAcademics;
  homework: { activeCount: number; recentList: HomeworkItem[] };
  fees: StudentFees;
  todaySchedule: SchedulePeriod[];
  leaves: LeaveApplication[];
}

interface Ward extends StudentProfile {
  attendance: StudentAttendance;
  academics: StudentAcademics;
  homework: { pendingCount: number; recentList: HomeworkItem[] };
  fees: StudentFees;
  todaySchedule: SchedulePeriod[];
  leaves: LeaveApplication[];
}

interface ParentData {
  totalWards: number;
  wards: Ward[];
  primaryWard: Ward | null;
}

// -- Staff shapes ----------------------------------------------------------

interface AssignedClass {
  _id: string;
  className: string;
  division?: string;
  syllabus?: string;
  marksGrades?: string;
  isClassTeacher: boolean;
  isAttendanceMarkedToday: boolean;
  studentCount: number;
  boysCount: number;
  girlsCount: number;
}

interface TeachingProfile {
  isTeacher: boolean;
  staffId: string;
  name: string;
  staffType: string;
  designation?: string;
  mobile?: string;
  email?: string;
  photo?: string;
  assignedClasses: AssignedClass[];
  totalAssignedClasses: number;
  totalAssignedStudents: number;
  assignedSubjects: Subject[];
  totalAssignedSubjects: number;
  todaySchedule: SchedulePeriod[];
  fullWeeklySchedule: any[];
  myAttendanceToday: string;
  myAttendanceRecord: any;
  recentHomework: HomeworkItem[];
  recentDiary: any[];
  recentLeaves: LeaveApplication[];
}

interface AccountantData {
  fees: {
    todayCollected: number;
    monthCollected: number;
    totalCollected: number;
    totalDueAmount: number;
    overdueStudentsCount: number;
    recentPayments: any[];
    topOverdueStudents: any[];
  };
  expenses: { todayExpense: number; monthExpense: number; recentExpenses: any[] };
  payroll: { recentPayroll: any[] };
}

interface LibrarianData {
  totalBooks: number;
  totalCopies: number;
  availableCopies: number;
  issuedBooks: number;
  overdueBooks: number;
  todayIssued: number;
  todayReturned: number;
  recentIssues: any[];
}

interface ReceptionistData {
  totalEnquiries: number;
  newEnquiries: number;
  campusVisits: number;
  admitted: number;
  todayFollowUpsCount: number;
  todayFollowUps: any[];
  recentEnquiries: any[];
}

interface DashboardData {
  userRole: string;
  userType: UserType;
  studentData: StudentData | null;
  parentData: ParentData | null;
  myTeachingProfile: TeachingProfile | null;
  accountantData: AccountantData | null;
  librarianData: LibrarianData | null;
  receptionistData: ReceptionistData | null;
  supportStaffData: any | null;

  upcomingHolidays: Holiday[];
  recentNotices: Notice[];

  totalStaff: number;
  totalStudents: number;
  totalClasses: number;
  totalSubjects: number;
  totalSchools: number;
  totalRoles: number;
  totalPermissions: number;
  totalNotices: number;
  totalLeaves: number;
  pendingLeavesCount: number;
  totalLeaveTypes: number;
  totalHomework: number;
  totalExams: number;
  totalAcademicYears: number;
  totalClassLevels: number;
  totalPromotions: number;
  activeAcademicYear: string;

  attendance: {
    todayPresent: number;
    todayAbsent: number;
    todayHalfDay: number;
    todayOnLeave: number;
    todayTotal: number;
    trend: Trend[];
  };
  staffByType: StaffByType[];
  recentStaff: Staff[];
  recentSchools: School[];
  recentSubjects: Subject[];
  recentLeaves: LeaveApplication[];
  recentHomework: HomeworkItem[];
  upcomingExams: any[];
  recentAttendance: any[];
  branchWiseSummary: BranchSummary[];
  finance: FinanceSummary;
}

// --- Brand palette (kept consistent with the Hostel screens) ---
const C = {
  primary: '#B3122A',
  primaryDark: '#B91424',
  primarySoft: '#FEECEC',
  primaryBorder: '#F6C6C9',
};

// --- Helpers ---

// Notice `description` fields contain raw HTML from a rich-text editor
// (e.g. "<div>hi</div>") — strip tags so it renders as plain RN <Text>.
const stripHtml = (html: string, maxLen: number = 90) => {
  if (!html) return '';
  const plain = html
    .replace(/<\/(div|p|li|br)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
};

const formatDate = (dateString?: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const formatCurrency = (value: number) => {
  const sign = value < 0 ? '-' : '';
  return `${sign}\u20B9${Math.abs(value || 0).toLocaleString('en-IN')}`;
};

const getInitials = (name?: string) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

// Server sends relative upload paths ("/uploads/x.jpg") and the
// "/default-avatar.png" placeholder — resolve the first, ignore the second.
const resolvePhoto = (photo?: string): string | null => {
  if (!photo) return null;
  if (photo.includes('default-avatar')) return null;
  if (photo.startsWith('http')) return photo;
  const origin = API_BASE.replace(/\/api\/?$/, '').replace(/\/$/, '');
  return `${origin}${photo.startsWith('/') ? '' : '/'}${photo}`;
};

// Class 3 + division "A" -> "Class 3 - A"; division "" or "A/B/C/D" is
// how the API represents "all divisions", so don't render a fake section.
const classLabel = (className?: string, division?: string) => {
  if (!className) return '-';
  if (!division || division.includes('/')) return className;
  return `${className} - ${division}`;
};

const dueLabel = (dueDate: string) => {
  if (!dueDate) return 'No due date';
  const due = new Date(`${dueDate}T23:59:59`);
  const today = new Date();
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (isNaN(days)) return `Due ${dueDate}`;
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days}d`;
};

const attendanceTone = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'present':
      return { bg: '#DCFCE3', fg: '#166534' };
    case 'absent':
      return { bg: '#FEE2E2', fg: '#991B1B' };
    case 'half day':
    case 'halfday':
      return { bg: '#FFEDD5', fg: '#9A3412' };
    case 'on leave':
    case 'leave':
      return { bg: '#EDE9FE', fg: '#5B21B6' };
    default:
      return { bg: '#F3F4F6', fg: '#4B5563' };
  }
};

// --- Reusable Components ---

const PrimaryStatCard = ({
  icon,
  title,
  value,
  color,
  bgColor,
  caption,
  onPress,
}: {
  icon: string;
  title: string;
  value: number | string;
  color: string;
  bgColor: string;
  caption?: string;
  onPress?: () => void;
}) => {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={[styles.primaryCard, { borderTopColor: color }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.primaryCardIcon, { backgroundColor: bgColor }]}>
        <Feather name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.primaryCardValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.primaryCardTitle}>{title}</Text>
      {caption ? <Text style={[styles.primaryCardCaption, { color }]}>{caption}</Text> : null}
    </Wrapper>
  );
};

const MetricChip = ({
  icon,
  label,
  value,
  color,
  bgColor,
  highlight,
}: {
  icon: string;
  label: string;
  value: number | string;
  color: string;
  bgColor: string;
  highlight?: boolean;
}) => (
  <View style={[styles.metricChip, highlight && styles.metricChipHighlight]}>
    <View style={[styles.metricChipIcon, { backgroundColor: bgColor }]}>
      <Feather name={icon as any} size={15} color={color} />
    </View>
    <View>
      <Text style={styles.metricChipValue}>{value}</Text>
      <Text style={styles.metricChipLabel}>{label}</Text>
    </View>
  </View>
);

const AttendanceCard = ({ icon, title, value, color, bgColor }: { icon: string; title: string; value: number; color: string; bgColor: string }) => (
  <View style={styles.attendanceCard}>
    <View style={[styles.attendanceIcon, { backgroundColor: bgColor }]}>
      <Feather name={icon as any} size={16} color={color} />
    </View>
    <Text style={[styles.attendanceValue, { color }]}>{value}</Text>
    <Text style={styles.attendanceTitle}>{title}</Text>
  </View>
);

const SectionHeader = ({
  icon,
  title,
  subtitle,
  actionLabel,
  onViewAll,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onViewAll?: () => void;
}) => (
  <View style={styles.sectionHeader}>
    <View style={styles.sectionHeaderLeft}>
      {icon ? (
        <View style={styles.sectionHeaderIcon}>
          <Feather name={icon as any} size={15} color={C.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
    {onViewAll && (
      <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.viewAllText}>{actionLabel || 'View All'}</Text>
      </TouchableOpacity>
    )}
  </View>
);

const EmptyState = ({ icon = 'inbox', message }: { icon?: string; message: string }) => (
  <View style={styles.emptyState}>
    <Feather name={icon as any} size={22} color="#D1D5DB" style={{ marginBottom: 6 }} />
    <Text style={styles.emptyStateText}>{message}</Text>
  </View>
);

const TrendRow = ({ trend }: { trend: Trend }) => {
  const pct = trend.total > 0 ? Math.round((trend.present / trend.total) * 100) : 0;
  return (
    <View style={styles.trendRow}>
      <View style={styles.trendRowTop}>
        <Text style={styles.trendDate}>{formatDate(trend.date)}</Text>
        <Text style={styles.trendFraction}>
          {trend.present}/{trend.total} <Text style={styles.trendPct}>({pct}%)</Text>
        </Text>
      </View>
      <View style={styles.trendTrack}>
        <View style={[styles.trendFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
};

const StaffTypeRow = ({ type, total }: { type: StaffByType; total: number }) => {
  const pct = total > 0 ? Math.round((type.count / total) * 100) : 0;
  return (
    <View style={styles.trendRow}>
      <View style={styles.trendRowTop}>
        <Text style={styles.trendDate}>{type._id}</Text>
        <Text style={styles.trendFraction}>
          {type.count} <Text style={styles.trendPct}>({pct}%)</Text>
        </Text>
      </View>
      <View style={styles.trendTrack}>
        <View style={[styles.trendFill, { width: `${pct}%`, backgroundColor: C.primary }]} />
      </View>
    </View>
  );
};

const NoticeCard = ({ notice, onPress }: { notice: Notice; onPress: () => void }) => (
  <TouchableOpacity style={styles.noticeCard} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.noticeIconCol}>
      <View style={styles.noticeIconCircle}>
        <Feather name="volume-2" size={15} color={C.primary} />
      </View>
    </View>
    <View style={{ flex: 1 }}>
      <View style={styles.noticeTopRow}>
        <View style={styles.noticeCategoryBadge}>
          <Text style={styles.noticeCategoryText}>{(notice.category || 'GENERAL').toUpperCase()}</Text>
        </View>
        <Text style={styles.noticeDate}>{notice.noticeDate}</Text>
      </View>
      <Text style={styles.noticeTitle} numberOfLines={1}>{notice.title}</Text>
      <Text style={styles.noticeDesc} numberOfLines={2}>{stripHtml(notice.description, 110)}</Text>
    </View>
    <Feather name="chevron-right" size={18} color="#D1D5DB" />
  </TouchableOpacity>
);

const HomeworkRow = ({ hw }: { hw: HomeworkItem }) => {
  const overdue = dueLabel(hw.dueDate) === 'Overdue';
  return (
    <View style={styles.listItem}>
      <View style={[styles.listAvatar, { backgroundColor: '#F0FDFA' }]}>
        <Feather name="book" size={15} color="#14b8a6" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle} numberOfLines={1}>{hw.title}</Text>
        <Text style={styles.itemSubtitle} numberOfLines={1}>
          {hw.subjectName} • {classLabel(hw.className, hw.division)}
          {hw.maxMarks ? ` • ${hw.maxMarks} marks` : ''}
        </Text>
      </View>
      <Text style={overdue ? styles.badgeRed : styles.badgeGreen}>{dueLabel(hw.dueDate)}</Text>
    </View>
  );
};

const ScheduleRow = ({ period }: { period: SchedulePeriod }) => (
  <View style={styles.listItem}>
    <View style={[styles.listAvatar, { backgroundColor: '#EFF6FF' }]}>
      <Text style={[styles.listAvatarText, { color: '#2563EB' }]}>{period.periodNumber ?? '•'}</Text>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.itemTitle} numberOfLines={1}>{period.subjectName || 'Period'}</Text>
      <Text style={styles.itemSubtitle} numberOfLines={1}>
        {classLabel(period.className, period.division)}
        {period.teacherName ? ` • ${period.teacherName}` : ''}
        {period.room ? ` • Room ${period.room}` : ''}
      </Text>
    </View>
    {period.startTime ? (
      <Text style={styles.tagText}>{period.startTime}{period.endTime ? ` - ${period.endTime}` : ''}</Text>
    ) : null}
  </View>
);

const LeaveRow = ({ leave }: { leave: LeaveApplication }) => (
  <View style={styles.listItem}>
    <View style={[styles.listAvatar, { backgroundColor: '#F5F3FF' }]}>
      <Feather name="log-out" size={15} color="#8b5cf6" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.itemTitle} numberOfLines={1}>{leave.leaveType?.name || 'Leave'}</Text>
      <Text style={styles.itemSubtitle} numberOfLines={1}>
        {formatDate(leave.fromDate)} - {formatDate(leave.toDate)} ({leave.totalDays}d)
      </Text>
    </View>
    <Text
      style={[
        styles.tagText,
        leave.status === 'Approved' && styles.tagGreen,
        leave.status === 'Rejected' && styles.tagRed,
        leave.status === 'Pending' && styles.tagOrange,
      ]}
    >
      {leave.status}
    </Text>
  </View>
);

const HolidayRow = ({ holiday }: { holiday: Holiday }) => (
  <View style={styles.listItem}>
    <View style={[styles.listAvatar, { backgroundColor: '#FFF7ED' }]}>
      <Feather name="sun" size={15} color="#f97316" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.itemTitle} numberOfLines={1}>{holiday.title || holiday.name || 'Holiday'}</Text>
      <Text style={styles.itemSubtitle} numberOfLines={1}>
        {formatDate(holiday.fromDate || holiday.date)}
        {holiday.toDate && holiday.toDate !== holiday.fromDate ? ` - ${formatDate(holiday.toDate)}` : ''}
      </Text>
    </View>
  </View>
);

// Fee summary block — shared by student + parent.
const FeeSummary = ({ fees }: { fees: StudentFees }) => {
  const paidPct = fees.totalAmount > 0 ? Math.round((fees.paidAmount / fees.totalAmount) * 100) : 100;
  return (
    <>
      <View style={styles.financeRow}>
        <View style={styles.financeItem}>
          <View style={[styles.financeIcon, { backgroundColor: '#EFF6FF' }]}>
            <Feather name="file-text" size={16} color="#2563EB" />
          </View>
          <Text style={styles.financeValue}>{formatCurrency(fees.totalAmount)}</Text>
          <Text style={styles.financeLabel}>Total Fee</Text>
        </View>
        <View style={styles.financeDivider} />
        <View style={styles.financeItem}>
          <View style={[styles.financeIcon, { backgroundColor: '#F0FDF4' }]}>
            <Feather name="check-circle" size={16} color="#16a34a" />
          </View>
          <Text style={styles.financeValue}>{formatCurrency(fees.paidAmount)}</Text>
          <Text style={styles.financeLabel}>Paid</Text>
        </View>
        <View style={styles.financeDivider} />
        <View style={styles.financeItem}>
          <View style={[styles.financeIcon, { backgroundColor: C.primarySoft }]}>
            <Feather name="alert-circle" size={16} color={C.primary} />
          </View>
          <Text style={[styles.financeValue, { color: fees.dueAmount > 0 ? C.primary : '#111827' }]}>
            {formatCurrency(fees.dueAmount)}
          </Text>
          <Text style={styles.financeLabel}>Balance Due</Text>
        </View>
      </View>
      <View style={[styles.trendTrack, { marginTop: 16 }]}>
        <View style={[styles.trendFill, { width: `${paidPct}%` }]} />
      </View>
      <Text style={styles.feeFootnote}>
        {fees.structureName || 'Fee structure'} • {fees.status}
      </Text>
    </>
  );
};

const NoticeDetailModal = ({
  visible,
  notice,
  onClose,
}: {
  visible: boolean;
  notice: Notice | null;
  onClose: () => void;
}) => {
  if (!notice) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeaderRow}>
            <View style={styles.modalHeaderIcon}>
              <Feather name="volume-2" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.modalHeaderTitle}>School Announcement Detail</Text>
              <Text style={styles.modalHeaderSubtitle}>Official notice published by administration.</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={22} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalDivider} />

          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.modalPillsRow}>
              <View style={styles.modalStatusPill}>
                <Text style={styles.modalStatusPillText}>{notice.status || 'Published Announcement'}</Text>
              </View>
              <View style={styles.modalCategoryPill}>
                <Text style={styles.modalCategoryPillText}>{notice.category || 'General'}</Text>
              </View>
            </View>

            <Text style={styles.modalNoticeTitle}>{notice.title}</Text>

            <View style={styles.modalInfoBox}>
              <View style={styles.modalInfoItem}>
                <Feather name="calendar" size={14} color={C.primary} />
                <Text style={styles.modalInfoLabel}>Publish:</Text>
                <Text style={styles.modalInfoValue}>{notice.noticeDate}</Text>
              </View>
              {notice.submissionDate ? (
                <View style={styles.modalInfoItem}>
                  <Feather name="clock" size={14} color="#f59e0b" />
                  <Text style={styles.modalInfoLabel}>Deadline:</Text>
                  <Text style={styles.modalInfoValue}>{notice.submissionDate}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.modalContentBox}>
              <Text style={styles.modalContentText}>
                {stripHtml(notice.description, 4000) || 'No further details were provided for this notice.'}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// --- Main Screen ---

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [userName, setUserName] = useState('User');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [activeWardIndex, setActiveWardIndex] = useState<number>(0);

  const fetchDashboardStats = useCallback(async (isSilent: boolean = false) => {
    try {
      if (!isSilent) setLoading(true);

      const response = await axios.get(`${API_BASE}/dashboard/stats`);
      if (response.data && response.data.success) {
        setData(response.data.data);
        setError(null);
      } else {
        if (!isSilent) setError('Failed to load dashboard data.');
      }
    } catch (err) {
      console.error('API Error:', err);
      if (!isSilent) setError('An error occurred while fetching data. Please check your connection.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const name = await AsyncStorage.getItem('userName');
      if (name) setUserName(name);
    })();

    fetchDashboardStats(false);

    const interval = setInterval(() => {
      fetchDashboardStats(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchDashboardStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboardStats(true);
    setRefreshing(false);
  }, [fetchDashboardStats]);

  // Screens that don't exist for a given role shouldn't hard-crash the app.
  const go = useCallback(
    (screen: string) => () => {
      try {
        navigation.navigate(screen);
      } catch (e) {
        console.warn(`Route "${screen}" is not registered for this role.`);
      }
    },
    [navigation],
  );

  const activeWard: Ward | null = useMemo(() => {
    const wards = data?.parentData?.wards || [];
    if (!wards.length) return data?.parentData?.primaryWard || null;
    return wards[Math.min(activeWardIndex, wards.length - 1)];
  }, [data, activeWardIndex]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorIconCircle}>
          <Feather name="wifi-off" size={26} color={C.primary} />
        </View>
        <Text style={styles.errorText}>{error || 'No data available'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchDashboardStats(false)}>
          <Feather name="refresh-cw" size={14} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const userType = data.userType;
  const isAdmin = userType === 'admin';
  const isTeacher = userType === 'staff' && !!data.myTeachingProfile?.isTeacher;
  const isStudent = userType === 'student' && !!data.studentData;
  const isParent = userType === 'parent' && !!data.parentData;

  const displayName =
    data.myTeachingProfile?.name ||
    data.studentData?.profile?.name ||
    userName;

  const workspaceLabel = isAdmin
    ? 'School Control Centre'
    : isTeacher
    ? 'Teacher Academic Workspace'
    : isParent
    ? 'Parent Portal'
    : isStudent
    ? 'Student Portal'
    : `${data.userRole} Workspace`;

  /* ------------------------------ Shared blocks ------------------------------ */

  const NoticesSection = (
    <View style={styles.cardContainer}>
      <SectionHeader
        icon="volume-2"
        title="Notices & Circulars"
        subtitle="Official announcements from administration"
        onViewAll={go('Notice Board')}
      />
      {data.recentNotices && data.recentNotices.length > 0 ? (
        data.recentNotices.map((notice) => (
          <NoticeCard key={notice._id} notice={notice} onPress={() => setSelectedNotice(notice)} />
        ))
      ) : (
        <EmptyState icon="bell-off" message="No active notices at this time." />
      )}
    </View>
  );

  const HolidaysSection = (
    <View style={styles.cardContainer}>
      <SectionHeader icon="sun" title="School Holidays" subtitle="Official vacation dates" onViewAll={go('Holidays')} />
      {data.upcomingHolidays && data.upcomingHolidays.length > 0 ? (
        data.upcomingHolidays.map((h, i) => <HolidayRow key={h._id || i} holiday={h} />)
      ) : (
        <EmptyState icon="calendar" message="No upcoming holidays announced." />
      )}
    </View>
  );

  /* --------------------------------- ADMIN --------------------------------- */

  const staffTotal = (data.staffByType || []).reduce((sum, t) => sum + t.count, 0);

  const renderAdmin = () => (
    <>
      <View style={styles.primaryGrid}>
        <PrimaryStatCard icon="users" title="Students" value={data.totalStudents} color="#2563EB" bgColor="#EFF6FF" onPress={go('Students')} />
        <PrimaryStatCard icon="user-check" title="Staff" value={data.totalStaff} color={C.primary} bgColor={C.primarySoft} onPress={go('Staff')} />
        <PrimaryStatCard icon="layers" title="Classes" value={data.totalClasses} color="#8b5cf6" bgColor="#F5F3FF" onPress={go('Classes')} />
        <PrimaryStatCard icon="book-open" title="Subjects" value={data.totalSubjects} color="#f59e0b" bgColor="#FFFBEB" onPress={go('Subjects')} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.metricChipRow}
        style={{ marginBottom: 20 }}
      >
        <MetricChip icon="git-branch" label="Branches" value={data.totalSchools} color="#db2777" bgColor="#FDF2F8" />
        <MetricChip icon="edit-3" label="Homework" value={data.totalHomework} color="#14b8a6" bgColor="#F0FDFA" />
        <MetricChip icon="award" label="Exams" value={data.totalExams} color="#e11d48" bgColor="#FFF1F2" />
        <MetricChip icon="bell" label="Notices" value={data.totalNotices} color={C.primary} bgColor={C.primarySoft} />
        <MetricChip icon="shield" label="Roles" value={data.totalRoles} color="#0891b2" bgColor="#ECFEFF" />
        <MetricChip icon="trending-up" label="Promotions" value={data.totalPromotions} color="#7c3aed" bgColor="#F5F3FF" />
        <MetricChip
          icon="briefcase"
          label="Pending Leaves"
          value={data.pendingLeavesCount}
          color="#f97316"
          bgColor="#FFF7ED"
          highlight={data.pendingLeavesCount > 0}
        />
      </ScrollView>

      {/* Finance Overview */}
      <View style={styles.cardContainer}>
        <SectionHeader icon="pie-chart" title="Finance Overview" onViewAll={go('Finance')} />
        <View style={styles.financeRow}>
          <View style={styles.financeItem}>
            <View style={[styles.financeIcon, { backgroundColor: '#F0FDF4' }]}>
              <Feather name="arrow-down-left" size={16} color="#16a34a" />
            </View>
            <Text style={styles.financeValue}>{formatCurrency(data.finance?.totalIncome ?? 0)}</Text>
            <Text style={styles.financeLabel}>Income</Text>
          </View>
          <View style={styles.financeDivider} />
          <View style={styles.financeItem}>
            <View style={[styles.financeIcon, { backgroundColor: C.primarySoft }]}>
              <Feather name="arrow-up-right" size={16} color={C.primary} />
            </View>
            <Text style={styles.financeValue}>{formatCurrency(data.finance?.totalExpense ?? 0)}</Text>
            <Text style={styles.financeLabel}>Expenses</Text>
          </View>
          <View style={styles.financeDivider} />
          <View style={styles.financeItem}>
            <View style={[styles.financeIcon, { backgroundColor: '#ECFEFF' }]}>
              <Feather name="dollar-sign" size={16} color="#0891b2" />
            </View>
            <Text
              style={[
                styles.financeValue,
                { color: (data.finance?.netBalance ?? 0) < 0 ? C.primary : '#111827' },
              ]}
            >
              {formatCurrency(data.finance?.netBalance ?? 0)}
            </Text>
            <Text style={styles.financeLabel}>Net Balance</Text>
          </View>
        </View>
      </View>

      {NoticesSection}

      {/* Today's Attendance */}
      <View style={styles.cardContainer}>
        <SectionHeader icon="check-square" title="Today's Attendance" onViewAll={go('Class Attendance')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
          <AttendanceCard icon="check-circle" title="Present" value={data.attendance.todayPresent} color="#22c55e" bgColor="#F0FDF4" />
          <AttendanceCard icon="x-circle" title="Absent" value={data.attendance.todayAbsent} color={C.primary} bgColor={C.primarySoft} />
          <AttendanceCard icon="clock" title="Half-Day" value={data.attendance.todayHalfDay} color="#f59e0b" bgColor="#FFFBEB" />
          <AttendanceCard icon="log-out" title="On Leave" value={data.attendance.todayOnLeave} color="#8b5cf6" bgColor="#F5F3FF" />
          <AttendanceCard icon="users" title="Total" value={data.attendance.todayTotal} color="#06b6d4" bgColor="#ECFEFF" />
        </ScrollView>
      </View>

      {/* 7-day trend */}
      <View style={styles.cardContainer}>
        <SectionHeader icon="trending-up" title="7-Day Attendance Trend" />
        {data.attendance.trend && data.attendance.trend.length > 0 ? (
          data.attendance.trend.map((day, index) => <TrendRow key={index} trend={day} />)
        ) : (
          <EmptyState icon="bar-chart-2" message="No attendance data for the last 7 days." />
        )}
      </View>

      {/* Branch-wise summary */}
      {data.branchWiseSummary && data.branchWiseSummary.length > 0 ? (
        <View style={styles.cardContainer}>
          <SectionHeader icon="git-branch" title="Branch Performance" subtitle="Across all campuses" onViewAll={go('Schools')} />
          {data.branchWiseSummary.map((b) => (
            <View key={b.schoolId} style={styles.branchCard}>
              <View style={styles.branchTop}>
                <Text style={styles.itemTitle} numberOfLines={1}>{b.name}</Text>
                <Text style={styles.tagText}>{b.code}</Text>
              </View>
              <Text style={styles.itemSubtitle}>{b.city}</Text>
              <View style={styles.branchStatsRow}>
                <View style={styles.branchStat}>
                  <Text style={styles.branchStatValue}>{b.totalStudents}</Text>
                  <Text style={styles.branchStatLabel}>Students</Text>
                </View>
                <View style={styles.branchStat}>
                  <Text style={styles.branchStatValue}>{b.totalStaff}</Text>
                  <Text style={styles.branchStatLabel}>Staff</Text>
                </View>
                <View style={styles.branchStat}>
                  <Text style={styles.branchStatValue}>{b.totalClasses}</Text>
                  <Text style={styles.branchStatLabel}>Classes</Text>
                </View>
                <View style={styles.branchStat}>
                  <Text style={[styles.branchStatValue, { color: '#22c55e' }]}>{b.todayAttendancePct}%</Text>
                  <Text style={styles.branchStatLabel}>Present</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Fee collection (admin sees the accountant block) */}
      {data.accountantData ? (
        <View style={styles.cardContainer}>
          <SectionHeader icon="credit-card" title="Fee Collection" onViewAll={go('Fees')} />
          <View style={styles.financeRow}>
            <View style={styles.financeItem}>
              <View style={[styles.financeIcon, { backgroundColor: '#F0FDF4' }]}>
                <Feather name="calendar" size={16} color="#16a34a" />
              </View>
              <Text style={styles.financeValue}>{formatCurrency(data.accountantData.fees.todayCollected)}</Text>
              <Text style={styles.financeLabel}>Today</Text>
            </View>
            <View style={styles.financeDivider} />
            <View style={styles.financeItem}>
              <View style={[styles.financeIcon, { backgroundColor: '#EFF6FF' }]}>
                <Feather name="bar-chart-2" size={16} color="#2563EB" />
              </View>
              <Text style={styles.financeValue}>{formatCurrency(data.accountantData.fees.monthCollected)}</Text>
              <Text style={styles.financeLabel}>This Month</Text>
            </View>
            <View style={styles.financeDivider} />
            <View style={styles.financeItem}>
              <View style={[styles.financeIcon, { backgroundColor: C.primarySoft }]}>
                <Feather name="alert-circle" size={16} color={C.primary} />
              </View>
              <Text style={[styles.financeValue, { color: C.primary }]}>
                {formatCurrency(data.accountantData.fees.totalDueAmount)}
              </Text>
              <Text style={styles.financeLabel}>Outstanding</Text>
            </View>
          </View>
          <Text style={styles.feeFootnote}>
            {data.accountantData.fees.overdueStudentsCount} students with overdue fees
          </Text>
        </View>
      ) : null}

      {/* Staff by Type */}
      <View style={styles.cardContainer}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.sectionHeaderIcon}>
              <Feather name="user-check" size={15} color={C.primary} />
            </View>
            <Text style={styles.sectionTitle}>Staff by Type</Text>
          </View>
          <Text style={styles.viewAllText}>Total: {staffTotal}</Text>
        </View>
        {data.staffByType && data.staffByType.length > 0 ? (
          data.staffByType.map((type, index) => <StaffTypeRow key={index} type={type} total={staffTotal} />)
        ) : (
          <EmptyState message="No staff types found." />
        )}
      </View>

      {/* Recently Added Staff */}
      <View style={styles.cardContainer}>
        <SectionHeader icon="user-plus" title="Recently Added Staff" onViewAll={go('Staff')} />
        {data.recentStaff && data.recentStaff.length > 0 ? (
          data.recentStaff.map((staff) => (
            <View key={staff._id} style={styles.listItem}>
              <View style={styles.listAvatar}>
                <Text style={styles.listAvatarText}>{getInitials(staff.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{staff.name}</Text>
                <Text style={styles.itemSubtitle}>{staff.staffId} • {staff.mobile}</Text>
              </View>
              <Text style={styles.tagText}>{staff.staffType}</Text>
            </View>
          ))
        ) : (
          <EmptyState message="No staff members added recently." />
        )}
      </View>

      {/* Recent Leave Applications */}
      <View style={styles.cardContainer}>
        <SectionHeader icon="file-minus" title="Recent Leave Applications" onViewAll={go('Leaves')} />
        {data.recentLeaves && data.recentLeaves.length > 0 ? (
          data.recentLeaves.map((leave) => (
            <View key={leave._id} style={styles.listItem}>
              <View style={styles.listAvatar}>
                <Text style={styles.listAvatarText}>{getInitials(leave.staff?.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{leave.staff?.name}</Text>
                <Text style={styles.itemSubtitle}>
                  {leave.leaveType?.name} • {formatDate(leave.fromDate)} - {formatDate(leave.toDate)} ({leave.totalDays}d)
                </Text>
              </View>
              <Text
                style={[
                  styles.tagText,
                  leave.status === 'Approved' && styles.tagGreen,
                  leave.status === 'Rejected' && styles.tagRed,
                  leave.status === 'Pending' && styles.tagOrange,
                ]}
              >
                {leave.status}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState message="No leave applications found." />
        )}
      </View>

      {/* Recent Homework */}
      <View style={styles.cardContainer}>
        <SectionHeader icon="edit-3" title="Recent Homework" onViewAll={go('Homework')} />
        {data.recentHomework && data.recentHomework.length > 0 ? (
          data.recentHomework.map((hw) => <HomeworkRow key={hw._id} hw={hw} />)
        ) : (
          <EmptyState message="No homework assigned recently." />
        )}
      </View>

      {/* Library snapshot */}
      {data.librarianData ? (
        <View style={styles.cardContainer}>
          <SectionHeader icon="book" title="Library Snapshot" onViewAll={go('Library')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
            <AttendanceCard icon="book" title="Titles" value={data.librarianData.totalBooks} color="#2563EB" bgColor="#EFF6FF" />
            <AttendanceCard icon="copy" title="Copies" value={data.librarianData.totalCopies} color="#8b5cf6" bgColor="#F5F3FF" />
            <AttendanceCard icon="check-circle" title="Available" value={data.librarianData.availableCopies} color="#22c55e" bgColor="#F0FDF4" />
            <AttendanceCard icon="log-out" title="Issued" value={data.librarianData.issuedBooks} color="#f59e0b" bgColor="#FFFBEB" />
            <AttendanceCard icon="alert-circle" title="Overdue" value={data.librarianData.overdueBooks} color={C.primary} bgColor={C.primarySoft} />
          </ScrollView>
        </View>
      ) : null}

      {/* Admissions funnel */}
      {data.receptionistData ? (
        <View style={styles.cardContainer}>
          <SectionHeader icon="user-plus" title="Admission Enquiries" onViewAll={go('Enquiries')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
            <AttendanceCard icon="inbox" title="Total" value={data.receptionistData.totalEnquiries} color="#2563EB" bgColor="#EFF6FF" />
            <AttendanceCard icon="star" title="New" value={data.receptionistData.newEnquiries} color="#f59e0b" bgColor="#FFFBEB" />
            <AttendanceCard icon="map-pin" title="Visits" value={data.receptionistData.campusVisits} color="#8b5cf6" bgColor="#F5F3FF" />
            <AttendanceCard icon="check-circle" title="Admitted" value={data.receptionistData.admitted} color="#22c55e" bgColor="#F0FDF4" />
            <AttendanceCard icon="phone" title="Follow-ups" value={data.receptionistData.todayFollowUpsCount} color={C.primary} bgColor={C.primarySoft} />
          </ScrollView>
        </View>
      ) : null}

      {/* Recent Schools */}
      <View style={styles.cardContainer}>
        <SectionHeader icon="git-branch" title="Recent Schools" onViewAll={go('Schools')} />
        {data.recentSchools && data.recentSchools.length > 0 ? (
          data.recentSchools.map((school) => (
            <View key={school._id} style={styles.listItem}>
              <View style={[styles.listAvatar, { backgroundColor: '#FDF2F8' }]}>
                <Feather name="git-branch" size={15} color="#db2777" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{school.name}</Text>
                <Text style={styles.itemSubtitle}>{school.city}{school.state ? `, ${school.state}` : ''} • {school.board}</Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyState message="No schools added recently." />
        )}
      </View>

      {/* Recent Subjects */}
      <View style={styles.cardContainer}>
        <SectionHeader icon="book-open" title="Recent Subjects" onViewAll={go('Subjects')} />
        {data.recentSubjects && data.recentSubjects.length > 0 ? (
          data.recentSubjects.map((sub) => (
            <View key={sub._id} style={styles.listItem}>
              <View style={[styles.listAvatar, { backgroundColor: '#FFFBEB' }]}>
                <Feather name="book-open" size={15} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{sub.name}</Text>
                <Text style={styles.itemSubtitle}>Code: {sub.code}</Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyState message="No subjects added recently." />
        )}
      </View>
    </>
  );

  /* -------------------------------- TEACHER -------------------------------- */

  const renderTeacher = () => {
    const p = data.myTeachingProfile!;
    const photo = resolvePhoto(p.photo);
    const attTone = attendanceTone(p.myAttendanceToday);

    return (
      <>
        {/* Identity banner */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.heroAvatarImg} />
            ) : (
              <View style={styles.heroAvatar}>
                <Text style={styles.heroAvatarText}>{getInitials(p.name)}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.heroName} numberOfLines={1}>{p.name}</Text>
              <View style={styles.heroBadgeRow}>
                <View style={styles.heroBadgeDark}>
                  <Text style={styles.heroBadgeDarkText}>{p.staffId}</Text>
                </View>
                <View style={styles.heroBadgeSoft}>
                  <Text style={styles.heroBadgeSoftText}>{p.designation || p.staffType}</Text>
                </View>
              </View>
              <Text style={styles.heroSubtitle} numberOfLines={1}>
                Live allotted classes & student insights
              </Text>
            </View>
          </View>
          <View style={styles.heroFooterRow}>
            <View style={[styles.heroStatusPill, { backgroundColor: attTone.bg }]}>
              <Feather name="clock" size={12} color={attTone.fg} />
              <Text style={[styles.heroStatusPillText, { color: attTone.fg }]}>
                Today's attendance: {p.myAttendanceToday}
              </Text>
            </View>
            <TouchableOpacity style={styles.heroCta} onPress={go('My Classes')} activeOpacity={0.85}>
              <Text style={styles.heroCtaText}>My Classes ({p.totalAssignedClasses})</Text>
              <Feather name="arrow-right" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Teaching KPIs */}
        <View style={styles.primaryGrid}>
          <PrimaryStatCard
            icon="layers"
            title="My Allotted Classes"
            value={p.totalAssignedClasses}
            caption={`${p.totalAssignedClasses} classes`}
            color="#8b5cf6"
            bgColor="#F5F3FF"
            onPress={go('My Classes')}
          />
          <PrimaryStatCard
            icon="users"
            title="Students Under Teaching"
            value={p.totalAssignedStudents}
            caption="Live enrolled"
            color="#2563EB"
            bgColor="#EFF6FF"
          />
          <PrimaryStatCard
            icon="book-open"
            title="Subjects Taught"
            value={p.totalAssignedSubjects}
            caption={p.assignedSubjects.map((s) => s.name).join(', ') || undefined}
            color="#f59e0b"
            bgColor="#FFFBEB"
          />
          <PrimaryStatCard
            icon="clock"
            title="Today's Periods"
            value={p.todaySchedule?.length || 0}
            caption={p.todaySchedule?.length ? undefined : 'No class today'}
            color="#16a34a"
            bgColor="#F0FDF4"
            onPress={go('Class Timetable')}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricChipRow}
          style={{ marginBottom: 20 }}
        >
          <MetricChip icon="check-square" label="My Attendance" value={p.myAttendanceToday} color="#06b6d4" bgColor="#ECFEFF" />
          <MetricChip icon="edit-3" label="Homework Given" value={p.recentHomework?.length || 0} color="#14b8a6" bgColor="#F0FDFA" />
          <MetricChip icon="file-text" label="Diary Notes" value={p.recentDiary?.length || 0} color="#db2777" bgColor="#FDF2F8" />
          <MetricChip icon="briefcase" label="My Leaves" value={p.recentLeaves?.length || 0} color="#f97316" bgColor="#FFF7ED" />
        </ScrollView>

        {/* Today's timetable */}
        <View style={styles.cardContainer}>
          <SectionHeader
            icon="calendar"
            title="My Schedule Today"
            subtitle="Live timetable for today"
            actionLabel="Full week"
            onViewAll={go('Class Timetable')}
          />
          {p.todaySchedule && p.todaySchedule.length > 0 ? (
            p.todaySchedule.map((period, i) => <ScheduleRow key={period._id || i} period={period} />)
          ) : (
            <EmptyState icon="coffee" message="No scheduled periods today." />
          )}
        </View>

        {/* Allotted classes */}
        <View style={styles.cardContainer}>
          <SectionHeader
            icon="users"
            title="My Allotted Classes"
            subtitle={`${p.totalAssignedClasses} classes • ${p.totalAssignedStudents} students enrolled`}
            onViewAll={go('My Classes')}
          />
          {p.assignedClasses && p.assignedClasses.length > 0 ? (
            p.assignedClasses.map((c) => (
              <View key={c._id} style={styles.classCard}>
                <View style={styles.classCardTop}>
                  <View style={styles.classPill}>
                    <Text style={styles.classPillText}>{classLabel(c.className, c.division)}</Text>
                  </View>
                  {c.syllabus ? (
                    <View style={styles.classSyllabusPill}>
                      <Text style={styles.classSyllabusText}>{c.syllabus}</Text>
                    </View>
                  ) : null}
                  {c.isClassTeacher ? (
                    <View style={styles.classTeacherPill}>
                      <Text style={styles.classTeacherPillText}>Class Teacher</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.classCountBox}>
                  <Text style={styles.classCountValue}>{c.studentCount}</Text>
                  <Text style={styles.classCountLabel}>Students enrolled</Text>
                  <View style={styles.classGenderRow}>
                    <View style={styles.genderPill}>
                      <Feather name="user" size={11} color="#2563EB" />
                      <Text style={[styles.genderPillText, { color: '#2563EB' }]}>{c.boysCount} Boys</Text>
                    </View>
                    <View style={[styles.genderPill, { backgroundColor: '#FDF2F8' }]}>
                      <Feather name="user" size={11} color="#db2777" />
                      <Text style={[styles.genderPillText, { color: '#db2777' }]}>{c.girlsCount} Girls</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.classActionRow}>
                  <TouchableOpacity
                    style={[styles.classAction, c.isAttendanceMarkedToday ? styles.classActionDone : styles.classActionPrimary]}
                    onPress={go('Class Attendance')}
                    activeOpacity={0.85}
                  >
                    <Feather name={c.isAttendanceMarkedToday ? 'check-circle' : 'check-square'} size={13} color="#fff" />
                    <Text style={styles.classActionText}>
                      {c.isAttendanceMarkedToday ? 'Attendance Marked' : 'Mark Attendance'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.classAction, styles.classActionGhost]} onPress={go('Homework')} activeOpacity={0.85}>
                    <Feather name="edit-3" size={13} color={C.primary} />
                    <Text style={styles.classActionGhostText}>Homework</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.classAction, styles.classActionGhost]} onPress={go('Class Diary')} activeOpacity={0.85}>
                    <Feather name="book" size={13} color={C.primary} />
                    <Text style={styles.classActionGhostText}>Class Diary</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.classAction, styles.classActionGhost]} onPress={go('Class Timetable')} activeOpacity={0.85}>
                    <Feather name="calendar" size={13} color={C.primary} />
                    <Text style={styles.classActionGhostText}>Timetable</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <EmptyState icon="layers" message="No classes allotted to you yet." />
          )}
        </View>

        {/* Subjects I teach */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="book-open" title="Subjects I Teach" />
          {p.assignedSubjects && p.assignedSubjects.length > 0 ? (
            p.assignedSubjects.map((s) => (
              <View key={s._id} style={styles.listItem}>
                <View style={[styles.listAvatar, { backgroundColor: '#FFFBEB' }]}>
                  <Feather name="book-open" size={15} color="#f59e0b" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{s.name}</Text>
                  <Text style={styles.itemSubtitle}>Code: {s.code}</Text>
                </View>
              </View>
            ))
          ) : (
            <EmptyState message="No subjects assigned." />
          )}
        </View>

        {/* Homework I assigned */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="edit-3" title="Homework I Assigned" onViewAll={go('Homework')} />
          {p.recentHomework && p.recentHomework.length > 0 ? (
            p.recentHomework.map((hw) => <HomeworkRow key={hw._id} hw={hw} />)
          ) : (
            <EmptyState message="You haven't assigned any homework yet." />
          )}
        </View>

        {/* My leaves */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="briefcase" title="My Leave Applications" actionLabel="Apply Leave" onViewAll={go('Apply Leave')} />
          {p.recentLeaves && p.recentLeaves.length > 0 ? (
            p.recentLeaves.map((l, i) => <LeaveRow key={l._id || i} leave={l} />)
          ) : (
            <EmptyState icon="file-minus" message="No leave requests submitted." />
          )}
        </View>

        {NoticesSection}
        {HolidaysSection}
      </>
    );
  };

  /* ---------------------- STUDENT / WARD (shared block) ---------------------- */

  const renderLearner = (
    profile: StudentProfile,
    attendance: StudentAttendance,
    academics: StudentAcademics,
    homeworkList: HomeworkItem[],
    homeworkCount: number,
    fees: StudentFees,
    schedule: SchedulePeriod[],
    leaves: LeaveApplication[],
    forParent: boolean,
  ) => {
    const photo = resolvePhoto(profile.photo);
    const tone = attendanceTone(attendance.todayStatus);
    const who = forParent ? profile.name : 'You';
    const markedDays = attendance.totalMarkedDays ?? attendance.totalDays ?? 0;

    return (
      <>
        {/* Identity banner */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.heroAvatarImg} />
            ) : (
              <View style={styles.heroAvatar}>
                <Text style={styles.heroAvatarText}>{getInitials(profile.name)}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.heroName} numberOfLines={1}>{profile.name}</Text>
              <View style={styles.heroBadgeRow}>
                <View style={styles.heroBadgeDark}>
                  <Text style={styles.heroBadgeDarkText}>{classLabel(profile.className, profile.division)}</Text>
                </View>
                <View style={styles.heroBadgeSoft}>
                  <Text style={styles.heroBadgeSoftText}>Roll {profile.rollNo}</Text>
                </View>
                <View style={styles.heroBadgeSoft}>
                  <Text style={styles.heroBadgeSoftText}>{profile.admissionNo}</Text>
                </View>
              </View>
              <Text style={styles.heroSubtitle} numberOfLines={1}>
                {profile.schoolName}
                {profile.syllabus ? ` • ${profile.syllabus}` : ''}
              </Text>
            </View>
          </View>
          <View style={styles.heroFooterRow}>
            <View style={[styles.heroStatusPill, { backgroundColor: tone.bg }]}>
              <Feather name="check-square" size={12} color={tone.fg} />
              <Text style={[styles.heroStatusPillText, { color: tone.fg }]}>
                Today's attendance: {attendance.todayStatus}
              </Text>
            </View>
            {profile.classMatesCount ? (
              <View style={styles.heroGhostPill}>
                <Feather name="users" size={12} color="#6B7280" />
                <Text style={styles.heroGhostPillText}>{profile.classMatesCount} classmates</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Learner KPIs */}
        <View style={styles.primaryGrid}>
          <PrimaryStatCard
            icon="check-circle"
            title="Attendance Rate"
            value={`${attendance.percentage}%`}
            caption={`${attendance.presentDays}/${markedDays} days`}
            color="#22c55e"
            bgColor="#F0FDF4"
            onPress={go('Student Attendance')}
          />
          <PrimaryStatCard
            icon="award"
            title="Exam Average"
            value={`${academics.averagePercentage}%`}
            caption={academics.totalExams ? `${academics.totalExams} exams` : 'No results yet'}
            color="#8b5cf6"
            bgColor="#F5F3FF"
            onPress={go('Exam Results')}
          />
          <PrimaryStatCard
            icon="edit-3"
            title="Pending Homework"
            value={homeworkCount}
            caption={homeworkCount > 0 ? 'Due tasks' : 'All clear'}
            color="#f59e0b"
            bgColor="#FFFBEB"
            onPress={go('Homework')}
          />
          <PrimaryStatCard
            icon="credit-card"
            title="Fee Balance"
            value={formatCurrency(fees.dueAmount)}
            caption={fees.status}
            color={fees.dueAmount > 0 ? C.primary : '#16a34a'}
            bgColor={fees.dueAmount > 0 ? C.primarySoft : '#F0FDF4'}
            onPress={go('Fees & Payment')}
          />
        </View>

        {/* Today's schedule */}
        <View style={styles.cardContainer}>
          <SectionHeader
            icon="calendar"
            title={forParent ? `${profile.name.split(' ')[0]}'s Schedule Today` : 'My Schedule Today'}
            subtitle="Live timetable for today"
            actionLabel="Full week"
            onViewAll={go('Class Timetable')}
          />
          {schedule && schedule.length > 0 ? (
            schedule.map((period, i) => <ScheduleRow key={period._id || i} period={period} />)
          ) : (
            <EmptyState icon="coffee" message="No scheduled periods today." />
          )}
        </View>

        {/* Homework */}
        <View style={styles.cardContainer}>
          <SectionHeader
            icon="edit-3"
            title={forParent ? `Homework Given to ${profile.name.split(' ')[0]}` : 'My Homework'}
            subtitle="Assignments and home tasks"
            onViewAll={go('Homework')}
          />
          {homeworkList && homeworkList.length > 0 ? (
            homeworkList.map((hw) => <HomeworkRow key={hw._id} hw={hw} />)
          ) : (
            <EmptyState icon="check-circle" message="No homework assigned right now." />
          )}
        </View>

        {/* Attendance detail */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="check-square" title="Attendance Summary" onViewAll={go('Student Attendance')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
            <AttendanceCard icon="check-circle" title="Present" value={attendance.presentDays} color="#22c55e" bgColor="#F0FDF4" />
            <AttendanceCard icon="x-circle" title="Absent" value={attendance.absentDays} color={C.primary} bgColor={C.primarySoft} />
            <AttendanceCard icon="clock" title="Half-Day" value={attendance.halfDays || 0} color="#f59e0b" bgColor="#FFFBEB" />
            <AttendanceCard icon="log-out" title="On Leave" value={attendance.leaveDays || 0} color="#8b5cf6" bgColor="#F5F3FF" />
            <AttendanceCard icon="calendar" title="Marked" value={markedDays} color="#06b6d4" bgColor="#ECFEFF" />
          </ScrollView>
          {attendance.recentRecords && attendance.recentRecords.length > 0 ? (
            <View style={{ marginTop: 14 }}>
              {attendance.recentRecords.slice(0, 5).map((r, i) => {
                const t = attendanceTone(r.status);
                return (
                  <View key={r._id || i} style={styles.listItem}>
                    <View style={[styles.listAvatar, { backgroundColor: t.bg }]}>
                      <Feather name="calendar" size={15} color={t.fg} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{formatDate(r.date)}</Text>
                      {r.remarks ? <Text style={styles.itemSubtitle}>{r.remarks}</Text> : null}
                    </View>
                    <Text style={[styles.tagText, { backgroundColor: t.bg, color: t.fg }]}>{r.status}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* Exam results */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="award" title="Exam Results" onViewAll={go('Exam Results')} />
          {academics.recentResults && academics.recentResults.length > 0 ? (
            academics.recentResults.map((r, i) => (
              <View key={r._id || i} style={styles.listItem}>
                <View style={[styles.listAvatar, { backgroundColor: '#FFF1F2' }]}>
                  <Feather name="award" size={15} color="#e11d48" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{r.examName || r.subjectName || 'Exam'}</Text>
                  <Text style={styles.itemSubtitle} numberOfLines={1}>
                    {r.subjectName ? `${r.subjectName} • ` : ''}
                    {r.marksObtained ?? '-'}/{r.maxMarks ?? '-'}
                  </Text>
                </View>
                <Text style={styles.badgeGreen}>{r.grade || `${r.percentage ?? 0}%`}</Text>
              </View>
            ))
          ) : (
            <EmptyState icon="bar-chart-2" message="No exam results published yet." />
          )}
        </View>

        {/* Fee account */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="credit-card" title="Fee Account" subtitle={fees.structureName} onViewAll={go('Fees & Payment')} />
          <FeeSummary fees={fees} />
          {fees.components && fees.components.length > 0 ? (
            <View style={{ marginTop: 14 }}>
              {fees.components.map((c, i) => (
                <View key={i} style={styles.listItem}>
                  <View style={[styles.listAvatar, { backgroundColor: '#EFF6FF' }]}>
                    <Feather name="file-text" size={15} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{c.name}</Text>
                  </View>
                  <Text style={styles.tagText}>{formatCurrency(c.amount || 0)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Leaves */}
        <View style={styles.cardContainer}>
          <SectionHeader
            icon="briefcase"
            title="Leave Applications"
            subtitle={forParent ? `Leave status for ${profile.name.split(' ')[0]}` : undefined}
            actionLabel="Apply Leave"
            onViewAll={go('Apply Leave')}
          />
          {leaves && leaves.length > 0 ? (
            leaves.map((l, i) => <LeaveRow key={l._id || i} leave={l} />)
          ) : (
            <EmptyState icon="file-minus" message="No leave requests submitted." />
          )}
        </View>

        {NoticesSection}
        {HolidaysSection}
      </>
    );
  };

  const renderStudent = () => {
    const s = data.studentData!;
    return renderLearner(
      s.profile,
      s.attendance,
      s.academics,
      s.homework?.recentList || [],
      s.homework?.activeCount || 0,
      s.fees,
      s.todaySchedule || [],
      s.leaves || [],
      false,
    );
  };

  const renderParent = () => {
    const pd = data.parentData!;
    const ward = activeWard;

    if (!ward) {
      return (
        <View style={styles.cardContainer}>
          <EmptyState icon="users" message="No student is linked to your account yet." />
        </View>
      );
    }

    return (
      <>
        {/* Ward switcher — only meaningful with more than one child */}
        {pd.totalWards > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.wardSwitchRow}
            style={{ marginBottom: 16 }}
          >
            {pd.wards.map((w, i) => {
              const active = i === Math.min(activeWardIndex, pd.wards.length - 1);
              return (
                <TouchableOpacity
                  key={w._id}
                  style={[styles.wardChip, active && styles.wardChipActive]}
                  onPress={() => setActiveWardIndex(i)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.wardChipAvatar, active && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                    <Text style={[styles.wardChipAvatarText, active && { color: '#fff' }]}>{getInitials(w.name)}</Text>
                  </View>
                  <View>
                    <Text style={[styles.wardChipName, active && { color: '#fff' }]} numberOfLines={1}>{w.name}</Text>
                    <Text style={[styles.wardChipMeta, active && { color: 'rgba(255,255,255,0.8)' }]}>
                      {classLabel(w.className, w.division)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        {renderLearner(
          ward,
          ward.attendance,
          ward.academics,
          ward.homework?.recentList || [],
          ward.homework?.pendingCount || 0,
          ward.fees,
          ward.todaySchedule || [],
          ward.leaves || [],
          true,
        )}
      </>
    );
  };

  /* ------------------------- OTHER STAFF (fallback) ------------------------- */

  const renderOtherStaff = () => (
    <>
      {data.accountantData ? (
        <View style={styles.cardContainer}>
          <SectionHeader icon="credit-card" title="Fee Collection" onViewAll={go('Fees')} />
          <View style={styles.financeRow}>
            <View style={styles.financeItem}>
              <View style={[styles.financeIcon, { backgroundColor: '#F0FDF4' }]}>
                <Feather name="calendar" size={16} color="#16a34a" />
              </View>
              <Text style={styles.financeValue}>{formatCurrency(data.accountantData.fees.todayCollected)}</Text>
              <Text style={styles.financeLabel}>Today</Text>
            </View>
            <View style={styles.financeDivider} />
            <View style={styles.financeItem}>
              <View style={[styles.financeIcon, { backgroundColor: '#EFF6FF' }]}>
                <Feather name="bar-chart-2" size={16} color="#2563EB" />
              </View>
              <Text style={styles.financeValue}>{formatCurrency(data.accountantData.fees.monthCollected)}</Text>
              <Text style={styles.financeLabel}>This Month</Text>
            </View>
            <View style={styles.financeDivider} />
            <View style={styles.financeItem}>
              <View style={[styles.financeIcon, { backgroundColor: C.primarySoft }]}>
                <Feather name="alert-circle" size={16} color={C.primary} />
              </View>
              <Text style={[styles.financeValue, { color: C.primary }]}>
                {formatCurrency(data.accountantData.fees.totalDueAmount)}
              </Text>
              <Text style={styles.financeLabel}>Outstanding</Text>
            </View>
          </View>
        </View>
      ) : null}

      {data.librarianData ? (
        <View style={styles.cardContainer}>
          <SectionHeader icon="book" title="Library Snapshot" onViewAll={go('Library')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
            <AttendanceCard icon="book" title="Titles" value={data.librarianData.totalBooks} color="#2563EB" bgColor="#EFF6FF" />
            <AttendanceCard icon="check-circle" title="Available" value={data.librarianData.availableCopies} color="#22c55e" bgColor="#F0FDF4" />
            <AttendanceCard icon="log-out" title="Issued" value={data.librarianData.issuedBooks} color="#f59e0b" bgColor="#FFFBEB" />
            <AttendanceCard icon="alert-circle" title="Overdue" value={data.librarianData.overdueBooks} color={C.primary} bgColor={C.primarySoft} />
          </ScrollView>
        </View>
      ) : null}

      {data.receptionistData ? (
        <View style={styles.cardContainer}>
          <SectionHeader icon="user-plus" title="Admission Enquiries" onViewAll={go('Enquiries')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
            <AttendanceCard icon="inbox" title="Total" value={data.receptionistData.totalEnquiries} color="#2563EB" bgColor="#EFF6FF" />
            <AttendanceCard icon="star" title="New" value={data.receptionistData.newEnquiries} color="#f59e0b" bgColor="#FFFBEB" />
            <AttendanceCard icon="check-circle" title="Admitted" value={data.receptionistData.admitted} color="#22c55e" bgColor="#F0FDF4" />
            <AttendanceCard icon="phone" title="Follow-ups" value={data.receptionistData.todayFollowUpsCount} color={C.primary} bgColor={C.primarySoft} />
          </ScrollView>
        </View>
      ) : null}

      {NoticesSection}
      {HolidaysSection}
    </>
  );

  /* -------------------------------- Render -------------------------------- */

  const renderByRole = () => {
    if (isAdmin) return renderAdmin();
    if (isTeacher) return renderTeacher();
    if (isParent) return renderParent();
    if (isStudent) return renderStudent();
    return renderOtherStaff();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} />}
      >
        {/* Header — colorful brand banner, same shell for every role */}
        <View style={styles.headerBanner}>
          <View style={styles.headerBannerGlowTop} />
          <View style={styles.headerBannerGlowBottom} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.welcomeText} numberOfLines={1}>Welcome back, {displayName}</Text>
              <View style={styles.headerMetaRow}>
                <Text style={styles.dateText}>
                  {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
                {!!data.activeAcademicYear && data.activeAcademicYear !== 'N/A' && (
                  <View style={styles.sessionPill}>
                    <Feather name="calendar" size={11} color="#fff" />
                    <Text style={styles.sessionPillText}>{data.activeAcademicYear}</Text>
                  </View>
                )}
              </View>
              <View style={styles.rolePill}>
                <Feather name="shield" size={11} color="#fff" />
                <Text style={styles.rolePillText}>{workspaceLabel}</Text>
              </View>
            </View>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveIndicatorText}>Live</Text>
            </View>
          </View>
        </View>

        <View style={styles.contentBody}>
          {renderByRole()}
        </View>
      </ScrollView>

      <NoticeDetailModal
        visible={!!selectedNotice}
        notice={selectedNotice}
        onClose={() => setSelectedNotice(null)}
      />
    </SafeAreaView>
  );
};

// --- Styles ---

const shadowSoft = {
  shadowColor: '#111827', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8FA' },
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F8FA', paddingHorizontal: 32 },
  contentContainer: { paddingBottom: 40 },
  contentBody: { padding: 18, paddingTop: 16 },

  // --- Header banner (brand-colored, sits above the scroll content) ---
  headerBanner: { backgroundColor: C.primary, paddingTop: 14, paddingBottom: 26, paddingHorizontal: 18, overflow: 'hidden' },
  headerBannerGlowTop: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)', top: -70, right: -40 },
  headerBannerGlowBottom: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -60, left: -30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  welcomeText: { fontSize: 21, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  dateText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  sessionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, gap: 4 },
  sessionPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rolePill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 5, marginTop: 8 },
  rolePillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, marginLeft: 10, marginTop: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80', marginRight: 5 },
  liveIndicatorText: { color: '#fff', fontWeight: '700', fontSize: 11 },

  // --- Identity hero (teacher / student / ward) ---
  heroCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, marginTop: -14, marginBottom: 16, borderWidth: 1, borderColor: C.primaryBorder, shadowColor: '#111827', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center' },
  heroAvatar: { width: 58, height: 58, borderRadius: 18, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  heroAvatarImg: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#F3F4F6' },
  heroAvatarText: { fontSize: 20, fontWeight: '800', color: C.primary },
  heroName: { fontSize: 19, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  heroBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  heroBadgeDark: { backgroundColor: C.primary, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  heroBadgeDarkText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  heroBadgeSoft: { backgroundColor: '#F3F4F6', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  heroBadgeSoftText: { color: '#4B5563', fontSize: 10, fontWeight: '700' },
  heroSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 6, fontWeight: '500' },
  heroFooterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  heroStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 12 },
  heroStatusPillText: { fontSize: 11, fontWeight: '700' },
  heroGhostPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 12, backgroundColor: '#F3F4F6' },
  heroGhostPillText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
  heroCtaText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // --- Ward switcher ---
  wardSwitchRow: { gap: 10, paddingRight: 18 },
  wardChip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#F1F2F4', maxWidth: 220 },
  wardChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  wardChipAvatar: { width: 34, height: 34, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  wardChipAvatarText: { fontSize: 12, fontWeight: '800', color: C.primary },
  wardChipName: { fontSize: 13, fontWeight: '800', color: '#111827' },
  wardChipMeta: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginTop: 1 },

  // --- Primary KPI grid ---
  primaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 4 },
  primaryCard: { backgroundColor: '#FFFFFF', width: '48%', padding: 18, borderRadius: 20, marginBottom: 12, borderTopWidth: 3, ...shadowSoft },
  primaryCardIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  primaryCardValue: { fontSize: 26, fontWeight: '800', color: '#111827' },
  primaryCardTitle: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  primaryCardCaption: { fontSize: 11, fontWeight: '700', marginTop: 6 },

  // --- Secondary metric chips ---
  metricChipRow: { paddingRight: 18, gap: 10 },
  metricChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, gap: 10, borderWidth: 1, borderColor: '#F1F2F4' },
  metricChipHighlight: { borderColor: '#FDBA74', backgroundColor: '#FFF7ED' },
  metricChipIcon: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  metricChipValue: { fontSize: 15, fontWeight: '800', color: '#111827' },
  metricChipLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

  // --- Section shells ---
  cardContainer: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, marginBottom: 16, ...shadowSoft },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  sectionHeaderIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionSubtitle: { fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginTop: 2 },
  viewAllText: { color: C.primary, fontSize: 13, fontWeight: '700' },

  // --- Finance / fees ---
  financeRow: { flexDirection: 'row', alignItems: 'center' },
  financeItem: { flex: 1, alignItems: 'center' },
  financeIcon: { width: 34, height: 34, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  financeValue: { fontSize: 15, fontWeight: '800', color: '#111827' },
  financeLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', marginTop: 2 },
  financeDivider: { width: 1, height: 40, backgroundColor: '#F1F2F4' },
  feeFootnote: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', marginTop: 10, textAlign: 'center' },

  // --- Attendance ---
  horizontalScroll: { paddingRight: 20, gap: 12 },
  attendanceCard: { backgroundColor: '#FAFAFB', alignItems: 'center', justifyContent: 'center', width: 88, paddingVertical: 16, borderRadius: 18, borderWidth: 1, borderColor: '#F1F2F4', marginRight: 10 },
  attendanceIcon: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  attendanceValue: { fontSize: 19, fontWeight: '800', marginBottom: 2 },
  attendanceTitle: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

  // --- Teacher: allotted class cards ---
  classCard: { borderWidth: 1, borderColor: '#F1F2F4', borderRadius: 18, padding: 14, marginBottom: 12 },
  classCardTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  classPill: { backgroundColor: C.primary, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 10 },
  classPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  classSyllabusPill: { backgroundColor: C.primarySoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  classSyllabusText: { color: C.primary, fontSize: 10, fontWeight: '800' },
  classTeacherPill: { backgroundColor: '#EEF2FF', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  classTeacherPillText: { color: '#4f46e5', fontSize: 10, fontWeight: '800' },
  classCountBox: { backgroundColor: '#FEF7F7', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  classCountValue: { fontSize: 30, fontWeight: '800', color: '#111827' },
  classCountLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '700', marginTop: 2 },
  classGenderRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  genderPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  genderPillText: { fontSize: 11, fontWeight: '700' },
  classActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  classAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  classActionPrimary: { backgroundColor: '#22c55e' },
  classActionDone: { backgroundColor: '#9CA3AF' },
  classActionGhost: { backgroundColor: C.primarySoft },
  classActionText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  classActionGhostText: { color: C.primary, fontSize: 11, fontWeight: '800' },

  // --- Admin: branch cards ---
  branchCard: { borderWidth: 1, borderColor: '#F1F2F4', borderRadius: 18, padding: 14, marginBottom: 12 },
  branchTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  branchStatsRow: { flexDirection: 'row', marginTop: 14 },
  branchStat: { flex: 1, alignItems: 'center' },
  branchStatValue: { fontSize: 16, fontWeight: '800', color: '#111827' },
  branchStatLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', marginTop: 2 },

  // --- Generic list rows ---
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F6', gap: 12 },
  listAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  listAvatarText: { fontSize: 13, fontWeight: '800', color: '#14161F' },
  itemTitle: { fontSize: 14, fontWeight: '700', color: '#14161F' },
  itemSubtitle: { fontSize: 12, color: '#14161F', marginTop: 2 },
  tagText: { fontSize: 11, backgroundColor: '#F3F4F6', color: '#14161F', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontWeight: '700', overflow: 'hidden' },
  tagGreen: { backgroundColor: '#DCFCE3', color: '#166534' },
  tagRed: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  tagOrange: { backgroundColor: '#FFEDD5', color: '#9A3412' },
  badgeGreen: { fontSize: 11, backgroundColor: '#DCFCE3', color: '#166534', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, fontWeight: '700', overflow: 'hidden' },
  badgeRed: { fontSize: 11, backgroundColor: '#FEE2E2', color: '#991B1B', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, fontWeight: '700', overflow: 'hidden' },

  // --- Loading / error states ---
  loadingText: { marginTop: 12, fontSize: 15, color: '#14161F', fontWeight: '500' },
  errorIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  errorText: { fontSize: 15, color: '#14161F', marginBottom: 18, textAlign: 'center', fontWeight: '500' },
  retryButton: { flexDirection: 'row', backgroundColor: C.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 20, alignItems: 'center' },
  retryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  emptyState: { paddingVertical: 24, alignItems: 'center', justifyContent: 'center' },
  emptyStateText: { color: '#14161F', fontSize: 13, fontWeight: '500' },

  // --- Trend / staff-by-type bars ---
  trendRow: { marginBottom: 14 },
  trendRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  trendDate: { fontSize: 13, fontWeight: '600', color: '#14161F' },
  trendFraction: { fontSize: 13, fontWeight: '700', color: '#111827' },
  trendPct: { fontSize: 12, fontWeight: '600', color: '#22c55e' },
  trendTrack: { height: 7, borderRadius: 4, backgroundColor: '#F3F4F6', overflow: 'hidden' },
  trendFill: { height: '100%', borderRadius: 4, backgroundColor: '#22c55e' },

  // --- Notices list ---
  noticeCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F6', gap: 12 },
  noticeIconCol: { justifyContent: 'center' },
  noticeIconCircle: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  noticeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  noticeCategoryBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  noticeCategoryText: { color: C.primary, fontSize: 9, fontWeight: '800' },
  noticeDate: { fontSize: 11, color: '#14161F', fontWeight: '600' },
  noticeTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  noticeDesc: { fontSize: 12, color: '#14161F', marginTop: 2 },

  // --- Notice detail modal ---
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 440, maxHeight: '82%', backgroundColor: '#FFFFFF', borderRadius: 24, paddingTop: 22, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 22 },
  modalHeaderIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },
  modalHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  modalHeaderSubtitle: { fontSize: 12, color: '#14161F', marginTop: 2 },
  modalDivider: { height: 1, backgroundColor: '#F1F2F4', marginTop: 18 },
  modalScroll: { paddingHorizontal: 22, paddingTop: 18 },
  modalPillsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modalStatusPill: { backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  modalStatusPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modalCategoryPill: { backgroundColor: '#F3F4F6', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  modalCategoryPillText: { color: '#14161F', fontSize: 12, fontWeight: '700' },
  modalNoticeTitle: { fontSize: 19, fontWeight: '800', color: '#111827', marginBottom: 16 },
  modalInfoBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, borderWidth: 1, borderColor: '#F1F2F4', borderRadius: 14, padding: 14, marginBottom: 16 },
  modalInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalInfoLabel: { fontSize: 12, color: '#14161F', fontWeight: '600' },
  modalInfoValue: { fontSize: 12, color: '#111827', fontWeight: '800' },
  modalContentBox: { borderWidth: 1, borderColor: '#F1F2F4', borderRadius: 14, padding: 16, marginBottom: 20 },
  modalContentText: { fontSize: 14, color: '#14161F', lineHeight: 21 },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 22, paddingBottom: 20, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#F1F2F4' },
  modalCloseBtn: { backgroundColor: '#14161F', paddingHorizontal: 24, paddingVertical: 11, borderRadius: 14 },
  modalCloseBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

export default DashboardScreen;