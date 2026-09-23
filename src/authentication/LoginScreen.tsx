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

// Saved login keys (for the "save password" autofill feature)
const SAVED_LOGIN_ENABLED = "savedLoginEnabled";
const SAVED_LOGIN_EMAIL = "savedLoginEmail";
const SAVED_LOGIN_PASSWORD = "savedLoginPassword";
const LOGIN_SAVE_ASKED_EMAIL = "loginSaveAskedEmail";
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
  const [checkingSession, setCheckingSession] = useState(true);

  const buttonWidth = useRef(new Animated.Value(screenWidth - 60)).current;
  const formTranslateX = useRef(new Animated.Value(0)).current;
  const entranceAnims = useRef([...Array(5)].map(() => new Animated.Value(0)))
    .current;

  useEffect(() => {
    initScreen();
  }, []);

  const initScreen = async () => {
    try {
      const keepLoggedIn = await AsyncStorage.getItem("keepLoggedIn");
      const token = await AsyncStorage.getItem("userToken");

      if (keepLoggedIn === "true" && token) {
        // Valid remembered session — skip the login form entirely.
        navigation.replace("DrawerRoot");
        return;
      }
    } catch (error) {
      console.log("Session check error:", error);
    }

    await loadSavedLoginDetails();
    setCheckingSession(false);

    const animations = entranceAnims.map((anim) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.exp),
      })
    );
    Animated.stagger(120, animations).start();
  };

  const loadSavedLoginDetails = async () => {
    try {
      const savedEnabled = await AsyncStorage.getItem(SAVED_LOGIN_ENABLED);

      if (savedEnabled === "true") {
        const savedEmail = await AsyncStorage.getItem(SAVED_LOGIN_EMAIL);
        const savedPassword = await AsyncStorage.getItem(SAVED_LOGIN_PASSWORD);

        if (savedEmail) {
          setEmail(savedEmail);
        }

        if (savedPassword) {
          setPassword(savedPassword);
        }
      }

      const keepLoggedIn = await AsyncStorage.getItem("keepLoggedIn");
      setRemember(keepLoggedIn === "true");
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
  };

  const removeSavedLoginDetails = async () => {
    await Promise.all(
      [SAVED_LOGIN_ENABLED, SAVED_LOGIN_EMAIL, SAVED_LOGIN_PASSWORD].map((key) =>
        AsyncStorage.removeItem(key)
      )
    );
  };

  const goToDashboard = () => {
    setTimeout(() => {
      navigation.replace("DrawerRoot");
    }, 500);
  };

  const askSaveLoginDetails = (
    loginEmail: string,
    loginPassword: string
  ): Promise<boolean> => {
    return new Promise((resolve) => {
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
                await saveLoginDetails(loginEmail, loginPassword);
                resolve(true);
              } catch (error) {
                console.log("Save login details error:", error);
                resolve(false);
              }
            },
          },
        ],
        {
          cancelable: false,
        }
      );
    });
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

      const displayName = user.name
        ? user.name
        : `${user.firstName || ""} ${user.lastName || ""}`.trim();
      await AsyncStorage.setItem("userName", displayName || "User");

      await AsyncStorage.setItem("userEmail", String(user.email || loginEmail));

      // Save the correct role
      await AsyncStorage.setItem("userRole", extractedRole.toUpperCase());

      await AsyncStorage.setItem(
        "isSuperAdmin",
        user.isSuperAdmin ? "true" : "false"
      );
      const schoolIdValue = user.schoolId?._id || user.school?._id || "";
      const schoolNameValue = user.schoolId?.name || user.school?.name || "";
      await AsyncStorage.setItem("userSchoolId", schoolIdValue);
      await AsyncStorage.setItem("userSchoolName", schoolNameValue);

      await AsyncStorage.setItem("userPermissions", JSON.stringify(permissions));

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

  if (checkingSession) {
    return (
      <View style={styles.sessionLoader}>
        <StatusBar barStyle="dark-content" backgroundColor={BRAND.bg} translucent={false} />
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

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
                {
                  experimental_backgroundImage:
                    loginStatus === "success"
                      ? "linear-gradient(135deg, #DC2626, #DC2626)"
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
    backgroundColor: BRAND.primaryDark, 
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