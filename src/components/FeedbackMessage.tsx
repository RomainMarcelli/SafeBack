// Composant visuel unifie pour les retours utilisateur (erreur, succes, info).
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useAppAccessibility } from "./AppAccessibilityProvider";
import { textStyleFromScale } from "../theme/designSystem";

type FeedbackKind = "error" | "success" | "info";

export function FeedbackMessage(props: {
  kind: FeedbackKind;
  message: string;
  compact?: boolean;
  mode?: "toast" | "inline";
  durationMs?: number;
}) {
  const { kind, message, compact = false, mode = "toast", durationMs = 3000 } = props;
  const { preferences } = useAppAccessibility();
  const normalizedMessage = String(message ?? "").trim();
  const [visible, setVisible] = useState(Boolean(normalizedMessage));

  useEffect(() => {
    if (!normalizedMessage) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [normalizedMessage]);

  useEffect(() => {
    if (!visible || !normalizedMessage) return;
    if (mode !== "toast") return;
    const timer = setTimeout(() => {
      setVisible(false);
    }, Math.max(1200, durationMs));
    return () => clearTimeout(timer);
  }, [visible, normalizedMessage, mode, durationMs]);

  if (!normalizedMessage) return null;
  if (!visible) return null;

  const palette =
    kind === "error"
      ? {
          border: preferences.highContrast ? "border-rose-700" : "border-rose-200",
          background: preferences.highContrast ? "bg-rose-100" : "bg-rose-50",
          accent: "bg-rose-500",
          iconBg: "bg-white border-rose-200",
          iconColor: "#BE123C",
          title: "Attention",
          titleColor: "text-rose-700",
          textColor: "text-rose-900"
        }
      : kind === "success"
        ? {
            border: preferences.highContrast ? "border-emerald-700" : "border-emerald-200",
            background: preferences.highContrast ? "bg-emerald-100" : "bg-emerald-50",
            accent: "bg-emerald-500",
            iconBg: "bg-white border-emerald-200",
            iconColor: "#047857",
            title: "Succès",
            titleColor: "text-emerald-700",
            textColor: "text-emerald-900"
          }
        : {
            border: preferences.highContrast ? "border-cyan-700" : "border-cyan-200",
            background: preferences.highContrast ? "bg-cyan-100" : "bg-cyan-50",
            accent: "bg-cyan-500",
            iconBg: "bg-white border-cyan-200",
            iconColor: "#0E7490",
            title: "Information",
            titleColor: "text-cyan-700",
            textColor: "text-cyan-900"
          };

  const iconName: keyof typeof Ionicons.glyphMap =
    kind === "error" ? "alert-circle-outline" : kind === "success" ? "checkmark-circle-outline" : "information-circle-outline";

  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${palette.title}. ${normalizedMessage}`}
      className={`${
        mode === "toast"
          ? "absolute left-4 right-4 top-3 z-50"
          : compact
            ? "mt-3"
            : "mt-4"
      } overflow-hidden rounded-2xl border ${palette.border} ${palette.background}`}
    >
      <View className={`absolute left-0 top-0 h-full w-1.5 ${palette.accent}`} />
      <View className={`flex-row items-start gap-3 ${compact ? "px-3 py-3" : "px-4 py-4"}`}>
        <View className={`h-9 w-9 items-center justify-center rounded-xl border ${palette.iconBg}`}>
          <Ionicons name={iconName} size={18} color={palette.iconColor} />
        </View>
        <View className="flex-1">
          <Text className={`text-[10px] font-semibold uppercase tracking-[2px] ${palette.titleColor}`}>
            {palette.title}
          </Text>
          <Text
            className={`mt-1 font-semibold ${palette.textColor}`}
            style={textStyleFromScale(preferences.textScale, 14)}
          >
            {normalizedMessage}
          </Text>
        </View>
      </View>
    </View>
  );
}
