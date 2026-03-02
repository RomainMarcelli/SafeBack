// Conditions générales d'utilisation SafeBack (version application mobile).
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Clause = {
  title: string;
  body: string;
};

const CLAUSES: Clause[] = [
  {
    title: "Objet du service",
    body: "SafeBack fournit des fonctionnalités d'accompagnement de trajet, d'alerte de proches et de suivi de sécurité. L'application ne remplace pas les services d'urgence officiels."
  },
  {
    title: "Compte utilisateur",
    body: "L'utilisateur est responsable des informations transmises lors de l'inscription, de la sécurité de ses identifiants et de l'usage de son compte."
  },
  {
    title: "Utilisation acceptable",
    body: "L'utilisateur s'engage à utiliser SafeBack de manière licite, à ne pas usurper l'identité d'autrui et à ne pas détourner les fonctionnalités d'alerte."
  },
  {
    title: "Fonctionnalités tierces",
    body: "Certaines fonctions reposent sur des services tiers (cartographie, push, réseaux téléphoniques). Leur disponibilité peut varier selon l'appareil, la région et la connexion."
  },
  {
    title: "Disponibilité et évolution",
    body: "Le service peut évoluer, être corrigé ou interrompu partiellement pour maintenance. Les fonctionnalités peuvent être modifiées pour des raisons techniques, légales ou de sécurité."
  },
  {
    title: "Responsabilité",
    body: "SafeBack met en œuvre des moyens raisonnables de fiabilité, sans garantie absolue de disponibilité continue ni d'absence totale d'incident."
  },
  {
    title: "Protection des données",
    body: "Le traitement des données personnelles est détaillé dans la Politique de confidentialité accessible depuis l'application."
  },
  {
    title: "Suppression et export",
    body: "L'utilisateur peut exporter ses données et demander la suppression complète de son compte depuis le centre de confidentialité ou la page compte."
  }
];

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Retour</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.push("/legal/privacy")}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Confidentialité</Text>
          </TouchableOpacity>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">
          Conditions d'utilisation
        </Text>
        <Text className="mt-2 text-sm text-slate-600">
          SafeBack - cadre d'usage de l'application.
        </Text>

        {CLAUSES.map((clause) => (
          <View
            key={clause.title}
            className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm"
          >
            <Text className="text-sm font-bold uppercase tracking-wider text-slate-700">
              {clause.title}
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-700">{clause.body}</Text>
          </View>
        ))}

        <View className="mt-4 rounded-3xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
          <Text className="text-xs font-semibold uppercase tracking-widest text-cyan-700">
            Actions utiles
          </Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
              onPress={() => router.push("/privacy-center")}
            >
              <Text className="text-center text-sm font-semibold text-white">Centre de confidentialité</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              onPress={() => router.push("/account")}
            >
              <Text className="text-center text-sm font-semibold text-slate-700">Mon compte</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
