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
import { getAccessibilityPreferences } from "../../src/lib/accessibility/preferences";
import { getThemeMode, setThemeMode, type ThemeMode } from "../../src/lib/theme/themePreferences";
import { signInWithCredentials } from "../../src/lib/auth/authFlows";
import { getHomeHubSections, type HomeHubItem } from "../../src/lib/home/homeHub";
import {
  getDiscoveryProgress,
  hasVisitedRoute,
  resetDiscoveryProgress
} from "../../src/lib/home/discoveryProgress";
import {
  getNextOnboardingStepId,
  getOnboardingStepRoute,
  getOnboardingAssistantSession,
  resetOnboardingExperience,
  setOnboardingAssistantStep,
  type OnboardingStepId
} from "../../src/lib/home/onboarding";
import { confirmSensitiveAction } from "../../src/lib/privacy/confirmAction";
import { supabase } from "../../src/lib/core/supabase";
import { textScaleClass } from "../../src/theme/designSystem";
import { useAppToast } from "../../src/components/AppToastProvider";
import { getSensitiveJson, setSensitiveJson } from "../../src/lib/core/secureStorage";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("33")) {
    const rest = digits.slice(2);
    return `+33 ${rest.replace(/(\d{2})(?=\d)/g, "$1 ")}`.trim();
  }
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

function iconForShortcut(item: HomeHubItem): keyof typeof Ionicons.glyphMap {
  if (item.href === "/setup") return "navigate-outline";
  if (item.href === "/trips") return "time-outline";
  if (item.href === "/messages") return "chatbubble-ellipses-outline";
  if (item.href === "/favorites") return "heart-outline";
  if (item.href === "/friends") return "people-outline";
  if (item.href === "/friends-map") return "map-outline";
  if (item.href === "/safety-alerts") return "shield-checkmark-outline";
  if (item.href === "/auto-checkins") return "flash-outline";
  if (item.href === "/guardian-dashboard") return "people-circle-outline";
  if (item.href === "/live-companion") return "pulse-outline";
  if (item.href === "/safety-drill") return "flask-outline";
  if (item.href === "/forgotten-trip") return "location-outline";
  if (item.href === "/notifications") return "notifications-outline";
  if (item.href === "/incident-report") return "document-text-outline";
  if (item.href === "/incidents") return "documents-outline";
  if (item.href === "/privacy-center") return "shield-outline";
  if (item.href === "/sessions-devices") return "phone-portrait-outline";
  if (item.href === "/accessibility") return "accessibility-outline";
  if (item.href === "/voice-assistant") return "mic-outline";
  if (item.href === "/features-guide") return "book-outline";
  return "sparkles-outline";
}

type DevTestAccount = {
  label: string;
  email: string;
  password: string;
};

const DEV_TEST_ACCOUNTS_KEY = "safeback:dev:test-accounts:v1";

export default function AccountScreen() {
  const router = useRouter();
  const { showToast } = useAppToast();
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
  const [textScale, setTextScale] = useState<"normal" | "large">("normal");
  const [highContrast, setHighContrast] = useState(false);
  const [activeInput, setActiveInput] = useState<
    "email" | "username" | "firstName" | "lastName" | "phone" | null
  >(null);
  const [showQrPreview, setShowQrPreview] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [resettingExperience, setResettingExperience] = useState(false);
  const [devTestAccounts, setDevTestAccounts] = useState<DevTestAccount[]>([]);
  const [devLabel, setDevLabel] = useState("");
  const [devEmail, setDevEmail] = useState("");
  const [devPassword, setDevPassword] = useState("");
  const [showAllShortcutsModal, setShowAllShortcutsModal] = useState(false);
  const [visitedRoutes, setVisitedRoutes] = useState<string[]>([]);
  const [shortcutSearchQuery, setShortcutSearchQuery] = useState("");
  const [shortcutFilter, setShortcutFilter] = useState<"all" | "new" | "configured" | "todo">(
    "all"
  );
  const shortcutSections = getHomeHubSections();

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
        const accessibility = await getAccessibilityPreferences();
        setTextScale(accessibility.textScale);
        setHighContrast(accessibility.highContrast);
        const theme = await getThemeMode();
        setThemeModeState(theme);
        if (data.session?.user.id) {
          const discovery = await getDiscoveryProgress(data.session.user.id);
          setVisitedRoutes(discovery.visitedRoutes);
        }
        if (__DEV__) {
          const parsed = await getSensitiveJson<unknown[]>(DEV_TEST_ACCOUNTS_KEY, []);
          if (Array.isArray(parsed)) {
            setDevTestAccounts(
              parsed
                .map((item) => ({
                  label: String((item as { label?: string }).label ?? "").trim(),
                  email: String((item as { email?: string }).email ?? "").trim(),
                  password: String((item as { password?: string }).password ?? "")
                }))
                .filter((item) => item.email.length > 0 && item.password.length > 0)
            );
          }
        }
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      }
    });
  }, []);

  useEffect(() => {
    if (!authUserId || !showAllShortcutsModal) return;
    getDiscoveryProgress(authUserId)
      .then((discovery) => {
        setVisitedRoutes(discovery.visitedRoutes);
      })
      .catch(() => {
        // no-op
      });
  }, [authUserId, showAllShortcutsModal]);

  useEffect(() => {
    if (showAllShortcutsModal) return;
    setShortcutSearchQuery("");
    setShortcutFilter("all");
  }, [showAllShortcutsModal]);

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
    if (!errorMessage) return;
    showToast({ kind: "error", message: errorMessage, durationMs: 5000 });
    setErrorMessage("");
  }, [errorMessage, showToast]);

  useEffect(() => {
    if (!successMessage) return;
    showToast({ kind: "success", message: successMessage, durationMs: 4000 });
    setSuccessMessage("");
  }, [successMessage, showToast]);

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
  const fontClasses = textScaleClass(textScale);
  const darkMode = themeMode === "dark";

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
        const nextStep = getNextOnboardingStepId("profile") ?? "favorites";
        await setOnboardingAssistantStep(authUserId, nextStep);
        setShowGuideHint(false);
        router.push(getOnboardingStepRoute(nextStep));
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

  const toggleThemeMode = async (value: boolean) => {
    try {
      const nextMode: ThemeMode = value ? "dark" : "light";
      await setThemeMode(nextMode);
      setThemeModeState(nextMode);
      setSuccessMessage(nextMode === "dark" ? "Mode sombre activé." : "Mode clair activé.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de changer le thème.");
    }
  };

  const persistDevAccounts = async (next: DevTestAccount[]) => {
    setDevTestAccounts(next);
    await setSensitiveJson(DEV_TEST_ACCOUNTS_KEY, next);
  };

  const addDevTestAccount = async () => {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      setSwitchingAccount(true);
      const emailValue = devEmail.trim().toLowerCase();
      const passwordValue = devPassword;
      console.log("[account/dev-switch] add:start", {
        email: emailValue,
        label: devLabel.trim() || null
      });
      if (!emailValue || !passwordValue) {
        setErrorMessage("Renseigne l'email et le mot de passe du compte test.");
        console.log("[account/dev-switch] add:blocked-missing-fields");
        return;
      }

      // En mode test on accepte l'ajout immédiat sans vérification email/mot de passe côté Supabase.
      // Le contrôle réel se fera seulement au moment du switch de compte.
      const labelValue = devLabel.trim() || emailValue.split("@")[0];
      const next = [
        { label: labelValue, email: emailValue, password: passwordValue },
        ...devTestAccounts.filter((item) => item.email !== emailValue)
      ];
      await persistDevAccounts(next);
      console.log("[account/dev-switch] add:stored", {
        email: emailValue,
        totalAccounts: next.length
      });
      setDevLabel("");
      setDevEmail("");
      setDevPassword("");
      setSuccessMessage("Compte test ajouté.");
    } catch (error: any) {
      console.log("[account/dev-switch] add:error", {
        message: error?.message ?? "unknown"
      });
      setErrorMessage(error?.message ?? "Impossible d'ajouter ce compte test.");
    } finally {
      setSwitchingAccount(false);
    }
  };

  const switchToDevAccount = async (account: DevTestAccount) => {
    try {
      setSwitchingAccount(true);
      setErrorMessage("");
      await supabase.auth.signOut();
      await signInWithCredentials({
        identifier: account.email,
        password: account.password
      });
      setSuccessMessage(`Connecté sur ${account.label}.`);
      router.replace("/");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de switcher ce compte test.");
    } finally {
      setSwitchingAccount(false);
    }
  };

  const deleteMyAccount = async () => {
    const confirmed = await confirmSensitiveAction({
      firstTitle: "Supprimer définitivement ton compte ?",
      firstMessage:
        "Cette action supprime ton profil et tes données SafeBack. Tu ne pourras pas revenir en arrière.",
      secondTitle: "Dernière confirmation",
      secondMessage: "Confirme la suppression définitive de ton compte.",
      firstConfirmLabel: "Je comprends",
      secondConfirmLabel: "Supprimer",
      delayMs: 1000
    });
    if (!confirmed) return;

    try {
      setDeletingAccount(true);
      setErrorMessage("");
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      await clearActiveSessionId();
      await supabase.auth.signOut();
      router.replace("/auth");
    } catch (error: any) {
      setErrorMessage(
        error?.message ??
          "Suppression impossible. Applique d'abord la migration SQL de suppression de compte."
      );
    } finally {
      setDeletingAccount(false);
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

  const resetOnboardingAndDiscoveryStatus = async () => {
    if (!authUserId) return;
    const confirmed = await confirmSensitiveAction({
      firstTitle: "Réinitialiser l'expérience ?",
      firstMessage:
        "Cette action remet à zéro l'onboarding, le tutoriel complet et les badges Nouveau.",
      secondTitle: "Dernière confirmation",
      secondMessage:
        "Confirme la réinitialisation complète de l'expérience SafeBack pour ce compte.",
      firstConfirmLabel: "Continuer",
      secondConfirmLabel: "Réinitialiser",
      delayMs: 900
    });
    if (!confirmed) return;

    try {
      setResettingExperience(true);
      setErrorMessage("");
      setSuccessMessage("");
      await resetOnboardingExperience(authUserId);
      const next = await resetDiscoveryProgress(authUserId);
      setVisitedRoutes(next.visitedRoutes);
      setGuideStep(null);
      setShowGuideHint(false);
      setSuccessMessage("Onboarding et statut Nouveau réinitialisés.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de réinitialiser l'onboarding.");
    } finally {
      setResettingExperience(false);
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

  const shortcutStatus = (href: string): "new" | "configured" | "todo" => {
    if (hasVisitedRoute(visitedRoutes, href)) return "configured";
    const essentialRoutes = new Set([
      "/privacy-center",
      "/sessions-devices",
      "/safety-alerts",
      "/auto-checkins",
      "/friends-map"
    ]);
    if (essentialRoutes.has(href)) return "todo";
    return "new";
  };

  const filteredShortcutSections = shortcutSections
    .map((section) => {
      const items = section.items.filter((item) => {
        const status = shortcutStatus(item.href);
        const query = shortcutSearchQuery.trim().toLowerCase();
        const inQuery =
          query.length === 0 ||
          `${item.title} ${item.subtitle}`.toLowerCase().includes(query);
        if (!inQuery) return false;
        if (shortcutFilter === "all") return true;
        return status === shortcutFilter;
      });
      return {
        ...section,
        items
      };
    })
    .filter((section) => section.items.length > 0);

  const shortcutStatusCounts = shortcutSections.reduce(
    (acc, section) => {
      for (const item of section.items) {
        const status = shortcutStatus(item.href);
        acc[status] += 1;
      }
      return acc;
    },
    { new: 0, configured: 0, todo: 0 }
  );

  const shortcutFilters: Array<{
    id: "all" | "new" | "configured" | "todo";
    label: string;
    count: number;
  }> = [
    {
      id: "all",
      label: "Tout",
      count: shortcutStatusCounts.new + shortcutStatusCounts.configured + shortcutStatusCounts.todo
    },
    { id: "new", label: "Nouveau", count: shortcutStatusCounts.new },
    { id: "configured", label: "Configuré", count: shortcutStatusCounts.configured },
    { id: "todo", label: "À faire", count: shortcutStatusCounts.todo }
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: darkMode ? "#0B1220" : "#F7F2EA" }}>
      <StatusBar style={darkMode ? "light" : "dark"} />
      <View className={`absolute -top-24 -right-16 h-56 w-56 rounded-full ${darkMode ? "bg-slate-800 opacity-60" : "bg-[#FAD4A6] opacity-70"}`} />
      <View className={`absolute top-32 -left-28 h-72 w-72 rounded-full ${darkMode ? "bg-slate-700 opacity-50" : "bg-[#BFE9D6] opacity-60"}`} />
      <View className={`absolute bottom-24 -right-32 h-72 w-72 rounded-full ${darkMode ? "bg-slate-900 opacity-60" : "bg-[#C7DDF8] opacity-40"}`} />
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

        <Text className={`mt-6 font-extrabold ${darkMode ? "text-slate-100" : "text-[#0F172A]"} ${fontClasses.title}`}>
          Mon compte
        </Text>
        <Text className={`mt-2 ${darkMode ? "text-slate-300" : "text-[#475569]"} ${fontClasses.body}`}>
          Mets à jour tes informations personnelles et tes favoris.
        </Text>

        <View className={`mt-4 rounded-3xl border p-4 shadow-sm ${highContrast ? "border-slate-900 bg-white" : "border-[#E7E0D7] bg-white/90"}`}>
          <Text className="text-xs uppercase tracking-widest text-slate-500">Accessibilité active</Text>
          <Text className="mt-2 text-sm text-slate-700">
            Texte: {textScale === "large" ? "Grand" : "Normal"} · Contraste: {highContrast ? "Élevé" : "Standard"}
          </Text>
          <View className="mt-3 flex-row gap-2">
            <Link href="/accessibility" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Text className="text-center text-sm font-semibold text-slate-700">Régler</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/voice-assistant" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
                <Text className="text-center text-sm font-semibold text-cyan-700">Assistant vocal</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

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
              <TouchableOpacity
                onPress={() => setShowQrPreview(true)}
                className="items-center rounded-2xl border border-slate-200 bg-white px-3 py-3"
              >
                <Image
                  source={{ uri: qrCodeUrl }}
                  style={{ width: 140, height: 140, borderRadius: 12 }}
                  resizeMode="cover"
                />
                <Text className="mt-2 text-xs font-semibold text-slate-600">Appuie pour agrandir</Text>
              </TouchableOpacity>
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
          <Link href="/scan-friend-qr" asChild>
            <TouchableOpacity className="mt-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
              <Text className="text-center text-sm font-semibold text-cyan-800">Scanner un QR ami</Text>
            </TouchableOpacity>
          </Link>
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

        <TouchableOpacity
          className={`mt-3 rounded-3xl border px-5 py-4 ${
            deletingAccount ? "border-slate-200 bg-slate-100" : "border-rose-300 bg-rose-100"
          }`}
          onPress={() => {
            deleteMyAccount().catch(() => {
              // no-op
            });
          }}
          disabled={saving || signingOut || deletingAccount}
        >
          <View className="flex-row items-center justify-center">
            <Ionicons
              name="trash-outline"
              size={18}
              color={deletingAccount ? "#64748b" : "#9f1239"}
            />
            <Text
              className={`ml-2 text-base font-semibold ${
                deletingAccount ? "text-slate-500" : "text-rose-800"
              }`}
            >
              {deletingAccount ? "Suppression..." : "Supprimer mon compte"}
            </Text>
          </View>
        </TouchableOpacity>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-xs uppercase tracking-widest text-slate-500">Raccourcis</Text>
              <Text className="mt-2 text-sm text-slate-600">
                1 action principale: ouvre le hub complet, puis choisis l'écran voulu.
              </Text>
            </View>
            <TouchableOpacity
              className="rounded-full border border-slate-200 bg-white p-2"
              onPress={() => {
                toggleThemeMode(!darkMode).catch(() => {
                  // no-op
                });
              }}
            >
              <Ionicons name={darkMode ? "sunny-outline" : "moon-outline"} size={18} color="#334155" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            className="mt-3 rounded-2xl bg-[#111827] px-3 py-3"
            onPress={() => setShowAllShortcutsModal(true)}
          >
            <Text className="text-center text-sm font-semibold text-white">
              Voir tous les raccourcis
            </Text>
          </TouchableOpacity>
          <View className="mt-2 flex-row gap-2">
            <Link href="/privacy-center" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-3">
                <Text className="text-center text-sm font-semibold text-indigo-700">
                  Confidentialité
                </Text>
              </TouchableOpacity>
            </Link>
            <Link href="/sessions-devices" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Text className="text-center text-sm font-semibold text-slate-700">
                  Appareils
                </Text>
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

        <TouchableOpacity
          className={`mt-3 rounded-3xl border px-4 py-4 ${
            resettingExperience ? "border-amber-200 bg-amber-100" : "border-amber-200 bg-amber-50"
          }`}
          onPress={() => {
            resetOnboardingAndDiscoveryStatus().catch(() => {
              // no-op
            });
          }}
          disabled={resettingExperience}
        >
          <View className="flex-row items-center justify-center">
            <Ionicons name="refresh-circle-outline" size={18} color="#b45309" />
            <Text className="ml-2 text-sm font-semibold text-amber-800">
              {resettingExperience
                ? "Réinitialisation..."
                : "Réinitialiser onboarding + statut Nouveau"}
            </Text>
          </View>
        </TouchableOpacity>

        {__DEV__ ? (
          <View className="mt-4 rounded-3xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-violet-700">
              Test multi-comptes (DEV)
            </Text>
            <Text className="mt-2 text-xs text-violet-700">
              Garde ici plusieurs comptes de test et switch en 1 clic.
            </Text>
            <TextInput
              className="mt-3 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-900"
              placeholder="Label (ex: Compte A)"
              placeholderTextColor="#a78bfa"
              value={devLabel}
              onChangeText={setDevLabel}
            />
            <TextInput
              className="mt-2 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-900"
              placeholder="email@test.com"
              placeholderTextColor="#a78bfa"
              value={devEmail}
              onChangeText={setDevEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              className="mt-2 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-900"
              placeholder="Mot de passe test"
              placeholderTextColor="#a78bfa"
              value={devPassword}
              onChangeText={setDevPassword}
              autoCapitalize="none"
              secureTextEntry
            />
            <TouchableOpacity
              className="mt-2 rounded-2xl bg-violet-700 px-4 py-3"
              onPress={() => {
                addDevTestAccount().catch(() => {
                  // no-op
                });
              }}
              disabled={!devEmail.trim() || !devPassword || switchingAccount}
            >
              <Text className="text-center text-sm font-semibold text-white">
                {switchingAccount ? "Vérification..." : "Ajouter compte test"}
              </Text>
            </TouchableOpacity>

            {devTestAccounts.map((account) => (
              <View
                key={`dev-account-${account.email}`}
                className="mt-2 flex-row items-center justify-between rounded-2xl border border-violet-200 bg-white px-3 py-3"
              >
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-semibold text-violet-900">{account.label}</Text>
                  <Text className="text-xs text-violet-700">{account.email}</Text>
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className={`rounded-xl px-3 py-2 ${switchingAccount ? "bg-slate-300" : "bg-violet-700"}`}
                    onPress={() => {
                      switchToDevAccount(account).catch(() => {
                        // no-op
                      });
                    }}
                    disabled={switchingAccount}
                  >
                    <Text className="text-xs font-semibold uppercase tracking-widest text-white">
                      Switch
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="rounded-xl border border-violet-200 bg-white px-3 py-2"
                    onPress={() => {
                      const next = devTestAccounts.filter((item) => item.email !== account.email);
                      persistDevAccounts(next).catch(() => {
                        // no-op
                      });
                    }}
                    disabled={switchingAccount}
                  >
                    <Text className="text-xs font-semibold uppercase tracking-widest text-violet-700">
                      Retirer
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <Modal transparent visible={showGuideHint && guideStep === "profile"} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full rounded-3xl border border-cyan-200 bg-[#F0FDFF] p-5 shadow-lg">
            <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-cyan-700">
              Assistant - Étape 1
            </Text>
            <Text className="mt-2 text-xl font-extrabold text-cyan-950">
              Complète ton profil
            </Text>
            <Text className="mt-2 text-sm text-cyan-900/80">
              Renseigne au minimum un nom ou pseudo ET un numéro de téléphone. Dès que c'est rempli,
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

      <Modal transparent visible={showQrPreview} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/70 px-6">
          <View className="w-full rounded-3xl border border-slate-200 bg-white p-5">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Mon QR SafeBack</Text>
            {qrCodeUrl ? (
              <View className="mt-4 items-center">
                <Image
                  source={{ uri: qrCodeUrl }}
                  style={{ width: 280, height: 280, borderRadius: 16 }}
                  resizeMode="cover"
                />
              </View>
            ) : null}
            <View className="mt-4 flex-row gap-2">
              <TouchableOpacity
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                onPress={() => setShowQrPreview(false)}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">Fermer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
                onPress={() => {
                  setShowQrPreview(false);
                  router.push("/scan-friend-qr");
                }}
              >
                <Text className="text-center text-sm font-semibold text-white">Scanner un QR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={showAllShortcutsModal}
        animationType="slide"
        onRequestClose={() => setShowAllShortcutsModal(false)}
      >
        <View className="flex-1 justify-end bg-black/45">
          <View className="max-h-[88%] rounded-t-3xl bg-[#FFFCF7] px-6 pb-8 pt-5">
            <View className="h-1.5 w-14 self-center rounded-full bg-slate-300" />
            <View className="mt-4 flex-row items-center justify-between">
              <Text className="text-xl font-extrabold text-[#0F172A]">Tous les raccourcis</Text>
              <TouchableOpacity
                className="rounded-full border border-slate-200 bg-white px-3 py-1"
                onPress={() => setShowAllShortcutsModal(false)}
              >
                <Text className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Fermer
                </Text>
              </TouchableOpacity>
            </View>
            <View className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <View className="flex-row items-center">
                <Ionicons name="search-outline" size={16} color="#64748b" />
                <TextInput
                  className="ml-2 flex-1 text-sm text-slate-900"
                  placeholder="Rechercher un raccourci..."
                  placeholderTextColor="#94a3b8"
                  value={shortcutSearchQuery}
                  onChangeText={setShortcutSearchQuery}
                />
                {shortcutSearchQuery.trim().length > 0 ? (
                  <TouchableOpacity
                    className="rounded-full bg-slate-100 px-2 py-1"
                    onPress={() => setShortcutSearchQuery("")}
                  >
                    <Ionicons name="close" size={12} color="#334155" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-3"
              contentContainerStyle={{ gap: 8, paddingRight: 8 }}
            >
              {shortcutFilters.map((filter) => {
                const active = shortcutFilter === filter.id;
                return (
                  <TouchableOpacity
                    key={`shortcut-filter-${filter.id}`}
                    className={`rounded-full border px-3 py-2 ${
                      active ? "border-slate-900 bg-slate-900" : "border-slate-200 bg-white"
                    }`}
                    onPress={() => setShortcutFilter(filter.id)}
                  >
                    <Text
                      className={`text-xs font-semibold uppercase tracking-wider ${
                        active ? "text-white" : "text-slate-700"
                      }`}
                    >
                      {filter.label} · {filter.count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <ScrollView className="mt-4">
              {filteredShortcutSections.map((section) => (
                <View
                  key={`shortcut-section-${section.id}`}
                  className="mb-4 rounded-3xl border border-[#E7E0D7] bg-white p-4"
                >
                  <Text className="text-xs uppercase tracking-widest text-slate-500">{section.title}</Text>
                  {section.items.map((item) => {
                    const status = shortcutStatus(item.href);
                    return (
                      <Link key={item.id} href={item.href} asChild>
                        <TouchableOpacity
                          className="mt-2 flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                          onPress={() => setShowAllShortcutsModal(false)}
                        >
                          <Ionicons name={iconForShortcut(item)} size={16} color="#334155" />
                          <View className="ml-3 flex-1">
                            <View className="flex-row items-center gap-2">
                              <Text className="text-sm font-semibold text-slate-900">{item.title}</Text>
                              {status === "new" ? (
                                <View className="rounded-full bg-cyan-100 px-2 py-0.5">
                                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700">
                                    Nouveau
                                  </Text>
                                </View>
                              ) : status === "configured" ? (
                                <View className="rounded-full bg-emerald-100 px-2 py-0.5">
                                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                                    Configuré
                                  </Text>
                                </View>
                              ) : (
                                <View className="rounded-full bg-slate-200 px-2 py-0.5">
                                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                                    À faire
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text className="mt-0.5 text-xs text-slate-500">{item.subtitle}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                        </TouchableOpacity>
                      </Link>
                    );
                  })}
                </View>
              ))}
              {filteredShortcutSections.length === 0 ? (
                <View className="mt-2 rounded-3xl border border-slate-200 bg-white p-5">
                  <Text className="text-center text-base font-semibold text-slate-900">Aucun raccourci trouvé</Text>
                  <Text className="mt-2 text-center text-sm text-slate-600">
                    Change le filtre ou la recherche pour afficher des pages.
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
