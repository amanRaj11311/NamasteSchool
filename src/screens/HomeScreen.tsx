import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Platform,
  Animated,
  AppState,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';

import {
  COLORS,
  ON_DARK,
  SPACING,
  RADIUS,
  FONT,
  SHADOW,
  TOUCH_TARGET,
} from '../constants/theme';
import { MENU_ITEMS } from '../constants/menuItems';
import {
  EventData,
  Upcoming,
  getHeroForDate,
  getUpcoming,
  getGreeting,
} from '../constants/events';

const MAX_CONTENT_WIDTH = 720;
const HEADER_RADIUS = 28;
const BANNER_OVERLAP = 52;
const GRID_GAP = SPACING.md;

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();

  // Responsive grid: 3 columns on phones, 4 on tablets / landscape
  const columns = width >= 600 ? 4 : 3;
  const isCompact = width < 360;

  const [userName, setUserName] = useState('User');
  const [userRole, setUserRole] = useState('Staff');
  const [greeting, setGreeting] = useState(getGreeting(new Date().getHours()));
  const [currentDate, setCurrentDate] = useState('');
  const [hero, setHero] = useState<EventData>(() => getHeroForDate(new Date()));
  const [upcoming, setUpcoming] = useState<Upcoming | null>(() => getUpcoming(new Date()));

  // One orchestrated moment: the hero card eases in when the day's content changes
  const heroAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    heroAnim.setValue(0);
    Animated.timing(heroAnim, { toValue: 1, duration: 520, useNativeDriver: true }).start();
  }, [hero.title, heroAnim]);

  const loadUserData = useCallback(async () => {
    try {
      const name = await AsyncStorage.getItem('userName');
      const role = await AsyncStorage.getItem('userRole');
      const superAdmin = await AsyncStorage.getItem('isSuperAdmin');

      setUserName(name || 'User');
      setUserRole(superAdmin === 'true' ? 'Principal / Admin' : role || 'Staff');
    } catch (e) {}
  }, []);

  const updateDateTime = useCallback(() => {
    const now = new Date();
    setGreeting(getGreeting(now.getHours()));

    const options: Intl.DateTimeFormatOptions = {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      weekday: 'long',
    };
    setCurrentDate(now.toLocaleDateString('en-US', options));
    setHero(getHeroForDate(now));
    setUpcoming(getUpcoming(now));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
      updateDateTime();
    }, [loadUserData, updateDateTime])
  );

  // Refresh when the app comes back to the foreground (e.g. opened after midnight)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateDateTime();
    });
    return () => sub.remove();
  }, [updateDateTime]);

  const upcomingWhen = upcoming
    ? upcoming.days === 1
      ? 'Tomorrow'
      : `in ${upcoming.days} days`
    : '';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ------------------------------ HEADER ------------------------------ */}
        <LinearGradient
          colors={[COLORS.primaryDeep, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View pointerEvents="none" style={styles.headerCircleA} />
          <View pointerEvents="none" style={styles.headerCircleB} />

          <SafeAreaView>
            <View style={[styles.headerContent, styles.contentWidth]}>
              <View style={styles.profileSection}>
                <View style={[styles.avatarWrap, isCompact && styles.avatarWrapCompact]}>
                  <Text style={styles.avatarInitial}>{userName.charAt(0).toUpperCase()}</Text>
                </View>

                <View style={styles.profileText}>
                  <Text style={styles.greetingText}>
                    {greeting.emoji}  {greeting.text}
                  </Text>
                  <Text style={styles.nameText} numberOfLines={1}>{userName}</Text>

                  <View style={styles.roleBadge}>
                    <Feather name="shield" size={11} color={COLORS.white} />
                    <Text style={styles.roleText} numberOfLines={1}>{userRole}</Text>
                  </View>

                  <View style={styles.dateRow}>
                    <Feather name="calendar" size={12} color={ON_DARK.low} />
                    <Text style={styles.dateText} numberOfLines={1}>{currentDate}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.menuIconBtn}
                onPress={() => navigation.openDrawer()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Open menu"
              >
                <Feather name="more-vertical" size={22} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>

        {/* --------------------------- DAILY HERO CARD --------------------------- */}
        <View style={[styles.heroWrap, styles.contentWidth]}>
          <Animated.View
            style={[
              styles.heroShadow,
              {
                opacity: heroAnim,
                transform: [
                  { scale: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={hero.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View pointerEvents="none" style={styles.heroCircleA} />
              <View pointerEvents="none" style={styles.heroCircleB} />

              <View style={styles.heroContent}>
                <View style={styles.heroBadge}>
                  <Feather name={(hero.tagIcon || 'bell') as any} size={11} color={COLORS.white} />
                  <Text style={styles.heroBadgeText}>{hero.tag}</Text>
                </View>

                <Text style={styles.heroTitle} numberOfLines={2}>{hero.title}</Text>
                <Text style={styles.heroSubtitle} numberOfLines={3}>{hero.subtitle}</Text>

                {!!hero.meta && (
                  <View style={styles.heroMetaRow}>
                    <Feather name={(hero.metaIcon || 'clock') as any} size={12} color={ON_DARK.mid} />
                    <Text style={styles.heroMetaText} numberOfLines={1}>{hero.meta}</Text>
                  </View>
                )}
              </View>

              <View style={styles.heroMedallion}>
                {hero.image ? (
                  <Image source={hero.image} style={styles.heroImage} resizeMode="cover" />
                ) : (
                  <Text style={styles.heroEmoji}>{hero.emoji}</Text>
                )}
              </View>
            </LinearGradient>
          </Animated.View>

          {upcoming && (
            <View style={styles.upcomingRow}>
              <Text style={styles.upcomingEmoji}>{upcoming.emoji}</Text>
              <View style={styles.upcomingTextWrap}>
                <Text style={styles.upcomingLabel}>Coming up</Text>
                <Text style={styles.upcomingTitle} numberOfLines={1}>{upcoming.title}</Text>
              </View>
              <View style={styles.upcomingChip}>
                <Text style={styles.upcomingChipText}>{upcomingWhen}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ---------------------------- QUICK ACCESS ---------------------------- */}
        <View style={[styles.body, styles.contentWidth]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick access</Text>
            <Text style={styles.sectionMeta}>{MENU_ITEMS.length} modules</Text>
          </View>

          <View style={styles.grid}>
            {MENU_ITEMS.map((item) => (
              <View key={item.id} style={{ width: `${100 / columns}%`, padding: GRID_GAP / 2 }}>
                {/* Shadow lives on this wrapper: iOS drops shadows on overflow:hidden views */}
                <View style={[styles.tileShadow, { backgroundColor: item.bg }]}>
                  <Pressable
                    onPress={() => navigation.navigate(item.route)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.title}`}
                    style={({ pressed }) => [
                      styles.tile,
                      { backgroundColor: item.bg },
                      pressed && styles.tilePressed,
                    ]}
                  >
                    <View pointerEvents="none" style={styles.tileGlow} />

                    {item.image ? (
                      <Image
                        source={item.image}
                        style={[styles.iconImage, isCompact && styles.iconImageCompact]}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.iconPlate, isCompact && styles.iconPlateCompact]}>
                        <Feather name={item.icon as any} size={isCompact ? 22 : 26} color={item.fg} />
                      </View>
                    )}

                    <Text style={styles.tileText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {item.title}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: SPACING.xxl + SPACING.lg,
  },
  contentWidth: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
  },

  // Header
  headerGradient: {
    width: '100%',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    paddingBottom: BANNER_OVERLAP + SPACING.xl,
    borderBottomLeftRadius: HEADER_RADIUS,
    borderBottomRightRadius: HEADER_RADIUS,
    overflow: 'hidden',
  },
  headerCircleA: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerCircleB: {
    position: 'absolute',
    bottom: -80,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.primaryBright + '33',
  },
  headerContent: {
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
  },
  profileSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: ON_DARK.glass,
    borderWidth: 1.5,
    borderColor: ON_DARK.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.lg,
  },
  avatarWrapCompact: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: SPACING.md,
  },
  avatarInitial: {
    fontSize: FONT.h1,
    fontWeight: '800',
    color: COLORS.white,
  },
  profileText: {
    flex: 1,
  },
  greetingText: {
    fontSize: FONT.small,
    color: ON_DARK.high,
    fontWeight: '500',
    marginBottom: 2,
  },
  nameText: {
    fontSize: FONT.h1,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: SPACING.xs,
    letterSpacing: -0.3,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: ON_DARK.glass,
    borderWidth: 1,
    borderColor: ON_DARK.glassBorder,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs - 1,
    borderRadius: RADIUS.pill,
    marginBottom: SPACING.sm - 2,
  },
  roleText: {
    fontSize: FONT.tiny,
    fontWeight: '700',
    color: COLORS.white,
    marginLeft: SPACING.xs + 2,
    flexShrink: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: FONT.tiny + 1,
    color: ON_DARK.mid,
    fontWeight: '500',
    marginLeft: SPACING.xs + 2,
    flexShrink: 1,
  },
  menuIconBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    marginLeft: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: ON_DARK.glass,
    borderWidth: 1,
    borderColor: ON_DARK.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Hero card (overlaps the header)
  heroWrap: {
    marginTop: -BANNER_OVERLAP,
    paddingHorizontal: SPACING.xl,
  },
  heroShadow: {
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primaryDeep, // needed for the iOS shadow to render
    ...SHADOW.raised,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    minHeight: 148,
    overflow: 'hidden',
  },
  heroCircleA: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroCircleB: {
    position: 'absolute',
    bottom: -70,
    left: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  heroContent: {
    flex: 1,
    marginRight: SPACING.lg,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: ON_DARK.glass,
    borderWidth: 1,
    borderColor: ON_DARK.glassBorder,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs - 1,
    borderRadius: RADIUS.pill,
    marginBottom: SPACING.sm,
  },
  heroBadgeText: {
    fontSize: FONT.tiny,
    fontWeight: '700',
    color: COLORS.white,
    marginLeft: SPACING.xs + 2,
  },
  heroTitle: {
    fontSize: FONT.h2 + 3,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: -0.3,
    marginBottom: SPACING.xs,
  },
  heroSubtitle: {
    fontSize: FONT.small,
    lineHeight: FONT.small + 6,
    color: ON_DARK.high,
    fontWeight: '500',
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  heroMetaText: {
    fontSize: FONT.tiny + 1,
    color: ON_DARK.mid,
    fontWeight: '600',
    marginLeft: SPACING.xs + 2,
    flexShrink: 1,
  },
  heroMedallion: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: ON_DARK.glass,
    borderWidth: 2,
    borderColor: ON_DARK.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroEmoji: {
    fontSize: 44,
  },

  // Coming-up strip
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderFaint,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
  },
  upcomingEmoji: {
    fontSize: 22,
    marginRight: SPACING.md,
  },
  upcomingTextWrap: {
    flex: 1,
  },
  upcomingLabel: {
    fontSize: FONT.tiny,
    color: COLORS.faint,
    fontWeight: '600',
  },
  upcomingTitle: {
    fontSize: FONT.small,
    color: COLORS.ink,
    fontWeight: '700',
  },
  upcomingChip: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.primarySoftBorder,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    marginLeft: SPACING.md,
  },
  upcomingChipText: {
    fontSize: FONT.tiny,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Quick access
  body: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT.h2,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.2,
  },
  sectionMeta: {
    fontSize: FONT.small,
    fontWeight: '500',
    color: COLORS.faint,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -(GRID_GAP / 2),
  },
  tileShadow: {
    borderRadius: RADIUS.xl,
    ...SHADOW.card,
  },
  tile: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: SPACING.xs,
    overflow: 'hidden',
  },
  tilePressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9,
  },
  tileGlow: {
    position: 'absolute',
    top: -34,
    right: -34,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  iconPlate: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  iconPlateCompact: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  iconImage: {
    width: 60,
    height: 60,
    marginBottom: SPACING.sm,
  },
  iconImageCompact: {
    width: 50,
    height: 50,
  },
  tileText: {
    width: '100%',
    fontSize: FONT.small,
    fontWeight: '700',
    color: COLORS.ink,
    textAlign: 'center',
    paddingHorizontal: SPACING.xs,
  },
});