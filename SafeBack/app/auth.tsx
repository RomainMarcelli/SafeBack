import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { upsertProfile } from "../src/lib/db";
import { supabase } from "../src/lib/supabase";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("33")) {
    const rest = digits.slice(2);
    return `+33 ${rest.replace(/(\d{2})(?=\d)/g, "$1 ")}`.trim();
  }
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

export default function AuthScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
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

  useEffect(() => {
    if (!checking && userId) {
      router.replace("/");
    }
  }, [checking, userId, router]);

  if (!checking && userId) {
    return null;
  }

  const submit = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        await upsertProfile({
          user_id: data.user?.id,
          username: username.trim() || null,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          phone: phone.trim() || null
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (username.trim() || phone.trim() || firstName.trim() || lastName.trim()) {
          await upsertProfile({
            username: username.trim() || null,
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
            phone: phone.trim() || null
          });
        }
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur auth.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-28 -left-24 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 48 }}
        keyboardShouldPersistTaps={true}
      >
        <View className="mt-6 flex-row items-center justify-between">
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
              SafeBack
            </Text>
          </View>
          <View className="rounded-full border border-[#E7E0D7] bg-white/90 px-3 py-1">
            <Text className="text-xs font-semibold text-slate-700">
              {mode === "signup" ? "Inscription" : "Connexion"}
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">
          {mode === "signup" ? "Cree ton compte" : "Connexion"}
        </Text>
        <Text className="mt-2 text-base text-[#475569]">
          Garde tes proches informes en toute securite.
        </Text>

        <View className="mt-8 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Email</Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="prenom@email.com"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
            Mot de passe
          </Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="********"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
            Username
          </Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Pseudo"
            placeholderTextColor="#94a3b8"
            value={username}
            onChangeText={setUsername}
          />

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
            Prenom
          </Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Prenom"
            placeholderTextColor="#94a3b8"
            value={firstName}
            onChangeText={setFirstName}
          />

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">Nom</Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Nom"
            placeholderTextColor="#94a3b8"
            value={lastName}
            onChangeText={setLastName}
          />

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
            Telephone
          </Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="07 00 00 00 00"
            placeholderTextColor="#94a3b8"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(text) => setPhone(formatPhone(text))}
          />

          {errorMessage ? (
            <Text className="mt-3 text-sm text-red-600">{errorMessage}</Text>
          ) : null}

          <TouchableOpacity
            className={`mt-5 rounded-2xl px-4 py-4 ${
              email && password ? "bg-[#111827]" : "bg-slate-300"
            }`}
            onPress={submit}
            disabled={!email || !password || saving}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {mode === "signup" ? "Creer un compte" : "Se connecter"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={() => setMode(mode === "signup" ? "signin" : "signup")}
            disabled={saving}
          >
            <Text className="text-center text-sm font-semibold text-slate-800">
              {mode === "signup" ? "J ai deja un compte" : "Creer un compte"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
