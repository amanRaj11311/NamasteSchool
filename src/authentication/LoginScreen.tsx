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
  Dimensions,
  Animated,
  Easing,
  Image,
} from "react-native";
import Feather from "@react-native-vector-icons/feather";
import { API_BASE } from "../network/api";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const isSmallScreen = screenHeight < 700;

const AnimatedTouchableOpacity =
  Animated.createAnimatedComponent(TouchableOpacity);

// Saved login keys
const SAVED_LOGIN_ENABLED = "savedLoginEnabled";
const SAVED_LOGIN_EMAIL = "savedLoginEmail";
const SAVED_LOGIN_PASSWORD = "savedLoginPassword";
const LOGIN_SAVE_ASKED = "loginSaveAsked";

// Brand colors — matches the Namaste School reference UI
const BRAND = {
  primary: "#DC2626", // main red
  primaryDark: "#B91C1C",
  primaryLight: "#EF4444",
  bg: "#FFF1F0",
  blob1: "#FCA5A5",
  blob2: "#F87171",
};

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginStatus, setLoginStatus] = useState<"idle" | "loading" | "success">(
    "idle"
  );

  const buttonWidth = useRef(new Animated.Value(screenWidth - 60)).current;
  const formTranslateX = useRef(new Animated.Value(0)).current;
  const entranceAnims = useRef([...Array(5)].map(() => new Animated.Value(0)))
    .current;

  useEffect(() => {
    loadSavedLoginDetails();

    const animations = entranceAnims.map((anim) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.exp),
      })
    );

    Animated.stagger(120, animations).start();
  }, []);

  const loadSavedLoginDetails = async () => {
    try {
      const savedEnabled = await AsyncStorage.getItem(SAVED_LOGIN_ENABLED);

      if (savedEnabled === "true") {
        const savedEmail = await AsyncStorage.getItem(SAVED_LOGIN_EMAIL);
        const savedPassword = await AsyncStorage.getItem(SAVED_LOGIN_PASSWORD);

        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) setPassword(savedPassword);

        setRemember(true);
      }
    } catch (error) {
      console.log("Load saved login error:", error);
    }
  };

  const saveLoginDetails = async (
    loginEmail: string,
    loginPassword: string
  ) => {
    await AsyncStorage.setItem(SAVED_LOGIN_ENABLED, "true");
    await AsyncStorage.setItem(SAVED_LOGIN_EMAIL, loginEmail);
    await AsyncStorage.setItem(SAVED_LOGIN_PASSWORD, loginPassword);
    await AsyncStorage.setItem(LOGIN_SAVE_ASKED, "true");
  };

  const removeSavedLoginDetails = async () => {
    await AsyncStorage.multiRemove([
      SAVED_LOGIN_ENABLED,
      SAVED_LOGIN_EMAIL,
      SAVED_LOGIN_PASSWORD,
    ]);

    await AsyncStorage.setItem(LOGIN_SAVE_ASKED, "true");
  };

  const goToDashboard = () => {
    setTimeout(() => {
      navigation.replace("DrawerRoot");
    }, 500);
  };

  const askSaveLoginDetailsFirstTime = async (
    loginEmail: string,
    loginPassword: string
  ) => {
    Alert.alert(
      "Save Login Details?",
      "Do you want to save your email and password on this device for next login?",
      [
        {
          text: "No",
          style: "cancel",
          onPress: async () => {
            await removeSavedLoginDetails();
            setRemember(false);
            goToDashboard();
          },
        },
        {
          text: "Yes, Save",
          onPress: async () => {
            await saveLoginDetails(loginEmail, loginPassword);
            setRemember(true);
            goToDashboard();
          },
        },
      ],
      { cancelable: false }
    );
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Animated.sequence([
        Animated.timing(formTranslateX, {
          toValue: -10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(formTranslateX, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(formTranslateX, {
          toValue: 0,
          duration: 50,
          useNativeDriver: true,
        }),
      ]).start();

      return Alert.alert("Required", "Please enter Email and Password");
    }

    const loginEmail = email.trim().toLowerCase();
    const loginPassword = password;

    setLoginStatus("loading");

    Animated.timing(buttonWidth, {
      toValue: 56,
      duration: 300,
      useNativeDriver: false,
    }).start();

    try {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        email: loginEmail,
        password: loginPassword,
      });

      if (!response.data?.success) {
        setLoginStatus("idle");
        Animated.timing(buttonWidth, {
          toValue: screenWidth - 60,
          duration: 300,
          useNativeDriver: false,
        }).start();
        return Alert.alert(
          "Login Failed",
          response.data?.message || "Invalid email or password"
        );
      }

      const user = response.data.user;

      if (!user) {
        setLoginStatus("idle");
        return Alert.alert("Login Error", "User data not received from server");
      }

      // Backend currently doesn't issue a JWT/session token on login — it
      // just confirms success and returns the user object (with permissions
      // already embedded in user.permissions / user.roleId.permissions).
      // We store a simple logged-in marker instead of a real bearer token.
      // If any screen later needs authenticated API calls, that's a
      // separate backend change — not required for login/navigation to work.
      const sessionMarker = String(user.id || user._id || "logged-in");

      let extractedRole = "EMPLOYEE";

      if (user.roleName) {
        extractedRole = user.roleName;
      } else if (user.role) {
        if (typeof user.role === "string") {
          extractedRole = user.role;
        } else if (user.role.name) {
          extractedRole = user.role.name;
        }
      } else if (user.roleId?.name) {
        extractedRole = user.roleId.name;
      }

      const permissions = user.permissions || user.roleId?.permissions || [];

      await AsyncStorage.setItem("userToken", sessionMarker);
      await AsyncStorage.setItem("userId", String(user.id || user._id || ""));
      await AsyncStorage.setItem(
        "employeeId",
        String(user.employeeId || user.id || "")
      );

      // API returns a single `name` field ("Super Admin"),
      // not separate firstName/lastName.
      const displayName = user.name
        ? user.name
        : `${user.firstName || ""} ${user.lastName || ""}`.trim();
      await AsyncStorage.setItem("userName", displayName || "User");

      // FIX: email was never persisted before, so AppBar/Drawer always
      // read null for it. Prefer whatever the API returns for the user's
      // email, falling back to the address they just logged in with.
      await AsyncStorage.setItem("userEmail", String(user.email || loginEmail));

      // Save the correct role
      await AsyncStorage.setItem("userRole", extractedRole.toUpperCase());

      // Persist the Super Admin flag — AppNavigator uses this to
      // bypass per-module permission checks entirely for Super Admins.
      await AsyncStorage.setItem(
        "isSuperAdmin",
        user.isSuperAdmin ? "true" : "false"
      );

      // FIX: `schoolId` was never persisted before. On the backend it comes
      // back as a *populated object* ({_id, name, code, city, board}) for a
      // normal school-scoped user, and as `null` for a Super Admin (who
      // isn't tied to one school and picks from a list instead). Store just
      // the `_id` string — that's what feature screens (e.g. Notice Board)
      // send back to the API — plus the name separately for display use.
      const schoolIdValue = user.schoolId?._id || user.school?._id || "";
      const schoolNameValue = user.schoolId?.name || user.school?.name || "";
      await AsyncStorage.setItem("userSchoolId", schoolIdValue);
      await AsyncStorage.setItem("userSchoolName", schoolNameValue);

      await AsyncStorage.setItem("userPermissions", JSON.stringify(permissions));

      // This is only for token/session preference
      await AsyncStorage.setItem("keepLoggedIn", remember ? "true" : "false");

      await AsyncStorage.setItem(
        "userDesignation",
        String(user.designation || "N/A")
      );
      await AsyncStorage.setItem(
        "userDepartment",
        String(user.department || "N/A")
      );
      await AsyncStorage.setItem("userDoj", String(user.dateOfJoining || ""));

      const bank = user.bankDetails || {};
      await AsyncStorage.setItem("userBankAcc", String(bank.accountNumber || "-"));
      await AsyncStorage.setItem("userBankName", String(bank.bankName || "-"));
      await AsyncStorage.setItem("userBankIfsc", String(bank.ifscCode || "-"));

      if (user.avatar) {
        await AsyncStorage.setItem("userAvatar", user.avatar);
      } else {
        await AsyncStorage.removeItem("userAvatar");
      }

      setLoginStatus("success");
      console.log("LOGIN SUCCESS — navigating to dashboard");

      const alreadyAsked = await AsyncStorage.getItem(LOGIN_SAVE_ASKED);

      // Navigation no longer waits on the Alert — if the Alert fails to show
      // for any reason (web platform, OS quirk, etc.) the user still lands
      // on the dashboard instead of getting stuck on the success screen.
      goToDashboard();

      // First time successful login ke baad user se (in the background) ask karega
      if (alreadyAsked !== "true") {
        askSaveLoginDetailsFirstTime(loginEmail, loginPassword);
      } else if (remember) {
        // Agar user ne checkbox ON rakha hai to details save/update hongi
        await saveLoginDetails(loginEmail, loginPassword);
      } else {
        await removeSavedLoginDetails();
      }
    } catch (error: any) {
      setLoginStatus("idle");

      Animated.timing(buttonWidth, {
        toValue: screenWidth - 60,
        duration: 300,
        useNativeDriver: false,
      }).start();

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
          outputRange: [40, 0],
        }),
      },
    ],
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor={BRAND.bg}
        translucent={false}
      />

      {/* Decorative glow blobs — matches the soft red radial background in the reference UI */}
      <View pointerEvents="none" style={styles.blobTopLeft} />
      <View pointerEvents="none" style={styles.blobBottomRight} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={[
            styles.formCard,
            { transform: [{ translateX: formTranslateX }] },
          ]}
        >
          <Animated.View style={[styles.brandSection, getEntranceStyle(0)]}>
            <View style={styles.logoCircle}>
              <Image
                source={require("../assets/logo.png")}
                style={styles.appLogo}
                resizeMode="contain"
              />
            </View>

            <View style={styles.brandTextWrap}>
              <Text style={styles.appTitle}>Namaste School</Text>
              <Text style={styles.appSubtitle}>School Management System</Text>
            </View>
          </Animated.View>

          <Animated.View style={getEntranceStyle(1)}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputContainer}>
              <Feather name="mail" size={20} color="#94A3B8" />
              <TextInput
                style={styles.input}
                placeholder="name@company.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </Animated.View>

          <Animated.View style={getEntranceStyle(2)}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Feather name="lock" size={20} color="#94A3B8" />
              <TextInput
                style={styles.input}
                secureTextEntry={!showPassword}
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                placeholderTextColor="#94A3B8"
              />

              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Feather
                  name={showPassword ? "eye" : "eye-off"}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.rememberRow}>
              <TouchableOpacity
                style={[styles.checkbox, remember && styles.checked]}
                onPress={() => setRemember(!remember)}
              >
                {remember && <Feather name="check" size={14} color="#fff" />}
              </TouchableOpacity>

              <Text style={styles.rememberText}>Keep me logged in</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.btnContainer, getEntranceStyle(3)]}>
            <AnimatedTouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.loginBtn,
                { width: buttonWidth },
                // @ts-ignore — experimental_backgroundImage is a valid RN style prop
                // (RN 0.76+, New Architecture) that renders a native CSS-style gradient
                // without needing any third-party library like react-native-linear-gradient.
                {
                  experimental_backgroundImage:
                    loginStatus === "success"
                      ? "linear-gradient(135deg, #16A34A, #15803D)"
                      : `linear-gradient(135deg, ${BRAND.primaryLight}, ${BRAND.primaryDark})`,
                },
              ]}
              onPress={handleLogin}
              disabled={loginStatus !== "idle"}
            >
              {loginStatus === "idle" ? (
                <>
                  <Feather
                    name="log-in"
                    size={18}
                    color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.loginText}>Sign In</Text>
                </>
              ) : loginStatus === "loading" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Feather name="check" size={24} color="#fff" />
              )}
            </AnimatedTouchableOpacity>
          </Animated.View>

        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.bg,
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
    paddingVertical: 40,
  },

  formCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 32,
    paddingHorizontal: 32,
    paddingTop: isSmallScreen ? 30 : 38,
    paddingBottom: 30,
    shadowColor: BRAND.primaryDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },

  brandSection: {
    alignItems: "center",
    marginBottom: 28,
  },

  logoCircle: {
    width: 110,
    height: 110,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
    overflow: "hidden",
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },

  appLogo: {
    width: 100,
    height: 100,
    resizeMode: "contain",
  },

  brandTextWrap: {
    alignItems: "center",
  },

  appTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#1E293B",
    letterSpacing: -0.4,
  },

  appSubtitle: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 4,
  },

  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 8,
    marginTop: 10,
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 15,
    height: 55,
  },

  input: {
    flex: 1,
    fontSize: 16,
    color: "#1E293B",
    marginLeft: 10,
  },

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
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

  checked: {
    backgroundColor: BRAND.primary,
    borderColor: BRAND.primary,
  },

  rememberText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },

  btnContainer: {
    alignItems: "center",
    justifyContent: "center",
    height: 57,
    marginTop: 10,
  },

  loginBtn: {
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    backgroundColor: BRAND.primaryDark, // fallback color if gradient style isn't supported
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
});