import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { listFavoriteAddresses } from "../../src/lib/db";
import {
  DEFAULT_FORGOTTEN_TRIP_CONFIG,
  inferPreferredPlaceType,
  isLikelyPreferredPlace,
  type ForgottenTripConfig
} from "../../src/lib/forgottenTrip";
import {
  getForgottenTripConfig,
  resetForgottenTripConfig,
  setForgottenTripConfig
} from "../../src/lib/forgottenTripStorage";
import { supabase } from "../../src/lib/supabase";

type FavoriteAddress = {
  id: string;
  label: string;
  address: string;
};

function typeLabel(value: ReturnType<typeof inferPreferredPlaceType>) {
  if (value === "home") return "Maison";
  if (value === "work") return "Travail";
  if (value === "friends") return "Amis/Famille";
  return "Autre";
}

export default function ForgottenTripSettingsScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<FavoriteAddress[]>([]);
  const [config, setConfig] = useState<ForgottenTripConfig>(DEFAULT_FORGOTTEN_TRIP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!checking && !userId) {
      router.replace("/auth");
    }
  }, [checking, userId, router]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        const [dbFavorites, storedConfig] = await Promise.all([
          listFavoriteAddresses(),
          getForgottenTripConfig()
        ]);
        setFavorites(dbFavorites as FavoriteAddress[]);
        setConfig(storedConfig);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  const selectedIds = new Set(config.selectedFavoriteIds);
  const suggestedIds = useMemo(
    () =>
      favorites
        .filter((favorite) => isLikelyPreferredPlace(inferPreferredPlaceType(favorite.label)))
        .map((favorite) => favorite.id),
    [favorites]
  );

  const toggleFavorite = (id: string) => {
    setConfig((prev) => {
      const exists = prev.selectedFavoriteIds.includes(id);
      return {
        ...prev,
        selectedFavoriteIds: exists
          ? prev.selectedFavoriteIds.filter((value) => value !== id)
          : [...prev.selectedFavoriteIds, id]
      };
    });
  };

  const applySuggestions = () => {
    setConfig((prev) => ({
      ...prev,
      selectedFavoriteIds: suggestedIds
    }));
  };

  const save = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      await setForgottenTripConfig(config);
      setSuccessMessage("Reglages enregistres.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      await resetForgottenTripConfig();
      setConfig(DEFAULT_FORGOTTEN_TRIP_CONFIG);
      setSuccessMessage("Reglages par defaut restaures.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de reinitialisation.");
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving;

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">
              Retour
            </Text>
          </TouchableOpacity>
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
              Detection
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Trajet oublie</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Detecte une sortie de lieu habituel sans session active et envoie une notification locale.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Activation</Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                config.enabled ? "bg-emerald-600" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setConfig((prev) => ({ ...prev, enabled: true }))}
            >
              <Text className={`text-center text-sm font-semibold ${config.enabled ? "text-white" : "text-slate-700"}`}>
                Active
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                !config.enabled ? "bg-rose-600" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setConfig((prev) => ({ ...prev, enabled: false }))}
            >
              <Text className={`text-center text-sm font-semibold ${!config.enabled ? "text-white" : "text-slate-700"}`}>
                Desactive
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Lieux de predilection</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Selectionne les lieux a surveiller (maison, travail, amis...). Si rien n est selectionne,
            SafeBack utilise les labels detectes automatiquement.
          </Text>
          <TouchableOpacity
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={applySuggestions}
          >
            <Text className="text-center text-sm font-semibold text-slate-700">
              Appliquer auto (maison / travail / amis)
            </Text>
          </TouchableOpacity>

          <View className="mt-3 gap-2">
            {favorites.length === 0 ? (
              <Text className="text-sm text-slate-500">Aucun lieu favori disponible.</Text>
            ) : (
              favorites.map((favorite) => {
                const active = selectedIds.has(favorite.id);
                const placeType = inferPreferredPlaceType(favorite.label);
                return (
                  <TouchableOpacity
                    key={favorite.id}
                    className={`rounded-2xl border px-4 py-3 ${
                      active
                        ? "border-[#0F766E] bg-emerald-50"
                        : "border-slate-200 bg-white"
                    }`}
                    onPress={() => toggleFavorite(favorite.id)}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text className="text-sm font-semibold text-slate-800">{favorite.label}</Text>
                        <Text className="mt-1 text-xs text-slate-500">{favorite.address}</Text>
                      </View>
                      <View
                        className={`rounded-full px-3 py-1 ${
                          active ? "bg-[#0F766E]" : "bg-slate-100"
                        }`}
                      >
                        <Text className={`text-xs font-semibold ${active ? "text-white" : "text-slate-600"}`}>
                          {typeLabel(placeType)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>

        {errorMessage ? <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text> : null}
        {successMessage ? <Text className="mt-4 text-sm text-emerald-600">{successMessage}</Text> : null}

        <TouchableOpacity
          className={`mt-6 rounded-3xl px-6 py-5 shadow-lg ${
            busy ? "bg-slate-300" : "bg-[#111827]"
          }`}
          onPress={save}
          disabled={busy}
        >
          <Text className="text-center text-base font-semibold text-white">
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="mt-3 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4"
          onPress={reset}
          disabled={busy}
        >
          <Text className="text-center text-base font-semibold text-amber-800">
            Revenir aux reglages par defaut
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
