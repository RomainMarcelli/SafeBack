import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type FaqItem = {
  q: string;
  a: string;
};

const FAQS: FaqItem[] = [
  {
    q: "Comment lancer un trajet ?",
    a: "Depuis l accueil, ouvre Nouveau trajet, choisis le depart, la destination, puis selectionne les contacts a prevenir."
  },
  {
    q: "A quoi servent les favoris ?",
    a: "Les favoris enregistrent tes adresses et contacts frequents pour preparer un trajet plus rapidement."
  },
  {
    q: "Pourquoi je ne vois pas la carte ?",
    a: "Certaines fonctions (ex: carte temps reel et transit) peuvent demander Premium et une cle API Google Maps."
  },
  {
    q: "Comment corriger un probleme de connexion ?",
    a: "Verifie ton email, ton mot de passe, et la configuration EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY."
  },
  {
    q: "Les notifications ne partent pas ?",
    a: "Sur Expo Go, certaines notifications sont limitees. Teste aussi les permissions systeme sur ton appareil."
  }
];

export default function HelpScreen() {
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
          <Text className="text-2xl font-bold text-black">Aide / FAQ</Text>
        </View>

        <Text className="mt-2 text-sm text-slate-600">
          Reponses rapides aux questions les plus frequentes.
        </Text>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Support</Text>
          <Text className="mt-2 text-sm text-slate-700">
            Si ton probleme persiste, partage une capture de l erreur et les etapes pour la
            reproduire.
          </Text>
        </View>

        <View className="mt-4">
          {FAQS.map((item, index) => (
            <View
              key={`faq-${index}`}
              className="mt-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <Text className="text-sm font-semibold text-slate-900">{item.q}</Text>
              <Text className="mt-2 text-sm leading-5 text-slate-600">{item.a}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

