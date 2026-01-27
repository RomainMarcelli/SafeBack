import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect } from "expo-router";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../src/lib/supabase";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  if (!checking && userId) {
    return <Redirect href="/" />;
  }

  const submit = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur auth.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar style="dark" />
      <View className="flex-1 px-6 pt-16">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs uppercase text-slate-500">SafeBack</Text>
            <Text className="text-3xl font-extrabold text-black">
              {mode === "signup" ? "Cree ton compte" : "Connexion"}
            </Text>
            <Text className="mt-1 text-base text-slate-600">
              Garde tes proches informes en toute securite.
            </Text>
          </View>
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-black">
            <Text className="text-xl font-bold text-white">SB</Text>
          </View>
        </View>

        <View className="mt-10 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="text-xs font-semibold text-slate-500">Email</Text>
          <TextInput
            className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base"
            placeholder="prenom@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text className="mt-4 text-xs font-semibold text-slate-500">Mot de passe</Text>
          <TextInput
            className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base"
            placeholder="********"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {errorMessage ? (
            <Text className="mt-3 text-sm text-red-600">{errorMessage}</Text>
          ) : null}

          <TouchableOpacity
            className={`mt-5 rounded-xl px-4 py-3 ${
              email && password ? "bg-black" : "bg-slate-300"
            }`}
            onPress={submit}
            disabled={!email || !password || saving}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {mode === "signup" ? "Creer un compte" : "Se connecter"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            onPress={() => setMode(mode === "signup" ? "signin" : "signup")}
            disabled={saving}
          >
            <Text className="text-center text-sm font-semibold text-slate-800">
              {mode === "signup"
                ? "J ai deja un compte"
                : "Creer un compte"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
