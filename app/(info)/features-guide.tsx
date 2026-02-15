import { useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FEATURE_SECTIONS, type FeatureSection } from "../../src/lib/catalog/featuresCatalog";
import { exportFeaturesGuidePdf } from "../../src/lib/catalog/featuresGuidePdf";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

// Mappe chaque couleur d'accent vers les classes utilitaires utilisées par les cartes.
function accentStyle(accent: FeatureSection["accent"]) {
  if (accent === "amber") {
    return {
      badge: "bg-amber-100 text-amber-700",
      border: "border-amber-200"
    };
  }
  if (accent === "emerald") {
    return {
      badge: "bg-emerald-100 text-emerald-700",
      border: "border-emerald-200"
    };
  }
  if (accent === "sky") {
    return {
      badge: "bg-sky-100 text-sky-700",
      border: "border-sky-200"
    };
  }
  if (accent === "rose") {
    return {
      badge: "bg-rose-100 text-rose-700",
      border: "border-rose-200"
    };
  }
  return {
    badge: "bg-slate-100 text-slate-700",
    border: "border-slate-200"
  };
}

export default function FeaturesGuideScreen() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");

  // Filtre dynamique par catégorie + recherche texte, puis suppression des sections vides.
  const filteredSections = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return FEATURE_SECTIONS
      .filter((section) => activeCategoryId === "all" || section.id === activeCategoryId)
      .map((section) => {
        if (!normalizedQuery) {
          return section;
        }
        const sectionMatch = `${section.title} ${section.subtitle}`.toLowerCase().includes(normalizedQuery);
        if (sectionMatch) {
          return section;
        }
        const matchingFeatures = section.features.filter((feature) => {
          const text = `${feature.title} ${feature.description} ${feature.howTo}`.toLowerCase();
          return text.includes(normalizedQuery);
        });
        return {
          ...section,
          features: matchingFeatures
        };
      })
      .filter((section) => section.features.length > 0);
  }, [activeCategoryId, searchQuery]);

  const visibleFeatureCount = useMemo(
    () => filteredSections.reduce((count, section) => count + section.features.length, 0),
    [filteredSections]
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 42 }}>
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
              Guide
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">
          Guide des fonctionnalités
        </Text>
        <Text className="mt-2 text-base text-[#475569]">
          Tout est centralisé ici: quoi faire, où cliquer et comment démarrer rapidement.
        </Text>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Recherche</Text>
          <View className="mt-3 flex-row items-center rounded-2xl border border-slate-200 bg-[#F8FAFC] px-3">
            <Ionicons name="search-outline" size={16} color="#64748b" />
            <TextInput
              className="ml-2 flex-1 py-3 text-sm text-slate-800"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Rechercher une fonctionnalité ou une action..."
              placeholderTextColor="#94a3b8"
            />
            {searchQuery.trim().length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                className="rounded-full border border-slate-200 bg-white px-2 py-1"
              >
                <Ionicons name="close" size={13} color="#334155" />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">Catégories</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
            <View className="flex-row gap-2 pr-2">
              <TouchableOpacity
                className={`rounded-full px-3 py-2 ${
                  activeCategoryId === "all" ? "bg-[#111827]" : "border border-slate-200 bg-white"
                }`}
                onPress={() => setActiveCategoryId("all")}
              >
                <Text
                  className={`text-xs font-semibold uppercase tracking-widest ${
                    activeCategoryId === "all" ? "text-white" : "text-slate-700"
                  }`}
                >
                  Tout
                </Text>
              </TouchableOpacity>
              {FEATURE_SECTIONS.map((section) => {
                const active = section.id === activeCategoryId;
                return (
                  <TouchableOpacity
                    key={section.id}
                    className={`rounded-full px-3 py-2 ${
                      active ? "bg-[#111827]" : "border border-slate-200 bg-white"
                    }`}
                    onPress={() => setActiveCategoryId(section.id)}
                  >
                    <Text
                      className={`text-xs font-semibold uppercase tracking-widest ${
                        active ? "text-white" : "text-slate-700"
                      }`}
                    >
                      {section.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View className="mt-5 rounded-3xl bg-[#111827] px-5 py-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-300">Résumé</Text>
          <Text className="mt-2 text-2xl font-extrabold text-white">{filteredSections.length}</Text>
          <Text className="mt-1 text-sm text-slate-300">Sections visibles</Text>
          <Text className="mt-3 text-2xl font-extrabold text-white">{visibleFeatureCount}</Text>
          <Text className="mt-1 text-sm text-slate-300">Fonctionnalités visibles</Text>
          <TouchableOpacity
            className={`mt-4 rounded-2xl border px-4 py-3 ${
              exporting ? "border-slate-400 bg-slate-700" : "border-emerald-200 bg-emerald-50"
            }`}
            onPress={async () => {
              try {
                // Export manuel du guide complet en PDF pour consultation hors application.
                setExporting(true);
                setErrorMessage("");
                setSuccessMessage("");
                await exportFeaturesGuidePdf();
                setSuccessMessage("PDF généré et prêt à être partagé.");
              } catch (error: any) {
                setErrorMessage(error?.message ?? "Impossible de générer le PDF.");
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                exporting ? "text-slate-200" : "text-emerald-800"
              }`}
            >
              {exporting ? "Génération PDF..." : "Télécharger le guide en PDF"}
            </Text>
          </TouchableOpacity>
        </View>

        {filteredSections.length === 0 ? (
          <View className="mt-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <Text className="text-sm font-semibold text-slate-800">Aucun résultat</Text>
            <Text className="mt-2 text-sm text-slate-600">
              Essaie un mot-clé plus large ou réactive la catégorie "Tout".
            </Text>
          </View>
        ) : null}

        {filteredSections.map((section) => {
          const accent = accentStyle(section.accent);
          return (
            <View
              key={section.id}
              className={`mt-4 rounded-3xl border bg-white/90 p-5 shadow-sm ${accent.border}`}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-xl font-extrabold text-[#0F172A]">{section.title}</Text>
                <View className={`rounded-full px-3 py-1 ${accent.badge}`}>
                  <Text className="text-[10px] font-semibold uppercase tracking-[2px]">
                    {section.features.length} items
                  </Text>
                </View>
              </View>
              <Text className="mt-2 text-sm text-slate-600">{section.subtitle}</Text>

              {section.features.map((feature) => (
                <View
                  key={feature.id}
                  className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <Text className="text-sm font-semibold text-slate-900">{feature.title}</Text>
                  <Text className="mt-1 text-sm text-slate-700">{feature.description}</Text>
                  <Text className="mt-2 text-xs uppercase tracking-widest text-slate-500">
                    Comment faire
                  </Text>
                  <Text className="mt-1 text-sm text-slate-600">{feature.howTo}</Text>
                  {feature.route ? (
                    <TouchableOpacity
                      className="mt-3 flex-row items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2"
                      onPress={() => router.push(feature.route as never)}
                    >
                      <Ionicons name="open-outline" size={14} color="#334155" />
                      <Text className="ml-2 text-xs font-semibold uppercase tracking-widest text-slate-700">
                        Ouvrir
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}
        {successMessage ? <FeedbackMessage kind="success" message={successMessage} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
