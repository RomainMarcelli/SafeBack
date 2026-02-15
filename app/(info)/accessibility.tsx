// Centre d'accessibilité : lisibilité, contraste, retour haptique et commandes vocales.
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Switch, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getAccessibilityPreferences,
  resetAccessibilityPreferences,
  setAccessibilityPreferences,
  type AccessibilityPreferences,
  type TextScale
} from "../../src/lib/accessibility/preferences";
import { triggerAccessibleHaptic } from "../../src/lib/accessibility/feedback";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

export default function AccessibilityScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<AccessibilityPreferences | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const value = await getAccessibilityPreferences();
        setPrefs(value);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Impossible de charger les préférences d'accessibilité.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updatePref = async (patch: Partial<AccessibilityPreferences>) => {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      const next = await setAccessibilityPreferences(patch);
      setPrefs(next);
      await triggerAccessibleHaptic("light");
      setSuccessMessage("Préférences enregistrées.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'enregistrer les préférences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Retour</Text>
          </TouchableOpacity>
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">Accessibilité</Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Confort de lecture</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Taille de texte, contraste, haptique et commandes vocales via dictée clavier.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Mode haute lisibilité</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Accentue le contraste et simplifie les blocs visuels.
          </Text>
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-slate-800">Activer</Text>
            <Switch
              value={Boolean(prefs?.highContrast)}
              onValueChange={(value) => {
                updatePref({ highContrast: value }).catch(() => {
                  // no-op
                });
              }}
              disabled={loading || saving}
            />
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Taille de texte</Text>
          <View className="mt-3 flex-row gap-2">
            {(["normal", "large"] as TextScale[]).map((scale) => {
              const active = (prefs?.textScale ?? "normal") === scale;
              return (
                <TouchableOpacity
                  key={scale}
                  className={`flex-1 rounded-2xl px-4 py-3 ${
                    active ? "bg-[#111827]" : "border border-slate-200 bg-white"
                  }`}
                  onPress={() => {
                    updatePref({ textScale: scale }).catch(() => {
                      // no-op
                    });
                  }}
                  disabled={loading || saving}
                >
                  <Text className={`text-center text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                    {scale === "large" ? "Grand" : "Normal"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Retour haptique</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Vibration légère sur les validations sensibles.
          </Text>
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-slate-800">Activer</Text>
            <Switch
              value={Boolean(prefs?.hapticsEnabled)}
              onValueChange={(value) => {
                updatePref({ hapticsEnabled: value }).catch(() => {
                  // no-op
                });
              }}
              disabled={loading || saving}
            />
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Commandes vocales</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Utilise la dictée du clavier pour lancer des actions rapides.
          </Text>
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-slate-800">Activer</Text>
            <Switch
              value={Boolean(prefs?.voiceCommandsEnabled)}
              onValueChange={(value) => {
                updatePref({ voiceCommandsEnabled: value }).catch(() => {
                  // no-op
                });
              }}
              disabled={loading || saving}
            />
          </View>
          <TouchableOpacity
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={() => router.push("/voice-assistant")}
          >
            <Text className="text-center text-sm font-semibold text-slate-700">Ouvrir l'assistant vocal</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Mode malvoyant (beta)</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Active un profil renforcé: texte grand, contraste élevé et retours adaptés.
          </Text>
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-slate-800">Activer</Text>
            <Switch
              value={Boolean(prefs?.blindModeEnabled)}
              onValueChange={(value) => {
                updatePref({
                  blindModeEnabled: value,
                  textScale: value ? "large" : prefs?.textScale ?? "normal",
                  highContrast: value ? true : prefs?.highContrast ?? false,
                  voiceCommandsEnabled: value ? true : prefs?.voiceCommandsEnabled ?? false
                }).catch(() => {
                  // no-op
                });
              }}
              disabled={loading || saving}
            />
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Mode malentendant (beta)</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Privilégie les retours visuels et conserve les notifications visibles.
          </Text>
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-slate-800">Activer</Text>
            <Switch
              value={Boolean(prefs?.deafModeEnabled)}
              onValueChange={(value) => {
                updatePref({
                  deafModeEnabled: value,
                  highContrast: value ? true : prefs?.highContrast ?? false,
                  hapticsEnabled: value ? true : prefs?.hapticsEnabled ?? true
                }).catch(() => {
                  // no-op
                });
              }}
              disabled={loading || saving}
            />
          </View>
        </View>

        <TouchableOpacity
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
          onPress={async () => {
            try {
              setSaving(true);
              const next = await resetAccessibilityPreferences();
              setPrefs(next);
              setSuccessMessage("Préférences d'accessibilité réinitialisées.");
            } catch (error: any) {
              setErrorMessage(error?.message ?? "Impossible de réinitialiser.");
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          <Text className="text-center text-sm font-semibold text-amber-700">Réinitialiser l'accessibilité</Text>
        </TouchableOpacity>

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}
        {successMessage ? <FeedbackMessage kind="success" message={successMessage} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
