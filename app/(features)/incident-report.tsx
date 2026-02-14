import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createIncidentReport } from "../../src/lib/core/db";
import { exportIncidentReportPdf } from "../../src/lib/incidents/incidentReportPdf";
import { supabase } from "../../src/lib/core/supabase";

type Severity = "low" | "medium" | "high";
type IncidentType = "sos" | "delay" | "other";

function formatDateTimeLocalInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function IncidentReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionId?: string;
    from?: string;
    to?: string;
    lat?: string;
    lon?: string;
    details?: string;
  }>();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  const [incidentType, setIncidentType] = useState<IncidentType>("sos");
  const [severity, setSeverity] = useState<Severity>("high");
  const [occurredAtInput, setOccurredAtInput] = useState(() =>
    formatDateTimeLocalInput(new Date())
  );
  const [locationLabel, setLocationLabel] = useState("Lieu à préciser");
  const [details, setDetails] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    const from = typeof params.from === "string" ? params.from.trim() : "";
    const to = typeof params.to === "string" ? params.to.trim() : "";
    const detailSeed = typeof params.details === "string" ? params.details.trim() : "";
    if (from && to) {
      setLocationLabel(`${from} -> ${to}`);
    }
    if (detailSeed) {
      // Conserve le contexte SOS en brouillon pour éviter à l'utilisateur de tout ressaisir.
      setDetails(detailSeed);
    }
  }, [params.from, params.to, params.details]);

  const occurredAtIso = useMemo(() => {
    const parsed = new Date(occurredAtInput);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }, [occurredAtInput]);

  const parsedLat = useMemo(() => {
    const raw = typeof params.lat === "string" ? Number(params.lat) : Number.NaN;
    return Number.isFinite(raw) ? raw : null;
  }, [params.lat]);
  const parsedLon = useMemo(() => {
    const raw = typeof params.lon === "string" ? Number(params.lon) : Number.NaN;
    return Number.isFinite(raw) ? raw : null;
  }, [params.lon]);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  const saveIncident = async (): Promise<string | null> => {
    const trimmedDetails = details.trim();
    if (trimmedDetails.length < 8) {
      setErrorMessage("Ajoute plus de détails (minimum 8 caractères).");
      return null;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const row = await createIncidentReport({
        session_id: typeof params.sessionId === "string" ? params.sessionId : null,
        incident_type: incidentType,
        severity,
        occurred_at: occurredAtIso,
        location_label: locationLabel.trim() || null,
        latitude: parsedLat,
        longitude: parsedLon,
        details: trimmedDetails
      });
      setSavedReportId(row.id);
      setSuccessMessage("Rapport enregistré.");
      return row.id;
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'enregistrer le rapport.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      let reportId = savedReportId;
      if (!reportId) {
        reportId = await saveIncident();
      }
      if (!reportId) return;

      await exportIncidentReportPdf({
        id: reportId,
        occurredAtIso,
        incidentType,
        severity,
        locationLabel,
        latitude: parsedLat,
        longitude: parsedLon,
        fromAddress: typeof params.from === "string" ? params.from : null,
        toAddress: typeof params.to === "string" ? params.to : null,
        details: details.trim()
      });
      setSuccessMessage("PDF exporté.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'exporter le PDF.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
                Incident
              </Text>
            </View>
          </View>

          <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Rapport incident</Text>
          <Text className="mt-2 text-base text-[#475569]">
            Note les faits à chaud puis exporte un PDF.
          </Text>

          <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Type</Text>
            <View className="mt-3 flex-row gap-2">
              {(["sos", "delay", "other"] as const).map((value) => {
                const active = incidentType === value;
                return (
                  <TouchableOpacity
                    key={value}
                    className={`flex-1 rounded-2xl px-3 py-3 ${
                      active ? "bg-[#111827]" : "border border-slate-200 bg-white"
                    }`}
                    onPress={() => setIncidentType(value)}
                  >
                    <Text className={`text-center text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                      {value === "sos" ? "SOS" : value === "delay" ? "Retard" : "Autre"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">Niveau</Text>
            <View className="mt-3 flex-row gap-2">
              {(["low", "medium", "high"] as const).map((value) => {
                const active = severity === value;
                return (
                  <TouchableOpacity
                    key={value}
                    className={`flex-1 rounded-2xl px-3 py-3 ${
                      active ? "bg-rose-600" : "border border-slate-200 bg-white"
                    }`}
                    onPress={() => setSeverity(value)}
                  >
                    <Text className={`text-center text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                      {value === "low" ? "Faible" : value === "medium" ? "Moyen" : "Élevé"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Heure</Text>
            <TextInput
              className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-sm text-slate-800"
              value={occurredAtInput}
              onChangeText={setOccurredAtInput}
              placeholder="YYYY-MM-DDTHH:mm"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
            />

            <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">Lieu</Text>
            <TextInput
              className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-sm text-slate-800"
              value={locationLabel}
              onChangeText={setLocationLabel}
              placeholder="Adresse, lieu public, repère..."
              placeholderTextColor="#94a3b8"
            />

            <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">Détails</Text>
            <TextInput
              className="mt-3 min-h-[130px] rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-sm text-slate-800"
              value={details}
              onChangeText={setDetails}
              placeholder="Décris précisément ce qui s'est passé..."
              placeholderTextColor="#94a3b8"
              multiline
              textAlignVertical="top"
            />
          </View>

          {errorMessage ? <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text> : null}
          {successMessage ? <Text className="mt-4 text-sm text-emerald-600">{successMessage}</Text> : null}

          <TouchableOpacity
            className={`mt-6 rounded-3xl px-6 py-5 shadow-lg ${
              saving ? "bg-slate-300" : "bg-[#111827]"
            }`}
            onPress={saveIncident}
            disabled={saving || exporting}
          >
            <Text className="text-center text-base font-semibold text-white">
              {saving ? "Enregistrement..." : "Enregistrer le rapport"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`mt-3 rounded-3xl border px-6 py-5 ${
              exporting ? "border-slate-200 bg-slate-100" : "border-emerald-200 bg-emerald-50"
            }`}
            onPress={handleExport}
            disabled={saving || exporting}
          >
            <Text className={`text-center text-base font-semibold ${exporting ? "text-slate-500" : "text-emerald-800"}`}>
              {exporting ? "Export PDF..." : "Exporter en PDF"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
