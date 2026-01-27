import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect } from "expo-router";
import { Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Contacts from "expo-contacts";
import { createContact, createFavoriteAddress, createSessionWithContacts } from "../src/lib/db";
import { supabase } from "../src/lib/supabase";

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

function AddressInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  const { label, value, onChange, onSelect } = props;
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!value || value.trim().length < 3) {
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
  }, [value]);

  return (
    <View className="mt-4">
      <Text className="text-sm font-semibold text-slate-800">{label}</Text>
      <TextInput
        className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base"
        placeholder="Commence a taper une adresse"
        value={value}
        onChangeText={onChange}
      />
      {loading ? (
        <Text className="mt-2 text-xs text-slate-500">Recherche...</Text>
      ) : null}
      {suggestions.length > 0 ? (
        <View className="mt-2 rounded-xl border border-slate-200 bg-white">
          {suggestions.map((item) => (
            <TouchableOpacity
              key={item.id}
              className="border-b border-slate-100 px-4 py-3"
              onPress={() => onSelect(item.label)}
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
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [favoriteLabel, setFavoriteLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [showPhoneContacts, setShowPhoneContacts] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

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

  const canAddManual = useMemo(
    () => manualName.trim().length > 0 && manualPhone.trim().length > 0,
    [manualName, manualPhone]
  );

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

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
        setContacts((prev) => [
          ...prev,
          {
            id: saved.id,
            name: saved.name,
            channel: saved.channel,
            phone: saved.phone ?? undefined
          }
        ]);
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
          phone: number
        });
        setContacts((prev) => [
          ...prev,
          {
            id: saved.id,
            name: saved.name,
            channel: saved.channel,
            phone: saved.phone ?? undefined
          }
        ]);
        setShowPhoneContacts(false);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur lors de l enregistrement.");
      } finally {
        setSaving(false);
      }
    })();
  };

  const saveFavoriteAddress = () => {
    if (!favoriteLabel.trim() || !fromAddress.trim()) return;
    (async () => {
      try {
        setSaving(true);
        setErrorMessage("");
        await createFavoriteAddress({
          label: favoriteLabel.trim(),
          address: fromAddress.trim()
        });
        setFavoriteLabel("");
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur lors de l enregistrement.");
      } finally {
        setSaving(false);
      }
    })();
  };

  const launchSession = () => {
    if (!fromAddress.trim() || !toAddress.trim()) return;
    (async () => {
      try {
        setSaving(true);
        setErrorMessage("");
        await createSessionWithContacts({
          from_address: fromAddress.trim(),
          to_address: toAddress.trim(),
          contactIds: contacts.map((contact) => contact.id)
        });
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur lors du lancement.");
      } finally {
        setSaving(false);
      }
    })();
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar style="dark" />
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="mt-6 text-2xl font-bold text-black">Setup du retour</Text>
        <Text className="mt-2 text-sm text-slate-600">
          Renseigne le trajet et les contacts a prevenir.
        </Text>

        <AddressInput
          label="Adresse de depart"
          value={fromAddress}
          onChange={setFromAddress}
          onSelect={setFromAddress}
        />

        <View className="mt-2 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="text-xs font-semibold text-slate-500">Adresse favorite</Text>
          <TextInput
            className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base"
            placeholder="Nom (maison, bureau, pote)"
            value={favoriteLabel}
            onChangeText={setFavoriteLabel}
          />
          <TouchableOpacity
            className={`mt-3 rounded-xl px-4 py-3 ${
              favoriteLabel.trim() && fromAddress.trim() ? "bg-black" : "bg-slate-300"
            }`}
            onPress={saveFavoriteAddress}
            disabled={!favoriteLabel.trim() || !fromAddress.trim() || saving}
          >
            <Text className="text-center text-sm font-semibold text-white">
              Enregistrer comme adresse favorite
            </Text>
          </TouchableOpacity>
        </View>

        <AddressInput
          label="Adresse de destination"
          value={toAddress}
          onChange={setToAddress}
          onSelect={setToAddress}
        />

        <Text className="mt-8 text-sm font-semibold text-slate-800">
          Contacts a prevenir
        </Text>

        <View className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="text-xs font-semibold text-slate-500">Ajouter manuellement</Text>
          <TextInput
            className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base"
            placeholder="Nom"
            value={manualName}
            onChangeText={setManualName}
          />
          <TextInput
            className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base"
            placeholder="Numero"
            keyboardType="phone-pad"
            value={manualPhone}
            onChangeText={setManualPhone}
          />
          <TouchableOpacity
            className={`mt-3 rounded-xl px-4 py-3 ${
              canAddManual ? "bg-black" : "bg-slate-300"
            }`}
            onPress={addManualContact}
            disabled={!canAddManual || saving}
          >
            <Text className="text-center text-sm font-semibold text-white">
              Ajouter le contact
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
          onPress={importFromPhone}
          disabled={saving}
        >
          <Text className="text-center text-sm font-semibold text-slate-800">
            Importer depuis les contacts du telephone
          </Text>
        </TouchableOpacity>

        {showPhoneContacts ? (
          <View className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
            {phoneContacts.slice(0, 8).map((contact) => (
              <TouchableOpacity
                key={contact.id}
                className="border-b border-slate-100 px-2 py-3"
                onPress={() => selectPhoneContact(contact)}
              >
                <Text className="text-sm text-slate-800">{contact.name}</Text>
                <Text className="text-xs text-slate-500">
                  {contact.phoneNumbers?.[0]?.number ?? "Sans numero"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="text-xs font-semibold text-slate-500">Selection</Text>
          {contacts.length === 0 ? (
            <Text className="mt-2 text-sm text-slate-500">Aucun contact ajoute.</Text>
          ) : (
            contacts.map((contact) => (
              <View
                key={contact.id}
                className="mt-2 flex-row items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
              >
                <View>
                  <Text className="text-sm font-semibold text-slate-800">
                    {contact.name}
                  </Text>
                  <Text className="text-xs text-slate-500">
                    {contact.phone} · {contact.channel.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {errorMessage ? (
          <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text>
        ) : null}

        <TouchableOpacity
          className={`mt-8 rounded-2xl px-5 py-4 ${
            fromAddress.trim() && toAddress.trim() ? "bg-black" : "bg-slate-300"
          }`}
          onPress={launchSession}
          disabled={!fromAddress.trim() || !toAddress.trim() || saving}
        >
          <Text className="text-center text-base font-semibold text-white">
            Lancer le retour
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
