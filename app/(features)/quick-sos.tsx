// Action SOS rapide : collecte le contexte minimal puis envoie l'alerte immédiatement.
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, Linking, Platform, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { getActiveSessionId } from "../../src/lib/trips/activeSession";
import { getSessionById, listSessionContacts } from "../../src/lib/core/db";
import { sendSosSignalToGuardians } from "../../src/lib/social/messagingDb";
import { buildSmsUrl, buildSosMessage } from "../../src/lib/safety/sos";
import { supabase } from "../../src/lib/core/supabase";

type SessionContact = {
  phone?: string | null;
};

export default function QuickSosScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Préparation de l'alerte SOS...");
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionInfo, setSessionInfo] = useState<{
    id: string | null;
    from: string;
    to: string;
    lat: number | null;
    lon: number | null;
    body: string;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        const activeSessionId = await getActiveSessionId();
        const session = activeSessionId ? await getSessionById(activeSessionId) : null;

        let coords: { lat: number; lon: number } | null = null;
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status === "granted") {
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced
            });
            coords = {
              lat: position.coords.latitude,
              lon: position.coords.longitude
            };
          }
        } catch {
          coords = null;
        }

        const from = session?.from_address ?? "inconnu";
        const to = session?.to_address ?? "inconnu";
        const body = buildSosMessage({
          fromAddress: from,
          toAddress: to,
          coords: coords ? { lat: coords.lat, lon: coords.lon } : null
        });

        const guardianDispatch = await sendSosSignalToGuardians({
          sessionId: session?.id ?? null,
          body
        });

        let smsRecipients = 0;
        if (session?.id) {
          const contacts = (await listSessionContacts(session.id)) as SessionContact[];
          const phones = contacts
            .map((contact) => String(contact.phone ?? "").trim())
            .filter((value) => value.length > 0);
          smsRecipients = phones.length;
          if (phones.length > 0) {
            const smsUrl = buildSmsUrl({
              phones,
              body,
              platform: Platform.OS === "ios" ? "ios" : "android"
            });
            if (smsUrl && (await Linking.canOpenURL(smsUrl))) {
              await Linking.openURL(smsUrl);
            }
          }
        }

        setSessionInfo({
          id: session?.id ?? null,
          from,
          to,
          lat: coords?.lat ?? null,
          lon: coords?.lon ?? null,
          body
        });
        setMessage(
          `Alerte SOS lancée. Garants notifiés: ${guardianDispatch.conversations}. SMS préparés: ${smsRecipients}.`
        );
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Impossible de lancer l'alerte SOS.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-full rounded-3xl border border-[#E7E0D7] bg-white/90 p-6 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Action rapide</Text>
          <Text className="mt-3 text-3xl font-extrabold text-[#0F172A]">SOS</Text>
          {loading ? (
            <View className="mt-4 flex-row items-center">
              <ActivityIndicator size="small" color="#334155" />
              <Text className="ml-2 text-sm text-slate-600">Envoi en cours...</Text>
            </View>
          ) : errorMessage ? (
            <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text>
          ) : (
            <Text className="mt-4 text-sm text-rose-700">{message}</Text>
          )}

          <TouchableOpacity
            className="mt-5 rounded-2xl bg-[#111827] px-4 py-3"
            onPress={() => {
              router.replace("/");
            }}
          >
            <Text className="text-center text-sm font-semibold text-white">Retour accueil</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3"
            onPress={() => {
              router.push({
                pathname: "/incident-report",
                params: {
                  sessionId: sessionInfo?.id ?? undefined,
                  from: sessionInfo?.from ?? undefined,
                  to: sessionInfo?.to ?? undefined,
                  lat: sessionInfo?.lat != null ? String(sessionInfo.lat) : undefined,
                  lon: sessionInfo?.lon != null ? String(sessionInfo.lon) : undefined,
                  details: sessionInfo?.body ?? undefined
                }
              });
            }}
            disabled={loading}
          >
            <Text className="text-center text-sm font-semibold text-rose-800">
              Rédiger un rapport incident
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
