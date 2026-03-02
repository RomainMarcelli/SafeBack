// Provider global d'accessibilité: expose les préférences et des helpers transverses.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Text } from "react-native";
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  getAccessibilityPreferences,
  subscribeAccessibilityPreferences,
  type AccessibilityPreferences
} from "../lib/accessibility/preferences";
import { announceVoiceHint } from "../lib/accessibility/voiceHints";
import { triggerAccessibleHaptic } from "../lib/accessibility/feedback";

type AppAccessibilityContextValue = {
  preferences: AccessibilityPreferences;
  textScaleFactor: number;
  announce: (message: string) => Promise<void>;
  haptic: (pattern?: "light" | "success" | "warning") => Promise<void>;
};

const AppAccessibilityContext = createContext<AppAccessibilityContextValue | null>(null);

function scaleFactorFromPrefs(prefs: AccessibilityPreferences): number {
  return prefs.textScale === "large" ? 1.15 : 1;
}

export function AppAccessibilityProvider(props: { children: ReactNode }) {
  const { children } = props;
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(
    DEFAULT_ACCESSIBILITY_PREFERENCES
  );

  useEffect(() => {
    let mounted = true;
    getAccessibilityPreferences()
      .then((next) => {
        if (!mounted) return;
        setPreferences(next);
      })
      .catch(() => {
        // no-op
      });
    const unsubscribe = subscribeAccessibilityPreferences((next) => {
      setPreferences(next);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const textComponent = Text as any;
    const previousDefaults = textComponent.defaultProps ?? {};
    textComponent.defaultProps = {
      ...previousDefaults,
      maxFontSizeMultiplier: preferences.textScale === "large" ? 1.25 : 1.05
    };
    return () => {
      textComponent.defaultProps = previousDefaults;
    };
  }, [preferences.textScale]);

  const value = useMemo<AppAccessibilityContextValue>(
    () => ({
      preferences,
      textScaleFactor: scaleFactorFromPrefs(preferences),
      announce: async (message: string) => {
        await announceVoiceHint(message);
      },
      haptic: async (pattern = "light") => {
        await triggerAccessibleHaptic(pattern);
      }
    }),
    [preferences]
  );

  return (
    <AppAccessibilityContext.Provider value={value}>
      {children}
    </AppAccessibilityContext.Provider>
  );
}

export function useAppAccessibility(): AppAccessibilityContextValue {
  const context = useContext(AppAccessibilityContext);
  if (!context) {
    throw new Error("useAppAccessibility doit être utilisé dans AppAccessibilityProvider.");
  }
  return context;
}
