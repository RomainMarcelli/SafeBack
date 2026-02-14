import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  type TextInputProps
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getProfile, upsertProfile } from "../../src/lib/core/db";
import { ensureMyPublicProfile, type PublicProfile } from "../../src/lib/social/friendsDb";
import { clearActiveSessionId } from "../../src/lib/trips/activeSession";
import {
  getOnboardingAssistantSession,
  setOnboardingAssistantStep,
  type OnboardingStepId
} from "../../src/lib/home/onboarding";
import { supabase } from "../../src/lib/core/supabase";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("33")) {
    const rest = digits.slice(2);
    return `+33 ${rest.replace(/(\d{2})(?=\d)/g, "$1 ")}`.trim();
  }
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

export default function AccountScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [restartingGuide, setRestartingGuide] = useState(false);
  const [guideStep, setGuideStep] = useState<OnboardingStepId | null>(null);
  const [showGuideHint, setShowGuideHint] = useState(false);
  const [guideTransitioning, setGuideTransitioning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeInput, setActiveInput] = useState<
    "email" | "username" | "firstName" | "lastName" | "phone" | null
  >(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setAuthUserId(data.session?.user.id ?? null);
      const sessionEmail = data.session?.user.email ?? null;
      setUserEmail(sessionEmail);
      setEmail(sessionEmail ?? "");
      setChecking(false);

      try {
        const profile = await getProfile();
        if (profile) {
          setUsername(profile.username ?? "");
          setFirstName(profile.first_name ?? "");
          setLastName(profile.last_name ?? "");
          setPhone(profile.phone ?? "");
        }
        try {
          const socialProfile = await ensureMyPublicProfile();
          setPublicProfile(socialProfile);
        } catch {
          setPublicProfile(null);
        }
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      }
    });
  }, []);

  useEffect(() => {
    if (!authUserId) return;
    (async () => {
      const assistant = await getOnboardingAssistantSession(authUserId);
      if (!assistant.active) {
        setGuideStep(null);
        setShowGuideHint(false);
        return;
      }
      setGuideStep(assistant.stepId);
      setShowGuideHint(assistant.stepId === "profile");
    })();
  }, [authUserId]);

  useEffect(() => {
    if (!checking && !userEmail) {
      router.replace("/auth");
    }
  }, [checking, userEmail, router]);

  if (!checking && !userEmail) {
    return null;
  }

  const publicId = publicProfile?.public_id ?? "";
  const qrPayload = publicId ? `SAFEBACK|${publicId}` : "";
  const qrCodeUrl = qrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}`
    : "";

  const saveProfile = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      if (email && email !== userEmail) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
        setUserEmail(email);
      }

      await upsertProfile({
        username: username.trim() || null,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null
      });
      setSuccessMessage("Profil mis a jour.");
      if (guideStep === "profile" && authUserId && !guideTransitioning) {
        // Le parcours guidé n'avance qu'après une action explicite (enregistrer),
        // pour éviter qu'une réouverture d'étape saute automatiquement les pages suivantes.
        setGuideTransitioning(true);
        await setOnboardingAssistantStep(authUserId, "favorites");
        setShowGuideHint(false);
        router.push("/favorites");
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur sauvegarde.");
    } finally {
      setSaving(false);
      setGuideTransitioning(false);
    }
  };

  const signOut = async () => {
    try {
      setSigningOut(true);
      setErrorMessage("");
      setSuccessMessage("");
      await clearActiveSessionId();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/auth");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de deconnexion.");
    } finally {
      setSigningOut(false);
    }
  };

  const restartSetupGuide = async () => {
    try {
      setRestartingGuide(true);
      // Ouvre d'abord le menu du guide pour laisser l'utilisateur choisir l'étape à rejouer.
      router.push({
        pathname: "/",
        params: {
          onboarding: "guide",
          onboardingToken: String(Date.now())
        }
      });
      setSuccessMessage("Menu du parcours guidé ouvert.");
    } finally {
      setRestartingGuide(false);
    }
  };

  const renderClearableInput = (params: {
    id: "email" | "username" | "firstName" | "lastName" | "phone";
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    autoCapitalize?: TextInputProps["autoCapitalize"];
    keyboardType?: TextInputProps["keyboardType"];
  }) => {
    const { id, value, onChangeText, placeholder, autoCapitalize, keyboardType } = params;
    return (
      <View className="mt-3">
        <TextInput
          className="rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 pr-12 text-base text-slate-900"
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          value={value}
          onChangeText={onChangeText}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          onFocus={() => setActiveInput(id)}
          onBlur={() => setActiveInput((current) => (current === id ? null : current))}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
        {activeInput === id && value.trim().length > 0 ? (
          <TouchableOpacity
            className="absolute right-3 top-1/2 h-7 w-7 -translate-y-3 items-center justify-center rounded-full bg-slate-200"
            onPress={() => onChangeText("")}
          >
            <Ionicons name="close" size={14} color="#334155" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Permet de fermer le clavier en touchant hors des champs. */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            className="flex-1 px-6"
            contentContainerStyle={{ paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
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
              Paramètres
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">
          Mon compte
        </Text>
        <Text className="mt-2 text-base text-[#475569]">
          Mets à jour tes informations personnelles et tes favoris.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Mon ID SafeBack</Text>
          <Text className="mt-2 text-2xl font-extrabold text-[#0F172A]">
            {publicId || "Génération..."}
          </Text>
          <Text className="mt-1 text-sm text-slate-600">
            Partage cet identifiant, ton QR code, ou envoie directement ton profil.
          </Text>
          {qrCodeUrl ? (
            <View className="mt-4 items-center">
              <Image
                source={{ uri: qrCodeUrl }}
                style={{ width: 140, height: 140, borderRadius: 12 }}
                resizeMode="cover"
              />
            </View>
          ) : null}
          <View className="mt-4 flex-row gap-2">
            <TouchableOpacity
              className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
              onPress={async () => {
                if (!publicId) return;
                try {
                  await Share.share({
                    message: `Ajoute-moi sur SafeBack\nID: ${publicId}`
                  });
                } catch {
                  // no-op : le partage système peut être annulé.
                }
              }}
              disabled={!publicId}
            >
              <Text className="text-center text-sm font-semibold text-white">Partager mon ID</Text>
            </TouchableOpacity>
            <Link href="/friends" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Text className="text-center text-sm font-semibold text-slate-800">Gérer mes amis</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Email</Text>
          {renderClearableInput({
            id: "email",
            value: email,
            onChangeText: setEmail,
            placeholder: "ton@email.com",
            autoCapitalize: "none",
            keyboardType: "email-address"
          })}
        </View>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Profil</Text>
          {renderClearableInput({
            id: "username",
            value: username,
            onChangeText: setUsername,
            placeholder: "Username",
            autoCapitalize: "none"
          })}
          {renderClearableInput({
            id: "firstName",
            value: firstName,
            onChangeText: setFirstName,
            placeholder: "Prénom"
          })}
          {renderClearableInput({
            id: "lastName",
            value: lastName,
            onChangeText: setLastName,
            placeholder: "Nom"
          })}
          {renderClearableInput({
            id: "phone",
            value: phone,
            onChangeText: (text) => setPhone(formatPhone(text)),
            placeholder: "Numéro",
            keyboardType: "phone-pad"
          })}
        </View>

        {errorMessage ? (
          <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text>
        ) : null}
        {successMessage ? (
          <Text className="mt-4 text-sm text-emerald-600">{successMessage}</Text>
        ) : null}

        <TouchableOpacity
          className={`mt-6 rounded-3xl px-6 py-5 shadow-lg ${
            saving ? "bg-slate-300" : "bg-[#111827]"
          }`}
          onPress={saveProfile}
          disabled={saving || signingOut}
        >
          <Text className="text-center text-base font-semibold text-white">
            Enregistrer
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className={`mt-3 rounded-3xl border px-5 py-4 ${
            signingOut
              ? "border-slate-200 bg-slate-100"
              : "border-rose-200 bg-rose-50"
          }`}
          onPress={signOut}
          disabled={saving || signingOut}
        >
          <View className="flex-row items-center justify-center">
            <Ionicons
              name="log-out-outline"
              size={18}
              color={signingOut ? "#64748b" : "#be123c"}
            />
            <Text
              className={`ml-2 text-base font-semibold ${
                signingOut ? "text-slate-500" : "text-rose-700"
              }`}
            >
              {signingOut ? "Déconnexion..." : "Déconnexion"}
            </Text>
          </View>
        </TouchableOpacity>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Raccourcis</Text>

          <View className="mt-3 flex-row gap-2">
            <Link href="/favorites" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="heart-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Favoris</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/trips" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="time-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Mes trajets</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2 flex-row gap-2">
            <Link href="/safety-alerts" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="shield-checkmark-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Alertes</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/help" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="help-circle-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Aide</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2">
            <Link href="/features-guide" asChild>
              <TouchableOpacity className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                <Ionicons name="book-outline" size={18} color="#065f46" />
                <Text className="mt-1 text-sm font-semibold text-emerald-800">
                  Guide complet des fonctionnalités
                </Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2">
            <Link href="/privacy-center" asChild>
              <TouchableOpacity className="rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-3">
                <Ionicons name="shield-outline" size={18} color="#4338ca" />
                <Text className="mt-1 text-sm font-semibold text-indigo-800">
                  Centre de confidentialité
                </Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2 flex-row gap-2">
            <Link href="/forgotten-trip" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="location-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Trajet oublié</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/messages" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Messages</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2">
            <Link href="/auto-checkins" asChild>
              <TouchableOpacity className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                <Ionicons name="flash-outline" size={18} color="#065f46" />
                <Text className="mt-1 text-sm font-semibold text-emerald-800">
                  Arrivées auto (Snap)
                </Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2 flex-row gap-2">
            <Link href="/notifications" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="notifications-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Notifications</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/friends" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="people-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Amis</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2 flex-row gap-2">
            <Link href="/incidents" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="document-text-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Incidents</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/quick-sos" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
                <Ionicons name="warning-outline" size={18} color="#be123c" />
                <Text className="mt-1 text-sm font-semibold text-rose-700">SOS rapide</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2">
            <Link href="/contact-groups" asChild>
              <TouchableOpacity className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="layers-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Groupes</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2 flex-row gap-2">
            <Link href="/about" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="information-circle-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">À propos</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/legal" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="document-text-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Mentions</Text>
              </TouchableOpacity>
            </Link>
          </View>

        </View>

        <TouchableOpacity
          className={`mt-8 rounded-3xl border px-4 py-4 ${
            restartingGuide ? "border-cyan-200 bg-cyan-100" : "border-cyan-200 bg-cyan-50"
          }`}
          onPress={restartSetupGuide}
          disabled={restartingGuide}
        >
          <View className="flex-row items-center justify-center">
            <Ionicons name="sparkles-outline" size={18} color="#0e7490" />
            <Text className="ml-2 text-sm font-semibold text-cyan-800">
              {restartingGuide ? "Préparation..." : "Rejouer le parcours guidé"}
            </Text>
          </View>
        </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <Modal transparent visible={showGuideHint && guideStep === "profile"} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full rounded-3xl border border-cyan-200 bg-[#F0FDFF] p-5 shadow-lg">
            <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-cyan-700">
              Assistant - Etape 1
            </Text>
            <Text className="mt-2 text-xl font-extrabold text-cyan-950">
              Complète ton profil
            </Text>
            <Text className="mt-2 text-sm text-cyan-900/80">
              Renseigne au minimum un nom ou pseudo ET un numéro de téléphone. Dès que c est rempli,
              on passe automatiquement à l étape suivante.
            </Text>
            <View className="mt-4 rounded-2xl border border-cyan-200 bg-white px-3 py-3">
              <Text className="text-xs font-semibold text-cyan-800">
                Champs à vérifier: Username/Prénom/Nom + Numéro
              </Text>
            </View>
            <TouchableOpacity
              className="mt-4 rounded-2xl bg-cyan-700 px-4 py-3"
              onPress={() => setShowGuideHint(false)}
            >
              <Text className="text-center text-sm font-semibold text-white">Compris</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
