import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Link, Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { clearActiveSessionId } from "../../src/lib/trips/activeSession";
import { syncSafeBackHomeWidget } from "../../src/lib/home/androidHomeWidget";
import {
  getHomeHubSections,
  getPrimaryHomeHubItems,
  type HomeHubItem
} from "../../src/lib/home/homeHub";
import {
  getProfile,
  listContacts,
  listFavoriteAddresses,
  listSessions
} from "../../src/lib/core/db";
import { formatQuickArrivalMessage } from "../../src/lib/home/homeQuickActions";
import { sendArrivalSignalToGuardians } from "../../src/lib/social/messagingDb";
import {
  getOnboardingStepRoute,
  getOnboardingState,
  markOnboardingManualStep,
  resetOnboardingState,
  startOnboardingAssistant,
  setOnboardingCompleted,
  setOnboardingDismissed,
  type OnboardingStepId,
  type OnboardingState
} from "../../src/lib/home/onboarding";
import { getPredefinedMessageConfig, resolvePredefinedMessage } from "../../src/lib/contacts/predefinedMessage";
import { supabase } from "../../src/lib/core/supabase";

type TutorialStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  ctaLabel: string;
  href: "/account" | "/favorites" | "/safety-alerts" | "/setup";
  manual?: boolean;
};

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "profile",
    title: "Completer ton profil",
    description: "Ajoute au moins ton nom et ton numero pour rassurer tes proches.",
    ctaLabel: "Ouvrir mon compte",
    href: "/account"
  },
  {
    id: "favorites",
    title: "Ajouter des adresses favorites",
    description: "Maison, travail ou ecole: tu lances ensuite un trajet en quelques secondes.",
    ctaLabel: "Configurer mes adresses",
    href: "/favorites"
  },
  {
    id: "contacts",
    title: "Ajouter tes proches de confiance",
    description: "Ils seront prevenus automatiquement au depart et en cas de retard.",
    ctaLabel: "Ajouter mes contacts",
    href: "/favorites"
  },
  {
    id: "safety_review",
    title: "Regler les alertes de securite",
    description: "Choisis quand SafeBack te relance et quand escalader vers tes proches.",
    ctaLabel: "Ouvrir les reglages securite",
    href: "/safety-alerts",
    manual: true
  },
  {
    id: "first_trip",
    title: "Lancer ton premier trajet",
    description: "Un premier trajet valide toute la chaine d alertes et de suivi.",
    ctaLabel: "Demarrer un trajet",
    href: "/setup"
  }
];

type OnboardingChecklist = {
  profile: boolean;
  favorites: boolean;
  contacts: boolean;
  first_trip: boolean;
};

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ onboarding?: string; onboardingToken?: string }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickInfo, setQuickInfo] = useState("");
  const [quickError, setQuickError] = useState("");
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [onboardingChecklist, setOnboardingChecklist] = useState<OnboardingChecklist>({
    profile: false,
    favorites: false,
    contacts: false,
    first_trip: false
  });
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [showOnboardingPrompt, setShowOnboardingPrompt] = useState(false);
  const [showOnboardingGuide, setShowOnboardingGuide] = useState(false);
  const [showHubModal, setShowHubModal] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  const [guideActionBusy, setGuideActionBusy] = useState(false);

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

  const isStepDone = (stepId: TutorialStep["id"]) => {
    if (stepId === "profile") return onboardingChecklist.profile;
    if (stepId === "favorites") return onboardingChecklist.favorites;
    if (stepId === "contacts") return onboardingChecklist.contacts;
    if (stepId === "first_trip") return onboardingChecklist.first_trip;
    if (stepId === "safety_review") {
      return onboardingState?.manualDone.includes("safety_review") ?? false;
    }
    return false;
  };

  const completedStepCount = useMemo(
    () => TUTORIAL_STEPS.filter((step) => isStepDone(step.id)).length,
    [onboardingChecklist, onboardingState]
  );
  const totalStepCount = TUTORIAL_STEPS.length;
  const onboardingPercent = Math.round((completedStepCount / totalStepCount) * 100);
  const onboardingComplete = onboardingState?.completed || completedStepCount === totalStepCount;
  const currentStep = TUTORIAL_STEPS[tutorialStepIndex] ?? TUTORIAL_STEPS[0];
  const currentStepDone = isStepDone(currentStep.id);
  const primaryHubItems = useMemo(() => getPrimaryHomeHubItems(4), []);
  const hubSections = useMemo(() => getHomeHubSections(), []);

  const iconForHubItem = (item: HomeHubItem): keyof typeof Ionicons.glyphMap => {
    if (item.href === "/setup") return "navigate-outline";
    if (item.href === "/trips") return "time-outline";
    if (item.href === "/messages") return "chatbubble-ellipses-outline";
    if (item.href === "/favorites") return "heart-outline";
    if (item.href === "/friends") return "people-outline";
    if (item.href === "/friends-map") return "map-outline";
    if (item.href === "/safety-alerts") return "shield-checkmark-outline";
    if (item.href === "/auto-checkins") return "flash-outline";
    if (item.href === "/forgotten-trip") return "location-outline";
    if (item.href === "/notifications") return "notifications-outline";
    if (item.href === "/incident-report") return "document-text-outline";
    if (item.href === "/incidents") return "documents-outline";
    if (item.href === "/privacy-center") return "shield-outline";
    if (item.href === "/features-guide") return "book-outline";
    return "sparkles-outline";
  };

  const getFirstPendingStepIndex = () => {
    const index = TUTORIAL_STEPS.findIndex((step) => !isStepDone(step.id));
    return index === -1 ? TUTORIAL_STEPS.length - 1 : index;
  };

  const getFirstPendingStep = (): OnboardingStepId => {
    const step = TUTORIAL_STEPS.find((item) => !isStepDone(item.id));
    return step?.id ?? "first_trip";
  };

  const refreshOnboarding = useCallback(async (currentUserId: string) => {
    try {
      const [state, profile, addresses, contacts, sessions] = await Promise.all([
        getOnboardingState(currentUserId),
        getProfile(),
        listFavoriteAddresses(),
        listContacts(),
        listSessions()
      ]);

      const hasIdentity = Boolean(
        profile?.username?.trim() ||
          profile?.first_name?.trim() ||
          profile?.last_name?.trim()
      );
      const hasPhone = Boolean(profile?.phone?.trim());
      const nextChecklist: OnboardingChecklist = {
        profile: hasIdentity && hasPhone,
        favorites: addresses.length > 0,
        contacts: contacts.length > 0,
        first_trip: sessions.length > 0
      };

      const safetyDone = state.manualDone.includes("safety_review");
      const shouldComplete =
        nextChecklist.profile &&
        nextChecklist.favorites &&
        nextChecklist.contacts &&
        nextChecklist.first_trip &&
        safetyDone;

      let nextState = state;
      if (shouldComplete && !state.completed) {
        nextState = await setOnboardingCompleted(currentUserId);
      }

      setOnboardingChecklist(nextChecklist);
      setOnboardingState(nextState);
      setShowOnboardingPrompt(!nextState.completed && !nextState.dismissed);
    } finally {
      setOnboardingReady(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      refreshOnboarding(userId);
    }, [userId, refreshOnboarding])
  );

  useEffect(() => {
    const shouldOpenGuide =
      params.onboarding === "1" ||
      params.onboarding === "true" ||
      params.onboarding === "guide" ||
      params.onboarding === "restart";
    if (!shouldOpenGuide) return;
    if (!onboardingReady) return;

    const openGuideFromShortcut = async () => {
      // `restart` force une remise à zéro complète pour rejouer l'assistant depuis le début.
      if (params.onboarding === "restart" && userId) {
        const nextState = await resetOnboardingState(userId);
        setOnboardingState(nextState);
        await refreshOnboarding(userId);
      }
      setShowOnboardingPrompt(false);
      setTutorialStepIndex(0);
      setShowOnboardingGuide(true);
    };

    void openGuideFromShortcut();
  }, [params.onboarding, params.onboardingToken, onboardingReady, userId, refreshOnboarding]);

  const launchGuidedAssistant = async () => {
    if (!userId) return;
    // Démarre l'assistant à la première étape incomplète puis navigue directement vers l'écran cible.
    const stepId = getFirstPendingStep();
    await startOnboardingAssistant(userId, stepId);
    setShowOnboardingPrompt(false);
    setShowOnboardingGuide(false);
    router.push(getOnboardingStepRoute(stepId));
  };

  const launchGuideFromStep = async (stepId: OnboardingStepId) => {
    if (!userId) return;
    try {
      setGuideActionBusy(true);
      // Permet à l'utilisateur de rejouer une étape précise depuis le menu du guide.
      await startOnboardingAssistant(userId, stepId);
      setShowOnboardingPrompt(false);
      setShowOnboardingGuide(false);
      router.push(getOnboardingStepRoute(stepId));
    } finally {
      setGuideActionBusy(false);
    }
  };

  const resetGuideFromZero = async () => {
    if (!userId) return;
    try {
      setGuideActionBusy(true);
      // Redémarrage complet demandé par l'utilisateur : efface la progression et repart à l'étape 1.
      const next = await resetOnboardingState(userId);
      setOnboardingState(next);
      await startOnboardingAssistant(userId, "profile");
      setTutorialStepIndex(0);
      setShowOnboardingPrompt(false);
      setShowOnboardingGuide(false);
      router.push("/account");
    } finally {
      setGuideActionBusy(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    refreshOnboarding(userId);
  }, [userId, refreshOnboarding]);

  if (!checking && !userId) {
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
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
              Accueil
            </Text>
          </View>
          <Link href="/account" asChild>
            <TouchableOpacity className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2">
              <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                Mon compte
              </Text>
            </TouchableOpacity>
          </Link>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">SafeBack</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Lance rapidement un trajet, suis ta position et garde tes proches informes.
        </Text>

        {onboardingReady && !onboardingComplete && !onboardingState?.dismissed ? (
          <View className="mt-4 overflow-hidden rounded-3xl border border-cyan-200 bg-cyan-50/90 p-5 shadow-sm">
            <TouchableOpacity
              className="absolute right-3 top-3 z-10 h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white/90"
              onPress={async () => {
                if (!userId) return;
                const next = await setOnboardingDismissed(userId, true);
                setOnboardingState(next);
                setShowOnboardingPrompt(false);
              }}
            >
              <Ionicons name="close" size={16} color="#0f172a" />
            </TouchableOpacity>
            <View className="absolute -right-10 -top-8 h-28 w-28 rounded-full bg-cyan-200/50" />
            <View className="absolute -left-8 bottom-0 h-20 w-20 rounded-full bg-amber-200/45" />
            <Text className="text-[11px] font-semibold uppercase tracking-[2.5px] text-cyan-800">
              Assistant de demarrage express
            </Text>
            <Text className="mt-2 text-xl font-extrabold text-cyan-950">
              Application presque prete
            </Text>
            <Text className="mt-1 text-sm text-cyan-900/80">
              Suis le guide et finalise ta configuration en quelques etapes.
            </Text>
            <View className="mt-4 h-2 overflow-hidden rounded-full bg-cyan-100">
              <View
                className="h-full rounded-full bg-cyan-600"
                style={{ width: `${onboardingPercent}%` }}
              />
            </View>
            <Text className="mt-2 text-xs font-semibold text-cyan-900">
              {completedStepCount}/{totalStepCount} etapes completees
            </Text>
            <TouchableOpacity
              className="mt-4 rounded-2xl bg-[#0f172a] px-4 py-3"
              onPress={launchGuidedAssistant}
            >
              <Text className="text-center text-sm font-semibold text-white">
                Ouvrir le guide
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Action principale</Text>
          <Text className="mt-2 text-2xl font-bold text-slate-900">Demarrer un trajet</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Prepare ton depart, ta destination et les contacts a prevenir.
          </Text>

          <Link href="/setup" asChild>
            <TouchableOpacity className="mt-4 flex-row items-center justify-center rounded-2xl bg-[#111827] px-5 py-4">
              <Ionicons name="navigate-outline" size={18} color="#ffffff" />
              <Text className="ml-2 text-base font-semibold text-white">Nouveau trajet</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Widget accueil</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Actions rapides en 1 clic sans passer par plusieurs ecrans.
          </Text>
          <View className="mt-3 flex-row gap-2">
            <Link href="/setup" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl bg-[#111827] px-4 py-4">
                <Text className="text-center text-sm font-semibold text-white">Lancer un trajet</Text>
              </TouchableOpacity>
            </Link>
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-4 py-4 ${quickBusy ? "bg-slate-300" : "bg-emerald-600"}`}
              onPress={async () => {
                try {
                  setQuickBusy(true);
                  setQuickError("");
                  setQuickInfo("");
                  const config = await getPredefinedMessageConfig();
                  const message = resolvePredefinedMessage(config);
                  const result = await sendArrivalSignalToGuardians({ note: message });
                  await clearActiveSessionId();
                  await syncSafeBackHomeWidget({
                    status: "arrived",
                    note: "Confirmation envoyee",
                    updatedAtIso: new Date().toISOString()
                  });
                  setQuickInfo(formatQuickArrivalMessage(result.conversations));
                } catch (error: any) {
                  setQuickError(error?.message ?? "Impossible d envoyer la confirmation rapide.");
                } finally {
                  setQuickBusy(false);
                }
              }}
              disabled={quickBusy}
            >
              <Text className="text-center text-sm font-semibold text-white">
                {quickBusy ? "Envoi..." : "Je suis bien rentre"}
              </Text>
            </TouchableOpacity>
          </View>
          <View className="mt-2 flex-row gap-2">
            <Link href="/quick-sos" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                <Text className="text-center text-sm font-semibold text-rose-700">
                  SOS rapide
                </Text>
              </TouchableOpacity>
            </Link>
            <Link href="/incident-report" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <Text className="text-center text-sm font-semibold text-emerald-800">
                  Rapport incident
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
          {quickInfo ? <Text className="mt-3 text-sm text-emerald-700">{quickInfo}</Text> : null}
          {quickError ? <Text className="mt-3 text-sm text-red-600">{quickError}</Text> : null}
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Navigation rapide</Text>
            <TouchableOpacity
              className="rounded-full border border-slate-200 bg-white px-3 py-1"
              onPress={() => setShowHubModal(true)}
            >
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                Voir tout
              </Text>
            </TouchableOpacity>
          </View>
          <Text className="mt-2 text-sm text-slate-600">
            Les 4 entrées les plus utilisées. Le reste est dans “Voir tout”.
          </Text>
          <View className="mt-3">
            {primaryHubItems.map((item) => (
              <Link key={item.id} href={item.href} asChild>
                <TouchableOpacity className="mt-2 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
                    <Ionicons name={iconForHubItem(item)} size={17} color="#334155" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-semibold text-slate-900">{item.title}</Text>
                    <Text className="mt-0.5 text-xs text-slate-500">{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                </TouchableOpacity>
              </Link>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal transparent visible={showOnboardingPrompt} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full overflow-hidden rounded-3xl border border-[#F3D7AE] bg-[#FFF7ED] p-6 shadow-lg">
            <View className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-200/60" />
            <View className="absolute -left-7 bottom-0 h-20 w-20 rounded-full bg-cyan-200/50" />

            <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-amber-700">
              Bienvenue sur SafeBack
            </Text>
            <Text className="mt-2 text-2xl font-extrabold text-[#0F172A]">
              On configure tout ensemble ?
            </Text>
            <Text className="mt-2 text-sm text-slate-700">
              En 3 minutes, je te guide pour activer les reglages essentiels et etre pret(e) des ton
              premier trajet.
            </Text>

            <View className="mt-6 flex-row gap-3">
              <TouchableOpacity
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                onPress={async () => {
                  if (!userId) return;
                  const next = await setOnboardingDismissed(userId, true);
                  setOnboardingState(next);
                  setShowOnboardingPrompt(false);
                }}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">Plus tard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
                onPress={async () => {
                  if (!userId) return;
                  const next = await setOnboardingDismissed(userId, false);
                  setOnboardingState(next);
                  setShowOnboardingPrompt(false);
                  await launchGuidedAssistant();
                }}
              >
                <Text className="text-center text-sm font-semibold text-white">Commencer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showOnboardingGuide} animationType="slide">
        <View className="flex-1 justify-end bg-black/45">
          <View className="max-h-[88%] rounded-t-3xl bg-[#FFFCF7] px-6 pb-8 pt-5">
            <View className="h-1.5 w-14 self-center rounded-full bg-slate-300" />
            <View className="mt-4 flex-row items-start justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-slate-500">
                  Guide de configuration
                </Text>
                <Text className="mt-1 text-2xl font-extrabold text-[#0F172A]">
                  Etape {tutorialStepIndex + 1} / {totalStepCount}
                </Text>
              </View>
              <TouchableOpacity
                className="rounded-full border border-slate-200 bg-white px-3 py-1"
                onPress={() => setShowOnboardingGuide(false)}
              >
                <Text className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Fermer
                </Text>
              </TouchableOpacity>
            </View>

            <View className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <View
                className="h-full rounded-full bg-[#0f172a]"
                style={{ width: `${Math.max(8, onboardingPercent)}%` }}
              />
            </View>

            <View className="mt-5 rounded-3xl border border-[#E7E0D7] bg-white p-5 shadow-sm">
              <Text className="text-xs uppercase tracking-widest text-slate-500">Etape actuelle</Text>
              <Text className="mt-2 text-xl font-bold text-slate-900">{currentStep.title}</Text>
              <Text className="mt-2 text-sm text-slate-600">{currentStep.description}</Text>
              {currentStepDone ? (
                <View className="mt-3 self-start rounded-full bg-emerald-100 px-3 py-1">
                  <Text className="text-xs font-semibold text-emerald-700">Etape validee</Text>
                </View>
              ) : null}
            </View>

            <View className="mt-4">
              {TUTORIAL_STEPS.map((step, index) => {
                const done = isStepDone(step.id);
                const active = tutorialStepIndex === index;
                return (
                  <TouchableOpacity
                    key={step.id}
                    onPress={() => setTutorialStepIndex(index)}
                    className={`mt-2 flex-row items-center justify-between rounded-2xl border px-3 py-3 ${
                      active
                        ? "border-cyan-300 bg-cyan-50"
                        : done
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-slate-200 bg-white"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        active ? "text-cyan-900" : done ? "text-emerald-800" : "text-slate-700"
                      }`}
                    >
                      {step.title}
                    </Text>
                    <Ionicons
                      name={active ? "play-circle" : done ? "checkmark-circle" : "ellipse-outline"}
                      size={18}
                      color={active ? "#0891b2" : done ? "#059669" : "#94a3b8"}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="mt-3 flex-row gap-3">
              <TouchableOpacity
                className={`flex-1 rounded-2xl px-4 py-3 ${guideActionBusy ? "bg-slate-300" : "bg-cyan-700"}`}
                onPress={() => launchGuideFromStep(currentStep.id)}
                disabled={guideActionBusy}
              >
                <Text className="text-center text-sm font-semibold text-white">
                  Refaire cette étape
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 rounded-2xl border px-4 py-3 ${
                  guideActionBusy ? "border-slate-200 bg-slate-100" : "border-rose-200 bg-rose-50"
                }`}
                onPress={resetGuideFromZero}
                disabled={guideActionBusy}
              >
                <Text className={`text-center text-sm font-semibold ${guideActionBusy ? "text-slate-500" : "text-rose-700"}`}>
                  Revenir à 0
                </Text>
              </TouchableOpacity>
            </View>

            <View className="mt-5 flex-row gap-3">
              <TouchableOpacity
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                onPress={() => {
                  if (tutorialStepIndex === 0) return;
                  setTutorialStepIndex((prev) => Math.max(0, prev - 1));
                }}
                disabled={tutorialStepIndex === 0}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">Precedent</Text>
              </TouchableOpacity>

              {currentStep.manual && !currentStepDone ? (
                <TouchableOpacity
                  className="flex-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
                  onPress={async () => {
                    if (!userId) return;
                    const next = await markOnboardingManualStep(userId, currentStep.id);
                    setOnboardingState(next);
                    await refreshOnboarding(userId);
                  }}
                >
                  <Text className="text-center text-sm font-semibold text-emerald-700">
                    Marquer comme fait
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View className="mt-3 flex-row gap-3">
              <TouchableOpacity
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                onPress={() => {
                  setShowOnboardingGuide(false);
                  router.push(currentStep.href);
                }}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">
                  {currentStep.ctaLabel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 rounded-2xl px-4 py-3 ${
                  tutorialStepIndex === totalStepCount - 1 ? "bg-emerald-600" : "bg-[#111827]"
                }`}
                onPress={async () => {
                  if (tutorialStepIndex < totalStepCount - 1) {
                    setTutorialStepIndex((prev) => Math.min(totalStepCount - 1, prev + 1));
                    return;
                  }
                  if (!userId) {
                    setShowOnboardingGuide(false);
                    return;
                  }
                  const next = await setOnboardingCompleted(userId);
                  setOnboardingState(next);
                  setShowOnboardingGuide(false);
                  setShowOnboardingPrompt(false);
                }}
              >
                <Text className="text-center text-sm font-semibold text-white">
                  {tutorialStepIndex === totalStepCount - 1 ? "Terminer" : "Suivant"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showHubModal} animationType="slide" onRequestClose={() => setShowHubModal(false)}>
        <View className="flex-1 justify-end bg-black/45">
          <View className="max-h-[88%] rounded-t-3xl bg-[#FFFCF7] px-6 pb-8 pt-5">
            <View className="h-1.5 w-14 self-center rounded-full bg-slate-300" />
            <View className="mt-4 flex-row items-center justify-between">
              <Text className="text-xl font-extrabold text-[#0F172A]">Toutes les pages</Text>
              <TouchableOpacity
                className="rounded-full border border-slate-200 bg-white px-3 py-1"
                onPress={() => setShowHubModal(false)}
              >
                <Text className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Fermer
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView className="mt-4">
              {hubSections.map((section) => (
                <View key={section.id} className="mb-4 rounded-3xl border border-[#E7E0D7] bg-white p-4">
                  <Text className="text-xs uppercase tracking-widest text-slate-500">{section.title}</Text>
                  {section.items.map((item) => (
                    <Link key={item.id} href={item.href} asChild>
                      <TouchableOpacity
                        className="mt-2 flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                        onPress={() => setShowHubModal(false)}
                      >
                        <Ionicons name={iconForHubItem(item)} size={16} color="#334155" />
                        <View className="ml-3 flex-1">
                          <Text className="text-sm font-semibold text-slate-900">{item.title}</Text>
                          <Text className="mt-0.5 text-xs text-slate-500">{item.subtitle}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    </Link>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
