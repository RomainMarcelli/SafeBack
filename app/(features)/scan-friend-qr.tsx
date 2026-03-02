// Écran de scan QR ami: caméra temps réel + import photo pour ajout rapide.
import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, scanFromURLAsync, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import {
  searchPublicProfiles,
  sendFriendRequest,
  type PublicProfile
} from "../../src/lib/social/friendsDb";
import { parseSafeBackPublicIdFromQr } from "../../src/lib/social/friendQr";
import { supabase } from "../../src/lib/core/supabase";
import { confirmAction } from "../../src/lib/privacy/confirmAction";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

function profileLabel(profile?: PublicProfile | null) {
  if (!profile) return "Profil";
  const username = String(profile.username ?? "").trim();
  if (username) return `@${username}`;
  const fullName = `${String(profile.first_name ?? "").trim()} ${String(profile.last_name ?? "").trim()}`.trim();
  if (fullName) return fullName;
  return `ID ${profile.public_id}`;
}

export default function ScanFriendQrScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanningEnabled, setScanningEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [targetProfile, setTargetProfile] = useState<PublicProfile | null>(null);
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
    return () => listener.subscription.unsubscribe();
  }, []);

  const shouldRedirectToAuth = !checking && !userId;

  const canScan = Boolean(permission?.granted && scanningEnabled && !busy);

  const resolveProfileFromQr = async (rawPayload: string) => {
    const nextPublicId = parseSafeBackPublicIdFromQr(rawPayload);
    if (!nextPublicId) {
      setErrorMessage("QR invalide: ID SafeBack introuvable.");
      setSuccessMessage("");
      return;
    }

    try {
      setBusy(true);
      setErrorMessage("");
      setSuccessMessage("");
      setPublicId(nextPublicId);
      const rows = await searchPublicProfiles(nextPublicId, 20);
      const exact = rows.find(
        (row) => String(row.public_id).toLowerCase() === nextPublicId.toLowerCase()
      );
      if (!exact) {
        setTargetProfile(null);
        setErrorMessage("Aucun profil trouvé pour cet ID SafeBack.");
        return;
      }
      setTargetProfile(exact);
      setSuccessMessage("QR reconnu. Tu peux envoyer la demande d'ami.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'analyser ce QR.");
    } finally {
      setBusy(false);
      setScanningEnabled(false);
    }
  };

  const onScanPhoto = async () => {
    try {
      setBusy(true);
      setErrorMessage("");
      const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mediaPermission.granted) {
        setErrorMessage("Permission Photos refusée.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        allowsEditing: false
      });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      const scanRows = await scanFromURLAsync(result.assets[0].uri, ["qr"]);
      const data = scanRows[0]?.data;
      if (!data) {
        setErrorMessage("Aucun QR détecté dans cette photo.");
        return;
      }
      await resolveProfileFromQr(String(data));
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de scanner la photo.");
    } finally {
      setBusy(false);
    }
  };

  const onSendFriendRequest = async () => {
    if (!targetProfile) return;
    const confirmed = await confirmAction({
      title: "Envoyer la demande d'ami ?",
      message: `Ajouter ${profileLabel(targetProfile)} à ton réseau proche ?`,
      confirmLabel: "Envoyer"
    });
    if (!confirmed) return;

    try {
      setBusy(true);
      setErrorMessage("");
      await sendFriendRequest(targetProfile.user_id);
      setSuccessMessage("Demande envoyée avec succès.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'envoyer la demande.");
    } finally {
      setBusy(false);
    }
  };

  const scanHint = useMemo(() => {
    if (!permission) return "Vérification de la permission caméra...";
    if (!permission.granted) return "Autorise la caméra pour scanner un QR SafeBack.";
    if (!scanningEnabled) return "Scan en pause. Tu peux relancer un scan si besoin.";
    return "Place le QR dans le cadre pour détecter l'ID automatiquement.";
  }, [permission, scanningEnabled]);

  if (shouldRedirectToAuth) {
    return <Redirect href="/auth" />;
  }

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
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">QR Ami</Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Scanner un QR ami</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Ajoute un proche en 1 geste via caméra ou capture d'écran.
        </Text>

        <View className="mt-6 overflow-hidden rounded-3xl border border-[#E7E0D7] bg-white/90 shadow-sm">
          <View className="px-5 pt-5">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Caméra</Text>
            <Text className="mt-2 text-sm text-slate-600">{scanHint}</Text>
          </View>

          <View className="mt-4 h-72 bg-slate-900">
            {permission?.granted ? (
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={
                  canScan
                    ? (event) => {
                        resolveProfileFromQr(String(event.data)).catch(() => {
                          // no-op: erreur affichée par resolveProfileFromQr.
                        });
                      }
                    : undefined
                }
              />
            ) : (
              <View className="flex-1 items-center justify-center px-6">
                <Text className="text-center text-sm text-slate-200">
                  La caméra n'est pas autorisée.
                </Text>
                <TouchableOpacity
                  className="mt-3 rounded-2xl bg-white px-4 py-3"
                  onPress={() => {
                    requestPermission().catch(() => {
                      // no-op
                    });
                  }}
                >
                  <Text className="text-sm font-semibold text-slate-900">Autoriser la caméra</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View className="px-5 pb-5 pt-4">
            <View className="flex-row gap-2">
              <TouchableOpacity
                className={`flex-1 rounded-2xl px-4 py-3 ${busy ? "bg-slate-300" : "bg-[#111827]"}`}
                onPress={onScanPhoto}
                disabled={busy}
              >
                <Text className="text-center text-sm font-semibold text-white">Scanner depuis Photos</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                onPress={() => {
                  setScanningEnabled(true);
                  setTargetProfile(null);
                  setPublicId(null);
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">Relancer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {targetProfile ? (
          <View className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-emerald-700">Profil détecté</Text>
            <Text className="mt-2 text-lg font-extrabold text-emerald-900">{profileLabel(targetProfile)}</Text>
            <Text className="mt-1 text-sm text-emerald-800">ID {publicId ?? targetProfile.public_id}</Text>
            <TouchableOpacity
              className={`mt-3 rounded-2xl px-4 py-3 ${busy ? "bg-slate-300" : "bg-emerald-700"}`}
              onPress={onSendFriendRequest}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-center text-sm font-semibold text-white">Envoyer la demande d'ami</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}
        {successMessage ? <FeedbackMessage kind="success" message={successMessage} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
