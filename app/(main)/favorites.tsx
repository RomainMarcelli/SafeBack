import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Contacts from "expo-contacts";
import {
  createContact,
  createFavoriteAddress,
  deleteContact,
  deleteFavoriteAddress,
  listContacts,
  listFavoriteAddresses
} from "../../src/lib/core/db";
import { CONTACT_GROUPS, resolveContactGroup, type ContactGroupKey } from "../../src/lib/contacts/contactGroups";
import {
  getOnboardingAssistantSession,
  setOnboardingAssistantStep,
  type OnboardingStepId
} from "../../src/lib/home/onboarding";
import { supabase } from "../../src/lib/core/supabase";

const GEO_API = "https://data.geopf.fr/geocodage/completion/";

type AddressSuggestion = {
  id: string;
  label: string;
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
      return {
        id: item?.id ?? item?.properties?.id ?? String(index),
        label
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
    <View className="mt-3">
      <Text className="text-xs uppercase tracking-widest text-slate-500">{label}</Text>
      <TextInput
        className="mt-2 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
        placeholder="Commence a taper une adresse"
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

export default function FavoritesScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [addrLabel, setAddrLabel] = useState("");
  const [addrValue, setAddrValue] = useState("");
  const [addrQuery, setAddrQuery] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactChannel, setContactChannel] = useState<"sms" | "whatsapp" | "call">("sms");
  const [contactGroup, setContactGroup] = useState<ContactGroupKey>("friends");
  const [contactQuery, setContactQuery] = useState("");
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [showPhoneContacts, setShowPhoneContacts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [guideStep, setGuideStep] = useState<OnboardingStepId | null>(null);
  const [showGuideHint, setShowGuideHint] = useState(false);
  const [guideTransitioning, setGuideTransitioning] = useState(false);

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

  useEffect(() => {
    if (!checking && !userId) {
      router.replace("/auth");
    }
  }, [checking, userId, router]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const [addr, cont] = await Promise.all([listFavoriteAddresses(), listContacts()]);
        setAddresses(addr);
        setContacts(cont);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const assistant = await getOnboardingAssistantSession(userId);
      if (!assistant.active) {
        setGuideStep(null);
        setShowGuideHint(false);
        return;
      }
      if (assistant.stepId === "favorites" || assistant.stepId === "contacts") {
        setGuideStep(assistant.stepId);
        setShowGuideHint(true);
        return;
      }
      setGuideStep(null);
      setShowGuideHint(false);
    })();
  }, [userId]);

  if (!checking && !userId) {
    return null;
  }

  const addAddress = async () => {
    if (!addrLabel.trim() || !addrValue.trim()) return;
    try {
      setSaving(true);
      setErrorMessage("");
      const saved = await createFavoriteAddress({
        label: addrLabel.trim(),
        address: addrValue.trim()
      });
      setAddresses((prev) => [saved, ...prev]);
      setAddrLabel("");
      setAddrValue("");
      if (guideStep === "favorites" && userId && !guideTransitioning) {
        // Le parcours guidé n'avance que quand l'utilisateur ajoute réellement une nouvelle adresse.
        setGuideTransitioning(true);
        if (contacts.length > 0) {
          await setOnboardingAssistantStep(userId, "safety_review");
          setGuideStep("safety_review");
          setShowGuideHint(false);
          router.push("/safety-alerts");
        } else {
          await setOnboardingAssistantStep(userId, "contacts");
          setGuideStep("contacts");
          setShowGuideHint(true);
        }
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur sauvegarde.");
    } finally {
      setSaving(false);
      setGuideTransitioning(false);
    }
  };

  const addContact = async () => {
    if (!contactName.trim()) return;
    if (!contactPhone.trim() && !contactEmail.trim()) return;
    try {
      setSaving(true);
      setErrorMessage("");
      const saved = await createContact({
        name: contactName.trim(),
        phone: contactPhone.trim() ? formatPhone(contactPhone.trim()) : undefined,
        email: contactEmail.trim() || null,
        channel: contactChannel,
        contact_group: contactGroup
      });
      setContacts((prev) => [saved, ...prev]);
      setContactName("");
      setContactPhone("");
      setContactEmail("");
      setContactChannel("sms");
      setContactGroup("friends");
      if (guideStep === "contacts" && userId && !guideTransitioning) {
        // Même principe : passage à l'étape suivante uniquement après ajout d'un contact durant cette session.
        setGuideTransitioning(true);
        await setOnboardingAssistantStep(userId, "safety_review");
        setGuideStep("safety_review");
        setShowGuideHint(false);
        router.push("/safety-alerts");
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur sauvegarde.");
    } finally {
      setSaving(false);
      setGuideTransitioning(false);
    }
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
    setContactName(contact.name ?? "");
    setContactPhone(formatPhone(number));
    setContactChannel("sms");
    setContactGroup("friends");
    setShowPhoneContacts(false);
  };

  const filteredAddresses = useMemo(() => {
    const query = addrQuery.trim().toLowerCase();
    if (!query) return addresses;
    return addresses.filter((item) => {
      const label = String(item.label ?? "").toLowerCase();
      const address = String(item.address ?? "").toLowerCase();
      return label.includes(query) || address.includes(query);
    });
  }, [addresses, addrQuery]);

  const filteredContacts = useMemo(() => {
    const query = contactQuery.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((item) => {
      const name = String(item.name ?? "").toLowerCase();
      const phone = String(item.phone ?? "").toLowerCase();
      const email = String(item.email ?? "").toLowerCase();
      const group = resolveContactGroup(item.contact_group);
      const groupLabel = CONTACT_GROUPS.find((entry) => entry.key === group)?.label.toLowerCase() ?? "";
      return (
        name.includes(query) ||
        phone.includes(query) ||
        email.includes(query) ||
        groupLabel.includes(query)
      );
    });
  }, [contacts, contactQuery]);

  const openMaps = async (address: string) => {
    if (!address.trim()) return;
    const query = encodeURIComponent(address);
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  };

  const openPhone = async (phone: string, action: "tel" | "sms") => {
    if (!phone.trim()) return;
    const clean = phone.replace(/\s/g, "");
    await Linking.openURL(`${action}:${clean}`);
  };

  const openMail = async (email: string) => {
    if (!email.trim()) return;
    await Linking.openURL(`mailto:${email.trim()}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 48 }}
        keyboardShouldPersistTaps="always"
      >
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.replace("/")}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">
              Accueil
            </Text>
          </TouchableOpacity>
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
              Favoris
            </Text>
          </View>
        </View>
        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Favoris</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Ajoute ici les lieux et contacts que tu utilises souvent.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Lieux favoris</Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
            placeholder="Rechercher un lieu"
            placeholderTextColor="#94a3b8"
            value={addrQuery}
            onChangeText={setAddrQuery}
          />
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Nom (maison, bureau)"
            placeholderTextColor="#94a3b8"
            value={addrLabel}
            onChangeText={setAddrLabel}
          />
          <AddressInput
            label="Adresse"
            value={addrValue}
            onChange={setAddrValue}
            onSelect={setAddrValue}
          />
          <TouchableOpacity
            className={`mt-4 rounded-2xl px-4 py-3 ${
              addrLabel.trim() && addrValue.trim() ? "bg-[#111827]" : "bg-slate-300"
            }`}
            onPress={addAddress}
            disabled={!addrLabel.trim() || !addrValue.trim() || saving}
          >
            <Text className="text-center text-sm font-semibold text-white">
              Ajouter le lieu
            </Text>
          </TouchableOpacity>

          {filteredAddresses.length > 0 ? (
            <View className="mt-4">
              {filteredAddresses.map((item) => (
                <View
                  key={item.id}
                  className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-sm font-semibold text-emerald-900">
                        {item.label}
                      </Text>
                      <Text className="text-xs text-emerald-700">{item.address}</Text>
                    </View>
                    <TouchableOpacity
                      className="h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-white"
                      onPress={async () => {
                        try {
                          await deleteFavoriteAddress(item.id);
                          setAddresses((prev) => prev.filter((addr) => addr.id !== item.id));
                        } catch (error: any) {
                          setErrorMessage(error?.message ?? "Erreur suppression.");
                        }
                      }}
                    >
                      <Text className="text-sm font-semibold text-emerald-700">✕</Text>
                    </TouchableOpacity>
                  </View>
                  <View className="mt-3 flex-row gap-2">
                    <TouchableOpacity
                      className="flex-1 rounded-2xl bg-emerald-600 px-3 py-2"
                      onPress={() =>
                        router.push({
                          pathname: "/setup",
                          params: { from: item.address }
                        })
                      }
                    >
                      <Text className="text-center text-xs font-semibold text-white">
                        Depart
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 rounded-2xl border border-emerald-200 bg-white px-3 py-2"
                      onPress={() =>
                        router.push({
                          pathname: "/setup",
                          params: { to: item.address }
                        })
                      }
                    >
                      <Text className="text-center text-xs font-semibold text-emerald-700">
                        Arrivee
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="rounded-2xl border border-emerald-200 bg-white px-3 py-2"
                      onPress={() => openMaps(item.address)}
                    >
                      <Text className="text-center text-xs font-semibold text-emerald-700">
                        Maps
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : addresses.length > 0 && addrQuery.trim() ? (
            <Text className="mt-4 text-sm text-emerald-700">Aucun lieu ne correspond.</Text>
          ) : null}
        </View>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Contacts favoris</Text>
          <TouchableOpacity
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={() => router.push("/contact-groups")}
          >
            <Text className="text-center text-sm font-semibold text-slate-800">
              Gerer les groupes (Famille / Collegues / Amis)
            </Text>
          </TouchableOpacity>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
            placeholder="Rechercher un contact"
            placeholderTextColor="#94a3b8"
            value={contactQuery}
            onChangeText={setContactQuery}
          />
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Nom"
            placeholderTextColor="#94a3b8"
            value={contactName}
            onChangeText={setContactName}
          />
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Numero"
            placeholderTextColor="#94a3b8"
            keyboardType="phone-pad"
            value={contactPhone}
            onChangeText={(text) => setContactPhone(formatPhone(text))}
          />
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Email (optionnel)"
            placeholderTextColor="#94a3b8"
            keyboardType="email-address"
            autoCapitalize="none"
            value={contactEmail}
            onChangeText={setContactEmail}
          />
          <View className="mt-3 flex-row gap-2">
            {([
              { key: "sms", label: "SMS" },
              { key: "whatsapp", label: "WhatsApp" },
              { key: "call", label: "Appel" }
            ] as const).map((item) => {
              const active = contactChannel === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  className={`flex-1 rounded-2xl px-3 py-2 ${
                    active ? "bg-[#111827]" : "border border-slate-200 bg-white"
                  }`}
                  onPress={() => setContactChannel(item.key)}
                >
                  <Text className={`text-center text-xs font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text className="mt-3 text-xs uppercase tracking-widest text-slate-500">Groupe</Text>
          <View className="mt-2 flex-row gap-2">
            {CONTACT_GROUPS.map((group) => {
              const active = contactGroup === group.key;
              return (
                <TouchableOpacity
                  key={`group-${group.key}`}
                  className={`flex-1 rounded-2xl px-3 py-2 ${
                    active ? "bg-[#111827]" : "border border-slate-200 bg-white"
                  }`}
                  onPress={() => setContactGroup(group.key)}
                >
                  <Text className={`text-center text-xs font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                    {group.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={importFromPhone}
            disabled={saving}
          >
            <Text className="text-center text-sm font-semibold text-slate-800">
              Choisir dans les contacts du telephone
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`mt-3 rounded-2xl px-4 py-3 ${
              contactName.trim() && (contactPhone.trim() || contactEmail.trim()) ? "bg-[#111827]" : "bg-slate-300"
            }`}
            onPress={addContact}
            disabled={!contactName.trim() || (!contactPhone.trim() && !contactEmail.trim()) || saving}
          >
            <Text className="text-center text-sm font-semibold text-white">
              Ajouter le contact
            </Text>
          </TouchableOpacity>

          {showPhoneContacts ? (
            <View className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
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

          {filteredContacts.length > 0 ? (
            <View className="mt-4">
              {filteredContacts.map((item) => (
                <View
                  key={item.id}
                  className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-sm font-semibold text-slate-800">{item.name}</Text>
                      <Text className="mt-1 text-xs font-semibold text-slate-600">
                        {
                          CONTACT_GROUPS.find(
                            (entry) => entry.key === resolveContactGroup(item.contact_group)
                          )?.label
                        }
                      </Text>
                      <Text className="text-xs text-slate-500">
                        {formatPhone(item.phone ?? "")}
                      </Text>
                      {item.email ? (
                        <Text className="text-xs text-slate-500">{item.email}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      className="h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white"
                      onPress={async () => {
                        try {
                          await deleteContact(item.id);
                          setContacts((prev) => prev.filter((contact) => contact.id !== item.id));
                        } catch (error: any) {
                          setErrorMessage(error?.message ?? "Erreur suppression.");
                        }
                      }}
                    >
                      <Text className="text-sm font-semibold text-slate-700">✕</Text>
                    </TouchableOpacity>
                  </View>
                  <View className="mt-3 flex-row gap-2">
                    <TouchableOpacity
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2"
                      onPress={() => openPhone(item.phone ?? "", "tel")}
                    >
                      <Text className="text-center text-xs font-semibold text-slate-700">
                        Appeler
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 rounded-2xl bg-[#111827] px-3 py-2"
                      onPress={() => openPhone(item.phone ?? "", "sms")}
                    >
                      <Text className="text-center text-xs font-semibold text-white">SMS</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2"
                      onPress={() => openMail(item.email ?? "")}
                    >
                      <Text className="text-center text-xs font-semibold text-slate-700">Mail</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : contacts.length > 0 && contactQuery.trim() ? (
            <Text className="mt-4 text-sm text-slate-600">Aucun contact ne correspond.</Text>
          ) : null}
        </View>

        {errorMessage ? (
          <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text>
        ) : null}
      </ScrollView>

      <Modal transparent visible={showGuideHint && (guideStep === "favorites" || guideStep === "contacts")} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full rounded-3xl border border-cyan-200 bg-[#F0FDFF] p-5 shadow-lg">
            <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-cyan-700">
              Assistant - {guideStep === "favorites" ? "Etape 2" : "Etape 3"}
            </Text>
            <Text className="mt-2 text-xl font-extrabold text-cyan-950">
              {guideStep === "favorites" ? "Ajoute une adresse favorite" : "Ajoute un proche de confiance"}
            </Text>
            <Text className="mt-2 text-sm text-cyan-900/80">
              {guideStep === "favorites"
                ? "Remplis Nom + Adresse puis touche 'Ajouter le lieu'."
                : "Renseigne Nom + Numero (ou email) puis touche 'Ajouter le contact'."}
            </Text>
            <View className="mt-4 rounded-2xl border border-cyan-200 bg-white px-3 py-3">
              <Text className="text-xs font-semibold text-cyan-800">
                {guideStep === "favorites"
                  ? "Des qu au moins une adresse est enregistree, on passe automatiquement a la suite."
                  : "Des qu au moins un contact est enregistre, on passe automatiquement a la suite."}
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
