import React, { useState, useEffect, useCallback } from 'react';
import { 
  ScrollView, 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView,
  ActivityIndicator
} from 'react-native';
import axios from 'axios';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { API_BASE } from '../network/api';

// --- Types & Interfaces ---
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
}

interface School {
  _id: string;
  name: string;
  address: string;
}

interface Subject {
  _id: string;
  name: string;
  code: string;
}

interface DashboardData {
  totalStaff: number;
  totalSchools: number;
  totalSubjects: number;
  totalClasses: number;
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
}

// --- Reusable Components ---

const StatCard = ({ title, value, color, bgColor }: { title: string, value: number, color: string, bgColor: string }) => (
  <View style={[styles.statCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
    <View style={[styles.iconPlaceholder, { backgroundColor: bgColor }]}>
      <Text style={{ color: color, fontWeight: 'bold', fontSize: 16 }}>{title.charAt(0)}</Text>
    </View>
    <View style={styles.statInfo}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  </View>
);

const AttendanceCard = ({ title, value, color }: { title: string, value: number, color: string }) => (
  <View style={styles.attendanceCard}>
    <Text style={[styles.attendanceValue, { color }]}>{value}</Text>
    <Text style={styles.attendanceTitle}>{title}</Text>
  </View>
);

const SectionHeader = ({ title, onViewAll }: { title: string, onViewAll?: () => void }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {onViewAll && (
      <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.viewAllText}>View All →</Text>
      </TouchableOpacity>
    )}
  </View>
);

const EmptyState = ({ message }: { message: string }) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyStateText}>{message}</Text>
  </View>
);

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// --- Main Screen ---

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
      console.error("API Error:", err);
      if (!isSilent) setError('An error occurred while fetching data. Please check your connection.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardStats(false);

    const interval = setInterval(() => {
      fetchDashboardStats(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchDashboardStats]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#EF4444" />
        <Text style={styles.loadingText}>Loading Live Dashboard...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error || 'No data available'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchDashboardStats(false)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Super Admin</Text>
            <Text style={styles.dateText}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          </View>
          <TouchableOpacity style={styles.liveButton} activeOpacity={0.9}>
            <View style={styles.liveDot} />
            <Text style={styles.liveButtonText}>Live</Text>
          </TouchableOpacity>
        </View>

        {/* Top Stats Grid (2x2) */}
        <View style={styles.statsGrid}>
          <StatCard title="Total Staff" value={data.totalStaff} color="#ef4444" bgColor="#fee2e2" />
          <StatCard title="Schools" value={data.totalSchools} color="#f97316" bgColor="#ffedd5" />
          <StatCard title="Subjects" value={data.totalSubjects} color="#eab308" bgColor="#fef9c3" />
          <StatCard title="Classes" value={data.totalClasses} color="#8b5cf6" bgColor="#ede9fe" />
        </View>

        {/* Today's Attendance (Horizontal Scroll) */}
        <View style={styles.cardContainer}>
          <SectionHeader title="Today's Attendance" onViewAll={() => navigation.navigate('Attendance')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
            <AttendanceCard title="Present" value={data.attendance.todayPresent} color="#22c55e" />
            <AttendanceCard title="Absent" value={data.attendance.todayAbsent} color="#ef4444" />
            <AttendanceCard title="Half-Day" value={data.attendance.todayHalfDay} color="#f59e0b" />
            <AttendanceCard title="Leave" value={data.attendance.todayOnLeave} color="#8b5cf6" />
            <AttendanceCard title="Total" value={data.attendance.todayTotal} color="#06b6d4" />
          </ScrollView>
        </View>

        {/* Last 7 Days Attendance Trend */}
        <View style={styles.cardContainer}>
          <SectionHeader title="7 Days Trend" />
          {data.attendance.trend && data.attendance.trend.length > 0 ? (
            data.attendance.trend.slice(-5).map((day, index) => (
              <View key={index} style={styles.listItem}>
                <Text style={styles.itemTitle}>{formatDate(day.date)}</Text>
                <View style={styles.trendBadges}>
                  <Text style={styles.badgeGreen}>P: {day.present}</Text>
                  <Text style={styles.badgeRed}>A: {day.absent}</Text>
                </View>
              </View>
            ))
          ) : (
            <EmptyState message="No attendance data for the last 7 days." />
          )}
        </View>

        {/* Staff by Type */}
        <View style={styles.cardContainer}>
          <SectionHeader title="Staff by Type" />
          {data.staffByType && data.staffByType.length > 0 ? (
            data.staffByType.map((type, index) => (
              <View key={index} style={styles.listItem}>
                <Text style={styles.itemTitle}>{type._id}</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{type.count}</Text>
                </View>
              </View>
            ))
          ) : (
            <EmptyState message="No staff types found." />
          )}
        </View>

        {/* Recent Staff */}
        <View style={styles.cardContainer}>
          <SectionHeader title="Recent Staff" onViewAll={() => navigation.navigate('Staff')} />
          {data.recentStaff && data.recentStaff.length > 0 ? (
            data.recentStaff.map((staff) => (
              <View key={staff._id} style={styles.listItem}>
                <View>
                  <Text style={styles.itemTitle}>{staff.name}</Text>
                  <Text style={styles.itemSubtitle}>{staff.staffId}</Text>
                </View>
                <Text style={styles.tagText}>{staff.staffType}</Text>
              </View>
            ))
          ) : (
            <EmptyState message="No staff members added recently." />
          )}
        </View>

        {/* Recent Schools */}
        <View style={styles.cardContainer}>
          <SectionHeader title="Recent Schools" onViewAll={() => navigation.navigate('Schools')} />
          {data.recentSchools && data.recentSchools.length > 0 ? (
            data.recentSchools.map((school) => (
              <View key={school._id} style={styles.listItem}>
                <View>
                  <Text style={styles.itemTitle}>{school.name}</Text>
                  <Text style={styles.itemSubtitle}>{school.address}</Text>
                </View>
              </View>
            ))
          ) : (
            <EmptyState message="No schools added recently." />
          )}
        </View>

        {/* Recent Subjects */}
        <View style={styles.cardContainer}>
          <SectionHeader title="Recent Subjects" onViewAll={() => navigation.navigate('Subjects')} />
          {data.recentSubjects && data.recentSubjects.length > 0 ? (
            data.recentSubjects.map((sub) => (
              <View key={sub._id} style={styles.listItem}>
                <View>
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
    </SafeAreaView>
  );
};

// --- Styles ---

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F7F9',
  },
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F7F9',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  dateText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '500',
  },
  liveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FCA5A5'
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 6,
  },
  liveButtonText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    width: '48%',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  iconPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statInfo: {
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  statTitle: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 2,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  viewAllText: {
    color: '#EF4444', // Changed from blue to red theme
    fontSize: 14,
    fontWeight: '600',
  },
  horizontalScroll: {
    paddingRight: 20,
    gap: 12,
  },
  attendanceCard: {
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    width: 90,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginRight: 10,
  },
  attendanceValue: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  attendanceTitle: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  itemSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  tagText: {
    fontSize: 12,
    backgroundColor: '#F3F4F6',
    color: '#4B5563',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontWeight: '600',
    overflow: 'hidden',
  },
  trendBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  badgeGreen: {
    fontSize: 12,
    backgroundColor: '#DCFCE3',
    color: '#166534',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontWeight: '600',
    overflow: 'hidden',
  },
  badgeRed: {
    fontSize: 12,
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontWeight: '600',
    overflow: 'hidden',
  },
  countBadge: {
    backgroundColor: '#FEE2E2', // Changed to red theme background
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBadgeText: {
    color: '#EF4444', // Changed to red theme text
    fontWeight: '700',
    fontSize: 13,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontStyle: 'italic',
  }
});

export default DashboardScreen;