import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Contacts from "expo-contacts";
import {
  createContact,
  createFavoriteAddress,
  deleteContact,
  deleteFavoriteAddress,
  listContacts,
  listFavoriteAddresses
} from "../src/lib/db";
import { supabase } from "../src/lib/supabase";

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
      <Text className="text-xs font-semibold text-slate-500">{label}</Text>
      <TextInput
        className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
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
        <View className="mt-2 rounded-xl border border-slate-200 bg-white">
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
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [showPhoneContacts, setShowPhoneContacts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
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
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  const addContact = async () => {
    if (!contactName.trim() || !contactPhone.trim()) return;
    try {
      setSaving(true);
      setErrorMessage("");
      const saved = await createContact({
        name: contactName.trim(),
        phone: formatPhone(contactPhone.trim()),
        channel: "sms"
      });
      setContacts((prev) => [saved, ...prev]);
      setContactName("");
      setContactPhone("");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur sauvegarde.");
    } finally {
      setSaving(false);
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
    setShowPhoneContacts(false);
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
            onPress={() => router.replace("/")}
          >
            <Text className="text-sm font-semibold text-slate-700">Accueil</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-black">Favoris</Text>
        </View>
        <Text className="mt-2 text-sm text-slate-600">
          Ajoute ici les lieux et contacts que tu utilises souvent.
        </Text>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-sm font-semibold text-slate-800">Lieux favoris</Text>
          <TextInput
            className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Nom (maison, bureau)"
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
            className={`mt-3 rounded-xl px-4 py-3 ${
              addrLabel.trim() && addrValue.trim() ? "bg-black" : "bg-slate-300"
            }`}
            onPress={addAddress}
            disabled={!addrLabel.trim() || !addrValue.trim() || saving}
          >
            <Text className="text-center text-sm font-semibold text-white">
              Ajouter le lieu
            </Text>
          </TouchableOpacity>

          {addresses.length > 0 ? (
            <View className="mt-4">
              {addresses.map((item) => (
                <View
                  key={item.id}
                  className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-sm font-semibold text-slate-800">{item.label}</Text>
                      <Text className="text-xs text-slate-500">{item.address}</Text>
                    </View>
                    <TouchableOpacity
                      className="h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white"
                      onPress={async () => {
                        try {
                          await deleteFavoriteAddress(item.id);
                          setAddresses((prev) => prev.filter((addr) => addr.id !== item.id));
                        } catch (error: any) {
                          setErrorMessage(error?.message ?? "Erreur suppression.");
                        }
                      }}
                    >
                      <Text className="text-sm font-semibold text-slate-700">✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-sm font-semibold text-slate-800">Contacts favoris</Text>
          <TextInput
            className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Nom"
            value={contactName}
            onChangeText={setContactName}
          />
          <TextInput
            className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Numero"
            keyboardType="phone-pad"
            value={contactPhone}
            onChangeText={(text) => setContactPhone(formatPhone(text))}
          />
          <TouchableOpacity
            className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            onPress={importFromPhone}
            disabled={saving}
          >
            <Text className="text-center text-sm font-semibold text-slate-800">
              Choisir dans les contacts du telephone
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`mt-3 rounded-xl px-4 py-3 ${
              contactName.trim() && contactPhone.trim() ? "bg-black" : "bg-slate-300"
            }`}
            onPress={addContact}
            disabled={!contactName.trim() || !contactPhone.trim() || saving}
          >
            <Text className="text-center text-sm font-semibold text-white">
              Ajouter le contact
            </Text>
          </TouchableOpacity>

          {showPhoneContacts ? (
            <View className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
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

          {contacts.length > 0 ? (
            <View className="mt-4">
              {contacts.map((item) => (
                <View
                  key={item.id}
                  className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-sm font-semibold text-slate-800">{item.name}</Text>
                      <Text className="text-xs text-slate-500">
                        {formatPhone(item.phone ?? "")}
                      </Text>
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
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {errorMessage ? (
          <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
