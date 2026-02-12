import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView
} from "react-native";
import Slider from "@react-native-community/slider";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Contacts from "expo-contacts";
import * as Location from "expo-location";
import Constants from "expo-constants";
import {
  createContact,
  createSessionWithContacts,
  listContacts,
  listFavoriteAddresses
} from "../src/lib/db";
import { supabase } from "../src/lib/supabase";
import { fetchRoute, type RouteMode, type RouteResult } from "../src/lib/routing";

const GEO_API = "https://data.geopf.fr/geocodage/completion/";

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
};

type FavoriteAddress = {
  id: string;
  label: string;
  address: string;
};

type SimulatedMessage = {
  id: string;
  contactName: string;
  channel: "sms" | "whatsapp" | "call";
  phone?: string;
  body: string;
  sentAt: string;
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

function AddressInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  const { label, value, onChange, onSelect } = props;
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
  const params = useLocalSearchParams<{ from?: string; to?: string; mode?: string }>();
  const revealValues = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0))
  ).current;
  const prefillDone = useRef(false);
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

  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [expectedHour, setExpectedHour] = useState<string | null>(null);
  const [expectedMinute, setExpectedMinute] = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [hourSlider, setHourSlider] = useState(0);
  const [minuteSlider, setMinuteSlider] = useState(0);

  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [simulatedMessages, setSimulatedMessages] = useState<SimulatedMessage[]>([]);
  const [notificationStatus, setNotificationStatus] = useState<
    "idle" | "sent" | "blocked" | "expo-go"
  >("idle");

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [showPhoneContacts, setShowPhoneContacts] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const hasGoogleKey = Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);

  const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
  const minuteOptions = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
  const canLaunch = Boolean(fromAddress.trim() && toAddress.trim());

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
    if (prefillDone.current) return;
    const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
    const toParam = Array.isArray(params.to) ? params.to[0] : params.to;
    const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
    if (!fromParam && !toParam && !modeParam) return;

    if (fromParam) {
      setFromAddress(fromParam);
      setDepartureMode("custom");
    }
    if (toParam) {
      setToAddress(toParam);
      setDestinationMode("custom");
    }
    if (modeParam) {
      const normalized = modeParam.toLowerCase();
      if (normalized === "walking" || normalized === "driving") {
        setRouteMode(normalized as RouteMode);
      }
      if (normalized === "transit") {
        if (hasGoogleKey) {
          setRouteMode("transit");
        } else {
          setShowTransitNotice(true);
        }
      }
    }
    prefillDone.current = true;
  }, [params.from, params.to, params.mode, hasGoogleKey]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoadingFavorites(true);
        const [addr, cont] = await Promise.all([listFavoriteAddresses(), listContacts()]);
        setFavoriteAddresses(addr as FavoriteAddress[]);
        setFavoriteContacts(cont as ContactItem[]);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      } finally {
        setLoadingFavorites(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!fromAddress.trim() || !toAddress.trim()) {
      setRouteResult(null);
      return;
    }
    if (routeMode === "transit" && !hasGoogleKey) {
      setRouteResult(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setRouteLoading(true);
        const data = await fetchRoute(fromAddress.trim(), toAddress.trim(), routeMode);
        if (!data) {
          console.log("[routing] Aucun itineraire", { fromAddress, toAddress, routeMode });
        }
        setRouteResult(data);
      } catch {
        console.log("[routing] Erreur calcul itineraire", { fromAddress, toAddress, routeMode });
        setRouteResult(null);
      } finally {
        setRouteLoading(false);
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [fromAddress, toAddress, routeMode, hasGoogleKey]);

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
    return null;
  }

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
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
          phone: manualPhone.trim()
        });
        setFavoriteContacts((prev) => [saved as ContactItem, ...prev]);
        setSelectedContacts((prev) => [...prev, saved.id]);
        setManualName("");
        setManualPhone("");
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur lors de l enregistrement.");
      } finally {
        setSaving(false);
      }
    })();
  };

  const importFromPhone = async () => {
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
          phone: formatPhone(number)
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

  const launchSession = () => {
    if (!fromAddress.trim() || !toAddress.trim()) return;
    (async () => {
      try {
        setSaving(true);
        setErrorMessage("");
        const expected = toExpectedArrivalIso(expectedHour, expectedMinute);
        const session = await createSessionWithContacts({
          from_address: fromAddress.trim(),
          to_address: toAddress.trim(),
          contactIds: selectedContacts,
          expected_arrival_time: expected
        });
        setLastSessionId(session.id);
        const time = formatNowTime();
        const arrivalText =
          formatTimeParts(expectedHour, expectedMinute) ||
          (routeResult ? `${routeResult.durationMinutes} min estimees` : "heure estimee inconnue");
        const messageBody = `Je demarre mon trajet a ${time} vers ${toAddress.trim()}. Arrivee prevue : ${arrivalText}.`;
        const messages: SimulatedMessage[] = selectedContactItems.map((contact, index) => ({
          id: `${session.id}-${contact.id}-${index}`,
          contactName: contact.name,
          channel: contact.channel,
          phone: contact.phone,
          body: messageBody,
          sentAt: time
        }));
        setSimulatedMessages(messages);

        if (messages.length > 0) {
          if (Constants.appOwnership === "expo") {
            setNotificationStatus("expo-go");
          } else {
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
                  title: "SafeBack (test)",
                  body: `Message simule envoye a ${messages.length} contact(s).`
                },
                trigger: null
              });
              setNotificationStatus("sent");
            } else {
              setNotificationStatus("blocked");
            }
          }
        }
        setShowLaunchModal(true);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur lors du lancement.");
      } finally {
        setSaving(false);
      }
    })();
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
        keyboardShouldPersistTaps={true}
      >
        <Animated.View style={getRevealStyle(0)}>
          <View className="mt-4 flex-row items-center justify-between">
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
                Reinitialiser
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

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
                  Position actuelle
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
              Point d arrivee
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
                label="Adresse d arrivee"
                value={toAddress}
                onChange={setToAddress}
                onSelect={setToAddress}
              />
            )}

            {routeLoading ? (
              <View className="mt-4 flex-row items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
                <ActivityIndicator size="small" color="#0f172a" />
                <Text className="text-sm text-slate-500">Calcul du temps de trajet...</Text>
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
                Impossible de calculer le trajet. Verifie les adresses.
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
                      setRouteMode(item.key as RouteMode);
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
                router.push("/premium");
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
                Contacts a prevenir
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
                    {contact.name} · {formatPhone(contact.phone ?? "")} x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

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
                        {formatPhone(contact.phone ?? "")}
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

        {errorMessage ? (
          <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text>
        ) : null}

        {simulatedMessages.length > 0 ? (
          <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Simulation d envoi (DEV / TEST)
            </Text>
            <Text className="mt-2 text-sm text-slate-600">
              L app simule l envoi de messages et log l evenement.
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
                    : "Notification locale non envoyee."}
            </Text>
          </View>
        ) : null}

        <Animated.View style={getRevealStyle(5)}>
          <TouchableOpacity
            className={`mt-8 rounded-3xl px-6 py-5 shadow-lg ${
              canLaunch ? "bg-[#111827]" : "bg-slate-300"
            }`}
            onPress={launchSession}
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
      </ScrollView>

      <Modal transparent visible={showLaunchModal} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded-3xl bg-[#FFFDF9] p-6 shadow-lg">
            <Text className="text-2xl font-extrabold text-[#0F172A]">Trajet lance</Text>
            <Text className="mt-2 text-sm text-slate-600">
              Tu peux suivre le trajet en temps reel.
            </Text>
            <View className="mt-6 flex-row gap-3">
              <TouchableOpacity
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                onPress={() => setShowLaunchModal(false)}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">
                  Fermer
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
                onPress={() => {
                  setShowLaunchModal(false);
                  if (lastSessionId) {
                    router.push({
                      pathname: "/tracking",
                      params: { sessionId: lastSessionId, mode: routeMode }
                    });
                  }
                }}
              >
                <Text className="text-center text-sm font-semibold text-white">
                  Suivre le trajet
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showTimePicker} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded-3xl bg-[#FFFDF9] p-6 shadow-lg">
            <Text className="text-xl font-extrabold text-[#0F172A]">Heure d arrivee</Text>
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
