import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView
} from "react-native";
import Slider from "@react-native-community/slider";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
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
  const parts = [item.name, item.street, item.postalCode, item.city, item.region]
    .filter(Boolean)
    .join(" ");
  return parts;
}

function formatTimeParts(hours: string | null, minutes: string | null) {
  if (!hours || !minutes) return "";
  return `${hours}:${minutes}`;
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
      <Text className="text-sm font-semibold text-slate-800">{label}</Text>
      <TextInput
        className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
        placeholder="Commence a taper une adresse"
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
        <View className="mt-2 rounded-2xl border border-slate-200 bg-white">
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

  const canAddManual = useMemo(
    () => manualName.trim().length > 0 && manualPhone.trim().length > 0,
    [manualName, manualPhone]
  );
  const selectedContactItems = useMemo(
    () => favoriteContacts.filter((contact) => selectedContacts.includes(contact.id)),
    [favoriteContacts, selectedContacts]
  );

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
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
      setFromAddress(formatted);
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
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mt-4 flex-row items-center">
          <TouchableOpacity
            className="mr-3 rounded-full border border-slate-200 px-3 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-sm font-semibold text-slate-700">Retour</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-black">Nouveau trajet</Text>
        </View>
        <Text className="mt-2 text-sm text-slate-600">
          Choisis un favori ou saisis une nouvelle adresse.
        </Text>

        <Text className="mt-6 text-sm font-semibold text-slate-800">Depart</Text>
        {loadingFavorites ? (
          <View className="mt-2 flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#0f172a" />
            <Text className="text-xs text-slate-500">Chargement des favoris...</Text>
          </View>
        ) : null}
        <View className="mt-2 flex-row gap-2">
          <TouchableOpacity
            className={`flex-1 rounded-2xl px-3 py-3 ${
              departureMode === "favorite" ? "bg-black" : "border border-slate-200 bg-white"
            }`}
            onPress={() => setDepartureMode("favorite")}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                departureMode === "favorite" ? "text-white" : "text-slate-700"
              }`}
            >
              Favori
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 rounded-2xl px-3 py-3 ${
              departureMode === "custom" ? "bg-black" : "border border-slate-200 bg-white"
            }`}
            onPress={() => setDepartureMode("custom")}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                departureMode === "custom" ? "text-white" : "text-slate-700"
              }`}
            >
              Autre adresse
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-3">
          <TouchableOpacity
            className="rounded-2xl border border-slate-200 bg-white px-3 py-3"
            onPress={useCurrentLocation}
          >
            <Text className="text-center text-sm font-semibold text-slate-700">
              Utiliser la position actuelle
            </Text>
          </TouchableOpacity>
        </View>

        {departureMode === "favorite" ? (
          <View className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            {favoriteAddresses.length === 0 ? (
              <Text className="text-sm text-slate-500">
                Aucun favori. Ajoute-en dans Favoris.
              </Text>
            ) : (
              favoriteAddresses.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  className={`mt-2 rounded-2xl px-3 py-3 ${
                    fromAddress === item.address ? "bg-black" : "bg-slate-50"
                  }`}
                  onPress={() => setFromAddress(item.address)}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      fromAddress === item.address ? "text-white" : "text-slate-800"
                    }`}
                  >
                    {item.label}
                  </Text>
                  <Text
                    className={`text-xs ${
                      fromAddress === item.address ? "text-slate-200" : "text-slate-500"
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

        <Text className="mt-6 text-sm font-semibold text-slate-800">Destination</Text>
        <View className="mt-2 flex-row gap-2">
          <TouchableOpacity
            className={`flex-1 rounded-2xl px-3 py-3 ${
              destinationMode === "favorite" ? "bg-black" : "border border-slate-200 bg-white"
            }`}
            onPress={() => setDestinationMode("favorite")}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                destinationMode === "favorite" ? "text-white" : "text-slate-700"
              }`}
            >
              Favori
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 rounded-2xl px-3 py-3 ${
              destinationMode === "custom" ? "bg-black" : "border border-slate-200 bg-white"
            }`}
            onPress={() => setDestinationMode("custom")}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                destinationMode === "custom" ? "text-white" : "text-slate-700"
              }`}
            >
              Autre adresse
            </Text>
          </TouchableOpacity>
        </View>

        {destinationMode === "favorite" ? (
          <View className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            {favoriteAddresses.length === 0 ? (
              <Text className="text-sm text-slate-500">
                Aucun favori. Ajoute-en dans Favoris.
              </Text>
            ) : (
              favoriteAddresses.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  className={`mt-2 rounded-2xl px-3 py-3 ${
                    toAddress === item.address ? "bg-black" : "bg-slate-50"
                  }`}
                  onPress={() => setToAddress(item.address)}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      toAddress === item.address ? "text-white" : "text-slate-800"
                    }`}
                  >
                    {item.label}
                  </Text>
                  <Text
                    className={`text-xs ${
                      toAddress === item.address ? "text-slate-200" : "text-slate-500"
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
          <View className="mt-3 flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#0f172a" />
            <Text className="text-sm text-slate-500">Calcul du temps de trajet...</Text>
          </View>
        ) : routeResult ? (
          <View className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <Text className="text-sm font-semibold text-emerald-800">Temps estime</Text>
            <Text className="text-sm text-emerald-700">
              {routeResult.durationMinutes} min · {routeResult.distanceKm} km
            </Text>
          </View>
        ) : fromAddress.trim() && toAddress.trim() ? (
          <Text className="mt-3 text-xs text-amber-600">
            Impossible de calculer le trajet. Verifie les adresses.
          </Text>
        ) : null}

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Mode de trajet</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {[
              { key: "walking", label: "A pied" },
              { key: "driving", label: "Voiture" },
              { key: "transit", label: "Metro/Bus" }
            ].map((item) => {
              const active = routeMode === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  className={`rounded-full px-4 py-2 ${
                    active ? "bg-black" : "border border-slate-200 bg-white"
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
                  <Text className={active ? "text-white" : "text-slate-700"}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        {showTransitNotice ? (
          <View className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Text className="text-sm font-semibold text-amber-800">
              Metro/Bus disponible uniquement en Premium.
            </Text>
            <Text className="mt-1 text-xs text-amber-700">
              Active Premium pour debloquer ce mode.
            </Text>
            <TouchableOpacity
              className="mt-3 rounded-lg bg-black px-4 py-2"
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

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs font-semibold text-slate-500">Heure d arrivee (optionnel)</Text>
          <TouchableOpacity
            className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={() => {
              const defaultHour = expectedHour ?? "00";
              const defaultMinute = expectedMinute ?? "00";
              setHourSlider(hourOptions.indexOf(defaultHour));
              setMinuteSlider(minuteOptions.indexOf(defaultMinute));
              setShowTimePicker(true);
            }}
          >
            <Text className="text-base text-slate-800">
              {formatTimeParts(expectedHour, expectedMinute) || "Choisir une heure"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text className="mt-8 text-sm font-semibold text-slate-800">Contacts a prevenir</Text>

        {selectedContactItems.length > 0 ? (
          <View className="mt-3 flex-row flex-wrap gap-2">
            {selectedContactItems.map((contact) => (
              <TouchableOpacity
                key={contact.id}
                className="rounded-full bg-black px-3 py-2"
                onPress={() => toggleContact(contact.id)}
              >
                <Text className="text-xs font-semibold text-white">
                  {contact.name} · {formatPhone(contact.phone ?? "")} ✕
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View className="mt-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          {favoriteContacts.length === 0 ? (
            <Text className="text-sm text-slate-500">Aucun contact favori.</Text>
          ) : (
            favoriteContacts.map((contact) => {
              const active = selectedContacts.includes(contact.id);
              return (
                <TouchableOpacity
                  key={contact.id}
                  className={`mt-2 flex-row items-center justify-between rounded-2xl px-3 py-3 ${
                    active ? "bg-black" : "bg-slate-50"
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

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs font-semibold text-slate-500">Ajouter un contact</Text>
          <TextInput
            className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Nom"
            value={manualName}
            onChangeText={setManualName}
          />
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Numero"
            keyboardType="phone-pad"
            value={manualPhone}
            onChangeText={(text) => setManualPhone(formatPhone(text))}
          />
          <TouchableOpacity
            className={`mt-3 rounded-2xl px-4 py-3 ${
              canAddManual ? "bg-black" : "bg-slate-300"
            }`}
            onPress={addManualContact}
            disabled={!canAddManual || saving}
          >
            <Text className="text-center text-sm font-semibold text-white">
              Ajouter et selectionner
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={importFromPhone}
            disabled={saving}
          >
            <Text className="text-center text-sm font-semibold text-slate-800">
              Importer depuis le telephone
            </Text>
          </TouchableOpacity>
        </View>

        {showPhoneContacts ? (
          <View className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            {phoneContacts.slice(0, 8).map((contact, index) => (
              <TouchableOpacity
                key={`phone-${index}`}
                className="border-b border-slate-100 px-2 py-3"
                onPress={() => selectPhoneContact(contact)}
              >
                <Text className="text-sm text-slate-800">{contact.name}</Text>
                <Text className="text-xs text-slate-500">
                  {formatPhone(contact.phoneNumbers?.[0]?.number ?? "")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {errorMessage ? (
          <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text>
        ) : null}

        {simulatedMessages.length > 0 ? (
          <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <Text className="text-xs font-semibold text-slate-500">
              Simulation d envoi (DEV / TEST)
            </Text>
            <Text className="mt-2 text-sm text-slate-600">
              L app simule l envoi de messages et log l evenement.
            </Text>
            <View className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              {simulatedMessages.map((item) => (
                <View key={item.id} className="border-b border-slate-200 py-2 last:border-b-0">
                  <Text className="text-sm font-semibold text-slate-800">
                    ✅ Message simule a {item.contactName} ({item.channel.toUpperCase()})
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

        <TouchableOpacity
          className={`mt-8 rounded-2xl px-5 py-4 ${
            fromAddress.trim() && toAddress.trim() ? "bg-black" : "bg-slate-300"
          }`}
          onPress={launchSession}
          disabled={!fromAddress.trim() || !toAddress.trim() || saving}
        >
          <Text className="text-center text-base font-semibold text-white">
            {saving ? "Lancement..." : "Lancer le trajet"}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal transparent visible={showLaunchModal} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded-3xl bg-white p-6 shadow-sm">
            <Text className="text-xl font-bold text-black">Trajet lance</Text>
            <Text className="mt-2 text-sm text-slate-600">
              Tu peux suivre le trajet en temps reel.
            </Text>
            <View className="mt-6 flex-row gap-3">
              <TouchableOpacity
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3"
                onPress={() => setShowLaunchModal(false)}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">
                  Fermer
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-xl bg-black px-4 py-3"
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
          <View className="w-full rounded-3xl bg-white p-6 shadow-sm">
            <Text className="text-lg font-bold text-black">Heure d arrivee</Text>
            <Text className="mt-1 text-sm text-slate-600">
              Fais glisser pour definir l heure et les minutes.
            </Text>

            <View className="mt-4 rounded-2xl bg-slate-50 p-4">
              <Text className="text-center text-2xl font-bold text-black">
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
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3"
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
                className="flex-1 rounded-xl bg-black px-4 py-3"
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
