import { ImageSourcePropType } from 'react-native';

export interface MenuItem {
  id: string;
  title: string;
  icon: string; // Feather fallback
  route: string;
  bg: string; // tile background
  fg: string; // icon colour (fallback)
  image?: ImageSourcePropType;
}

export const MENU_ITEMS: MenuItem[] = [
  {
    id: '1', title: 'Employee', icon: 'users', route: 'Staff',
    bg: '#D3EDF6', fg: '#1B8DB5',
  },
  {
    id: '2', title: 'Classes', icon: 'monitor', route: 'Classes',
    bg: '#FADFD6', fg: '#E0684A',
  },
  {
    id: '3', title: 'Transport', icon: 'truck', route: 'TransportFleet',
    bg: '#FCEBC2', fg: '#D9930D',
  },
  {
    id: '4', title: 'Fees', icon: 'credit-card', route: 'CollectAssignFees',
    bg: '#DADFF3', fg: '#4B5BC0',
  },
  {
    id: '5', title: 'TimeTable', icon: 'clock', route: 'Class TimeTable',
    bg: '#CDEBF1', fg: '#0F8FA8',
    // image: require('../assets/icons/timetable.png'),
  },
  {
    id: '6', title: 'Attendance', icon: 'check-square', route: 'Class Attendance',
    bg: '#F8DCD3', fg: '#D9573F',
    // image: require('../assets/icons/attendance.png'),
  },
  {
    id: '7', title: 'Notice Board', icon: 'clipboard', route: 'Notice Board',
    bg: '#F9E6B4', fg: '#C98A0A',
    // image: require('../assets/icons/notice.png'),
  },
  {
    id: '8', title: 'Diaries', icon: 'book-open', route: 'Diary',
    bg: '#D8DCF0', fg: '#5A57B5',
    // image: require('../assets/icons/diaries.png'),
  },
  {
    id: '9', title: 'Leaves', icon: 'file-minus', route: 'Leaves',
    bg: '#D0E9F5', fg: '#2A86C2',
    // image: require('../assets/icons/leaves.png'),
  },
];