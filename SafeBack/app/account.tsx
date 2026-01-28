import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Link, Redirect, useRouter } from "expo-router";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
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

  if (!checking && !userEmail) {
    return <Redirect href="/auth" />;
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
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      <View className="flex-1 px-6 pt-16">
        <View className="flex-row items-center">
          <TouchableOpacity
            className="mr-3 rounded-full border border-slate-200 px-3 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-sm font-semibold text-slate-700">Retour</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-black">Mon compte</Text>
        </View>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Email</Text>
          <TextInput
            className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Profil</Text>
          <TextInput
            className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Prenom"
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Nom"
            value={lastName}
            onChangeText={setLastName}
          />
          <TextInput
            className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Numero"
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
          className={`mt-6 rounded-2xl px-5 py-4 ${
            saving ? "bg-slate-300" : "bg-black"
          }`}
          onPress={saveProfile}
          disabled={saving}
        >
          <Text className="text-center text-base font-semibold text-white">
            Enregistrer les modifications
          </Text>
        </TouchableOpacity>

        <View className="mt-4 rounded-2xl bg-black px-4 py-3">
          <Link href="/favorites" className="text-center text-sm font-semibold text-white">
            Modifier mes favoris
          </Link>
        </View>
        <View className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <Link href="/trips" className="text-center text-sm font-semibold text-slate-800">
            Mes trajets
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
