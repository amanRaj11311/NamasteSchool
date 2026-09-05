import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { API_BASE } from '../network/api';

// --- Types & Interfaces (matches GET /dashboard/stats) ---

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
  sendTo: string[];
  channels: string[];
  noticeDate: string;
  submissionDate?: string;
  description: string;
  category: string;
  status?: string;
  isPinned: boolean;
  createdAt: string;
}

interface LeaveApplication {
  _id: string;
  staff: { _id: string; staffId: string; name: string };
  leaveType: { _id: string; name: string };
  fromDate: string;
  toDate: string;
  totalDays: number;
  reason: string;
  status: string;
  appliedOn: string;
}

interface HomeworkItem {
  _id: string;
  title: string;
  className: string;
  division?: string;
  subjectName: string;
  dueDate: string;
  dueTime?: string;
  maxMarks?: number;
}

interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  totalPayroll: number;
  totalGeneralExpense: number;
}

interface DashboardData {
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
  recentNotices: Notice[];
  recentLeaves: LeaveApplication[];
  recentHomework: HomeworkItem[];
  upcomingExams: any[];
  finance: FinanceSummary;
}

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

const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const formatCurrency = (value: number) => {
  const sign = value < 0 ? '-' : '';
  return `${sign}\u20B9${Math.abs(value).toLocaleString('en-IN')}`;
};

const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

// --- Reusable Components ---

// Big primary KPI card — icon-forward, tinted background, one per the
// metrics people actually check day to day.
const PrimaryStatCard = ({
  icon,
  title,
  value,
  color,
  bgColor,
}: {
  icon: string;
  title: string;
  value: number | string;
  color: string;
  bgColor: string;
}) => (
  <View style={styles.primaryCard}>
    <View style={[styles.primaryCardIcon, { backgroundColor: bgColor }]}>
      <Feather name={icon as any} size={20} color={color} />
    </View>
    <Text style={styles.primaryCardValue} numberOfLines={1}>{value}</Text>
    <Text style={styles.primaryCardTitle}>{title}</Text>
  </View>
);

// Smaller secondary metric — a horizontally-scrolling chip, for counts
// that matter but don't need a full tile of screen real estate.
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

const SectionHeader = ({ icon, title, onViewAll }: { icon?: string; title: string; onViewAll?: () => void }) => (
  <View style={styles.sectionHeader}>
    <View style={styles.sectionHeaderLeft}>
      {icon ? <Feather name={icon as any} size={16} color="#ef4444" style={{ marginRight: 8 }} /> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {onViewAll && (
      <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.viewAllText}>View All</Text>
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

// Attendance-trend row: label + proportional green bar + fraction/percent
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

// Staff-by-type row: label + proportional red bar + count
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
        <View style={[styles.trendFill, { width: `${pct}%`, backgroundColor: '#ef4444' }]} />
      </View>
    </View>
  );
};

const NoticeCard = ({ notice, onPress }: { notice: Notice; onPress: () => void }) => (
  <TouchableOpacity style={styles.noticeCard} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.noticeIconCol}>
      <View style={styles.noticeIconCircle}>
        <Feather name="volume-2" size={15} color="#ef4444" />
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

// Native modal reproducing the "School Announcement Detail" reference —
// tapping a notice opens this instead of a plain OS Alert.
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
          {/* Header */}
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
                <Feather name="calendar" size={14} color="#ef4444" />
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
  const [error, setError] = useState<string | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorIconCircle}>
          <Feather name="wifi-off" size={26} color="#ef4444" />
        </View>
        <Text style={styles.errorText}>{error || 'No data available'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchDashboardStats(false)}>
          <Feather name="refresh-cw" size={14} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const staffTotal = (data.staffByType || []).reduce((sum, t) => sum + t.count, 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeText} numberOfLines={1}>Welcome back, {userName}</Text>
            <View style={styles.headerMetaRow}>
              <Text style={styles.dateText}>
                {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
              {!!data.activeAcademicYear && (
                <View style={styles.sessionPill}>
                  <Feather name="calendar" size={11} color="#4f46e5" />
                  <Text style={styles.sessionPillText}>{data.activeAcademicYear}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveIndicatorText}>Live</Text>
          </View>
        </View>

        {/* Primary KPIs */}
        <View style={styles.primaryGrid}>
          <PrimaryStatCard icon="users" title="Students" value={data.totalStudents} color="#2563EB" bgColor="#EFF6FF" />
          <PrimaryStatCard icon="user-check" title="Staff" value={data.totalStaff} color="#ef4444" bgColor="#FEF2F2" />
          <PrimaryStatCard icon="layers" title="Classes" value={data.totalClasses} color="#8b5cf6" bgColor="#F5F3FF" />
          <PrimaryStatCard icon="book-open" title="Subjects" value={data.totalSubjects} color="#f59e0b" bgColor="#FFFBEB" />
        </View>

        {/* Secondary metrics — horizontal scroll, lighter visual weight */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricChipRow}
          style={{ marginBottom: 20 }}
        >
          <MetricChip icon="git-branch" label="Branches" value={data.totalSchools} color="#db2777" bgColor="#FDF2F8" />
          <MetricChip icon="edit-3" label="Homework" value={data.totalHomework} color="#14b8a6" bgColor="#F0FDFA" />
          <MetricChip icon="award" label="Exams" value={data.totalExams} color="#e11d48" bgColor="#FFF1F2" />
          <MetricChip icon="bell" label="Notices" value={data.totalNotices} color="#ef4444" bgColor="#FEF2F2" />
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
          <SectionHeader icon="pie-chart" title="Finance Overview" />
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
              <View style={[styles.financeIcon, { backgroundColor: '#FEF2F2' }]}>
                <Feather name="arrow-up-right" size={16} color="#ef4444" />
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
                  { color: (data.finance?.netBalance ?? 0) < 0 ? '#ef4444' : '#111827' },
                ]}
              >
                {formatCurrency(data.finance?.netBalance ?? 0)}
              </Text>
              <Text style={styles.financeLabel}>Net Balance</Text>
            </View>
          </View>
        </View>

        {/* School Notices & Circulars */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="volume-2" title="Notices & Circulars" onViewAll={() => navigation.navigate('Notice Board')} />
          {data.recentNotices && data.recentNotices.length > 0 ? (
            data.recentNotices.map((notice) => (
              <NoticeCard key={notice._id} notice={notice} onPress={() => setSelectedNotice(notice)} />
            ))
          ) : (
            <EmptyState icon="bell-off" message="No active notices." />
          )}
        </View>

        {/* Today's Attendance */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="check-square" title="Today's Attendance" onViewAll={() => navigation.navigate('Class Attendance')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
            <AttendanceCard icon="check-circle" title="Present" value={data.attendance.todayPresent} color="#22c55e" bgColor="#F0FDF4" />
            <AttendanceCard icon="x-circle" title="Absent" value={data.attendance.todayAbsent} color="#ef4444" bgColor="#FEF2F2" />
            <AttendanceCard icon="clock" title="Half-Day" value={data.attendance.todayHalfDay} color="#f59e0b" bgColor="#FFFBEB" />
            <AttendanceCard icon="log-out" title="On Leave" value={data.attendance.todayOnLeave} color="#8b5cf6" bgColor="#F5F3FF" />
            <AttendanceCard icon="users" title="Total" value={data.attendance.todayTotal} color="#06b6d4" bgColor="#ECFEFF" />
          </ScrollView>
        </View>

        {/* Last 7 Days Attendance Trend */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="trending-up" title="7-Day Attendance Trend" />
          {data.attendance.trend && data.attendance.trend.length > 0 ? (
            data.attendance.trend.map((day, index) => <TrendRow key={index} trend={day} />)
          ) : (
            <EmptyState icon="bar-chart-2" message="No attendance data for the last 7 days." />
          )}
        </View>

        {/* Staff by Type */}
        <View style={styles.cardContainer}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Feather name="user-check" size={16} color="#ef4444" style={{ marginRight: 8 }} />
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
          <SectionHeader icon="user-plus" title="Recently Added Staff" onViewAll={() => navigation.navigate('Staff')} />
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
          <SectionHeader icon="file-minus" title="Recent Leave Applications" onViewAll={() => navigation.navigate('Leaves')} />
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

        {/* Recent Homework Assignments */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="edit-3" title="Recent Homework" onViewAll={() => navigation.navigate('Homework')} />
          {data.recentHomework && data.recentHomework.length > 0 ? (
            data.recentHomework.map((hw) => (
              <View key={hw._id} style={styles.listItem}>
                <View style={[styles.listAvatar, { backgroundColor: '#F0FDFA' }]}>
                  <Feather name="book" size={15} color="#14b8a6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{hw.title}</Text>
                  <Text style={styles.itemSubtitle}>{hw.className}{hw.division ? ` - ${hw.division}` : ''} • {hw.subjectName}</Text>
                </View>
                <Text style={styles.badgeGreen}>Due {hw.dueDate}</Text>
              </View>
            ))
          ) : (
            <EmptyState message="No homework assigned recently." />
          )}
        </View>

        {/* Upcoming Scheduled Exams */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="award" title="Upcoming Exams" onViewAll={() => navigation.navigate('Exams')} />
          {data.upcomingExams && data.upcomingExams.length > 0 ? (
            data.upcomingExams.map((exam, index) => (
              <View key={exam._id || index} style={styles.listItem}>
                <View style={[styles.listAvatar, { backgroundColor: '#FFF1F2' }]}>
                  <Feather name="award" size={15} color="#e11d48" />
                </View>
                <Text style={styles.itemTitle}>{exam.title || exam.name || 'Exam'}</Text>
              </View>
            ))
          ) : (
            <EmptyState icon="calendar" message="No upcoming exams scheduled." />
          )}
        </View>

        {/* Recent Schools */}
        <View style={styles.cardContainer}>
          <SectionHeader icon="git-branch" title="Recent Schools" onViewAll={() => navigation.navigate('Schools')} />
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
          <SectionHeader icon="book-open" title="Recent Subjects" onViewAll={() => navigation.navigate('Subjects')} />
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8FA' },
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F8FA', paddingHorizontal: 32 },
  contentContainer: { padding: 18, paddingBottom: 40 },

  // --- Header ---
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, paddingHorizontal: 2 },
  welcomeText: { fontSize: 21, fontWeight: '800', color: '#111827', letterSpacing: -0.4 },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  dateText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  sessionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, gap: 4 },
  sessionPillText: { color: '#4f46e5', fontSize: 11, fontWeight: '700' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, marginLeft: 10, marginTop: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e', marginRight: 5 },
  liveIndicatorText: { color: '#16a34a', fontWeight: '700', fontSize: 11 },

  // --- Primary KPI grid ---
  primaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 4 },
  primaryCard: { backgroundColor: '#FFFFFF', width: '48%', padding: 18, borderRadius: 20, marginBottom: 12, shadowColor: '#111827', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  primaryCardIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  primaryCardValue: { fontSize: 26, fontWeight: '800', color: '#111827' },
  primaryCardTitle: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginTop: 2 },

  // --- Secondary metric chips ---
  metricChipRow: { paddingRight: 18, gap: 10 },
  metricChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, gap: 10, borderWidth: 1, borderColor: '#F1F2F4' },
  metricChipHighlight: { borderColor: '#FDBA74', backgroundColor: '#FFF7ED' },
  metricChipIcon: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  metricChipValue: { fontSize: 15, fontWeight: '800', color: '#111827' },
  metricChipLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

  // --- Section shells ---
  cardContainer: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, marginBottom: 16, shadowColor: '#111827', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  viewAllText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },

  // --- Finance ---
  financeRow: { flexDirection: 'row', alignItems: 'center' },
  financeItem: { flex: 1, alignItems: 'center' },
  financeIcon: { width: 34, height: 34, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  financeValue: { fontSize: 15, fontWeight: '800', color: '#111827' },
  financeLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', marginTop: 2 },
  financeDivider: { width: 1, height: 40, backgroundColor: '#F1F2F4' },

  // --- Attendance ---
  horizontalScroll: { paddingRight: 20, gap: 12 },
  attendanceCard: { backgroundColor: '#FAFAFB', alignItems: 'center', justifyContent: 'center', width: 88, paddingVertical: 16, borderRadius: 18, borderWidth: 1, borderColor: '#F1F2F4', marginRight: 10 },
  attendanceIcon: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  attendanceValue: { fontSize: 19, fontWeight: '800', marginBottom: 2 },
  attendanceTitle: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

  // --- Generic list rows ---
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F6', gap: 12 },
  listAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  listAvatarText: { fontSize: 13, fontWeight: '800', color: '#4B5563' },
  itemTitle: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  itemSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  tagText: { fontSize: 11, backgroundColor: '#F3F4F6', color: '#4B5563', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontWeight: '700', overflow: 'hidden' },
  tagGreen: { backgroundColor: '#DCFCE3', color: '#166534' },
  tagRed: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  tagOrange: { backgroundColor: '#FFEDD5', color: '#9A3412' },
  badgeGreen: { fontSize: 11, backgroundColor: '#DCFCE3', color: '#166534', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, fontWeight: '700', overflow: 'hidden' },

  // --- Loading / error states ---
  loadingText: { marginTop: 12, fontSize: 15, color: '#6B7280', fontWeight: '500' },
  errorIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  errorText: { fontSize: 15, color: '#374151', marginBottom: 18, textAlign: 'center', fontWeight: '500' },
  retryButton: { flexDirection: 'row', backgroundColor: '#ef4444', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 20, alignItems: 'center' },
  retryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  emptyState: { paddingVertical: 24, alignItems: 'center', justifyContent: 'center' },
  emptyStateText: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },

  // --- Trend / staff-by-type bars ---
  trendRow: { marginBottom: 14 },
  trendRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  trendDate: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
  trendFraction: { fontSize: 13, fontWeight: '700', color: '#111827' },
  trendPct: { fontSize: 12, fontWeight: '600', color: '#22c55e' },
  trendTrack: { height: 7, borderRadius: 4, backgroundColor: '#F3F4F6', overflow: 'hidden' },
  trendFill: { height: '100%', borderRadius: 4, backgroundColor: '#22c55e' },

  // --- Notices list ---
  noticeCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F6', gap: 12 },
  noticeIconCol: { justifyContent: 'center' },
  noticeIconCircle: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center' },
  noticeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  noticeCategoryBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  noticeCategoryText: { color: '#ef4444', fontSize: 9, fontWeight: '800' },
  noticeDate: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  noticeTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  noticeDesc: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  // --- Notice detail modal ---
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 440, maxHeight: '82%', backgroundColor: '#FFFFFF', borderRadius: 24, paddingTop: 22, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 22 },
  modalHeaderIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
  modalHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  modalHeaderSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  modalDivider: { height: 1, backgroundColor: '#F1F2F4', marginTop: 18 },
  modalScroll: { paddingHorizontal: 22, paddingTop: 18 },
  modalPillsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modalStatusPill: { backgroundColor: '#ef4444', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  modalStatusPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modalCategoryPill: { backgroundColor: '#F3F4F6', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  modalCategoryPillText: { color: '#4B5563', fontSize: 12, fontWeight: '700' },
  modalNoticeTitle: { fontSize: 19, fontWeight: '800', color: '#111827', marginBottom: 16 },
  modalInfoBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, borderWidth: 1, borderColor: '#F1F2F4', borderRadius: 14, padding: 14, marginBottom: 16 },
  modalInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalInfoLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  modalInfoValue: { fontSize: 12, color: '#111827', fontWeight: '800' },
  modalContentBox: { borderWidth: 1, borderColor: '#F1F2F4', borderRadius: 14, padding: 16, marginBottom: 20 },
  modalContentText: { fontSize: 14, color: '#374151', lineHeight: 21 },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 22, paddingBottom: 20, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#F1F2F4' },
  modalCloseBtn: { backgroundColor: '#4B5563', paddingHorizontal: 24, paddingVertical: 11, borderRadius: 14 },
  modalCloseBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

export default DashboardScreen;