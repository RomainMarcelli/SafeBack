import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView
} from "react-native";
import Slider from "@react-native-community/slider";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Contacts from "expo-contacts";
import * as Location from "expo-location";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContact,
  createSessionWithContacts,
  listContacts,
  listFavoriteAddresses,
  listSessions,
  setSessionLiveShare
} from "../../src/lib/core/db";
import { setActiveSessionId } from "../../src/lib/trips/activeSession";
import { buildFriendViewLink, createLiveShareToken } from "../../src/lib/trips/liveShare";
import { createNotificationDispatchPlan, type NotifyMode } from "../../src/lib/contacts/notifyChannels";
import {
  CONTACT_GROUPS,
  getContactGroupMeta,
  getContactGroupProfiles,
  resolveContactGroup,
  type ContactGroupKey,
  type ContactGroupProfilesMap
} from "../../src/lib/contacts/contactGroups";
import {
  computeSafetyEscalationSchedule,
  formatSafetyDelay,
  getSafetyEscalationConfig
} from "../../src/lib/safety/safetyEscalation";
import { syncSafeBackHomeWidget } from "../../src/lib/home/androidHomeWidget";
import {
  getOnboardingAssistantSession,
  setOnboardingCompleted,
  stopOnboardingAssistant
} from "../../src/lib/home/onboarding";
import { enqueuePendingTripLaunch } from "../../src/lib/trips/offlineTripQueue";
import { confirmAction } from "../../src/lib/privacy/confirmAction";
import { logPrivacyEvent } from "../../src/lib/privacy/privacyCenter";
import { supabase } from "../../src/lib/core/supabase";
import { fetchRoute, type RouteMode, type RouteResult } from "../../src/lib/trips/routing";
import {
  sendTripStartedSignalToGuardians,
  createGuardianAssignment,
  listGuardianAssignments,
  sendWatchTimerExpiredSignalToGuardians
} from "../../src/lib/social/messagingDb";
import { listFriends, type FriendWithProfile } from "../../src/lib/social/friendsDb";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

const GEO_API = "https://data.geopf.fr/geocodage/completion/";
// Garde-fou temporaire: suspension de l'estimation de trajet pour isoler le bug de navigation.
// Mettre EXPO_PUBLIC_ENABLE_ROUTE_ESTIMATE=0 pour la suspendre temporairement.
const ROUTE_ESTIMATION_ENABLED = process.env.EXPO_PUBLIC_ENABLE_ROUTE_ESTIMATE !== "0";
const LAST_ROUTE_MODE_STORAGE_KEY = "safeback:setup:last-route-mode:v1";
const OPEN_TRIP_DESTINATION_LABEL = "Destination ouverte";

type QuickActionKey =
  | "depart_now"
  | "go_home"
  | "simple_timer"
  | "favorite_destination"
  | null;

type AddressSuggestion = {
  id: string;
  label: string;
  lon?: number;
  lat?: number;
};

type ContactItem = {
  id: string;
  name: string;
  channel: "sms" | "whatsapp" | "call";
  phone?: string;
  email?: string | null;
  contact_group?: ContactGroupKey | null;
};

type FavoriteAddress = {
  id: string;
  label: string;
  address: string;
};

type SimulatedMessage = {
  id: string;
  contactName: string;
  channel: "sms" | "whatsapp" | "call" | "email" | "app";
  phone?: string;
  email?: string | null;
  body: string;
  sentAt: string;
};

type LaunchSessionOptions = {
  fromAddressOverride?: string;
  toAddressOverride?: string;
  selectedContactIdsOverride?: string[];
  routeModeOverride?: RouteMode;
  expectedHourOverride?: string | null;
  expectedMinuteOverride?: string | null;
  routeResultOverride?: RouteResult | null;
  autoOpenTracking?: boolean;
  requireDestination?: boolean;
};

type QuickTimerState = {
  id: string;
  durationMinutes: number;
  endsAtMs: number;
  alertSent: boolean;
};

function normalizeSuggestions(data: any): AddressSuggestion[] {
  const raw = data?.results ?? data?.features ?? [];
  return raw
    .map((item: any, index: number) => {
      const label =
        item?.fulltext ||
        item?.label ||
        item?.name ||
        item?.properties?.label ||
        item?.properties?.name ||
        "";
      const lon = item?.x ?? item?.lon ?? item?.geometry?.coordinates?.[0];
      const lat = item?.y ?? item?.lat ?? item?.geometry?.coordinates?.[1];
      return {
        id: item?.id ?? item?.properties?.id ?? String(index),
        label,
        lon,
        lat
      };
    })
    .filter((item: AddressSuggestion) => item.label.length > 0);
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("33")) {
    const rest = digits.slice(2);
    return `+33 ${rest.replace(/(\d{2})(?=\d)/g, "$1 ")}`.trim();
  }
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

function formatAddressFromGeo(item: Location.LocationGeocodedAddress | null) {
  if (!item) return "";
  const normalizePart = (value: unknown) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");
  const normalizeCompare = (value: string) => value.toLowerCase();
  const containsPart = (haystack: string, needle: string) => {
    if (!haystack || !needle) return false;
    return normalizeCompare(haystack).includes(normalizeCompare(needle));
  };

  const name = normalizePart(item.name);
  const street = normalizePart(item.street);
  const streetNumber = normalizePart((item as { streetNumber?: string }).streetNumber);
  const streetLine = [streetNumber, street].filter(Boolean).join(" ").trim();

  let mainLine = "";
  if (name) {
    if (containsPart(name, streetLine) || containsPart(name, street)) {
      mainLine = name;
    } else if (streetLine) {
      mainLine = streetLine;
    } else {
      mainLine = name;
    }
  } else {
    mainLine = streetLine || street;
  }

  const parts = [mainLine, normalizePart(item.postalCode), normalizePart(item.city)]
    .filter(Boolean)
    .filter((part, index, self) => self.indexOf(part) === index);
  return parts.join(" ");
}

function formatTimeParts(hours: string | null, minutes: string | null) {
  if (!hours || !minutes) return "";
  return `${hours}:${minutes}`;
}

function formatDurationLabel(minutesTotal: number) {
  if (!Number.isFinite(minutesTotal)) return "";
  if (minutesTotal < 60) return `${minutesTotal} min`;
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function toExpectedArrivalIso(hours: string | null, minutes: string | null) {
  if (!hours || !minutes) return null;
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date.toISOString();
}

function formatNowTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function notifyModeLabel(mode: NotifyMode) {
  if (mode === "app") return "Application";
  if (mode === "sms") return "SMS";
  if (mode === "email") return "Email";
  if (mode === "whatsapp") return "WhatsApp";
  return "Auto";
}

function roundMinutesToStep(date: Date, step: number) {
  const minutes = date.getMinutes();
  const rounded = Math.round(minutes / step) * step;
  if (rounded === 60) {
    date.setHours(date.getHours() + 1);
    date.setMinutes(0);
  } else {
    date.setMinutes(rounded);
  }
  return date;
}

function isLikelyNetworkError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return (
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("offline") ||
    message.includes("connection")
  );
}

function normalizeTextForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function AddressInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  inputTestID?: string;
}) {
  const { label, value, onChange, onSelect, inputTestID } = props;
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !value || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const handle = setTimeout(async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          text: value,
          type: "StreetAddress",
          maximumResponses: "5"
        });
        const response = await fetch(`${GEO_API}?${params.toString()}`);
        const json = await response.json();
        setSuggestions(normalizeSuggestions(json));
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(handle);
  }, [value, open]);

  return (
    <View className="mt-4">
      {label ? (
        <Text className="text-xs uppercase tracking-widest text-slate-500">{label}</Text>
      ) : null}
      <TextInput
        testID={inputTestID}
        className="mt-2 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-4 text-base text-slate-900"
        placeholder="Saisis une adresse"
        placeholderTextColor="#94a3b8"
        value={value}
        onChangeText={(text) => {
          onChange(text);
          if (text.trim()) setOpen(true);
          if (!text.trim()) setSuggestions([]);
        }}
        onFocus={() => setOpen(true)}
      />
      {loading ? (
        <Text className="mt-2 text-xs text-slate-500">Recherche...</Text>
      ) : null}
      {open && suggestions.length > 0 ? (
        <View className="mt-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {suggestions.map((item) => (
            <TouchableOpacity
              key={item.id}
              className="border-b border-slate-100 px-4 py-3"
              onPressIn={() => {
                onSelect(item.label);
                setOpen(false);
                setSuggestions([]);
              }}
            >
              <Text className="text-sm text-slate-800">{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function SetupScreen() {
  const router = useRouter();
  const revealValues = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0))
  ).current;
  // Compteur de debug pour tracer les calculs d'itinéraire asynchrones et ignorer les résultats obsolètes.
  const routeRequestIdRef = useRef(0);
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [favoriteAddresses, setFavoriteAddresses] = useState<FavoriteAddress[]>([]);
  const [favoriteContacts, setFavoriteContacts] = useState<ContactItem[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [departureMode, setDepartureMode] = useState<"favorite" | "custom">("favorite");
  const [destinationMode, setDestinationMode] = useState<"favorite" | "custom">("custom");
  const [routeMode, setRouteMode] = useState<RouteMode>("walking");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [showTransitNotice, setShowTransitNotice] = useState(false);
  const [advancedModeOpen, setAdvancedModeOpen] = useState(false);
  const [quickActionBusy, setQuickActionBusy] = useState<QuickActionKey>(null);
  const [showQuickDepartModal, setShowQuickDepartModal] = useState(false);
  const [quickDepartDestination, setQuickDepartDestination] = useState("");
  const [showFavoriteLaunchModal, setShowFavoriteLaunchModal] = useState(false);
  const [showQuickTimerModal, setShowQuickTimerModal] = useState(false);
  const [customTimerMinutes, setCustomTimerMinutes] = useState("90");
  const [quickTimerState, setQuickTimerState] = useState<QuickTimerState | null>(null);
  const [showGuardianRequiredModal, setShowGuardianRequiredModal] = useState(false);
  const [guardianModalLoading, setGuardianModalLoading] = useState(false);
  const [friendCandidates, setFriendCandidates] = useState<FriendWithProfile[]>([]);

  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualGroup, setManualGroup] = useState<ContactGroupKey>("friends");
  const [expectedHour, setExpectedHour] = useState<string | null>(null);
  const [expectedMinute, setExpectedMinute] = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [hourSlider, setHourSlider] = useState(0);
  const [minuteSlider, setMinuteSlider] = useState(0);

  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [lastShareToken, setLastShareToken] = useState<string | null>(null);
  const [simulatedMessages, setSimulatedMessages] = useState<SimulatedMessage[]>([]);
  const [notificationStatus, setNotificationStatus] = useState<
    "idle" | "sent" | "blocked" | "expo-go"
  >("idle");
  const [notificationDetails, setNotificationDetails] = useState("");
  const [notifyMode, setNotifyMode] = useState<NotifyMode>("auto");
  const [useGroupProfiles, setUseGroupProfiles] = useState(true);
  const [groupProfiles, setGroupProfiles] = useState<ContactGroupProfilesMap | null>(null);
  const [shareLiveLocation, setShareLiveLocation] = useState(false);
  const [autoDisableShareOnArrival, setAutoDisableShareOnArrival] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [showPhoneContacts, setShowPhoneContacts] = useState(false);
  const [guideFirstTripActive, setGuideFirstTripActive] = useState(false);
  const [showGuideHint, setShowGuideHint] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const hasGoogleKey = Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);

  const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
  const minuteOptions = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
  const canLaunch = Boolean(fromAddress.trim() && toAddress.trim());
  const homeFavorite = useMemo(() => {
    return favoriteAddresses.find((item) => {
      const label = normalizeTextForMatch(String(item.label ?? ""));
      const address = normalizeTextForMatch(String(item.address ?? ""));
      return (
        label.includes("home") ||
        label.includes("maison") ||
        label.includes("domicile") ||
        label.includes("chez moi") ||
        address.includes("home")
      );
    });
  }, [favoriteAddresses]);

  const getDefaultContactIdsForGroup = (group: ContactGroupKey): string[] =>
    favoriteContacts
      .filter((contact) => resolveContactGroup(contact.contact_group) === group)
      .map((contact) => contact.id);

  const getPrimaryContactIds = () => {
    const priorities: ContactGroupKey[] = ["family", "friends", "colleagues"];
    for (const group of priorities) {
      const ids = getDefaultContactIdsForGroup(group);
      if (ids.length > 0) return ids;
    }
    return [];
  };

  const getFriendLabel = (friend: FriendWithProfile): string => {
    const firstName = String(friend.profile?.first_name ?? "").trim();
    const lastName = String(friend.profile?.last_name ?? "").trim();
    const username = String(friend.profile?.username ?? "").trim();
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName.length > 0) return fullName;
    if (username.length > 0) return username;
    return `Ami ${friend.friend_user_id.slice(0, 8)}`;
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      console.log("[setup/auth] initial session", {
        hasUser: Boolean(data.session?.user?.id),
        userId: data.session?.user?.id ?? null
      });
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("[setup/auth] state changed", {
        event: _event,
        hasUser: Boolean(session?.user?.id),
        userId: session?.user?.id ?? null
      });
      if (_event === "SIGNED_OUT") {
        setUserId(null);
        return;
      }
      if (session?.user?.id) {
        setUserId(session.user.id);
      }
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(LAST_ROUTE_MODE_STORAGE_KEY)
      .then((stored) => {
        if (stored === "walking" || stored === "driving" || stored === "transit") {
          setRouteMode(stored);
        }
      })
      .catch(() => {
        // no-op
      });
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoadingFavorites(true);
        const [addr, cont, profiles] = await Promise.all([
          listFavoriteAddresses(),
          listContacts(),
          getContactGroupProfiles()
        ]);
        setFavoriteAddresses(addr as FavoriteAddress[]);
        setFavoriteContacts(cont as ContactItem[]);
        setGroupProfiles(profiles);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      } finally {
        setLoadingFavorites(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const assistant = await getOnboardingAssistantSession(userId);
        const onFirstTripStep = assistant.active && assistant.stepId === "first_trip";
        if (!onFirstTripStep) {
          setGuideFirstTripActive(false);
          setShowGuideHint(false);
          return;
        }

        // Si un trajet existe déjà, l'onboarding guidé peut être validé immédiatement.
        const sessions = await listSessions();
        if (sessions.length > 0) {
          await setOnboardingCompleted(userId);
          await stopOnboardingAssistant(userId);
          setGuideFirstTripActive(false);
          setShowGuideHint(false);
          return;
        }

        setGuideFirstTripActive(true);
        setShowGuideHint(true);
      } catch {
        setGuideFirstTripActive(false);
        setShowGuideHint(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!ROUTE_ESTIMATION_ENABLED) {
      setRouteLoading(false);
      setRouteResult(null);
      return;
    }
    if (!fromAddress.trim() || !toAddress.trim()) {
      setRouteResult(null);
      return;
    }
    if (routeMode === "transit" && !hasGoogleKey) {
      setRouteResult(null);
      return;
    }
    const handle = setTimeout(async () => {
      const requestId = routeRequestIdRef.current + 1;
      routeRequestIdRef.current = requestId;
      try {
        console.log("[setup/route] start", {
          requestId,
          from: fromAddress.trim(),
          to: toAddress.trim(),
          mode: routeMode
        });
        setRouteLoading(true);
        const data = await fetchRoute(fromAddress.trim(), toAddress.trim(), routeMode);
        if (requestId !== routeRequestIdRef.current) {
          console.log("[setup/route] stale result ignored", { requestId });
          return;
        }
        if (!data) {
          console.log("[setup/route] no route found", { requestId });
        }
        console.log("[setup/route] done", {
          requestId,
          durationMinutes: data?.durationMinutes ?? null,
          distanceKm: data?.distanceKm ?? null,
          provider: data?.provider ?? null
        });
        setRouteResult(data);
      } catch (error) {
        if (requestId !== routeRequestIdRef.current) {
          return;
        }
        console.log("[setup/route] fetch error", { requestId, error });
        setRouteResult(null);
      } finally {
        if (requestId === routeRequestIdRef.current) {
          setRouteLoading(false);
        }
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [fromAddress, toAddress, routeMode, hasGoogleKey]);

  useEffect(() => {
    console.log("[setup/route] loading-state", {
      loading: routeLoading,
      hasRoute: Boolean(routeResult),
      fromLength: fromAddress.trim().length,
      toLength: toAddress.trim().length
    });
  }, [routeLoading, routeResult, fromAddress, toAddress]);

  useEffect(() => {
    const animations = revealValues.map((value) =>
      Animated.timing(value, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    );
    Animated.stagger(90, animations).start();
  }, [revealValues]);

  const canAddManual = useMemo(
    () => manualName.trim().length > 0 && manualPhone.trim().length > 0,
    [manualName, manualPhone]
  );
  const selectedContactItems = useMemo(
    () => favoriteContacts.filter((contact) => selectedContacts.includes(contact.id)),
    [favoriteContacts, selectedContacts]
  );
  const selectedGroupsSummary = useMemo(() => {
    const counts: Record<ContactGroupKey, number> = {
      family: 0,
      colleagues: 0,
      friends: 0
    };
    for (const contact of selectedContactItems) {
      counts[resolveContactGroup(contact.contact_group)] += 1;
    }
    return counts;
  }, [selectedContactItems]);
  const getRevealStyle = (index: number) => ({
    opacity: revealValues[index],
    transform: [
      {
        translateY: revealValues[index].interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0]
        })
      }
    ]
  });

  if (!checking && !userId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#F7F2EA] px-6">
        <Text className="text-center text-xl font-bold text-slate-900">Session requise</Text>
        <Text className="mt-2 text-center text-sm text-slate-600">
          Connecte-toi pour créer un trajet.
        </Text>
        <TouchableOpacity
          className="mt-4 rounded-2xl bg-[#111827] px-5 py-3"
          onPress={() => router.push("/auth")}
        >
          <Text className="text-sm font-semibold text-white">Aller à la connexion</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const setRouteModeAndPersist = (nextMode: RouteMode) => {
    setRouteMode(nextMode);
    AsyncStorage.setItem(LAST_ROUTE_MODE_STORAGE_KEY, nextMode).catch(() => {
      // no-op
    });
  };

  const ensureGuardiansOrContactsBeforeLaunch = async (resolvedContactIds: string[]) => {
    if (resolvedContactIds.length > 0) return true;
    if (!userId) return false;
    const guardianships = await listGuardianAssignments();
    const hasActiveGuardian = guardianships.some(
      (row) => row.owner_user_id === userId && row.status === "active"
    );
    if (hasActiveGuardian) return true;

    setGuardianModalLoading(true);
    setShowGuardianRequiredModal(true);
    try {
      const [friends, contacts] = await Promise.all([listFriends(), listContacts()]);
      setFriendCandidates(friends);
      setFavoriteContacts(contacts as ContactItem[]);
    } finally {
      setGuardianModalLoading(false);
    }
    setErrorMessage(
      "Avant de lancer un trajet, choisis au moins un proche (contact) ou définis un garant."
    );
    return false;
  };

  const swapAddresses = () => {
    setFromAddress((prevFrom) => {
      const nextFrom = toAddress;
      setToAddress(prevFrom);
      return nextFrom;
    });
    setDepartureMode("custom");
    setDestinationMode("custom");
  };

  const resetForm = () => {
    setFromAddress("");
    setToAddress("");
    setDepartureMode("favorite");
    setDestinationMode("custom");
    setExpectedHour(null);
    setExpectedMinute(null);
    setManualName("");
    setManualPhone("");
    setManualGroup("friends");
    setSelectedContacts([]);
    setRouteResult(null);
    setErrorMessage("");
  };

  const applyEtaToArrival = () => {
    if (!routeResult) return;
    const eta = new Date();
    eta.setMinutes(eta.getMinutes() + routeResult.durationMinutes);
    roundMinutesToStep(eta, 5);
    const hours = String(eta.getHours()).padStart(2, "0");
    const minutes = String(eta.getMinutes()).padStart(2, "0");
    setExpectedHour(hours);
    setExpectedMinute(minutes);
  };

  const addManualContact = () => {
    if (!canAddManual) return;
    (async () => {
      try {
        setSaving(true);
        setErrorMessage("");
        const saved = await createContact({
          name: manualName.trim(),
          channel: "sms",
          phone: manualPhone.trim(),
          contact_group: manualGroup
        });
        setFavoriteContacts((prev) => [saved as ContactItem, ...prev]);
        setSelectedContacts((prev) => [...prev, saved.id]);
        setManualName("");
        setManualPhone("");
        setManualGroup("friends");
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur lors de l enregistrement.");
      } finally {
        setSaving(false);
      }
    })();
  };

  const importFromPhone = async () => {
    const confirmed = await confirmAction({
      title: "Acceder a tes contacts ?",
      message:
        "SafeBack va demander l'autorisation systeme pour importer rapidement tes proches depuis ton telephone.",
      confirmLabel: "Autoriser"
    });
    if (!confirmed) return;

    const permission = await Contacts.requestPermissionsAsync();
    if (permission.status !== "granted") {
      return;
    }
    const result = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers]
    });
    if (result.data.length > 0) {
      if (showPhoneContacts) {
        setShowPhoneContacts(false);
        return;
      }
      setPhoneContacts(result.data);
      setShowPhoneContacts(true);
    }
  };

  const selectPhoneContact = (contact: Contacts.Contact) => {
    const number = contact.phoneNumbers?.[0]?.number;
    if (!number) return;
    (async () => {
      try {
        setSaving(true);
        setErrorMessage("");
        const saved = await createContact({
          name: contact.name ?? number,
          channel: "sms",
          phone: formatPhone(number),
          contact_group: "friends"
        });
        setFavoriteContacts((prev) => [saved as ContactItem, ...prev]);
        setSelectedContacts((prev) => [...prev, saved.id]);
        setShowPhoneContacts(false);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur lors de l enregistrement.");
      } finally {
        setSaving(false);
      }
    })();
  };

  const useCurrentLocation = async () => {
    const confirmed = await confirmAction({
      title: "Utiliser ta position'actuelle ?",
      message:
        "SafeBack va demander l'autorisation systeme de localisation pour renseigner ton point de depart.",
      confirmLabel: "Autoriser"
    });
    if (!confirmed) return;

    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setErrorMessage("Permission localisation refusee.");
      return;
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });
    const geo = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    });
    const formatted = formatAddressFromGeo(geo[0] ?? null);
    if (formatted) {
      setFromAddress(formatted.trim());
      setErrorMessage("");
      setDepartureMode("custom");
    }
  };

  const resolveCurrentAddressForQuickAction = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      throw new Error("Autorise la localisation pour lancer une action rapide.");
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });
    const geo = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    });
    const formatted = formatAddressFromGeo(geo[0] ?? null).trim();
    if (formatted.length > 0) return formatted;
    return `Position actuelle (${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(
      5
    )})`;
  };

  const launchSession = (options?: LaunchSessionOptions) => {
    const normalizedFrom = (options?.fromAddressOverride ?? fromAddress).trim();
    const rawTo = (options?.toAddressOverride ?? toAddress).trim();
    const requireDestination = options?.requireDestination ?? true;
    if (!normalizedFrom) return;
    if (requireDestination && !rawTo) return;

    const normalizedTo = rawTo || OPEN_TRIP_DESTINATION_LABEL;
    const destinationForMessage = rawTo || "une destination ouverte";
    const resolvedRouteMode = options?.routeModeOverride ?? routeMode;
    const expectedHourValue = options?.expectedHourOverride ?? expectedHour;
    const expectedMinuteValue = options?.expectedMinuteOverride ?? expectedMinute;
    const resolvedRouteResult = options?.routeResultOverride ?? routeResult;
    const resolvedContactIds = options?.selectedContactIdsOverride ?? selectedContacts;
    const resolvedSelectedContactItems = favoriteContacts.filter((contact) =>
      resolvedContactIds.includes(contact.id)
    );
    const autoOpenTracking = Boolean(options?.autoOpenTracking);

    if (options?.routeModeOverride) {
      setRouteModeAndPersist(options.routeModeOverride);
    }

    (async () => {
      const launchRecipientsReady = await ensureGuardiansOrContactsBeforeLaunch(resolvedContactIds);
      if (!launchRecipientsReady) return;

      if (shareLiveLocation) {
        const confirmedShare = await confirmAction({
          title: "Activer le partage live de position ?",
          message:
            "Tes proches selectionnes pourront suivre ta position pendant ce trajet. Tu pourras couper ce partage ensuite.",
          confirmLabel: "Partager"
        });
        if (!confirmedShare) return;
      }

      try {
        setSaving(true);
        setErrorMessage("");
        setNotificationDetails("");
        const expected = toExpectedArrivalIso(expectedHourValue, expectedMinuteValue);
        const safetyConfig = await getSafetyEscalationConfig();
        let session;
        try {
          session = await createSessionWithContacts({
            from_address: normalizedFrom,
            to_address: normalizedTo,
            contactIds: resolvedContactIds,
            expected_arrival_time: expected
          });
        } catch (error) {
          if (!isLikelyNetworkError(error)) {
            throw error;
          }
          await enqueuePendingTripLaunch({
            fromAddress: normalizedFrom,
            toAddress: normalizedTo,
            contactIds: resolvedContactIds,
            expectedArrivalIso: expected,
            shareLiveLocation
          });
          setLastSessionId(null);
          setLastShareToken(null);
          setSimulatedMessages([]);
          setNotificationStatus("idle");
          setNotificationDetails(
            "Trajet prepare hors ligne. Les alertes seront envoyées automatiquement des que la connexion revient."
          );
          setShowLaunchModal(true);
          return;
        }
        await setActiveSessionId(session.id);
        let liveShareToken: string | null = null;
        let friendViewLink: string | null = null;
        if (shareLiveLocation) {
          liveShareToken = createLiveShareToken();
          await setSessionLiveShare({
            sessionId: session.id,
            enabled: true,
            shareToken: liveShareToken
          });
          await logPrivacyEvent({
            type: "share_enabled",
            message: "Partage live active au lancement du trajet.",
            data: {
              session_id: session.id
            }
          });
          friendViewLink = buildFriendViewLink({
            sessionId: session.id,
            shareToken: liveShareToken
          });
        } else {
          await setSessionLiveShare({
            sessionId: session.id,
            enabled: false,
            shareToken: null
          });
          await logPrivacyEvent({
            type: "share_disabled",
            message: "Partage live désactive au lancement du trajet.",
            data: {
              session_id: session.id
            }
          });
        }
        setLastSessionId(session.id);
        setLastShareToken(liveShareToken);
        try {
          await syncSafeBackHomeWidget({
            status: "trip_active",
            fromAddress: normalizedFrom,
            toAddress: normalizedTo,
            note: "Trajet en cours",
            updatedAtIso: new Date().toISOString()
          });
        } catch {
          // no-op : la synchro du widget ne doit pas bloquer le lancement du trajet.
        }
        const time = formatNowTime();
        const arrivalText =
          formatTimeParts(expectedHourValue, expectedMinuteValue) ||
          (resolvedRouteResult
            ? `${resolvedRouteResult.durationMinutes} min'estimees`
            : "heure estimee inconnue");
        let guardiansNotifiedCount = 0;
        try {
          const guardianResult = await sendTripStartedSignalToGuardians({
            sessionId: session.id,
            fromAddress: normalizedFrom,
            toAddress: normalizedTo,
            expectedArrivalIso: expected
          });
          guardiansNotifiedCount = guardianResult.conversations;
        } catch {
          guardiansNotifiedCount = 0;
        }
        const messageBody = `Je démarre mon trajet a ${time} vers ${destinationForMessage}. Arrivee prévue : ${arrivalText}.${shareLiveLocation ? ` Partage de position'active.${friendViewLink ? ` Suivi: ${friendViewLink}` : ""}` : ""}`;
        const subject = `SafeBack - Demarrage trajet ${time}`;
        const resolvedGroupProfiles = groupProfiles ?? (await getContactGroupProfiles());
        const departureContacts = resolvedSelectedContactItems.filter((contact) => {
          if (!useGroupProfiles) return true;
          const groupKey = resolveContactGroup(contact.contact_group);
          return resolvedGroupProfiles[groupKey].sendOnDeparture;
        });
        const delayAlertContacts = departureContacts.filter((contact) => {
          if (!useGroupProfiles) return true;
          const groupKey = resolveContactGroup(contact.contact_group);
          return resolvedGroupProfiles[groupKey].receiveDelayAlerts;
        });

        const contactsByMode = departureContacts.reduce<Record<NotifyMode, ContactItem[]>>(
          (accumulator, contact) => {
            const groupKey = resolveContactGroup(contact.contact_group);
            const effectiveMode = useGroupProfiles
              ? resolvedGroupProfiles[groupKey].notifyMode
              : notifyMode;
            if (!accumulator[effectiveMode]) {
              accumulator[effectiveMode] = [];
            }
            accumulator[effectiveMode].push(contact);
            return accumulator;
          },
          {} as Record<NotifyMode, ContactItem[]>
        );

        const dispatchEntries = (Object.entries(contactsByMode) as Array<[NotifyMode, ContactItem[]]>)
          .filter(([, contacts]) => contacts.length > 0)
          .map(([mode, contacts]) => ({
            mode,
            contacts,
            plan: createNotificationDispatchPlan({
              mode,
              contacts,
              subject,
              body: messageBody,
              platform: Platform.OS === "ios" ? "ios" : "android"
            })
          }));

        const dispatchIssues = dispatchEntries.flatMap((entry) => entry.plan.issues);
        const needsInAppAlert = dispatchEntries.some((entry) => entry.plan.needsInAppAlert);

        const messages: SimulatedMessage[] = departureContacts.map((contact, index) => {
          const groupKey = resolveContactGroup(contact.contact_group);
          const effectiveMode = useGroupProfiles
            ? resolvedGroupProfiles[groupKey].notifyMode
            : notifyMode;
          return {
            id: `${session.id}-${contact.id}-${index}`,
            contactName: `${contact.name} (${getContactGroupMeta(groupKey).label})`,
            channel: effectiveMode === "auto" ? contact.channel : effectiveMode,
            phone: contact.phone,
            email: contact.email ?? null,
            body: messageBody,
            sentAt: time
          };
        });
        setSimulatedMessages(messages);

        const openedChannels: string[] = [];
        const openExternalChannel = async (url: string | null, label: string) => {
          if (!url) return;
          const canOpen = await Linking.canOpenURL(url);
          if (!canOpen) {
            dispatchIssues.push(`${label} indisponible sur cet appareil.`);
            return;
          }
          await Linking.openURL(url);
          openedChannels.push(label);
        };

        for (const entry of dispatchEntries) {
          const modeText = notifyModeLabel(entry.mode);
          await openExternalChannel(entry.plan.smsUrl, `SMS (${modeText})`);
          await openExternalChannel(entry.plan.mailUrl, `Email (${modeText})`);
          await openExternalChannel(entry.plan.whatsappUrl, `WhatsApp (${modeText})`);
        }

        let appNotificationsScheduled = false;
        let notificationBlocked = false;
        const notificationNotes: string[] = [];

        if (Constants.appOwnership === "expo") {
          if (needsInAppAlert || safetyConfig.enabled) {
            notificationNotes.push(
              "Planification des alertes indisponible dans Expo Go. Utilise un build dev pour tester."
            );
          }
          if (needsInAppAlert && messages.length === 0) {
            notificationNotes.push("Aucun proche selectionne pour le canal'application.");
          }
        } else if (needsInAppAlert || safetyConfig.enabled) {
          const Notifications = await import("expo-notifications");
          const current = await Notifications.getPermissionsAsync();
          let status = current.status;
          if (status !== "granted") {
            const requested = await Notifications.requestPermissionsAsync();
            status = requested.status;
          }

          if (status === "granted") {
            if (needsInAppAlert && messages.length > 0) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: "SafeBack",
                  body: `Alerte de depart preparee pour ${messages.length} proche(s).`
                },
                trigger: null
              });
              appNotificationsScheduled = true;
            }
            if (safetyConfig.enabled) {
              const schedule = computeSafetyEscalationSchedule({
                config: safetyConfig,
                expectedArrivalIso: expected,
                routeDurationMinutes: resolvedRouteResult?.durationMinutes ?? null
              });
              const modeLabel = (mode: string) => {
                if (mode === "sms") return "SMS";
                if (mode === "push") return "Push";
                return "In-app";
              };

              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `SafeBack - Niveau 1 (${modeLabel(safetyConfig.stageOneMode)})`,
                  body: "Toujours pas rentré ? Confirme ton'arrivée ou préviens tes proches."
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                  seconds: schedule.stageOneDelaySeconds,
                  repeats: false
                }
              });
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `SafeBack - Niveau 2 (${modeLabel(safetyConfig.stageTwoMode)})`,
                  body:
                    delayAlertContacts.length > 0
                      ? `Aucune confirmation. ${delayAlertContacts.length} proche(s) à prévenir.`
                      : "Aucune confirmation. Ajoute des proches à prévenir pour activer l'escalade."
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                  seconds: schedule.stageTwoDelaySeconds,
                  repeats: false
                }
              });
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `SafeBack - Niveau 3 (${modeLabel(safetyConfig.stageThreeMode)})`,
                  body:
                    delayAlertContacts.length > 0
                      ? `Escalade finale. Priorité haute: ${delayAlertContacts.length} proche(s).`
                      : "Escalade finale. Aucun proche configuré pour ce trajet."
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                  seconds: schedule.stageThreeDelaySeconds,
                  repeats: false
                }
              });
              appNotificationsScheduled = true;
              notificationNotes.push(
                `Escalade planifiée: N1 ${formatSafetyDelay(
                  safetyConfig.stageOneDelayMinutes
                )} (${modeLabel(safetyConfig.stageOneMode)}), N2 ${formatSafetyDelay(
                  safetyConfig.stageTwoDelayMinutes
                )} (${modeLabel(safetyConfig.stageTwoMode)}), N3 ${formatSafetyDelay(
                  safetyConfig.stageThreeDelayMinutes
                )} (${modeLabel(safetyConfig.stageThreeMode)}). ${delayAlertContacts.length} proche(s) concerné(s).`
              );
              if (safetyConfig.secureArrivalEnabled) {
                notificationNotes.push(
                  `Preuve d'arrivée renforcée active: durée mini ${formatSafetyDelay(
                    safetyConfig.secureArrivalMinTripMinutes
                  )}${
                    safetyConfig.secureArrivalRequireCharging ? ", charge requise" : ""
                  }${safetyConfig.secureArrivalRequireLocation ? ", position requise" : ""}.`
                );
              }
            } else {
              notificationNotes.push("Alertes de retard désactivées dans les réglages.");
            }
          } else {
            notificationBlocked = true;
            notificationNotes.push("Autorisation notifications refusee sur cet appareil.");
          }
        }

        const hasAnyDispatch =
          openedChannels.length > 0 || appNotificationsScheduled || needsInAppAlert;
        if (notificationBlocked && openedChannels.length === 0 && !appNotificationsScheduled) {
          setNotificationStatus("blocked");
        } else if (Constants.appOwnership === "expo" && (needsInAppAlert || safetyConfig.enabled)) {
          setNotificationStatus("expo-go");
        } else if (hasAnyDispatch) {
          setNotificationStatus("sent");
        } else {
          setNotificationStatus("blocked");
        }

        const dispatchSummary: string[] = [];
        if (openedChannels.length > 0) {
          dispatchSummary.push(`Canaux externes ouverts: ${openedChannels.join(", ")}.`);
        }
        if (dispatchEntries.length > 0) {
          dispatchSummary.push(
            `Profils groupes: ${
              useGroupProfiles ? "actifs" : "désactives"
            } (${dispatchEntries
              .map((entry) => `${notifyModeLabel(entry.mode)}: ${entry.contacts.length}`)
              .join(" | ")}).`
          );
        }
        if (dispatchIssues.length > 0) {
          dispatchSummary.push(dispatchIssues.join(" "));
        }
        dispatchSummary.push(...notificationNotes);
        if (dispatchSummary.length === 0) {
          dispatchSummary.push("Aucun canal d'envoi disponible.");
        }
        if (guardiansNotifiedCount > 0) {
          dispatchSummary.push(`Garants notifies automatiquement: ${guardiansNotifiedCount}.`);
        }
        setNotificationDetails(dispatchSummary.join(" "));
        if (guideFirstTripActive && userId) {
          // Dernière étape guidée : le premier trajet lancé termine automatiquement l'onboarding.
          await setOnboardingCompleted(userId);
          await stopOnboardingAssistant(userId);
          setGuideFirstTripActive(false);
          setShowGuideHint(false);
        }

        if (autoOpenTracking) {
          try {
            router.push({
              pathname: "/tracking",
              params: {
                sessionId: session.id,
                mode: resolvedRouteMode,
                shareLiveLocation: shareLiveLocation ? "1" : "0",
                autoDisableShareOnArrival: autoDisableShareOnArrival ? "1" : "0",
                shareToken: liveShareToken ?? undefined
              }
            });
          } catch (error) {
            console.error("[setup/quick] auto tracking push failed", error);
          }
          setShowLaunchModal(false);
        } else {
          setShowLaunchModal(true);
        }
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur lors du lancement.");
      } finally {
        setSaving(false);
      }
    })();
  };

  const startQuickTimer = async (durationMinutes: number) => {
    const minutes = Math.max(1, Math.min(24 * 60, Math.round(durationMinutes)));
    const now = Date.now();
    const endsAtMs = now + minutes * 60 * 1000;
    setQuickTimerState({
      id: `${now}`,
      durationMinutes: minutes,
      endsAtMs,
      alertSent: false
    });
    setShowQuickTimerModal(false);
    setSuccessMessage(`Timer lancé pour ${minutes} min.`);

    if (Constants.appOwnership !== "expo") {
      try {
        const Notifications = await import("expo-notifications");
        const current = await Notifications.getPermissionsAsync();
        let status = current.status;
        if (status !== "granted") {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        if (status === "granted") {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "SafeBack - Timer",
              body: `Le timer de ${minutes} min est terminé. Confirme ton état.`
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: minutes * 60,
              repeats: false
            }
          });
        }
      } catch {
        // no-op : le timer continue côté app même sans notification locale.
      }
    }
  };

  useEffect(() => {
    if (!quickTimerState || quickTimerState.alertSent) return;
    const timer = setInterval(() => {
      if (Date.now() < quickTimerState.endsAtMs) return;
      setQuickTimerState((prev) => (prev ? { ...prev, alertSent: true } : prev));
      sendWatchTimerExpiredSignalToGuardians({
        durationMinutes: quickTimerState.durationMinutes
      })
        .then((result) => {
          setErrorMessage("");
          setSuccessMessage(
            result.conversations > 0
              ? `Timer expiré: ${result.conversations} garant(s) prévenu(s).`
              : "Timer expiré: aucun garant actif à prévenir."
          );
        })
        .catch((error: any) => {
          setErrorMessage(
            error?.message ?? "Timer expiré, mais l'alerte garant n'a pas pu être envoyée."
          );
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [quickTimerState]);

  const launchQuickTrip = async (params: {
    kind: Exclude<QuickActionKey, "simple_timer" | null>;
    toAddress: string;
    selectedContactIds: string[];
    mode: RouteMode;
    requireDestination: boolean;
  }) => {
    try {
      setQuickActionBusy(params.kind);
      setErrorMessage("");
      const currentAddress = await resolveCurrentAddressForQuickAction();
      let quickRoute: RouteResult | null = null;
      if (ROUTE_ESTIMATION_ENABLED && params.toAddress.trim().length > 0) {
        try {
          quickRoute = await fetchRoute(currentAddress, params.toAddress, params.mode);
        } catch {
          quickRoute = null;
        }
      }
      setFromAddress(currentAddress);
      setToAddress(params.toAddress);
      setSelectedContacts(params.selectedContactIds);
      setRouteModeAndPersist(params.mode);
      setRouteResult(quickRoute);
      setShowTransitNotice(false);
      setAdvancedModeOpen(false);

      launchSession({
        fromAddressOverride: currentAddress,
        toAddressOverride: params.toAddress,
        selectedContactIdsOverride: params.selectedContactIds,
        routeModeOverride: params.mode,
        routeResultOverride: quickRoute,
        autoOpenTracking: true,
        requireDestination: params.requireDestination
      });
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de lancer cette action rapide.");
    } finally {
      setQuickActionBusy(null);
    }
  };

  const handleQuickDepartNow = async () => {
    setQuickDepartDestination("");
    setShowQuickDepartModal(true);
  };

  const confirmQuickDepartNow = async () => {
    const destination = quickDepartDestination.trim();
    if (!destination) {
      setErrorMessage("Choisis une destination avant de démarrer.");
      return;
    }
    setShowQuickDepartModal(false);
    await launchQuickTrip({
      kind: "depart_now",
      toAddress: destination,
      selectedContactIds: getPrimaryContactIds(),
      mode: "walking",
      requireDestination: true
    });
  };

  const handleQuickGoHome = async () => {
    if (!homeFavorite?.address) {
      setErrorMessage("Aucune adresse Maison n'est configurée. Ouvre ton profil pour la configurer.");
      router.push("/account");
      return;
    }
    const fallbackMode = routeMode || "walking";
    await launchQuickTrip({
      kind: "go_home",
      toAddress: homeFavorite.address,
      selectedContactIds:
        getDefaultContactIdsForGroup("family").length > 0
          ? getDefaultContactIdsForGroup("family")
          : getPrimaryContactIds(),
      mode: fallbackMode,
      requireDestination: true
    });
  };

  const handleQuickFavoriteDestination = async (address: string) => {
    const fallbackMode = routeMode || "walking";
    setShowFavoriteLaunchModal(false);
    await launchQuickTrip({
      kind: "favorite_destination",
      toAddress: address,
      selectedContactIds: getPrimaryContactIds(),
      mode: fallbackMode,
      requireDestination: true
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-28 -left-24 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 170 }}
        keyboardShouldPersistTaps="always"
      >
        <Animated.View style={getRevealStyle(0)}>
          <View className="mt-4 flex-row items-center justify-between">
            <TouchableOpacity
              className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
              onPress={() => {
                try {
                  console.log("[setup/nav] back");
                  router.back();
                } catch (error) {
                  console.error("[setup/nav] back failed", error);
                }
              }}
            >
              <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                Retour
              </Text>
            </TouchableOpacity>
            <View className="rounded-full bg-[#111827] px-3 py-1">
              <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
                Nouveau trajet
              </Text>
            </View>
          </View>
          <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">
            Trace ton itineraire
          </Text>
          <Text className="mt-2 text-base text-[#475569]">
            Choisis tes adresses, puis previens tes proches en un geste.
          </Text>
          <View className="mt-4 flex-row flex-wrap gap-2">
            <View className="rounded-full bg-emerald-100 px-3 py-1">
              <Text className="text-xs font-semibold text-emerald-800">Depart rapide</Text>
            </View>
            <View className="rounded-full bg-amber-100 px-3 py-1">
              <Text className="text-xs font-semibold text-amber-800">Arrivee claire</Text>
            </View>
            <View className="rounded-full bg-slate-200 px-3 py-1">
              <Text className="text-xs font-semibold text-slate-700">Alertes actives</Text>
            </View>
          </View>

          <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Actions rapides</Text>
            <Text className="mt-2 text-sm text-slate-600">
              Lance en un geste. Le mode avancé reste disponible plus bas.
            </Text>

            <View className="mt-4 gap-2">
              <TouchableOpacity
                className={`rounded-2xl px-4 py-4 ${quickActionBusy === "depart_now" ? "bg-slate-300" : "bg-[#111827]"}`}
                onPress={() => {
                  handleQuickDepartNow().catch(() => {
                    // no-op
                  });
                }}
                disabled={saving || quickActionBusy !== null}
              >
                <Text className="text-center text-sm font-semibold text-white">🚶‍♂️ Je pars maintenant</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`rounded-2xl px-4 py-4 ${quickActionBusy === "go_home" ? "bg-slate-300" : "bg-emerald-600"}`}
                onPress={() => {
                  handleQuickGoHome().catch(() => {
                    // no-op
                  });
                }}
                disabled={saving || quickActionBusy !== null}
              >
                <Text className="text-center text-sm font-semibold text-white">🏠 Je rentre chez moi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                onPress={() => setShowQuickTimerModal(true)}
                disabled={saving || quickActionBusy !== null}
              >
                <Text className="text-center text-sm font-semibold text-slate-800">⏱ Timer simple</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                onPress={() => setShowFavoriteLaunchModal(true)}
                disabled={saving || quickActionBusy !== null}
              >
                <Text className="text-center text-sm font-semibold text-slate-800">⭐ Vers un lieu favori</Text>
              </TouchableOpacity>
            </View>

            <View className="mt-3 flex-row gap-2">
              <TouchableOpacity
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3"
                onPress={() => router.push("/favorites")}
              >
                <Text className="text-center text-xs font-semibold text-slate-700">
                  Configurer maison / favoris
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3"
                onPress={() => router.push("/friends")}
              >
                <Text className="text-center text-xs font-semibold text-slate-700">
                  Configurer garants / amis
                </Text>
              </TouchableOpacity>
            </View>

            {quickTimerState ? (
              <View className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
                <Text className="text-xs font-semibold uppercase tracking-widest text-cyan-700">
                  Timer actif
                </Text>
                <Text className="mt-1 text-sm text-cyan-900">
                  {quickTimerState.alertSent
                    ? "Timer terminé. Alerte envoyée aux garants."
                    : `Fin dans ${Math.max(
                        1,
                        Math.ceil((quickTimerState.endsAtMs - Date.now()) / 60000)
                      )} min`}
                </Text>
                {!quickTimerState.alertSent ? (
                  <TouchableOpacity
                    className="mt-3 rounded-xl bg-cyan-700 px-3 py-2"
                    onPress={() => {
                      setQuickTimerState(null);
                      setSuccessMessage("Timer confirmé et clôturé.");
                    }}
                  >
                    <Text className="text-center text-xs font-semibold text-white">
                      Je confirme, tout va bien
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>

          <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
            <TouchableOpacity
              className="flex-row items-center justify-between"
              onPress={() => setAdvancedModeOpen((prev) => !prev)}
            >
              <Text className="text-sm font-semibold text-slate-800">Mode avancé</Text>
              <Text className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {advancedModeOpen ? "Masquer" : "Afficher"}
              </Text>
            </TouchableOpacity>
            <Text className="mt-2 text-xs text-slate-500">
              Formulaire complet: adresses, mode, contacts, canaux et lancement manuel.
            </Text>
          </View>

          {advancedModeOpen ? (
            <View className="mt-5 flex-row gap-2">
              <TouchableOpacity
                className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2"
                onPress={swapAddresses}
                disabled={!fromAddress && !toAddress}
              >
                <Text className="text-center text-xs font-semibold uppercase tracking-widest text-slate-700">
                  Inverser
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2"
                onPress={resetForm}
              >
                <Text className="text-center text-xs font-semibold uppercase tracking-widest text-slate-700">
                  Réinitialiser
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Animated.View>

        {successMessage ? <FeedbackMessage kind="success" message={successMessage} /> : null}
        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}

        {advancedModeOpen ? (
          <>
        <Animated.View style={getRevealStyle(1)}>
          <View className="mt-8 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="h-3 w-3 rounded-full bg-emerald-500" />
                <Text className="ml-2 text-lg font-bold text-[#0F172A]">Depart</Text>
              </View>
              <TouchableOpacity
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1"
                onPress={useCurrentLocation}
              >
                <Text className="text-xs font-semibold text-emerald-700">
                  Position'actuelle
                </Text>
              </TouchableOpacity>
            </View>
            <Text className="mt-2 text-xs uppercase tracking-widest text-emerald-700">
              Point de depart
            </Text>

            <View className="mt-3 flex-row gap-2">
              <TouchableOpacity
                className={`flex-1 rounded-full px-4 py-2 ${
                  departureMode === "favorite"
                    ? "bg-emerald-600"
                    : "border border-emerald-200 bg-white"
                }`}
                onPress={() => setDepartureMode("favorite")}
              >
                <Text
                  className={`text-center text-xs font-semibold uppercase tracking-widest ${
                    departureMode === "favorite" ? "text-white" : "text-emerald-700"
                  }`}
                >
                  Favori
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 rounded-full px-4 py-2 ${
                  departureMode === "custom"
                    ? "bg-emerald-600"
                    : "border border-emerald-200 bg-white"
                }`}
                onPress={() => setDepartureMode("custom")}
              >
                <Text
                  className={`text-center text-xs font-semibold uppercase tracking-widest ${
                    departureMode === "custom" ? "text-white" : "text-emerald-700"
                  }`}
                >
                  Autre
                </Text>
              </TouchableOpacity>
            </View>

            {loadingFavorites ? (
              <View className="mt-3 flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#0f172a" />
                <Text className="text-xs text-slate-500">Chargement des favoris...</Text>
              </View>
            ) : null}

            {departureMode === "favorite" ? (
              <View className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                {favoriteAddresses.length === 0 ? (
                  <Text className="text-sm text-emerald-700">
                    Aucun favori. Ajoute-en dans Favoris.
                  </Text>
                ) : (
                  favoriteAddresses.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      className={`mt-2 rounded-2xl px-3 py-3 ${
                        fromAddress === item.address ? "bg-emerald-600" : "bg-white"
                      }`}
                      onPress={() => {
                        setFromAddress(item.address.trim());
                        setErrorMessage("");
                      }}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          fromAddress === item.address ? "text-white" : "text-emerald-900"
                        }`}
                      >
                        {item.label}
                      </Text>
                      <Text
                        className={`text-xs ${
                          fromAddress === item.address ? "text-emerald-100" : "text-emerald-700"
                        }`}
                      >
                        {item.address}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : (
              <AddressInput
                label="Adresse de depart"
                value={fromAddress}
                onChange={setFromAddress}
                onSelect={setFromAddress}
                inputTestID="setup-from-input"
              />
            )}
          </View>
        </Animated.View>

        <Animated.View style={getRevealStyle(2)}>
          <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="h-3 w-3 rounded-full bg-amber-500" />
                <Text className="ml-2 text-lg font-bold text-[#0F172A]">Destination</Text>
              </View>
              <View className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1">
                <Text className="text-xs font-semibold text-amber-700">Arrivee</Text>
              </View>
            </View>
            <Text className="mt-2 text-xs uppercase tracking-widest text-amber-700">
              Point d arrivée
            </Text>

            <View className="mt-3 flex-row gap-2">
              <TouchableOpacity
                className={`flex-1 rounded-full px-4 py-2 ${
                  destinationMode === "favorite"
                    ? "bg-amber-500"
                    : "border border-amber-200 bg-white"
                }`}
                onPress={() => setDestinationMode("favorite")}
              >
                <Text
                  className={`text-center text-xs font-semibold uppercase tracking-widest ${
                    destinationMode === "favorite" ? "text-white" : "text-amber-700"
                  }`}
                >
                  Favori
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 rounded-full px-4 py-2 ${
                  destinationMode === "custom"
                    ? "bg-amber-500"
                    : "border border-amber-200 bg-white"
                }`}
                onPress={() => setDestinationMode("custom")}
              >
                <Text
                  className={`text-center text-xs font-semibold uppercase tracking-widest ${
                    destinationMode === "custom" ? "text-white" : "text-amber-700"
                  }`}
                >
                  Autre
                </Text>
              </TouchableOpacity>
            </View>

            {destinationMode === "favorite" ? (
              <View className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3">
                {favoriteAddresses.length === 0 ? (
                  <Text className="text-sm text-amber-700">
                    Aucun favori. Ajoute-en dans Favoris.
                  </Text>
                ) : (
                  favoriteAddresses.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      className={`mt-2 rounded-2xl px-3 py-3 ${
                        toAddress === item.address ? "bg-amber-500" : "bg-white"
                      }`}
                      onPress={() => setToAddress(item.address)}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          toAddress === item.address ? "text-white" : "text-amber-900"
                        }`}
                      >
                        {item.label}
                      </Text>
                      <Text
                        className={`text-xs ${
                          toAddress === item.address ? "text-amber-100" : "text-amber-700"
                        }`}
                      >
                        {item.address}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : (
              <AddressInput
                label="Adresse d arrivée"
                value={toAddress}
                onChange={setToAddress}
                onSelect={setToAddress}
                inputTestID="setup-to-input"
              />
            )}

            {routeLoading ? (
              <View className="mt-4 flex-row items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
                <ActivityIndicator size="small" color="#0f172a" />
                <Text className="text-sm text-slate-500">Calcul du temps de trajet...</Text>
              </View>
            ) : !ROUTE_ESTIMATION_ENABLED ? (
              <View className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <Text className="text-xs font-semibold uppercase tracking-widest text-amber-700">
                  Estimation suspendue
                </Text>
                <Text className="mt-1 text-sm text-amber-800">
                  Le calcul de distance/temps est temporairement désactivé pour stabiliser l'app.
                </Text>
              </View>
            ) : routeResult ? (
              <View className="mt-4 rounded-3xl bg-[#111827] px-5 py-4 shadow-sm">
                <Text className="text-xs uppercase tracking-widest text-slate-300">
                  Temps estime
                </Text>
                <Text className="mt-2 text-3xl font-extrabold text-white">
                  {formatDurationLabel(routeResult.durationMinutes)}
                </Text>
                <Text className="mt-1 text-sm text-slate-300">
                  {routeResult.distanceKm} km
                </Text>
              </View>
            ) : canLaunch ? (
              <Text className="mt-4 text-xs font-semibold text-amber-700">
                Impossible de calculer le trajet. Vérifie les adresses.
              </Text>
            ) : null}
          </View>
        </Animated.View>

        <Animated.View style={getRevealStyle(3)}>
          <View className="mt-6 flex-row gap-3">
            <View className="flex-1 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Mode</Text>
            <View className="mt-3 gap-2">
              {[
                { key: "walking", label: "A pied" },
                { key: "driving", label: "Voiture" },
                { key: "transit", label: "Metro/Bus" }
              ].map((item) => {
                const active = routeMode === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    className={`rounded-2xl px-4 py-3 ${
                      active ? "bg-[#111827]" : "border border-slate-200 bg-white"
                    }`}
                    onPress={() => {
                      if (item.key === "transit" && !hasGoogleKey) {
                        setShowTransitNotice((prev) => !prev);
                        return;
                      }
                      setShowTransitNotice(false);
                      setRouteModeAndPersist(item.key as RouteMode);
                    }}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        active ? "text-white" : "text-slate-800"
                      }`}
                    >
                      {item.label}
                    </Text>
                    <Text className={active ? "text-xs text-slate-300" : "text-xs text-slate-500"}>
                      {item.key === "walking"
                        ? "Doucement"
                        : item.key === "driving"
                          ? "Le plus rapide"
                          : "Premium"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            </View>

            <View className="flex-1 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Arrivee</Text>
            <Text className="mt-3 text-2xl font-extrabold text-[#0F172A]">
              {formatTimeParts(expectedHour, expectedMinute) || "--:--"}
            </Text>
            <Text className="mt-1 text-xs text-slate-500">Optionnel</Text>
            <TouchableOpacity
              className="mt-3 rounded-2xl bg-[#111827] px-4 py-3"
              onPress={() => {
                const defaultHour = expectedHour ?? "00";
                const defaultMinute = expectedMinute ?? "00";
                setHourSlider(hourOptions.indexOf(defaultHour));
                setMinuteSlider(minuteOptions.indexOf(defaultMinute));
                setShowTimePicker(true);
              }}
            >
              <Text className="text-center text-xs font-semibold uppercase tracking-widest text-white">
                Definir l heure
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`mt-3 rounded-2xl px-4 py-3 ${
                routeResult ? "border border-slate-200 bg-white" : "bg-slate-200"
              }`}
              onPress={applyEtaToArrival}
              disabled={!routeResult}
            >
              <Text className="text-center text-xs font-semibold uppercase tracking-widest text-slate-700">
                Caler sur ETA
              </Text>
            </TouchableOpacity>
          </View>
          </View>
        </Animated.View>

        {showTransitNotice ? (
          <View className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Text className="text-sm font-semibold text-amber-800">
              Metro/Bus disponible uniquement en Premium.
            </Text>
            <Text className="mt-1 text-xs text-amber-700">
              Active Premium pour debloquer ce mode.
            </Text>
            <TouchableOpacity
              className="mt-3 rounded-lg bg-[#111827] px-4 py-2"
              onPress={() => {
                setShowTransitNotice(false);
                try {
                  console.log("[setup/nav] push /premium");
                  router.push("/premium");
                } catch (error) {
                  console.error("[setup/nav] push /premium failed", error);
                }
              }}
            >
              <Text className="text-center text-xs font-semibold text-white">
                Voir Premium
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Animated.View style={getRevealStyle(4)}>
          <View className="mt-8 flex-row items-end justify-between">
            <View>
              <Text className="text-2xl font-extrabold text-[#0F172A]">
                Contacts a prévenir
              </Text>
              <Text className="mt-1 text-sm text-[#475569]">
                Choisis qui recoit le message de depart.
              </Text>
            </View>
            <View className="rounded-full bg-[#111827] px-3 py-1">
              <Text className="text-xs font-semibold text-white">
                {selectedContactItems.length} selectionne(s)
              </Text>
            </View>
          </View>

          {selectedContactItems.length > 0 ? (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {selectedContactItems.map((contact) => (
                <TouchableOpacity
                  key={contact.id}
                  className="rounded-full bg-[#111827] px-3 py-2"
                  onPress={() => toggleContact(contact.id)}
                >
                  <Text className="text-xs font-semibold text-white">
                    {contact.name} · {getContactGroupMeta(resolveContactGroup(contact.contact_group)).label} ·{" "}
                    {formatPhone(contact.phone ?? "")} x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View className="mt-3 flex-row flex-wrap gap-2">
            {CONTACT_GROUPS.map((group) => (
              <View
                key={`summary-${group.key}`}
                className="rounded-full border border-slate-200 bg-white px-3 py-2"
              >
                <Text className="text-xs font-semibold text-slate-700">
                  {group.label}: {selectedGroupsSummary[group.key]}
                </Text>
              </View>
            ))}
          </View>

          <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-500">
              Type d'envoi aux proches
            </Text>
            <Text className="mt-2 text-sm text-slate-600">
              Choisis comment prévenir tes proches au depart.
            </Text>
            <TouchableOpacity
              className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              onPress={() => {
                try {
                  console.log("[setup/nav] push /contact-groups");
                  router.push("/contact-groups");
                } catch (error) {
                  console.error("[setup/nav] push /contact-groups failed", error);
                }
              }}
            >
              <Text className="text-center text-sm font-semibold text-slate-800">
                Gerer les profils de groupes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              onPress={() => {
                try {
                  console.log("[setup/nav] push /friends");
                  router.push("/friends");
                } catch (error) {
                  console.error("[setup/nav] push /friends failed", error);
                }
              }}
            >
              <Text className="text-center text-sm font-semibold text-slate-800">
                Gerer amis et garants
              </Text>
            </TouchableOpacity>
            <View className="mt-3 flex-row gap-2">
              <TouchableOpacity
                className={`flex-1 rounded-2xl px-3 py-2 ${
                  useGroupProfiles ? "bg-[#111827]" : "border border-slate-200 bg-white"
                }`}
                onPress={() => setUseGroupProfiles(true)}
              >
                <Text
                  className={`text-center text-xs font-semibold ${
                    useGroupProfiles ? "text-white" : "text-slate-700"
                  }`}
                >
                  Profils groupes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 rounded-2xl px-3 py-2 ${
                  !useGroupProfiles ? "bg-[#111827]" : "border border-slate-200 bg-white"
                }`}
                onPress={() => setUseGroupProfiles(false)}
              >
                <Text
                  className={`text-center text-xs font-semibold ${
                    !useGroupProfiles ? "text-white" : "text-slate-700"
                  }`}
                >
                  Mode global
                </Text>
              </TouchableOpacity>
            </View>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {([
                { key: "auto", label: "Auto" },
                { key: "app", label: "Application" },
                { key: "sms", label: "SMS" },
                { key: "email", label: "Email" },
                { key: "whatsapp", label: "WhatsApp" }
              ] as const).map((item) => {
                const active = notifyMode === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    className={`rounded-full px-4 py-2 ${
                      active ? "bg-[#111827]" : "border border-slate-200 bg-white"
                    }`}
                    onPress={() => setNotifyMode(item.key)}
                    disabled={useGroupProfiles}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        useGroupProfiles
                          ? "text-slate-400"
                          : active
                            ? "text-white"
                            : "text-slate-700"
                      }`}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {useGroupProfiles ? (
              <Text className="mt-2 text-xs text-slate-500">
                Le mode global est ignore: chaque contact utilise le profil de son groupe.
              </Text>
            ) : null}
          </View>

          <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-500">
              Ajouter un contact
            </Text>
            <TextInput
              className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
              placeholder="Nom"
              placeholderTextColor="#94a3b8"
              value={manualName}
              onChangeText={setManualName}
            />
            <TextInput
              className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
              placeholder="Numero"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              value={manualPhone}
              onChangeText={(text) => setManualPhone(formatPhone(text))}
            />
            <Text className="mt-3 text-xs uppercase tracking-widest text-slate-500">Groupe</Text>
            <View className="mt-2 flex-row gap-2">
              {CONTACT_GROUPS.map((group) => {
                const active = manualGroup === group.key;
                return (
                  <TouchableOpacity
                    key={`manual-group-${group.key}`}
                    className={`flex-1 rounded-2xl px-3 py-2 ${
                      active ? "bg-[#111827]" : "border border-slate-200 bg-white"
                    }`}
                    onPress={() => setManualGroup(group.key)}
                  >
                    <Text className={`text-center text-xs font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                      {group.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View className="mt-3 flex-row gap-2">
              <TouchableOpacity
                className={`flex-1 rounded-2xl px-4 py-3 ${
                  canAddManual ? "bg-[#111827]" : "bg-slate-300"
                }`}
                onPress={addManualContact}
                disabled={!canAddManual || saving}
              >
                <Text className="text-center text-xs font-semibold uppercase tracking-widest text-white">
                  Ajouter
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                onPress={importFromPhone}
                disabled={saving}
              >
                <Text className="text-center text-xs font-semibold uppercase tracking-widest text-slate-700">
                  Importer
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-500">
              Contacts favoris
            </Text>
            {favoriteContacts.length === 0 ? (
              <Text className="mt-3 text-sm text-slate-500">Aucun contact favori.</Text>
            ) : (
              favoriteContacts.map((contact) => {
                const active = selectedContacts.includes(contact.id);
                return (
                  <TouchableOpacity
                    key={contact.id}
                    className={`mt-2 flex-row items-center justify-between rounded-2xl px-3 py-3 ${
                      active ? "bg-[#111827]" : "bg-slate-50"
                    }`}
                    onPress={() => toggleContact(contact.id)}
                  >
                    <View>
                      <Text
                        className={`text-sm font-semibold ${
                          active ? "text-white" : "text-slate-800"
                        }`}
                      >
                        {contact.name}
                      </Text>
                      <Text
                        className={`text-xs ${
                          active ? "text-slate-200" : "text-slate-500"
                        }`}
                      >
                        {formatPhone(contact.phone ?? "")} ·{" "}
                        {getContactGroupMeta(resolveContactGroup(contact.contact_group)).label}
                      </Text>
                    </View>
                    <Text className={active ? "text-white" : "text-slate-500"}>
                      {active ? "Selectionne" : "Choisir"}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {showPhoneContacts ? (
            <View className="mt-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              {phoneContacts.slice(0, 8).map((contact, index) => (
                <TouchableOpacity
                  key={`phone-${index}`}
                  className="border-b border-amber-100 px-2 py-3"
                  onPress={() => selectPhoneContact(contact)}
                >
                  <Text className="text-sm text-amber-900">{contact.name}</Text>
                  <Text className="text-xs text-amber-700">
                    {formatPhone(contact.phoneNumbers?.[0]?.number ?? "")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </Animated.View>

        {simulatedMessages.length > 0 ? (
          <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Simulation d'envoi (DEV / TEST)
            </Text>
            <Text className="mt-2 text-sm text-slate-600">
              Envoi configure: {useGroupProfiles ? "Profils de groupes" : notifyModeLabel(notifyMode)}.
            </Text>
            <View className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              {simulatedMessages.map((item) => (
                <View key={item.id} className="border-b border-slate-200 py-2 last:border-b-0">
                  <Text className="text-sm font-semibold text-slate-800">
                    Message simule a {item.contactName} ({item.channel.toUpperCase()})
                  </Text>
                  <Text className="mt-1 text-sm text-slate-600">{item.body}</Text>
                  <Text className="mt-1 text-xs text-slate-500">
                    {formatPhone(item.phone ?? "")}
                  </Text>
                  {item.email ? (
                    <Text className="mt-1 text-xs text-slate-500">{item.email}</Text>
                  ) : null}
                </View>
              ))}
            </View>
            <Text className="mt-3 text-xs text-slate-500">
              {notificationStatus === "sent"
                ? "Notification locale declenchee."
                : notificationStatus === "blocked"
                  ? "Notifications refusees sur cet appareil."
                  : notificationStatus === "expo-go"
                    ? "Notifications locales non supportees dans Expo Go."
                    : "Notification locale non envoyée."}
            </Text>
            {notificationDetails ? (
              <Text className="mt-2 text-xs text-slate-500">{notificationDetails}</Text>
            ) : null}
          </View>
        ) : null}

        <Animated.View style={getRevealStyle(5)}>
          <TouchableOpacity
            testID="setup-launch-trip-button"
            className={`mt-8 rounded-3xl px-6 py-5 shadow-lg ${
              canLaunch ? "bg-[#111827]" : "bg-slate-300"
            } ${guideFirstTripActive ? "border-2 border-cyan-300" : ""}`}
            onPress={() => launchSession()}
            disabled={!canLaunch || saving}
          >
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xs uppercase tracking-widest text-slate-300">
                  Pret a partir
                </Text>
                <Text className="mt-1 text-xl font-extrabold text-white">
                  {saving ? "Lancement..." : "Lancer le trajet"}
                </Text>
              </View>
              <View className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
                <Text className="text-lg font-semibold text-white">GO</Text>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
          </>
        ) : null}
      </ScrollView>

      <Modal transparent visible={showQuickDepartModal} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full rounded-3xl bg-white p-5 shadow-lg">
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Je pars maintenant
            </Text>
            <Text className="mt-2 text-lg font-extrabold text-slate-900">
              Choisis d'abord ta destination
            </Text>
            <AddressInput
              label="Destination"
              value={quickDepartDestination}
              onChange={setQuickDepartDestination}
              onSelect={setQuickDepartDestination}
            />
            <View className="mt-4 flex-row gap-2">
              <TouchableOpacity
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                onPress={() => setShowQuickDepartModal(false)}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
                onPress={() => {
                  confirmQuickDepartNow().catch(() => {
                    // no-op
                  });
                }}
              >
                <Text className="text-center text-sm font-semibold text-white">Lancer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showGuardianRequiredModal} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full rounded-3xl bg-white p-5 shadow-lg">
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Proche requis
            </Text>
            <Text className="mt-2 text-lg font-extrabold text-slate-900">
              Choisis un contact ou un garant avant de partir
            </Text>
            {guardianModalLoading ? (
              <View className="mt-4 flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#0f172a" />
                <Text className="text-sm text-slate-600">Chargement des proches...</Text>
              </View>
            ) : (
              <>
                <Text className="mt-3 text-xs uppercase tracking-widest text-slate-500">
                  Contacts
                </Text>
                {favoriteContacts.length === 0 ? (
                  <Text className="mt-2 text-sm text-slate-600">
                    Aucun contact favori disponible.
                  </Text>
                ) : (
                  <View className="mt-2 gap-2">
                    {favoriteContacts.slice(0, 4).map((contact) => (
                      <TouchableOpacity
                        key={`guardian-contact-${contact.id}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        onPress={() => {
                          setSelectedContacts((prev) =>
                            prev.includes(contact.id) ? prev : [...prev, contact.id]
                          );
                          setShowGuardianRequiredModal(false);
                          setSuccessMessage(`Contact ajouté: ${contact.name}`);
                        }}
                      >
                        <Text className="text-sm font-semibold text-slate-800">{contact.name}</Text>
                        <Text className="mt-1 text-xs text-slate-500">
                          {getContactGroupMeta(resolveContactGroup(contact.contact_group)).label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
                  Amis (devenir garant)
                </Text>
                {friendCandidates.length === 0 ? (
                  <Text className="mt-2 text-sm text-slate-600">
                    Aucun ami disponible pour le moment.
                  </Text>
                ) : (
                  <View className="mt-2 gap-2">
                    {friendCandidates.slice(0, 4).map((friend) => (
                      <TouchableOpacity
                        key={`guardian-friend-${friend.id}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        onPress={async () => {
                          try {
                            await createGuardianAssignment(friend.friend_user_id);
                            setShowGuardianRequiredModal(false);
                            setSuccessMessage(`Garant ajouté: ${getFriendLabel(friend)}`);
                          } catch (error: any) {
                            setErrorMessage(
                              error?.message ?? "Impossible d'ajouter ce proche comme garant."
                            );
                          }
                        }}
                      >
                        <Text className="text-sm font-semibold text-slate-800">
                          {getFriendLabel(friend)}
                        </Text>
                        <Text className="mt-1 text-xs text-slate-500">Définir comme garant</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
            <View className="mt-4 flex-row gap-2">
              <TouchableOpacity
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                onPress={() => setShowGuardianRequiredModal(false)}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">Fermer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
                onPress={() => {
                  setShowGuardianRequiredModal(false);
                  router.push("/friends");
                }}
              >
                <Text className="text-center text-sm font-semibold text-white">Ouvrir Réseau proches</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showFavoriteLaunchModal} animationType="slide">
        <View className="flex-1 justify-end bg-black/30">
          <View className="rounded-t-3xl bg-white px-5 pb-8 pt-5">
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Vers un lieu favori
            </Text>
            <Text className="mt-1 text-lg font-extrabold text-slate-900">
              Choisis une destination
            </Text>
            {favoriteAddresses.length === 0 ? (
              <Text className="mt-3 text-sm text-slate-600">
                Aucun lieu favori configuré. Ajoute-en dans Favoris.
              </Text>
            ) : (
              <View className="mt-3 gap-2">
                {favoriteAddresses.map((item) => (
                  <TouchableOpacity
                    key={`quick-favorite-${item.id}`}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                    onPress={() => {
                      handleQuickFavoriteDestination(item.address).catch(() => {
                        // no-op
                      });
                    }}
                  >
                    <Text className="text-sm font-semibold text-slate-800">{item.label}</Text>
                    <Text className="mt-1 text-xs text-slate-500">{item.address}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity
              className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              onPress={() => setShowFavoriteLaunchModal(false)}
            >
              <Text className="text-center text-sm font-semibold text-slate-700">Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showQuickTimerModal} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full rounded-3xl bg-white p-5 shadow-lg">
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Timer simple
            </Text>
            <Text className="mt-2 text-lg font-extrabold text-slate-900">
              Choisis une durée
            </Text>
            <View className="mt-4 gap-2">
              {[
                { id: "30", label: "30 min", minutes: 30 },
                { id: "60", label: "1 h", minutes: 60 },
                { id: "120", label: "2 h", minutes: 120 }
              ].map((item) => (
                <TouchableOpacity
                  key={`quick-timer-${item.id}`}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  onPress={() => {
                    startQuickTimer(item.minutes).catch(() => {
                      // no-op
                    });
                  }}
                >
                  <Text className="text-center text-sm font-semibold text-slate-800">
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <View className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <Text className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Custom
                </Text>
                <TextInput
                  className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="Durée en minutes"
                  keyboardType="number-pad"
                  placeholderTextColor="#94a3b8"
                  value={customTimerMinutes}
                  onChangeText={setCustomTimerMinutes}
                />
                <TouchableOpacity
                  className="mt-2 rounded-xl bg-[#111827] px-3 py-2"
                  onPress={() => {
                    const minutes = Number(customTimerMinutes);
                    if (!Number.isFinite(minutes) || minutes <= 0) {
                      setErrorMessage("Durée custom invalide.");
                      return;
                    }
                    startQuickTimer(minutes).catch(() => {
                      // no-op
                    });
                  }}
                >
                  <Text className="text-center text-xs font-semibold text-white">Lancer custom</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity
              className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              onPress={() => setShowQuickTimerModal(false)}
            >
              <Text className="text-center text-sm font-semibold text-slate-700">Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showGuideHint && guideFirstTripActive} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full rounded-3xl border border-cyan-200 bg-[#F0FDFF] p-5 shadow-lg">
            <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-cyan-700">
              Assistant - Étape 5
            </Text>
            <Text className="mt-2 text-xl font-extrabold text-cyan-950">
              Lance ton premier trajet
            </Text>
            <Text className="mt-2 text-sm text-cyan-900/80">
              Renseigne depart + destination, puis appuie sur 'Lancer le trajet'. Des que c'est
              lance, le parcours de prise en main se termine automatiquement.
            </Text>
            <View className="mt-4 rounded-2xl border border-cyan-200 bg-white px-3 py-3">
              <Text className="text-xs font-semibold text-cyan-800">
                Le bouton de lancement est surligne en bleu pour te guider.
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

      <Modal transparent visible={showLaunchModal} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded-3xl bg-[#FFFDF9] p-6 shadow-lg">
            <Text className="text-2xl font-extrabold text-[#0F172A]">
              {lastSessionId ? "Trajet lance" : "Trajet prepare hors ligne"}
            </Text>
            <Text className="mt-2 text-sm text-slate-600">
              {lastSessionId
                ? "Tu peux suivre le trajet en temps reel."
                : "SafeBack synchronisera automatiquement le trajet et l'envoi des alertes des que la connexion revient."}
            </Text>
            <View className="mt-6 flex-row gap-3">
              <TouchableOpacity
                testID="setup-launch-modal-close-button"
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                onPress={() => setShowLaunchModal(false)}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">
                  Fermer
                </Text>
              </TouchableOpacity>
              {lastSessionId ? (
                <TouchableOpacity
                  testID="setup-open-tracking-button"
                  className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
                  onPress={() => {
                    setShowLaunchModal(false);
                    if (lastSessionId) {
                      try {
                        console.log("[setup/nav] push /tracking", {
                          sessionId: lastSessionId,
                          mode: routeMode
                        });
                        router.push({
                          pathname: "/tracking",
                          params: {
                            sessionId: lastSessionId,
                            mode: routeMode,
                            shareLiveLocation: shareLiveLocation ? "1" : "0",
                            autoDisableShareOnArrival: autoDisableShareOnArrival ? "1" : "0",
                            shareToken: lastShareToken ?? undefined
                          }
                        });
                      } catch (error) {
                        console.error("[setup/nav] push /tracking failed", error);
                      }
                    }
                  }}
                >
                  <Text className="text-center text-sm font-semibold text-white">
                    Suivre le trajet
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showTimePicker} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded-3xl bg-[#FFFDF9] p-6 shadow-lg">
            <Text className="text-xl font-extrabold text-[#0F172A]">Heure d arrivée</Text>
            <Text className="mt-1 text-sm text-slate-600">
              Fais glisser pour definir l heure et les minutes.
            </Text>

            <View className="mt-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] p-4">
              <Text className="text-center text-2xl font-extrabold text-[#0F172A]">
                {hourOptions[hourSlider]}:{minuteOptions[minuteSlider]}
              </Text>

              <Text className="mt-4 text-xs font-semibold text-slate-500">Heure</Text>
              <Slider
                value={hourSlider}
                minimumValue={0}
                maximumValue={hourOptions.length - 1}
                step={1}
                onValueChange={(value) => setHourSlider(value)}
                minimumTrackTintColor="#0f172a"
                maximumTrackTintColor="#e2e8f0"
                thumbTintColor="#0f172a"
              />

              <Text className="mt-4 text-xs font-semibold text-slate-500">Minutes</Text>
              <Slider
                value={minuteSlider}
                minimumValue={0}
                maximumValue={minuteOptions.length - 1}
                step={1}
                onValueChange={(value) => setMinuteSlider(value)}
                minimumTrackTintColor="#0f172a"
                maximumTrackTintColor="#e2e8f0"
                thumbTintColor="#0f172a"
              />
            </View>
            <View className="mt-5 flex-row gap-3">
              <TouchableOpacity
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                onPress={() => {
                  setExpectedHour(null);
                  setExpectedMinute(null);
                  setShowTimePicker(false);
                }}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">
                  Effacer
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
                onPress={() => {
                  setExpectedHour(hourOptions[hourSlider]);
                  setExpectedMinute(minuteOptions[minuteSlider]);
                  setShowTimePicker(false);
                }}
              >
                <Text className="text-center text-sm font-semibold text-white">Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
