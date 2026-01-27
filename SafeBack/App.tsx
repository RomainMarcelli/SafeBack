import "./global.css";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function App() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar style="dark" />
      <View className="flex-1 px-6 pt-16">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-black">
          <Text className="text-xl font-bold text-white">SB</Text>
        </View>

        <Text className="mt-6 text-3xl font-extrabold text-black">
          SafeBack
        </Text>
        <Text className="mt-2 text-base text-slate-600">
          Suivi de trajet en temps reel, alertes de retard, et notifications
          pour tes proches.
        </Text>

        <View className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Text className="text-sm font-semibold text-slate-900">
            Statut demo
          </Text>
          <View className="mt-3 flex-row items-center justify-between rounded-xl bg-white px-4 py-3">
            <Text className="text-sm text-slate-700">Trajet actif</Text>
            <Text className="text-sm font-semibold text-emerald-600">
              OK
            </Text>
          </View>
        </View>

        <View className="mt-8 rounded-2xl bg-black px-5 py-4">
          <Text className="text-center text-base font-semibold text-white">
            Demarrer un trajet
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
