// Page légale : conditions, informations réglementaires et mentions obligatoires.
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LegalScreen() {
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
          <Text className="text-2xl font-bold text-black">Mentions legales</Text>
        </View>

        <Text className="mt-2 text-sm text-slate-600">
          Accède aux documents légaux détaillés et à jour depuis cette page.
        </Text>

        <View className="mt-4 flex-row gap-2">
          <TouchableOpacity
            className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
            onPress={() => router.push("/legal/privacy")}
          >
            <Text className="text-center text-sm font-semibold text-white">
              Politique de confidentialité
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={() => router.push("/legal/terms")}
          >
            <Text className="text-center text-sm font-semibold text-slate-700">
              Conditions d utilisation
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-sm font-semibold text-slate-900">
            Conditions generales d utilisation (CGU)
          </Text>
          <Text className="mt-2 text-sm leading-5 text-slate-600">
            En utilisant SafeBack, tu acceptes d utiliser l'application de maniere legale et
            responsable. L utilisateur reste responsable des informations saisies et partagees avec
            ses contacts.
          </Text>
          <Text className="mt-2 text-sm leading-5 text-slate-600">
            Les fonctionnalites peuvent evoluer sans preavis. Certaines options peuvent dependre de
            services tiers (cartographie, notifications, telephonie).
          </Text>
        </View>

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-sm font-semibold text-slate-900">
            Politique de confidentialité
          </Text>
          <Text className="mt-2 text-sm leading-5 text-slate-600">
            SafeBack traite des données necessaires au fonctionnement du service: compte utilisateur,
            favoris, trajets et données de localisation quand activées par l utilisateur.
          </Text>
          <Text className="mt-2 text-sm leading-5 text-slate-600">
            Les données sont stockees dans une base distante configuree par le projet. Tu peux
            demander la suppression de tes données en supprimant ton compte et son contenu associe.
          </Text>
          <Text className="mt-2 text-sm leading-5 text-slate-600">
            Les permissions (localisation, notifications, contacts) sont optionnelles et controles
            par les réglages de ton'appareil.
          </Text>
        </View>

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-sm font-semibold text-slate-900">Responsabilite</Text>
          <Text className="mt-2 text-sm leading-5 text-slate-600">
            L application'est fournie telle quelle. Elle ne remplace pas un service d urgence ni un
            dispositif de sécurité officiel.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
