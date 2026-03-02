// Page de présentation de l'application, de sa mission et des principes de sécurité.
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import pkg from "../../package.json";

const CONTACT_EMAIL = "support@safeback.app";

export default function AboutScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="mt-4 flex-row items-center">
          <TouchableOpacity
            className="mr-3 rounded-full border border-slate-200 px-3 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-sm font-semibold text-slate-700">Retour</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-black">A propos</Text>
        </View>

        <Text className="mt-2 text-sm text-slate-600">
          Informations generales sur l'application et son environnement technique.
        </Text>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Application</Text>
          <Text className="mt-2 text-base font-semibold text-slate-900">SafeBack</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Solution de suivi de trajet, notifications et gestion des contacts favoris.
          </Text>
          <Text className="mt-3 text-sm text-slate-700">Version: {pkg.version}</Text>
        </View>

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Contact</Text>
          <Text className="mt-2 text-sm text-slate-700">Email: {CONTACT_EMAIL}</Text>
        </View>

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Stack</Text>
          <Text className="mt-2 text-sm text-slate-700">- Expo / React Native</Text>
          <Text className="mt-1 text-sm text-slate-700">- Expo Router</Text>
          <Text className="mt-1 text-sm text-slate-700">- TypeScript</Text>
          <Text className="mt-1 text-sm text-slate-700">- Supabase</Text>
          <Text className="mt-1 text-sm text-slate-700">- NativeWind</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
