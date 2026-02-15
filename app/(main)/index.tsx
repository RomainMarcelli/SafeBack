import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Link, Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
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
import { getAutoCheckinConfig } from "../../src/lib/safety/autoCheckins";
import { supabase } from "../../src/lib/core/supabase";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";
import { getThemeMode, type ThemeMode } from "../../src/lib/theme/themePreferences";
import { useAppAccessibility } from "../../src/components/AppAccessibilityProvider";
import { AnimatedCard } from "../../src/components/ui/AnimatedCard";
import { AnimatedPressable } from "../../src/components/ui/AnimatedPressable";
import { PremiumEmptyState } from "../../src/components/ui/PremiumEmptyState";
import { SkeletonCard } from "../../src/components/ui/Skeleton";
import {
  getOnboardingTutorialSteps,
  getTutorialGlobalProgressLabel,
  getTutorialSectionStats
} from "../../src/lib/home/onboardingTutorial";
import {
  hasVisitedRoute,
  markTutorialStepCompleted,
  setTutorialCurrentStepIndex,
  syncTutorialCompletionFromVisitedRoutes,
  type DiscoveryProgress
} from "../../src/lib/home/discoveryProgress";

type TutorialStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  ctaLabel: string;
  href:
    | "/account"
    | "/favorites"
    | "/safety-alerts"
    | "/friends-map"
    | "/auto-checkins"
    | "/guardian-dashboard"
    | "/setup";
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
    description: "Ils seront prévenus automatiquement au depart et en cas de retard.",
    ctaLabel: "Ajouter mes contacts",
    href: "/favorites"
  },
  {
    id: "safety_review",
    title: "Regler les alertes de sécurité",
    description: "Choisis quand SafeBack te relance et quand escalader vers tes proches.",
    ctaLabel: "Ouvrir les réglages sécurité",
    href: "/safety-alerts",
    manual: true
  },
  {
    id: "friends_map",
    title: "Paramétrer la carte des proches",
    description: "Choisis si tu veux apparaître sur la carte et configure ton icône de présence.",
    ctaLabel: "Configurer ma visibilité carte",
    href: "/friends-map",
    manual: true
  },
  {
    id: "auto_checkins",
    title: "Configurer les arrivées automatiques",
    description: "Ajoute une règle maison/travail pour confirmer ton arrivée automatiquement.",
    ctaLabel: "Configurer les arrivées auto",
    href: "/auto-checkins",
    manual: true
  },
  {
    id: "guardian_dashboard",
    title: "Tester le dashboard proches",
    description: "Vérifie la vue côté proche: statuts, demandes bien-arrivé et co-pilote.",
    ctaLabel: "Ouvrir le dashboard proches",
    href: "/guardian-dashboard",
    manual: true
  },
  {
    id: "first_trip",
    title: "Lancer ton premier trajet",
    description: "Un premier trajet valide toute la chaine d alertes et de suivi.",
    ctaLabel: "Démarrer un trajet",
    href: "/setup"
  }
];

const STEP_ESTIMATED_MINUTES: Record<OnboardingStepId, number> = {
  profile: 1,
  favorites: 1,
  contacts: 1,
  safety_review: 1,
  friends_map: 1,
  auto_checkins: 1,
  guardian_dashboard: 1,
  first_trip: 2
};

type OnboardingChecklist = {
  profile: boolean;
  favorites: boolean;
  contacts: boolean;
  auto_checkins: boolean;
  first_trip: boolean;
};

export default function HomeScreen() {
  const router = useRouter();
  const { announce } = useAppAccessibility();
  const params = useLocalSearchParams<{ onboarding?: string; onboardingToken?: string }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickInfo, setQuickInfo] = useState("");
  const [quickError, setQuickError] = useState("");
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [discoveryProgress, setDiscoveryProgress] = useState<DiscoveryProgress | null>(null);
  const [onboardingChecklist, setOnboardingChecklist] = useState<OnboardingChecklist>({
    profile: false,
    favorites: false,
    contacts: false,
    auto_checkins: false,
    first_trip: false
  });
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [showOnboardingPrompt, setShowOnboardingPrompt] = useState(false);
  const [showOnboardingGuide, setShowOnboardingGuide] = useState(false);
  const [showFullTutorial, setShowFullTutorial] = useState(false);
  const [showHubModal, setShowHubModal] = useState(false);
  const [hubSearchQuery, setHubSearchQuery] = useState("");
  const [hubFilter, setHubFilter] = useState<"all" | "new" | "configured" | "todo">("all");
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  const [fullTutorialStepIndex, setFullTutorialStepIndex] = useState(0);
  const [guideActionBusy, setGuideActionBusy] = useState(false);
  const hubSheetDragStartY = useRef<number | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");

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
    getThemeMode()
      .then(setThemeMode)
      .catch(() => setThemeMode("light"));
  }, []);

  const isStepDone = (stepId: TutorialStep["id"]) => {
    if (stepId === "profile") return onboardingChecklist.profile;
    if (stepId === "favorites") return onboardingChecklist.favorites;
    if (stepId === "contacts") return onboardingChecklist.contacts;
    if (stepId === "auto_checkins") return onboardingChecklist.auto_checkins;
    if (stepId === "first_trip") return onboardingChecklist.first_trip;
    if (stepId === "friends_map") {
      return onboardingState?.manualDone.includes("friends_map") ?? false;
    }
    if (stepId === "guardian_dashboard") {
      return onboardingState?.manualDone.includes("guardian_dashboard") ?? false;
    }
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
  const remainingEstimatedMinutes = useMemo(
    () =>
      TUTORIAL_STEPS.filter((step) => !isStepDone(step.id)).reduce(
        (sum, step) => sum + STEP_ESTIMATED_MINUTES[step.id],
        0
      ),
    [onboardingChecklist, onboardingState]
  );
  const onboardingComplete = onboardingState?.completed || completedStepCount === totalStepCount;
  const darkMode = themeMode === "dark";
  const currentStep = TUTORIAL_STEPS[tutorialStepIndex] ?? TUTORIAL_STEPS[0];
  const currentStepDone = isStepDone(currentStep.id);
  const fullTutorialSteps = useMemo(() => getOnboardingTutorialSteps(), []);
  const fullTutorialStats = useMemo(
    () => getTutorialSectionStats(fullTutorialSteps),
    [fullTutorialSteps]
  );
  const totalFullTutorialSteps = fullTutorialSteps.length;
  const completedFullTutorialStepIds = useMemo(
    () => new Set(discoveryProgress?.tutorialCompletedStepIds ?? []),
    [discoveryProgress?.tutorialCompletedStepIds]
  );
  const currentFullTutorialStep =
    fullTutorialSteps[Math.max(0, Math.min(fullTutorialStepIndex, totalFullTutorialSteps - 1))] ??
    null;
  const currentFullTutorialStepDone = currentFullTutorialStep
    ? completedFullTutorialStepIds.has(currentFullTutorialStep.id)
    : false;
  const fullTutorialCompletedCount = completedFullTutorialStepIds.size;
  const fullTutorialProgressLabel = getTutorialGlobalProgressLabel(
    fullTutorialStepIndex,
    totalFullTutorialSteps
  );
  const hubSections = useMemo(() => getHomeHubSections(), []);
  const visitedRoutes = discoveryProgress?.visitedRoutes ?? [];
  const isHubItemNew = (href: string) => !hasVisitedRoute(visitedRoutes, href);

  const isHubItemConfigured = (item: HomeHubItem) => {
    if (item.href === "/favorites") return onboardingChecklist.favorites;
    if (item.href === "/setup") return onboardingChecklist.first_trip;
    if (item.href === "/auto-checkins") return onboardingChecklist.auto_checkins;
    if (item.href === "/friends-map") return onboardingState?.manualDone.includes("friends_map") ?? false;
    if (item.href === "/guardian-dashboard") {
      return onboardingState?.manualDone.includes("guardian_dashboard") ?? false;
    }
    if (item.href === "/safety-alerts") return onboardingState?.manualDone.includes("safety_review") ?? false;
    return hasVisitedRoute(visitedRoutes, item.href);
  };

  const hubItemStatus = (item: HomeHubItem): "new" | "configured" | "todo" => {
    if (isHubItemNew(item.href)) return "new";
    return isHubItemConfigured(item) ? "configured" : "todo";
  };

  const filteredHubSections = useMemo(() => {
    const query = hubSearchQuery.trim().toLowerCase();
    return hubSections
      .map((section) => {
        const items = section.items.filter((item) => {
          const haystack = `${item.title} ${item.subtitle}`.toLowerCase();
          const matchesQuery = query.length === 0 || haystack.includes(query);
          if (!matchesQuery) return false;
          if (hubFilter === "all") return true;
          return hubItemStatus(item) === hubFilter;
        });
        return {
          ...section,
          items
        };
      })
      .filter((section) => section.items.length > 0);
  }, [hubSections, hubSearchQuery, hubFilter, onboardingChecklist, onboardingState, visitedRoutes]);

  const hubStatusCounts = useMemo(() => {
    const counts = {
      new: 0,
      configured: 0,
      todo: 0
    };
    for (const section of hubSections) {
      for (const item of section.items) {
        const status = hubItemStatus(item);
        counts[status] += 1;
      }
    }
    return counts;
  }, [hubSections, onboardingChecklist, onboardingState, visitedRoutes]);

  const hubFilters: Array<{
    id: "all" | "new" | "configured" | "todo";
    label: string;
    count: number;
  }> = [
    {
      id: "all",
      label: "Tout",
      count: hubStatusCounts.new + hubStatusCounts.configured + hubStatusCounts.todo
    },
    {
      id: "new",
      label: "Nouveau",
      count: hubStatusCounts.new
    },
    {
      id: "configured",
      label: "Configuré",
      count: hubStatusCounts.configured
    },
    {
      id: "todo",
      label: "À faire",
      count: hubStatusCounts.todo
    }
  ];
  const primaryHubItems = useMemo(
    () =>
      // On évite de dupliquer "Trajet" ici: l'action principale existe déjà juste au-dessus.
      getPrimaryHomeHubItems(8)
        .filter((item) => item.href !== "/setup")
        .slice(0, 4),
    []
  );

  const iconForHubItem = (item: HomeHubItem): keyof typeof Ionicons.glyphMap => {
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
  };

  const renderHubStatusBadge = (status: "new" | "configured" | "todo") => {
    if (status === "new") {
      return (
        <View className="rounded-full bg-cyan-100 px-2 py-0.5">
          <Text className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700">
            Nouveau
          </Text>
        </View>
      );
    }
    if (status === "configured") {
      return (
        <View className="rounded-full bg-emerald-100 px-2 py-0.5">
          <Text className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Configuré
          </Text>
        </View>
      );
    }
    return (
      <View className="rounded-full bg-slate-200 px-2 py-0.5">
        <Text className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
          À faire
        </Text>
      </View>
    );
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
      const [state, profile, addresses, contacts, sessions, autoCheckins] = await Promise.all([
        getOnboardingState(currentUserId),
        getProfile(),
        listFavoriteAddresses(),
        listContacts(),
        listSessions(),
        getAutoCheckinConfig()
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
        auto_checkins: autoCheckins.rules.length > 0,
        first_trip: sessions.length > 0
      };

      const safetyDone = state.manualDone.includes("safety_review");
      const friendsMapDone = state.manualDone.includes("friends_map");
      const guardianDashboardDone = state.manualDone.includes("guardian_dashboard");
      const autoCheckinDone = nextChecklist.auto_checkins || state.manualDone.includes("auto_checkins");
      const shouldComplete =
        nextChecklist.profile &&
        nextChecklist.favorites &&
        nextChecklist.contacts &&
        friendsMapDone &&
        autoCheckinDone &&
        guardianDashboardDone &&
        nextChecklist.first_trip &&
        safetyDone;

      let nextState = state;
      if (shouldComplete && !state.completed) {
        nextState = await setOnboardingCompleted(currentUserId);
      }

      const syncedProgress = await syncTutorialCompletionFromVisitedRoutes(currentUserId);

      setOnboardingChecklist(nextChecklist);
      setOnboardingState(nextState);
      setDiscoveryProgress(syncedProgress);
      setFullTutorialStepIndex(
        Math.max(0, Math.min(totalFullTutorialSteps - 1, syncedProgress.tutorialCurrentStepIndex))
      );
      setShowOnboardingPrompt(!nextState.completed && !nextState.dismissed);
    } finally {
      setOnboardingReady(true);
    }
  }, [totalFullTutorialSteps]);

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

  useEffect(() => {
    if (showHubModal) return;
    setHubSearchQuery("");
    setHubFilter("all");
  }, [showHubModal]);

  const launchGuidedAssistant = async () => {
    if (!userId) return;
    // Démarre l'assistant à la première étape incomplète puis navigue directement vers l'écran cible.
    const stepId = getFirstPendingStep();
    await startOnboardingAssistant(userId, stepId);
    setShowOnboardingPrompt(false);
    setShowOnboardingGuide(false);
    router.push(getOnboardingStepRoute(stepId));
  };

  const launchFullTutorial = () => {
    // Tutoriel de découverte complet: toutes les pages + mode d'emploi détaillé.
    const resumeIndex = Math.max(
      0,
      Math.min(totalFullTutorialSteps - 1, discoveryProgress?.tutorialCurrentStepIndex ?? 0)
    );
    setFullTutorialStepIndex(resumeIndex);
    setShowOnboardingPrompt(false);
    setShowOnboardingGuide(false);
    setShowFullTutorial(true);
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

  const accentClasses = (accent: string) => {
    if (accent === "amber") {
      return {
        pill: "bg-amber-100",
        pillText: "text-amber-700",
        border: "border-amber-200",
        surface: "bg-amber-50",
        cta: "bg-amber-600"
      };
    }
    if (accent === "emerald") {
      return {
        pill: "bg-emerald-100",
        pillText: "text-emerald-700",
        border: "border-emerald-200",
        surface: "bg-emerald-50",
        cta: "bg-emerald-700"
      };
    }
    if (accent === "sky") {
      return {
        pill: "bg-sky-100",
        pillText: "text-sky-700",
        border: "border-sky-200",
        surface: "bg-sky-50",
        cta: "bg-sky-700"
      };
    }
    if (accent === "rose") {
      return {
        pill: "bg-rose-100",
        pillText: "text-rose-700",
        border: "border-rose-200",
        surface: "bg-rose-50",
        cta: "bg-rose-700"
      };
    }
    return {
      pill: "bg-slate-100",
      pillText: "text-slate-700",
      border: "border-slate-200",
      surface: "bg-slate-50",
      cta: "bg-slate-800"
    };
  };

  const persistFullTutorialCursor = async (stepIndex: number) => {
    if (!userId) return;
    try {
      const next = await setTutorialCurrentStepIndex(userId, stepIndex);
      setDiscoveryProgress(next);
    } catch {
      // no-op: la sauvegarde de reprise ne doit pas casser l'expérience.
    }
  };

  const markFullTutorialStepAsCompleted = async (stepId: string | undefined) => {
    if (!userId || !stepId) return;
    try {
      const next = await markTutorialStepCompleted(userId, stepId);
      setDiscoveryProgress(next);
    } catch {
      // no-op
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
    <SafeAreaView style={{ flex: 1, backgroundColor: darkMode ? "#0B1220" : "#F7F2EA" }}>
      <StatusBar style={darkMode ? "light" : "dark"} />
      <View className={`absolute -top-24 -right-16 h-56 w-56 rounded-full ${darkMode ? "bg-slate-800 opacity-60" : "bg-[#FAD4A6] opacity-70"}`} />
      <View className={`absolute top-32 -left-28 h-72 w-72 rounded-full ${darkMode ? "bg-slate-700 opacity-50" : "bg-[#BFE9D6] opacity-60"}`} />
      <View className={`absolute bottom-24 -right-32 h-72 w-72 rounded-full ${darkMode ? "bg-slate-900 opacity-60" : "bg-[#C7DDF8] opacity-40"}`} />

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

        <Text className={`mt-6 text-4xl font-extrabold ${darkMode ? "text-slate-100" : "text-[#0F172A]"}`}>SafeBack</Text>
        <Text className={`mt-2 text-base ${darkMode ? "text-slate-300" : "text-[#475569]"}`}>
          Lance rapidement un trajet, suis ta position et garde tes proches informes.
        </Text>

        {!onboardingReady ? (
          <View className="mt-4 gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}

        {onboardingReady && !onboardingComplete && !onboardingState?.dismissed ? (
          <AnimatedCard delayMs={40}>
            <View className="mt-4 overflow-hidden rounded-3xl border border-cyan-200 bg-cyan-50/90 p-5 shadow-sm">
            <TouchableOpacity
              testID="home-dismiss-express-assistant"
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
              Suis le guide et finalise ta configuration en quelques étapes.
            </Text>
            <View className="mt-4 h-2 overflow-hidden rounded-full bg-cyan-100">
              <View
                className="h-full rounded-full bg-cyan-600"
                style={{ width: `${onboardingPercent}%` }}
              />
            </View>
            <Text className="mt-2 text-xs font-semibold text-cyan-900">
              {completedStepCount}/{totalStepCount} étapes completees
            </Text>
            <Text className="mt-1 text-xs text-cyan-800">
              Temps restant estimé : {Math.max(1, remainingEstimatedMinutes)} min
            </Text>
            <TouchableOpacity
              testID="home-open-express-assistant"
              className="mt-4 rounded-2xl bg-[#0f172a] px-4 py-3"
              onPress={launchGuidedAssistant}
            >
              <Text className="text-center text-sm font-semibold text-white">
                Ouvrir le guide
              </Text>
            </TouchableOpacity>
            </View>
          </AnimatedCard>
        ) : null}

        <AnimatedCard delayMs={80}>
          <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Action principale</Text>
          <Text className="mt-2 text-2xl font-bold text-slate-900">Démarrer un trajet</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Prepare ton depart, ta destination et les contacts a prévenir.
          </Text>

          <Link href="/setup" asChild>
            <AnimatedPressable
              testID="home-open-setup-button"
              containerStyle={{ marginTop: 16 }}
              className="flex-row items-center justify-center rounded-2xl bg-[#111827] px-5 py-4"
              voiceHint="Ouverture de la préparation de trajet"
            >
              <Ionicons name="navigate-outline" size={18} color="#ffffff" />
              <Text className="ml-2 text-base font-semibold text-white">Nouveau trajet</Text>
            </AnimatedPressable>
          </Link>
          </View>
        </AnimatedCard>

        <AnimatedCard delayMs={120}>
          <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Widget accueil</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Actions rapides en 1 clic sans passer par plusieurs écrans.
          </Text>
          <View className="mt-3 flex-row gap-2">
            <Link href="/trips" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl bg-[#111827] px-4 py-4">
                <Text className="text-center text-sm font-semibold text-white">Mes trajets</Text>
              </TouchableOpacity>
            </Link>
            <TouchableOpacity
              testID="home-quick-arrival-button"
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
                    note: "Confirmation envoyée",
                    updatedAtIso: new Date().toISOString()
                  });
                  setQuickInfo(formatQuickArrivalMessage(result.conversations));
                } catch (error: any) {
                  setQuickError(error?.message ?? "Impossible d envoyér la confirmation rapide.");
                } finally {
                  setQuickBusy(false);
                }
              }}
              disabled={quickBusy}
            >
              <Text className="text-center text-sm font-semibold text-white">
                {quickBusy ? "Envoi..." : "Je suis bien rentré"}
              </Text>
            </TouchableOpacity>
          </View>
          <View className="mt-2 flex-row gap-2">
            <Link href="/quick-sos" asChild>
              <TouchableOpacity
                testID="home-open-quick-sos-button"
                className="flex-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4"
              >
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
          {quickInfo ? <FeedbackMessage kind="info" message={quickInfo} compact /> : null}
          {quickError ? <FeedbackMessage kind="error" message={quickError} compact /> : null}
          </View>
        </AnimatedCard>

        <AnimatedCard delayMs={160}>
          <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Navigation rapide</Text>
            <TouchableOpacity
              testID="home-open-hub-button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1"
              onPress={() => {
                setShowHubModal(true);
                announce("Hub de navigation ouvert").catch(() => {
                  // no-op
                });
              }}
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
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-semibold text-slate-900">{item.title}</Text>
                      {renderHubStatusBadge(hubItemStatus(item))}
                    </View>
                    <Text className="mt-0.5 text-xs text-slate-500">{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                </TouchableOpacity>
              </Link>
            ))}
          </View>
          </View>
        </AnimatedCard>
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
              En quelques minutes, je te guide pour activer les réglages essentiels et être prêt(e)
              dès ton premier trajet.
            </Text>

            <View className="mt-6 flex-row gap-3">
              <TouchableOpacity
                testID="home-onboarding-prompt-later"
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
                testID="home-onboarding-prompt-start"
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

            <TouchableOpacity
              testID="home-onboarding-prompt-full-tutorial"
              className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3"
              onPress={launchFullTutorial}
            >
              <Text className="text-center text-sm font-semibold text-cyan-800">
                Voir le tutoriel complet (toutes les pages)
              </Text>
            </TouchableOpacity>
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
                  Étape {tutorialStepIndex + 1} / {totalStepCount}
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
              <Text className="text-xs uppercase tracking-widest text-slate-500">Étape actuelle</Text>
              <Text className="mt-2 text-xl font-bold text-slate-900">{currentStep.title}</Text>
              <Text className="mt-2 text-sm text-slate-600">{currentStep.description}</Text>
              <Text className="mt-2 text-xs text-slate-500">
                Durée estimée : {STEP_ESTIMATED_MINUTES[currentStep.id]} min
              </Text>
              {currentStepDone ? (
                <View className="mt-3 self-start rounded-full bg-emerald-100 px-3 py-1">
                  <Text className="text-xs font-semibold text-emerald-700">Étape validee</Text>
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
                      {step.title} {done ? "· Fait" : ""}
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

            <TouchableOpacity
              className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3"
              onPress={launchFullTutorial}
            >
              <Text className="text-center text-sm font-semibold text-cyan-800">
                Ouvrir le tutoriel complet (toutes les pages)
              </Text>
            </TouchableOpacity>

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

      <Modal
        transparent
        visible={showFullTutorial}
        animationType="slide"
        onRequestClose={() => {
          persistFullTutorialCursor(fullTutorialStepIndex).catch(() => {
            // no-op
          });
          setShowFullTutorial(false);
        }}
      >
        <View className="flex-1 justify-end bg-black/45">
          <View className="max-h-[90%] rounded-t-3xl bg-[#FFFCF7] px-6 pb-8 pt-5">
            <View className="h-1.5 w-14 self-center rounded-full bg-slate-300" />
            <View className="mt-4 flex-row items-start justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-slate-500">
                  Tutoriel complet
                </Text>
                <Text className="mt-1 text-2xl font-extrabold text-[#0F172A]">
                  Toutes les pages pas à pas
                </Text>
              </View>
              <TouchableOpacity
                className="rounded-full border border-slate-200 bg-white px-3 py-1"
                onPress={() => {
                  persistFullTutorialCursor(fullTutorialStepIndex).catch(() => {
                    // no-op
                  });
                  setShowFullTutorial(false);
                }}
              >
                <Text className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Fermer
                </Text>
              </TouchableOpacity>
            </View>

            <Text className="mt-2 text-sm text-slate-600">
              {fullTutorialProgressLabel} · {fullTutorialStats.length} sections ·{" "}
              {totalFullTutorialSteps} étapes
            </Text>
            <Text className="mt-1 text-xs font-semibold text-emerald-700">
              {fullTutorialCompletedCount}/{totalFullTutorialSteps} étapes terminées
            </Text>

            <View className="mt-3 flex-row flex-wrap gap-2">
              {fullTutorialStats.map((entry) => (
                <View
                  key={`tutorial-stat-${entry.sectionId}`}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1"
                >
                  <Text className="text-[11px] font-semibold text-slate-700">
                    {entry.sectionTitle} · {entry.count}
                  </Text>
                </View>
              ))}
            </View>

            <ScrollView className="mt-4" contentContainerStyle={{ paddingBottom: 8 }}>
              {currentFullTutorialStep ? (() => {
                const palette = accentClasses(currentFullTutorialStep.sectionAccent);
                return (
                  <View
                    className={`rounded-3xl border ${palette.border} ${palette.surface} px-5 py-5`}
                  >
                    <View className={`self-start rounded-full px-3 py-1 ${palette.pill}`}>
                      <Text className={`text-[10px] font-semibold uppercase tracking-[2px] ${palette.pillText}`}>
                        {currentFullTutorialStep.sectionTitle}
                      </Text>
                    </View>
                    <Text className="mt-3 text-xl font-extrabold text-slate-900">
                      {currentFullTutorialStep.title}
                    </Text>
                    <Text className="mt-2 text-sm text-slate-700">
                      {currentFullTutorialStep.description}
                    </Text>
                    {currentFullTutorialStepDone ? (
                      <View className="mt-3 self-start rounded-full bg-emerald-100 px-3 py-1">
                        <Text className="text-xs font-semibold text-emerald-700">
                          Étape terminée automatiquement
                        </Text>
                      </View>
                    ) : null}

                    <View className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <Text className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                        Comment faire
                      </Text>
                      <Text className="mt-2 text-sm text-slate-700">
                        {currentFullTutorialStep.howTo}
                      </Text>
                    </View>

                    {currentFullTutorialStep.route ? (
                      <TouchableOpacity
                        className={`mt-4 rounded-2xl px-4 py-3 ${palette.cta}`}
                        onPress={async () => {
                          await markFullTutorialStepAsCompleted(currentFullTutorialStep.id);
                          await persistFullTutorialCursor(fullTutorialStepIndex);
                          setShowFullTutorial(false);
                          router.push(currentFullTutorialStep.route as any);
                        }}
                      >
                        <Text className="text-center text-sm font-semibold text-white">
                          Ouvrir cette étape
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <Text className="text-sm font-semibold text-slate-700">
                          Étape informative (pas d'écran dédié).
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })() : null}
            </ScrollView>

            <View className="mt-4 flex-row gap-3">
              <TouchableOpacity
                className={`flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 ${
                  fullTutorialStepIndex <= 0 ? "opacity-50" : ""
                }`}
                disabled={fullTutorialStepIndex <= 0}
                onPress={() => {
                  setFullTutorialStepIndex((prev) => {
                    const next = Math.max(0, prev - 1);
                    persistFullTutorialCursor(next).catch(() => {
                      // no-op
                    });
                    return next;
                  });
                }}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">Précédent</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
                onPress={async () => {
                  await markFullTutorialStepAsCompleted(currentFullTutorialStep?.id);
                  if (fullTutorialStepIndex >= totalFullTutorialSteps - 1) {
                    persistFullTutorialCursor(fullTutorialStepIndex).catch(() => {
                      // no-op
                    });
                    setShowFullTutorial(false);
                    return;
                  }
                  setFullTutorialStepIndex((prev) => {
                    const next = Math.min(totalFullTutorialSteps - 1, prev + 1);
                    persistFullTutorialCursor(next).catch(() => {
                      // no-op
                    });
                    return next;
                  });
                }}
              >
                <Text className="text-center text-sm font-semibold text-white">
                  {fullTutorialStepIndex >= totalFullTutorialSteps - 1 ? "Terminer" : "Suivant"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showHubModal} animationType="slide" onRequestClose={() => setShowHubModal(false)}>
        <View className="flex-1 bg-black/45">
          <Pressable
            testID="home-hub-overlay-close"
            style={{ flex: 1 }}
            onPress={() => setShowHubModal(false)}
          />
          <View
            className="max-h-[88%] rounded-t-3xl bg-[#FFFCF7] px-6 pb-8 pt-5"
          >
            <View
              className="h-1.5 w-14 self-center rounded-full bg-slate-300"
              {...PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onPanResponderGrant: (event) => {
                  hubSheetDragStartY.current = event.nativeEvent.pageY;
                },
                onPanResponderMove: (event) => {
                  if (hubSheetDragStartY.current == null) return;
                  const delta = event.nativeEvent.pageY - hubSheetDragStartY.current;
                  if (delta > 30) {
                    hubSheetDragStartY.current = null;
                    setShowHubModal(false);
                  }
                },
                onPanResponderRelease: () => {
                  hubSheetDragStartY.current = null;
                },
                onPanResponderTerminate: () => {
                  hubSheetDragStartY.current = null;
                }
              }).panHandlers}
            />
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
            <View className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <View className="flex-row items-center">
                <Ionicons name="search-outline" size={16} color="#64748b" />
                <TextInput
                  testID="home-hub-search-input"
                  className="ml-2 flex-1 text-sm text-slate-900"
                  placeholder="Rechercher une page, une action..."
                  placeholderTextColor="#94a3b8"
                  value={hubSearchQuery}
                  onChangeText={setHubSearchQuery}
                />
                {hubSearchQuery.trim().length > 0 ? (
                  <TouchableOpacity
                    className="rounded-full bg-slate-100 px-2 py-1"
                    onPress={() => setHubSearchQuery("")}
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
              {hubFilters.map((filter) => {
                const active = hubFilter === filter.id;
                return (
                  <TouchableOpacity
                    key={`hub-filter-${filter.id}`}
                    className={`rounded-full border px-3 py-2 ${
                      active ? "border-slate-900 bg-slate-900" : "border-slate-200 bg-white"
                    }`}
                    onPress={() => setHubFilter(filter.id)}
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
              {!onboardingReady ? (
                <View className="gap-3">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </View>
              ) : filteredHubSections.length === 0 ? (
                <PremiumEmptyState
                  title="Aucun résultat"
                  description="Aucune page ne correspond à cette recherche ou à ce filtre."
                  icon="search-outline"
                  actionLabel="Réinitialiser les filtres"
                  onActionPress={() => {
                    setHubFilter("all");
                    setHubSearchQuery("");
                  }}
                />
              ) : (
                filteredHubSections.map((section) => (
                  <View key={section.id} className="mb-4 rounded-3xl border border-[#E7E0D7] bg-white p-4">
                    <Text className="text-xs uppercase tracking-widest text-slate-500">{section.title}</Text>
                    {section.items.map((item) => {
                      const status = hubItemStatus(item);
                      return (
                        <Link key={item.id} href={item.href} asChild>
                          <TouchableOpacity
                            className="mt-2 flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                            onPress={() => setShowHubModal(false)}
                          >
                            <Ionicons name={iconForHubItem(item)} size={16} color="#334155" />
                            <View className="ml-3 flex-1">
                              <View className="flex-row items-center gap-2">
                                <Text className="text-sm font-semibold text-slate-900">{item.title}</Text>
                                {renderHubStatusBadge(status)}
                              </View>
                              <Text className="mt-0.5 text-xs text-slate-500">{item.subtitle}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                          </TouchableOpacity>
                        </Link>
                      );
                    })}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
