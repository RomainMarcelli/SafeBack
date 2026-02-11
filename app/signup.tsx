import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
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

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
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

  if (!checking && userId) {
    return <Redirect href="/" />;
  }

  const submit = async () => {
    try {
      setSaving(true);
      setErrorMessage("");

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password
      });
      if (error) throw error;

      if (data.user?.id) {
        await upsertProfile({
          user_id: data.user.id,
          username: username.trim() || null,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          phone: phone.trim() || null
        });
      }

      router.replace("/auth");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de creation de compte.");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

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
          <Text className="text-2xl font-bold text-black">Creer un compte</Text>
        </View>
        <Text className="mt-2 text-sm text-slate-600">
          Renseigne les informations principales pour commencer.
        </Text>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs font-semibold uppercase text-slate-500">Email</Text>
          <TextInput
            className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="prenom@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text className="mt-4 text-xs font-semibold uppercase text-slate-500">
            Mot de passe
          </Text>
          <View className="mt-2 flex-row items-center rounded-xl border border-slate-200 bg-white px-3">
            <TextInput
              className="flex-1 py-3 text-base leading-6"
              placeholder="********"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              className="h-9 w-9 items-center justify-center rounded-full bg-slate-100"
              onPress={() => setShowPassword((prev) => !prev)}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={18}
                color="#334155"
              />
            </TouchableOpacity>
          </View>

          <Text className="mt-4 text-xs font-semibold uppercase text-slate-500">
            Username (facultatif)
          </Text>
          <TextInput
            className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Pseudo"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />

          <Text className="mt-4 text-xs font-semibold uppercase text-slate-500">
            Prenom (facultatif)
          </Text>
          <TextInput
            className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Prenom"
            value={firstName}
            onChangeText={setFirstName}
          />

          <Text className="mt-4 text-xs font-semibold uppercase text-slate-500">
            Nom (facultatif)
          </Text>
          <TextInput
            className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="Nom"
            value={lastName}
            onChangeText={setLastName}
          />

          <Text className="mt-4 text-xs font-semibold uppercase text-slate-500">
            Telephone (facultatif)
          </Text>
          <TextInput
            className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6"
            placeholder="07 00 00 00 00"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(text) => setPhone(formatPhone(text))}
          />

          {errorMessage ? (
            <Text className="mt-3 text-sm text-red-600">{errorMessage}</Text>
          ) : null}

          <TouchableOpacity
            className={`mt-5 rounded-xl px-4 py-3 ${
              canSubmit && !saving ? "bg-black" : "bg-slate-300"
            }`}
            onPress={submit}
            disabled={!canSubmit || saving}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {saving ? "Creation..." : "Creer mon compte"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
