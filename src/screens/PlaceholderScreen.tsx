import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";

type Props = {
  title: string;
  icon: string; // Feather icon name
  description?: string;
};

/**
 * Generic "coming soon" screen used as a stand-in for real module screens.
 * Swap the corresponding *Screen.tsx file's contents once the real UI is
 * built — the navigator doesn't need to change.
 */
export default function PlaceholderScreen({ title, icon, description }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Feather name={icon as any} size={40} color="#1976D2" />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {description || "This screen is under construction."}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F7FB",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
});