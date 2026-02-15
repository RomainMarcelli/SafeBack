// Design system minimal pour harmoniser couleurs et rayons sur les nouveaux écrans.
export const DS = {
  color: {
    bg: "#F7F2EA",
    surface: "#FFFFFF",
    surfaceSoft: "#F8FAFC",
    border: "#E7E0D7",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    primary: "#111827",
    success: "#059669",
    warning: "#D97706",
    danger: "#BE123C",
    info: "#0284C7"
  },
  radius: {
    xl: 16,
    xxl: 24
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24
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
      caption: "text-sm"
    };
  }
  return {
    title: "text-4xl",
    body: "text-base",
    caption: "text-xs"
  };
}
