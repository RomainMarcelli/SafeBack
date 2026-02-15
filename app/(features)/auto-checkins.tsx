// Écran de configuration des arrivées automatiques vers un ou plusieurs proches choisis.
import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import Slider from "@react-native-community/slider";
import { SafeAreaView } from "react-native-safe-area-context";
import { listFavoriteAddresses } from "../../src/lib/core/db";
import { listFriends, type FriendWithProfile } from "../../src/lib/social/friendsDb";
import {
  addAutoCheckinRule,
  deleteAutoCheckinRule,
  getAutoCheckinConfig,
  setAutoCheckinEnabled,
  toggleAutoCheckinRule,
  type AutoCheckinRule
} from "../../src/lib/safety/autoCheckins";
import { geocodeAddress } from "../../src/lib/trips/routing";
import { supabase } from "../../src/lib/core/supabase";
import { getWifiIdentity } from "../../src/lib/safety/wifiIdentity";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

type FavoriteAddress = {
  id: string;
  label: string;
  address: string;
};

function friendLabel(friend: FriendWithProfile): string {
  const username = String(friend.profile?.username ?? "").trim();
  if (username) return username;
  const fullName = `${String(friend.profile?.first_name ?? "").trim()} ${String(
    friend.profile?.last_name ?? ""
  ).trim()}`.trim();
  if (fullName) return fullName;
  return String(friend.profile?.public_id ?? "Proche");
}

export default function AutoCheckinsScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [rules, setRules] = useState<AutoCheckinRule[]>([]);
  const [favorites, setFavorites] = useState<FavoriteAddress[]>([]);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);

  const [ruleLabel, setRuleLabel] = useState("");
  const [ruleAddress, setRuleAddress] = useState("");
  const [radiusMeters, setRadiusMeters] = useState(140);
  const [cooldownMinutes, setCooldownMinutes] = useState(60);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [triggerByPosition, setTriggerByPosition] = useState(true);
  const [triggerByHomeWifi, setTriggerByHomeWifi] = useState(false);
  const [triggerByCharging, setTriggerByCharging] = useState(false);
  const [homeWifiIpPrefix, setHomeWifiIpPrefix] = useState<string | null>(null);
  const [homeWifiSsid, setHomeWifiSsid] = useState<string | null>(null);
  const [homeWifiBssid, setHomeWifiBssid] = useState<string | null>(null);

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

  const refresh = async () => {
    const [config, favoriteRows, friendRows] = await Promise.all([
      getAutoCheckinConfig(),
      listFavoriteAddresses(),
      listFriends()
    ]);
    setGlobalEnabled(config.enabled);
    setRules(config.rules);
    setFavorites(favoriteRows as FavoriteAddress[]);
    setFriends(friendRows);
  };

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        await refresh();
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const shouldRedirectToAuth = !checking && !userId;

  const friendMap = useMemo(
    () => new Map(friends.map((friend) => [friend.friend_user_id, friend])),
    [friends]
  );

  const toggleRecipient = (friendUserId: string) => {
    setSelectedRecipientIds((prev) =>
      prev.includes(friendUserId)
        ? prev.filter((value) => value !== friendUserId)
        : [...prev, friendUserId]
    );
  };

  const addRule = async () => {
    try {
      const label = ruleLabel.trim();
      const address = ruleAddress.trim();
      const hasAtLeastOneCondition = triggerByPosition || triggerByHomeWifi || triggerByCharging;
      if (!label || !address) {
        setErrorMessage("Ajoute un nom de lieu et une adresse.");
        return;
      }
      if (!hasAtLeastOneCondition) {
        setErrorMessage("Sélectionne au moins une condition de confirmation.");
        return;
      }
      if (triggerByHomeWifi && !homeWifiSsid && !homeWifiBssid && !homeWifiIpPrefix) {
        setErrorMessage("Capture d'abord ton Wi-Fi maison.");
        return;
      }
      if (selectedRecipientIds.length === 0) {
        setErrorMessage("Sélectionne au moins un proche.");
        return;
      }

      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      // Géocode au moment de l'enregistrement pour rendre la détection fiable et instantanée ensuite.
      const geo = await geocodeAddress(address);
      if (!geo) {
        setErrorMessage("Adresse introuvable. Vérifie la saisie.");
        return;
      }

      await addAutoCheckinRule({
        label,
        address,
        latitude: geo.lat,
        longitude: geo.lon,
        radiusMeters,
        cooldownMinutes,
        recipientUserIds: selectedRecipientIds,
        trigger: {
          byPosition: triggerByPosition,
          byHomeWifi: triggerByHomeWifi,
          byCharging: triggerByCharging,
          homeWifiSsid,
          homeWifiBssid,
          homeWifiIpPrefix
        }
      });
      await setAutoCheckinEnabled(true);
      await refresh();

      setRuleLabel("");
      setRuleAddress("");
      setRadiusMeters(140);
      setCooldownMinutes(60);
      setSelectedRecipientIds([]);
      setTriggerByPosition(true);
      setTriggerByHomeWifi(false);
      setTriggerByCharging(false);
      setHomeWifiIpPrefix(null);
      setHomeWifiSsid(null);
      setHomeWifiBssid(null);
      setSuccessMessage("Arrivée automatique ajoutée.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'ajouter cette règle.");
    } finally {
      setSaving(false);
    }
  };

  const setGlobalMode = async (enabled: boolean) => {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      setSaving(true);
      await setAutoCheckinEnabled(enabled);
      setGlobalEnabled(enabled);
      setSuccessMessage(enabled ? "Arrivées automatiques activées." : "Arrivées automatiques désactivées.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de modifier l'activation globale.");
    } finally {
      setSaving(false);
    }
  };

  const captureCurrentHomeWifi = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      const wifiIdentity = await getWifiIdentity();
      if (!wifiIdentity.isOnWifi) {
        setErrorMessage("Connecte-toi au Wi-Fi maison avant de capturer.");
        return;
      }
      if (!wifiIdentity.ssid && !wifiIdentity.bssid && !wifiIdentity.ipPrefix) {
        setErrorMessage("Impossible d'identifier ce Wi-Fi. Réessaie sur ton réseau maison.");
        return;
      }
      setHomeWifiSsid(wifiIdentity.ssid);
      setHomeWifiBssid(wifiIdentity.bssid);
      setHomeWifiIpPrefix(wifiIdentity.ipPrefix);
      setTriggerByHomeWifi(true);
      setSuccessMessage(
        `Wi-Fi maison capturé${
          wifiIdentity.ssid
            ? ` (${wifiIdentity.ssid})`
            : wifiIdentity.ipPrefix
              ? ` (${wifiIdentity.ipPrefix}.x)`
              : ""
        }.`
      );
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de capturer le Wi-Fi actuel.");
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving;

  if (shouldRedirectToAuth) {
    return <Redirect href="/auth" />;
  }

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
              Auto
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Arrivées auto</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Comme Snapchat: dès que tu arrives dans un lieu configuré, SafeBack envoie un message
          automatiquement aux proches sélectionnés.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Activation globale</Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                globalEnabled ? "bg-emerald-600" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setGlobalMode(true)}
              disabled={busy}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  globalEnabled ? "text-white" : "text-slate-700"
                }`}
              >
                Activé
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                !globalEnabled ? "bg-rose-600" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setGlobalMode(false)}
              disabled={busy}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  !globalEnabled ? "text-white" : "text-slate-700"
                }`}
              >
                Désactivé
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Créer une règle</Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Nom du lieu (Maison, Travail...)"
            placeholderTextColor="#94a3b8"
            value={ruleLabel}
            onChangeText={setRuleLabel}
          />
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Adresse complète"
            placeholderTextColor="#94a3b8"
            value={ruleAddress}
            onChangeText={setRuleAddress}
          />

          <View className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <Text className="text-xs uppercase tracking-widest text-slate-500">
              Conditions de confirmation
            </Text>
            <Text className="mt-1 text-xs text-slate-600">
              Tu peux en combiner 1, 2 ou 3. Le message part uniquement quand toutes les conditions
              cochées sont vraies.
            </Text>
            <View className="mt-3 flex-row flex-wrap gap-2">
              <TouchableOpacity
                className={`rounded-full border px-3 py-2 ${
                  triggerByPosition ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
                }`}
                onPress={() => setTriggerByPosition((prev) => !prev)}
              >
                <Text
                  className={`text-xs font-semibold ${
                    triggerByPosition ? "text-emerald-700" : "text-slate-700"
                  }`}
                >
                  Position
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`rounded-full border px-3 py-2 ${
                  triggerByHomeWifi ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
                }`}
                onPress={() => setTriggerByHomeWifi((prev) => !prev)}
              >
                <Text
                  className={`text-xs font-semibold ${
                    triggerByHomeWifi ? "text-emerald-700" : "text-slate-700"
                  }`}
                >
                  Wi-Fi maison
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`rounded-full border px-3 py-2 ${
                  triggerByCharging ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
                }`}
                onPress={() => setTriggerByCharging((prev) => !prev)}
              >
                <Text
                  className={`text-xs font-semibold ${
                    triggerByCharging ? "text-emerald-700" : "text-slate-700"
                  }`}
                >
                  Téléphone en charge
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              onPress={captureCurrentHomeWifi}
              disabled={busy}
            >
              <Text className="text-center text-sm font-semibold text-slate-700">
                Capturer le Wi-Fi actuel comme Wi-Fi maison
              </Text>
            </TouchableOpacity>
            <Text className="mt-2 text-xs text-slate-500">
              Référence Wi-Fi:{" "}
              {homeWifiSsid
                ? `${homeWifiSsid}`
                : homeWifiBssid
                  ? homeWifiBssid
                  : homeWifiIpPrefix
                    ? `${homeWifiIpPrefix}.x`
                    : "non capturée"}
            </Text>
          </View>

          {favorites.length > 0 ? (
            <View className="mt-3">
              <Text className="text-xs uppercase tracking-widest text-slate-500">Depuis favoris</Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {favorites.slice(0, 10).map((favorite) => (
                  <TouchableOpacity
                    key={favorite.id}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2"
                    onPress={() => {
                      setRuleLabel(favorite.label);
                      setRuleAddress(favorite.address);
                    }}
                  >
                    <Text className="text-xs font-semibold text-slate-700">{favorite.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          <View className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <Text className="text-xs uppercase tracking-widest text-slate-500">
              Rayon ({Math.round(radiusMeters)} m)
            </Text>
            <Slider
              minimumValue={60}
              maximumValue={400}
              step={10}
              value={radiusMeters}
              minimumTrackTintColor="#0f766e"
              maximumTrackTintColor="#cbd5e1"
              onValueChange={setRadiusMeters}
            />
            <Text className="mt-1 text-xs text-slate-600">
              Utilisé uniquement si la condition "Position" est active.
            </Text>
          </View>

          <View className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <Text className="text-xs uppercase tracking-widest text-slate-500">
              Cooldown ({Math.round(cooldownMinutes)} min)
            </Text>
            <Slider
              minimumValue={5}
              maximumValue={180}
              step={5}
              value={cooldownMinutes}
              minimumTrackTintColor="#0f766e"
              maximumTrackTintColor="#cbd5e1"
              onValueChange={setCooldownMinutes}
            />
          </View>

          <View className="mt-4">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Proches à notifier</Text>
            {friends.length === 0 ? (
              <Text className="mt-2 text-sm text-slate-500">
                Aucun proche disponible. Ajoute d'abord des amis dans "Réseau proches".
              </Text>
            ) : (
              <View className="mt-2 flex-row flex-wrap gap-2">
                {friends.map((friend) => {
                  const active = selectedRecipientIds.includes(friend.friend_user_id);
                  return (
                    <TouchableOpacity
                      key={friend.id}
                      className={`rounded-full border px-3 py-2 ${
                        active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
                      }`}
                      onPress={() => toggleRecipient(friend.friend_user_id)}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          active ? "text-emerald-700" : "text-slate-700"
                        }`}
                      >
                        {friendLabel(friend)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          <TouchableOpacity
            className={`mt-4 rounded-2xl px-4 py-3 ${saving ? "bg-slate-300" : "bg-[#111827]"}`}
            onPress={addRule}
            disabled={busy}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {saving ? "Création..." : "Ajouter cette arrivée auto"}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Règles actives</Text>
          {loading ? (
            <View className="mt-3 flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#0f172a" />
              <Text className="text-sm text-slate-500">Chargement...</Text>
            </View>
          ) : rules.length === 0 ? (
            <Text className="mt-3 text-sm text-slate-500">
              Aucune règle pour le moment. Tu peux en ajouter autant que tu veux.
            </Text>
          ) : (
            rules.map((rule) => (
              <View
                key={rule.id}
                className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-slate-800">{rule.label}</Text>
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      className={`rounded-full px-3 py-1 ${
                        rule.enabled ? "bg-emerald-100" : "bg-slate-200"
                      }`}
                      onPress={async () => {
                        try {
                          setSaving(true);
                          setErrorMessage("");
                          await toggleAutoCheckinRule(rule.id, !rule.enabled);
                          await refresh();
                        } catch (error: any) {
                          setErrorMessage(error?.message ?? "Impossible de mettre à jour la règle.");
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          rule.enabled ? "text-emerald-700" : "text-slate-700"
                        }`}
                      >
                        {rule.enabled ? "On" : "Off"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="rounded-full bg-rose-100 px-3 py-1"
                      onPress={async () => {
                        try {
                          setSaving(true);
                          setErrorMessage("");
                          await deleteAutoCheckinRule(rule.id);
                          await refresh();
                        } catch (error: any) {
                          setErrorMessage(error?.message ?? "Impossible de supprimer la règle.");
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      <Text className="text-xs font-semibold text-rose-700">Supprimer</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text className="mt-1 text-xs text-slate-600">{rule.address}</Text>
                <Text className="mt-1 text-xs text-slate-500">
                  Rayon {rule.radiusMeters} m · Cooldown {rule.cooldownMinutes} min
                </Text>
                <Text className="mt-1 text-xs text-slate-500">
                  Conditions:
                  {rule.trigger.byPosition ? " Position" : ""}
                  {rule.trigger.byHomeWifi ? " + Wi-Fi maison" : ""}
                  {rule.trigger.byCharging ? " + En charge" : ""}
                  {!rule.trigger.byPosition && !rule.trigger.byHomeWifi && !rule.trigger.byCharging
                    ? " Position"
                    : ""}
                </Text>
                {rule.trigger.byHomeWifi ? (
                  <Text className="mt-1 text-xs text-slate-500">
                    Wi-Fi maison:{" "}
                    {rule.trigger.homeWifiSsid
                      ? rule.trigger.homeWifiSsid
                      : rule.trigger.homeWifiBssid
                        ? rule.trigger.homeWifiBssid
                        : rule.trigger.homeWifiIpPrefix
                          ? `${rule.trigger.homeWifiIpPrefix}.x`
                          : "non défini"}
                  </Text>
                ) : null}
                <Text className="mt-1 text-xs text-slate-500">
                  {rule.recipientUserIds.length} proche(s) configuré(s)
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-1">
                  {rule.recipientUserIds.map((recipientUserId) => (
                    <View
                      key={`${rule.id}-${recipientUserId}`}
                      className="rounded-full border border-slate-200 bg-white px-2 py-1"
                    >
                      <Text className="text-[10px] font-semibold text-slate-700">
                        {friendMap.get(recipientUserId)
                          ? friendLabel(friendMap.get(recipientUserId) as FriendWithProfile)
                          : recipientUserId.slice(0, 8)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}
        {successMessage ? <FeedbackMessage kind="success" message={successMessage} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
