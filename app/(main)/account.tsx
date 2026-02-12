import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { Image, ScrollView, Share, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getProfile, upsertProfile } from "../../src/lib/db";
import { ensureMyPublicProfile, type PublicProfile } from "../../src/lib/friendsDb";
import { clearActiveSessionId } from "../../src/lib/activeSession";
import { supabase } from "../../src/lib/supabase";

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
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
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
        try {
          const socialProfile = await ensureMyPublicProfile();
          setPublicProfile(socialProfile);
        } catch {
          setPublicProfile(null);
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

  const publicId = publicProfile?.public_id ?? "";
  const qrPayload = publicId ? `SAFEBACK|${publicId}` : "";
  const qrCodeUrl = qrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}`
    : "";

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

  const signOut = async () => {
    try {
      setSigningOut(true);
      setErrorMessage("");
      setSuccessMessage("");
      await clearActiveSessionId();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/auth");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de deconnexion.");
    } finally {
      setSigningOut(false);
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
          <Text className="text-xs uppercase tracking-widest text-slate-500">Mon ID SafeBack</Text>
          <Text className="mt-2 text-2xl font-extrabold text-[#0F172A]">
            {publicId || "Generation..."}
          </Text>
          <Text className="mt-1 text-sm text-slate-600">
            Partage cet identifiant, ton QR code, ou envoie directement ton profil.
          </Text>
          {qrCodeUrl ? (
            <View className="mt-4 items-center">
              <Image
                source={{ uri: qrCodeUrl }}
                style={{ width: 140, height: 140, borderRadius: 12 }}
                resizeMode="cover"
              />
            </View>
          ) : null}
          <View className="mt-4 flex-row gap-2">
            <TouchableOpacity
              className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
              onPress={async () => {
                if (!publicId) return;
                try {
                  await Share.share({
                    message: `Ajoute-moi sur SafeBack\nID: ${publicId}`
                  });
                } catch {
                  // no-op: system share can be cancelled
                }
              }}
              disabled={!publicId}
            >
              <Text className="text-center text-sm font-semibold text-white">Partager mon ID</Text>
            </TouchableOpacity>
            <Link href="/friends" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Text className="text-center text-sm font-semibold text-slate-800">Gerer mes amis</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

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
          disabled={saving || signingOut}
        >
          <Text className="text-center text-base font-semibold text-white">
            Enregistrer
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className={`mt-3 rounded-3xl border px-5 py-4 ${
            signingOut
              ? "border-slate-200 bg-slate-100"
              : "border-rose-200 bg-rose-50"
          }`}
          onPress={signOut}
          disabled={saving || signingOut}
        >
          <View className="flex-row items-center justify-center">
            <Ionicons
              name="log-out-outline"
              size={18}
              color={signingOut ? "#64748b" : "#be123c"}
            />
            <Text
              className={`ml-2 text-base font-semibold ${
                signingOut ? "text-slate-500" : "text-rose-700"
              }`}
            >
              {signingOut ? "Deconnexion..." : "Deconnexion"}
            </Text>
          </View>
        </TouchableOpacity>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Raccourcis</Text>

          <View className="mt-3 flex-row gap-2">
            <Link href="/favorites" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="heart-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Favoris</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/trips" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="time-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Mes trajets</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2 flex-row gap-2">
            <Link href="/safety-alerts" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="shield-checkmark-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Alertes</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/help" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="help-circle-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Aide</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2 flex-row gap-2">
            <Link href="/forgotten-trip" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="location-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Trajet oublie</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/messages" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Messages</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2 flex-row gap-2">
            <Link href="/notifications" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="notifications-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Notifications</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/friends" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="people-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Amis</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2">
            <Link href="/contact-groups" asChild>
              <TouchableOpacity className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="layers-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Groupes</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-2 flex-row gap-2">
            <Link href="/about" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="information-circle-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">A propos</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/legal" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Ionicons name="document-text-outline" size={18} color="#334155" />
                <Text className="mt-1 text-sm font-semibold text-slate-800">Mentions</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

