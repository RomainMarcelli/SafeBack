import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signUpAndMaybeCreateProfile } from "../../src/lib/auth/authFlows";
import { toSignupErrorFr, type SignupErrorUi } from "../../src/lib/auth/authErrorFr";
import { supabase } from "../../src/lib/core/supabase";

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
  const [signupError, setSignupError] = useState<SignupErrorUi | null>(null);
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

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      Keyboard.dismiss();
      setSaving(true);
      setSignupError(null);

      await signUpAndMaybeCreateProfile({
        email,
        password,
        profile: {
          username,
          first_name: firstName,
          last_name: lastName,
          phone
        }
      });

      router.replace("/auth");
    } catch (error: unknown) {
      setSignupError(toSignupErrorFr(error));
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Permet de fermer le clavier en tapant hors des champs. */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            className="flex-1 px-6"
            contentContainerStyle={{ paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
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
              SafeBack
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Créer un compte</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Complète ton profil pour démarrer tes trajets en sécurité.
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

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">Mot de passe</Text>
          <View className="mt-3 flex-row items-center rounded-2xl border border-slate-200 bg-[#F8FAFC] px-3">
            <TextInput
              className="flex-1 py-3 text-base text-slate-900"
              placeholder="********"
              placeholderTextColor="#94a3b8"
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

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
            Username (facultatif)
          </Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Pseudo"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
            Prénom (facultatif)
          </Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Prénom"
            placeholderTextColor="#94a3b8"
            value={firstName}
            onChangeText={setFirstName}
          />

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
            Nom (facultatif)
          </Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Nom"
            placeholderTextColor="#94a3b8"
            value={lastName}
            onChangeText={setLastName}
          />

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
            Téléphone (facultatif)
          </Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="07 00 00 00 00"
            placeholderTextColor="#94a3b8"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(text) => setPhone(formatPhone(text))}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          {signupError ? (
            <View className="mt-4 overflow-hidden rounded-3xl border border-rose-200 bg-rose-50">
              <View className="absolute left-0 top-0 h-full w-1.5 bg-rose-500" />
              <View className="px-4 py-4">
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-white">
                    <Ionicons name="warning-outline" size={20} color="#be123c" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-rose-600">
                      Inscription
                    </Text>
                    <Text className="text-base font-extrabold text-rose-900">
                      {signupError.title}
                    </Text>
                  </View>
                </View>
                <View className="mt-3 rounded-2xl border border-rose-200 bg-white/90 px-3 py-3">
                  <Text className="text-sm font-semibold text-rose-900">
                    {signupError.message}
                  </Text>
                  {signupError.hint ? (
                    <Text className="mt-1 text-xs text-rose-700">{signupError.hint}</Text>
                  ) : null}
                </View>
                {signupError.code ? (
                  <Text className="mt-2 text-[11px] uppercase tracking-wider text-rose-500">
                    Code: {signupError.code}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            className={`mt-5 rounded-2xl px-4 py-4 ${
              canSubmit && !saving ? "bg-[#111827]" : "bg-slate-300"
            }`}
            onPress={submit}
            disabled={!canSubmit || saving}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {saving ? "Création..." : "Créer mon compte"}
            </Text>
          </TouchableOpacity>
        </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
