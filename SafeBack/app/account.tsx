import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Link, useRouter } from "expo-router";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getProfile, upsertProfile } from "../src/lib/db";
import { supabase } from "../src/lib/supabase";

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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
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
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      }
    });
  }, []);

  useEffect(() => {
    if (!checking && !userEmail) {
      router.replace("/auth");
    }
  }, [checking, userEmail, router]);

  if (!checking && !userEmail) {
    return null;
  }

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
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur sauvegarde.");
    } finally {
      setSaving(false);
    }
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
              Parametres
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">
          Mon compte
        </Text>
        <Text className="mt-2 text-base text-[#475569]">
          Mets a jour tes informations personnelles et tes favoris.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Email</Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="ton@email.com"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Profil</Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Username"
            placeholderTextColor="#94a3b8"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Prenom"
            placeholderTextColor="#94a3b8"
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Nom"
            placeholderTextColor="#94a3b8"
            value={lastName}
            onChangeText={setLastName}
          />
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Numero"
            placeholderTextColor="#94a3b8"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(text) => setPhone(formatPhone(text))}
          />
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
          disabled={saving}
        >
          <Text className="text-center text-base font-semibold text-white">
            Enregistrer
          </Text>
        </TouchableOpacity>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">
            Raccourcis
          </Text>
          <Link href="/favorites" asChild>
            <TouchableOpacity className="mt-4 rounded-2xl bg-[#111827] px-4 py-3">
              <Text className="text-center text-sm font-semibold text-white">
                Modifier mes favoris
              </Text>
            </TouchableOpacity>
          </Link>
          <Link href="/trips" asChild>
            <TouchableOpacity className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Text className="text-center text-sm font-semibold text-slate-800">
                Mes trajets
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
