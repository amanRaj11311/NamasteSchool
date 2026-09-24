import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
} from "react-native";
import Feather from "@react-native-vector-icons/feather";
import { API_BASE } from "../network/api";

const AnimatedTouchableOpacity =
  Animated.createAnimatedComponent(TouchableOpacity);

const SAVED_LOGIN_ENABLED = "savedLoginEnabled";
const SAVED_LOGIN_EMAIL = "savedLoginEmail";
const SAVED_LOGIN_PASSWORD = "savedLoginPassword";
const LOGIN_SAVE_ASKED_EMAIL = "loginSaveAskedEmail";

const BRAND = {
  primary: "#DC2626",
  primaryDark: "#B91C1C",
  primaryDarker: "#7F1D1D",
  primaryLight: "#EF4444",
  bg: "#FFF1F0",
  blob1: "#FCA5A5",
  blob2: "#F87171",
};

const BUTTON_HEIGHT = 56;

export default function LoginScreen({ navigation }: any) {
  const { width, height } = useWindowDimensions();
  const isWide = width >= 900; // tablets / landscape -> split layout
  const isSmall = height < 700;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  const [loginStatus, setLoginStatus] = useState<"idle" | "loading" | "success">(
    "idle"
  );
  const [checkingSession, setCheckingSession] = useState(true);
  const [btnMaxWidth, setBtnMaxWidth] = useState(280);

  // 0 = full width button, 1 = collapsed circle
  const btnProgress = useRef(new Animated.Value(0)).current;
  const formTranslateX = useRef(new Animated.Value(0)).current;
  const entranceAnims = useRef([...Array(4)].map(() => new Animated.Value(0)))
    .current;

  const buttonWidth = btnProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [btnMaxWidth, BUTTON_HEIGHT],
  });

  useEffect(() => {
    initScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initScreen = async () => {
    try {
      const keepLoggedIn = await AsyncStorage.getItem("keepLoggedIn");
      const token = await AsyncStorage.getItem("userToken");
      if (keepLoggedIn === "true" && token) {
        navigation.replace("DrawerRoot");
        return;
      }
    } catch (error) {
      console.log("Session check error:", error);
    }

    await loadSavedLoginDetails();
    setCheckingSession(false);

    Animated.stagger(
      120,
      entranceAnims.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
          easing: Easing.out(Easing.exp),
        })
      )
    ).start();
  };

  const loadSavedLoginDetails = async () => {
    try {
      const savedEnabled = await AsyncStorage.getItem(SAVED_LOGIN_ENABLED);
      if (savedEnabled === "true") {
        const savedEmail = await AsyncStorage.getItem(SAVED_LOGIN_EMAIL);
        const savedPassword = await AsyncStorage.getItem(SAVED_LOGIN_PASSWORD);
        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) setPassword(savedPassword);
      }
      const keepLoggedIn = await AsyncStorage.getItem("keepLoggedIn");
      setRemember(keepLoggedIn === "true");
    } catch (error) {
      console.log("Load saved login error:", error);
    }
  };

  const saveLoginDetails = async (e: string, p: string) => {
    await AsyncStorage.setItem(SAVED_LOGIN_ENABLED, "true");
    await AsyncStorage.setItem(SAVED_LOGIN_EMAIL, e);
    await AsyncStorage.setItem(SAVED_LOGIN_PASSWORD, p);
  };

  const removeSavedLoginDetails = async () => {
    await Promise.all(
      [SAVED_LOGIN_ENABLED, SAVED_LOGIN_EMAIL, SAVED_LOGIN_PASSWORD].map((k) =>
        AsyncStorage.removeItem(k)
      )
    );
  };

  const goToDashboard = () => {
    setTimeout(() => navigation.replace("DrawerRoot"), 500);
  };

  const askSaveLoginDetails = (e: string, p: string): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        "Save Login Details?",
        "Do you want to save your email and password on this device for next login?",
        [
          {
            text: "No",
            style: "cancel",
            onPress: async () => {
              try {
                await removeSavedLoginDetails();
              } catch (error) {
                console.log("Remove saved login error:", error);
              }
              resolve(false);
            },
          },
          {
            text: "Yes, Save",
            onPress: async () => {
              try {
                await saveLoginDetails(e, p);
                resolve(true);
              } catch (error) {
                console.log("Save login details error:", error);
                resolve(false);
              }
            },
          },
        ],
        { cancelable: false }
      );
    });

  const collapseButton = () =>
    Animated.timing(btnProgress, {
      toValue: 1,
      duration: 300,
      useNativeDriver: false,
    }).start();

  const resetButton = () => {
    setLoginStatus("idle");
    Animated.timing(btnProgress, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const shakeForm = () =>
    Animated.sequence([
      Animated.timing(formTranslateX, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(formTranslateX, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(formTranslateX, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      shakeForm();
      return Alert.alert("Required", "Please enter Email and Password");
    }

    const loginEmail = email.trim().toLowerCase();
    const loginPassword = password;

    setLoginStatus("loading");
    collapseButton();

    try {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        email: loginEmail,
        password: loginPassword,
      });

      if (!response.data?.success) {
        resetButton();
        return Alert.alert(
          "Login Failed",
          response.data?.message || "Invalid email or password"
        );
      }

      const user = response.data.user;
      if (!user) {
        resetButton();
        return Alert.alert("Login Error", "User data not received from server");
      }

      const sessionMarker = String(user.id || user._id || "logged-in");

      let extractedRole = "EMPLOYEE";
      if (user.roleName) extractedRole = user.roleName;
      else if (user.role) {
        if (typeof user.role === "string") extractedRole = user.role;
        else if (user.role.name) extractedRole = user.role.name;
      } else if (user.roleId?.name) extractedRole = user.roleId.name;

      const permissions = user.permissions || user.roleId?.permissions || [];

      await AsyncStorage.setItem("userToken", sessionMarker);
      await AsyncStorage.setItem("userId", String(user.id || user._id || ""));
      await AsyncStorage.setItem(
        "employeeId",
        String(user.employeeId || user.id || "")
      );

      const displayName = user.name
        ? user.name
        : `${user.firstName || ""} ${user.lastName || ""}`.trim();
      await AsyncStorage.setItem("userName", displayName || "User");
      await AsyncStorage.setItem("userEmail", String(user.email || loginEmail));
      await AsyncStorage.setItem("userRole", extractedRole.toUpperCase());
      await AsyncStorage.setItem(
        "isSuperAdmin",
        user.isSuperAdmin ? "true" : "false"
      );

      const schoolIdValue = String(user.schoolId?._id || user.school?._id || "");
      const schoolNameValue = String(user.schoolId?.name || user.school?.name || "");
      await AsyncStorage.setItem("userSchoolId", schoolIdValue);
      await AsyncStorage.setItem("userSchoolName", schoolNameValue);
      await AsyncStorage.setItem("userPermissions", JSON.stringify(permissions));
      await AsyncStorage.setItem("keepLoggedIn", remember ? "true" : "false");
      await AsyncStorage.setItem("userDesignation", String(user.designation || "N/A"));
      await AsyncStorage.setItem("userDepartment", String(user.department || "N/A"));
      await AsyncStorage.setItem("userDoj", String(user.dateOfJoining || ""));

      const bank = user.bankDetails || {};
      await AsyncStorage.setItem("userBankAcc", String(bank.accountNumber || "-"));
      await AsyncStorage.setItem("userBankName", String(bank.bankName || "-"));
      await AsyncStorage.setItem("userBankIfsc", String(bank.ifscCode || "-"));

      if (user.avatar) await AsyncStorage.setItem("userAvatar", user.avatar);
      else await AsyncStorage.removeItem("userAvatar");

      setLoginStatus("success");

      const savedEmailStored = await AsyncStorage.getItem(SAVED_LOGIN_EMAIL);
      const savedPasswordStored = await AsyncStorage.getItem(SAVED_LOGIN_PASSWORD);
      const askedForEmail = await AsyncStorage.getItem(LOGIN_SAVE_ASKED_EMAIL);

      const alreadySavedSame =
        savedEmailStored === loginEmail && savedPasswordStored === loginPassword;
      const alreadyAskedThisEmail = askedForEmail === loginEmail;

      if (!alreadySavedSame && !alreadyAskedThisEmail) {
        await askSaveLoginDetails(loginEmail, loginPassword);
        await AsyncStorage.setItem(LOGIN_SAVE_ASKED_EMAIL, loginEmail);
      }

      goToDashboard();
    } catch (error: any) {
      resetButton();
      Alert.alert(
        "Login Failed",
        error?.response?.data?.message ||
          error?.message ||
          "Something went wrong during login"
      );
    }
  };

  const getEntranceStyle = (index: number) => ({
    opacity: entranceAnims[index],
    transform: [
      {
        translateY: entranceAnims[index].interpolate({
          inputRange: [0, 1],
          outputRange: [30, 0],
        }),
      },
    ],
  });

  const onBtnContainerLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== btnMaxWidth) setBtnMaxWidth(w);
  };

  if (checkingSession) {
    return (
      <View style={styles.sessionLoader}>
        <StatusBar barStyle="dark-content" backgroundColor={BRAND.bg} />
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

  const logoSize = isWide ? 120 : isSmall ? 84 : 96;

  const Logo = (
    <View
      style={[
        styles.logoCircle,
        { width: logoSize, height: logoSize, borderRadius: logoSize * 0.28 },
      ]}
    >
      <Image
        source={require("../assets/logo.png")}
        style={{ width: logoSize * 0.85, height: logoSize * 0.85 }}
        resizeMode="contain"
      />
    </View>
  );

  const Form = (
    <View style={styles.formInner}>
      {!isWide && (
        <Animated.View style={[styles.brandSection, getEntranceStyle(0)]}>
          {Logo}
          <Text style={styles.appTitle}>Namaste School</Text>
          <Text style={styles.appSubtitle}>School Management System</Text>
        </Animated.View>
      )}

      {isWide && (
        <Animated.View style={[styles.welcomeWrap, getEntranceStyle(0)]}>
          <Text style={styles.welcomeTitle}>Welcome back</Text>
          <Text style={styles.welcomeSub}>Sign in to continue to your dashboard</Text>
        </Animated.View>
      )}

      <Animated.View style={getEntranceStyle(1)}>
        <Text style={styles.label}>Email Address</Text>
        <View
          style={[
            styles.inputContainer,
            focused === "email" && styles.inputFocused,
          ]}
        >
          <Feather
            name="mail"
            size={20}
            color={focused === "email" ? BRAND.primary : "#94A3B8"}
          />
          <TextInput
            style={styles.input}
            placeholder="name@company.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholderTextColor="#94A3B8"
            onFocus={() => setFocused("email")}
            onBlur={() => setFocused(null)}
          />
        </View>
      </Animated.View>

      <Animated.View style={getEntranceStyle(2)}>
        <Text style={styles.label}>Password</Text>
        <View
          style={[
            styles.inputContainer,
            focused === "password" && styles.inputFocused,
          ]}
        >
          <Feather
            name="lock"
            size={20}
            color={focused === "password" ? BRAND.primary : "#94A3B8"}
          />
          <TextInput
            style={styles.input}
            secureTextEntry={!showPassword}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            placeholderTextColor="#94A3B8"
            onFocus={() => setFocused("password")}
            onBlur={() => setFocused(null)}
            onSubmitEditing={handleLogin}
            returnKeyType="go"
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather
              name={showPassword ? "eye" : "eye-off"}
              size={20}
              color="#94A3B8"
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.rememberRow}
          activeOpacity={0.7}
          onPress={() => setRemember(!remember)}
        >
          <View style={[styles.checkbox, remember && styles.checked]}>
            {remember && <Feather name="check" size={14} color="#fff" />}
          </View>
          <Text style={styles.rememberText}>Keep me logged in</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={getEntranceStyle(3)}>
        <View style={styles.btnContainer} onLayout={onBtnContainerLayout}>
          <AnimatedTouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.loginBtn,
              { width: buttonWidth },
              {
                experimental_backgroundImage:
                  loginStatus === "success"
                    ? "linear-gradient(135deg, #16A34A, #15803D)"
                    : `linear-gradient(135deg, ${BRAND.primaryLight}, ${BRAND.primaryDark})`,
              } as any,
            ]}
            onPress={handleLogin}
            disabled={loginStatus !== "idle"}
          >
            {loginStatus === "idle" ? (
              <>
                <Feather name="log-in" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.loginText} numberOfLines={1}>
                  Sign In
                </Text>
              </>
            ) : loginStatus === "loading" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Feather name="check" size={24} color="#fff" />
            )}
          </AnimatedTouchableOpacity>
        </View>

        <View style={styles.secureRow}>
          <Feather name="shield" size={13} color="#94A3B8" />
          <Text style={styles.secureText}>Secure, encrypted connection</Text>
        </View>
      </Animated.View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={BRAND.bg} translucent={false} />

      <View pointerEvents="none" style={styles.blobTopLeft} />
      <View pointerEvents="none" style={styles.blobBottomRight} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingVertical: isSmall ? 20 : 40 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={[
            styles.card,
            isWide ? styles.cardWide : styles.cardNarrow,
            { transform: [{ translateX: formTranslateX }] },
          ]}
        >
          {isWide && (
            <View
              style={[
                styles.brandPanel,
                {
                  experimental_backgroundImage: `linear-gradient(160deg, ${BRAND.primaryLight}, ${BRAND.primaryDark} 55%, ${BRAND.primaryDarker})`,
                } as any,
              ]}
            >
              <View style={styles.panelCircle1} />
              <View style={styles.panelCircle2} />
              {Logo}
              <Text style={styles.panelTitle}>Namaste School</Text>
              <Text style={styles.panelSub}>
                One place to manage students, staff, attendance and payroll.
              </Text>
              <View style={styles.panelFeatures}>
                {["Attendance & leaves", "Payroll & documents", "Role based access"].map(
                  (t) => (
                    <View key={t} style={styles.panelFeatureRow}>
                      <View style={styles.panelDot}>
                        <Feather name="check" size={12} color={BRAND.primary} />
                      </View>
                      <Text style={styles.panelFeatureText}>{t}</Text>
                    </View>
                  )
                )}
              </View>
            </View>
          )}

          <View style={isWide ? styles.formPanelWide : styles.formPanelNarrow}>
            {Form}
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.bg },
  sessionLoader: {
    flex: 1,
    backgroundColor: BRAND.bg,
    justifyContent: "center",
    alignItems: "center",
  },

  blobTopLeft: {
    position: "absolute",
    top: -110,
    left: -110,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: BRAND.blob1,
    opacity: 0.35,
  },
  blobBottomRight: {
    position: "absolute",
    bottom: -130,
    right: -110,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: BRAND.blob2,
    opacity: 0.3,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  card: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 32,
    overflow: "hidden",
    shadowColor: BRAND.primaryDark,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 30,
    elevation: 12,
  },
  cardNarrow: { maxWidth: 440 },
  cardWide: { maxWidth: 980, flexDirection: "row", minHeight: 560 },

  formPanelNarrow: { paddingHorizontal: 28, paddingVertical: 32 },
  formPanelWide: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 48,
    paddingVertical: 40,
  },
  formInner: { width: "100%" },

  // Brand panel (wide only)
  brandPanel: {
    flex: 1,
    backgroundColor: BRAND.primaryDark,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    overflow: "hidden",
  },
  panelCircle1: {
    position: "absolute",
    top: -80,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  panelCircle2: {
    position: "absolute",
    bottom: -100,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  panelTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#fff",
    marginTop: 22,
    letterSpacing: -0.5,
  },
  panelSub: {
    fontSize: 15,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
    maxWidth: 300,
  },
  panelFeatures: { marginTop: 28, alignSelf: "center" },
  panelFeatureRow: { flexDirection: "row", alignItems: "center", marginVertical: 6 },
  panelDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  panelFeatureText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  // Brand (narrow)
  brandSection: { alignItems: "center", marginBottom: 24 },
  logoCircle: {
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#1E293B",
    letterSpacing: -0.4,
  },
  appSubtitle: { fontSize: 14, color: "#64748B", fontWeight: "600", marginTop: 4 },

  welcomeWrap: { marginBottom: 20 },
  welcomeTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  welcomeSub: { fontSize: 15, color: "#64748B", marginTop: 6 },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 8,
    marginTop: 12,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 15,
    height: 54,
  },
  inputFocused: {
    borderColor: BRAND.primary,
    backgroundColor: "#FFFFFF",
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#1E293B",
    marginLeft: 10,
    height: "100%",
  },

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 22,
    alignSelf: "flex-start",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    borderRadius: 6,
    marginRight: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  checked: { backgroundColor: BRAND.primary, borderColor: BRAND.primary },
  rememberText: { fontSize: 14, color: "#64748B", fontWeight: "500" },

  // Button container fills the card's inner width and sizes itself
  btnContainer: {
    width: "100%",
    height: BUTTON_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  loginBtn: {
    height: BUTTON_HEIGHT,
    borderRadius: BUTTON_HEIGHT / 2,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    backgroundColor: BRAND.primaryDark,
    overflow: "hidden",
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  loginText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 17,
    letterSpacing: 0.3,
  },

  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  secureText: { fontSize: 12, color: "#94A3B8", marginLeft: 6, fontWeight: "500" },
});