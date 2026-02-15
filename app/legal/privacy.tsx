// Politique de confidentialité SafeBack (version application mobile).
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Section = {
  title: string;
  points: string[];
};

const SECTIONS: Section[] = [
  {
    title: "Données collectées",
    points: [
      "Compte: email, identifiants de profil (username, prénom, nom, téléphone).",
      "Trajets: adresses départ/arrivée, ETA, mode de déplacement, partages live.",
      "Localisation: points GPS de suivi pendant les trajets selon permissions accordées.",
      "Social/sécurité: amis, garants, messages, notifications, incidents, demandes de vérification.",
      "Technique: sessions d'appareil, métriques UX et erreurs runtime pour améliorer la stabilité."
    ]
  },
  {
    title: "Finalités",
    points: [
      "Fournir le service principal de sécurité trajet (préparation, suivi, alertes, confirmations d'arrivée).",
      "Permettre la communication entre proches (messages, demandes de nouvelles, dashboard de suivi).",
      "Sécuriser les comptes (gestion des appareils connectés, révocation de session).",
      "Mesurer la qualité du service et corriger les anomalies techniques."
    ]
  },
  {
    title: "Durées de conservation",
    points: [
      "Données de compte et de service: conservées tant que le compte est actif.",
      "Historique de positions: soumis à une politique de rétention serveur configurable (ex: purge > 90 jours).",
      "Logs runtime/métriques UX: soumis à une politique de rétention serveur configurable (ex: purge > 90 jours).",
      "Suppression complète possible à tout moment via l'application (compte ou centre de confidentialité)."
    ]
  },
  {
    title: "Stockage et sous-traitance",
    points: [
      "Les données applicatives sont hébergées sur Supabase (PostgreSQL + Auth + Storage).",
      "La région de stockage correspond à la région du projet Supabase configurée dans le dashboard du projet.",
      "Les accès sont protégés par des politiques RLS (Row Level Security) pour isoler les données par utilisateur."
    ]
  },
  {
    title: "Droits utilisateur",
    points: [
      "Accès: consultation directe des données dans l'application.",
      "Export: export JSON complet disponible dans le centre de confidentialité.",
      "Suppression: suppression totale du compte et des données liées via action dédiée.",
      "Paramétrage: consentements granulaires (position, présence, notifications, partage live) modifiables à tout moment."
    ]
  }
];

export default function PrivacyPolicyScreen() {
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
            onPress={() => router.push("/legal/terms")}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Conditions</Text>
          </TouchableOpacity>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Politique de confidentialité</Text>
        <Text className="mt-2 text-sm text-slate-600">
          SafeBack - application de sécurité trajet. Version en vigueur dans l'app.
        </Text>

        {SECTIONS.map((section) => (
          <View
            key={section.title}
            className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm"
          >
            <Text className="text-sm font-bold uppercase tracking-wider text-slate-700">
              {section.title}
            </Text>
            {section.points.map((point, index) => (
              <Text key={`${section.title}-${index}`} className="mt-3 text-sm leading-6 text-slate-700">
                - {point}
              </Text>
            ))}
          </View>
        ))}

        <View className="mt-4 rounded-3xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
          <Text className="text-xs font-semibold uppercase tracking-widest text-cyan-700">
            Gestion rapide
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
