import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Link, Redirect } from "expo-router";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../src/lib/supabase";

export default function AuthScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      const email = identifier.trim();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de connexion.");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = identifier.trim().length > 0 && password.trim().length > 0;

  return (
    <SafeAreaView className="flex-1 bg-slate-100">
      <StatusBar style="dark" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="rounded-3xl bg-black px-6 py-7 shadow-sm">
          <Text className="text-xs uppercase tracking-[2px] text-slate-300">SAFEBACK</Text>
          <Text className="mt-2 text-4xl font-extrabold text-white">Connexion</Text>
          <Text className="mt-3 text-sm leading-5 text-slate-300">
            Suis ton trajet en temps reel et notifie tes proches en un geste.
          </Text>
          <View className="mt-5 rounded-full bg-white/10 px-4 py-2 self-start">
            <Text className="text-xs font-semibold text-white">Trajets securises</Text>
          </View>
        </View>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs font-semibold uppercase tracking-[1px] text-slate-500">
            Username ou email
          </Text>
          <View className="mt-2 flex-row items-center rounded-2xl border border-slate-200 bg-white px-3">
            <Ionicons name="person-outline" size={18} color="#64748b" />
            <TextInput
              className="ml-2 flex-1 py-3 text-base text-slate-900"
              placeholder="username ou prenom@email.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              value={identifier}
              onChangeText={setIdentifier}
            />
          </View>

          <Text className="mt-4 text-xs font-semibold uppercase tracking-[1px] text-slate-500">
            Mot de passe
          </Text>
          <View className="mt-2 flex-row items-center rounded-2xl border border-slate-200 bg-white px-3">
            <Ionicons name="lock-closed-outline" size={18} color="#64748b" />
            <TextInput
              className="ml-2 flex-1 py-3 text-base text-slate-900"
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
              {saving ? "Connexion..." : "Se connecter"}
            </Text>
          </TouchableOpacity>

          <Link href="/signup" asChild>
            <TouchableOpacity className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <Text className="text-center text-sm font-semibold text-slate-800">
                Creer un compte
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
