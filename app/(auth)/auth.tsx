import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Link, Redirect, useLocalSearchParams } from "expo-router";
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
import { signInWithCredentials } from "../../src/lib/auth/authFlows";
import { toSignInErrorFr, type SignInErrorUi } from "../../src/lib/auth/signInErrorFr";
import { AuthErrorCard } from "../../src/components/AuthErrorCard";
import { supabase } from "../../src/lib/core/supabase";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

export default function AuthScreen() {
  const params = useLocalSearchParams<{ signup?: string; email?: string }>();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signInError, setSignInError] = useState<SignInErrorUi | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [resending, setResending] = useState(false);
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
    if (params.signup !== "1") return;
    const emailParam = String(params.email ?? "").trim();
    if (emailParam.length > 0 && !identifier) {
      setIdentifier(emailParam);
    }
    setInfoMessage(
      "Compte créé. Confirme d'abord ton email puis connecte-toi."
    );
  }, [params.signup, params.email, identifier]);

  if (!checking && userId) {
    return <Redirect href="/" />;
  }

  const submit = async () => {
    try {
      Keyboard.dismiss();
      setSaving(true);
      setSignInError(null);
      setInfoMessage("");
      await signInWithCredentials({ identifier, password });
    } catch (error: unknown) {
      setSignInError(toSignInErrorFr(error));
    } finally {
      setSaving(false);
    }
  };

  const resendConfirmationEmail = async () => {
    const targetEmail = identifier.trim();
    if (!targetEmail.includes("@")) {
      setSignInError({
        kind: "email_not_confirmed",
        title: "Email requis",
        message: "Entre ton adresse email exacte pour renvoyer la confirmation.",
        hint: "Le renvoi ne fonctionne pas avec un username.",
        code: undefined
      });
      return;
    }

    try {
      setResending(true);
      setInfoMessage("");
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: targetEmail
      });
      if (error) throw error;
      setInfoMessage("Email de confirmation renvoyé. Vérifie tes spams si besoin.");
    } catch (error: any) {
      setSignInError(toSignInErrorFr(error));
    } finally {
      setResending(false);
    }
  };

  const canSubmit = identifier.trim().length > 0 && password.trim().length > 0;

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
        {/* Permet de fermer le clavier en dehors des champs. */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            className="flex-1 px-6"
            contentContainerStyle={{ paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
        <View className="mt-6 flex-row items-center justify-between">
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
              SafeBack
            </Text>
          </View>
          <View className="rounded-full border border-[#E7E0D7] bg-white/90 px-3 py-1">
            <Text className="text-xs font-semibold text-slate-700">Connexion</Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Bon retour</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Connecte-toi pour lancer un trajet et suivre ta position en temps réel.
        </Text>

        <View className="mt-8 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">
            Username ou email
          </Text>
          <View className="mt-3 flex-row items-center rounded-2xl border border-slate-200 bg-[#F8FAFC] px-3">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-white">
              <Ionicons name="person-outline" size={16} color="#334155" />
            </View>
            <TextInput
              className="ml-2 flex-1 py-3 text-base text-slate-900"
              placeholder="username ou prenom@email.com"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              value={identifier}
              onChangeText={setIdentifier}
            />
          </View>

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
            Mot de passe
          </Text>
          <View className="mt-3 flex-row items-center rounded-2xl border border-slate-200 bg-[#F8FAFC] px-3">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-white">
              <Ionicons name="lock-closed-outline" size={16} color="#334155" />
            </View>
            <TextInput
              className="ml-2 flex-1 py-3 text-base text-slate-900"
              placeholder="********"
              placeholderTextColor="#94a3b8"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              className="h-9 w-9 items-center justify-center rounded-full bg-white"
              onPress={() => setShowPassword((prev) => !prev)}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={18}
                color="#334155"
              />
            </TouchableOpacity>
          </View>

          {signInError ? (
            <AuthErrorCard
              contextLabel="Connexion"
              title={signInError.title}
              message={signInError.message}
              hint={signInError.hint}
              code={signInError.code}
            />
          ) : null}
          {signInError?.kind === "email_not_confirmed" ? (
            <TouchableOpacity
              className={`mt-3 rounded-2xl border border-amber-200 px-4 py-3 ${
                resending ? "bg-amber-100" : "bg-amber-50"
              }`}
              onPress={resendConfirmationEmail}
              disabled={resending}
            >
              <Text className="text-center text-sm font-semibold text-amber-800">
                {resending ? "Envoi..." : "Renvoyer l'email de confirmation"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {infoMessage ? <FeedbackMessage kind="info" message={infoMessage} compact /> : null}

          <TouchableOpacity
            className={`mt-5 rounded-2xl px-4 py-4 ${
              canSubmit && !saving ? "bg-[#111827]" : "bg-slate-300"
            }`}
            onPress={submit}
            disabled={!canSubmit || saving}
          >
            <Text className="text-center text-sm font-semibold uppercase tracking-wide text-white">
              {saving ? "Connexion..." : "Se connecter"}
            </Text>
          </TouchableOpacity>

          <Link href="/signup" asChild>
            <TouchableOpacity className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Text className="text-center text-sm font-semibold text-slate-800">
                Créer un compte
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
