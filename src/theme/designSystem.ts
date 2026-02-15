// Design system SafeBack : tokens globaux (couleurs, spacing, radius, elevation, motion).
export const DS = {
  color: {
    bg: "#F7F2EA",
    bgDark: "#0B1220",
    surface: "#FFFFFF",
    surfaceSoft: "#F8FAFC",
    border: "#E7E0D7",
    borderStrong: "#CBD5E1",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textOnDark: "#F8FAFC",
    primary: "#111827",
    primarySoft: "#1E293B",
    success: "#059669",
    warning: "#D97706",
    danger: "#BE123C",
    info: "#0284C7",
    badgeNewBg: "#E0F2FE",
    badgeNewText: "#0369A1",
    badgeDoneBg: "#DCFCE7",
    badgeDoneText: "#166534",
    badgeTodoBg: "#F1F5F9",
    badgeTodoText: "#334155"
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 30
  },
  elevation: {
    card: {
      shadowColor: "#0F172A",
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4
    },
    floating: {
      shadowColor: "#020617",
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8
    }
  },
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32
  },
  motion: {
    instant: 80,
    fast: 150,
    normal: 230,
    slow: 320
  }
} as const;

export function textScaleClass(scale: "normal" | "large"): {
  title: string;
  body: string;
  caption: string;
} {
  if (scale === "large") {
    return {
      title: "text-5xl",
      body: "text-lg",
      caption: "text-base"
    };
  }
  return {
    title: "text-4xl",
    body: "text-base",
    caption: "text-xs"
  };
}

export function textStyleFromScale(
  scale: "normal" | "large",
  baseSize: number
): { fontSize: number; lineHeight: number } {
  const factor = scale === "large" ? 1.15 : 1;
  const fontSize = Math.round(baseSize * factor * 10) / 10;
  return {
    fontSize,
    lineHeight: Math.round(fontSize * 1.35 * 10) / 10
  };
}
