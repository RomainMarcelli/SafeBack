// Écran principal des incidents : création, consultation et export des rapports utilisateur.
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { listIncidentReports } from "../../src/lib/core/db";
import { exportIncidentReportPdf } from "../../src/lib/incidents/incidentReportPdf";
import { supabase } from "../../src/lib/core/supabase";
import type { IncidentReport } from "../../src/lib/core/db";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month} · ${hours}:${minutes}`;
}

export default function IncidentsScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<IncidentReport[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    if (!checking && !userId) {
      router.replace("/auth");
    }
  }, [checking, userId, router]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        const data = await listIncidentReports(100);
        setRows(data);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (!checking && !userId) {
    return null;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
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
              Incidents
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Rapports incidents</Text>
        <Text className="mt-2 text-base text-[#475569]">
          SOS et signalements exportables en PDF.
        </Text>

        <TouchableOpacity
          className="mt-5 rounded-2xl bg-[#111827] px-4 py-3"
          onPress={() => router.push("/incident-report")}
        >
          <Text className="text-center text-sm font-semibold text-white">
            Nouveau rapport
          </Text>
        </TouchableOpacity>

        {loading ? (
          <Text className="mt-6 text-sm text-slate-500">Chargement...</Text>
        ) : rows.length === 0 ? (
          <Text className="mt-6 text-sm text-slate-500">Aucun rapport pour le moment.</Text>
        ) : (
          rows.map((row) => (
            <View
              key={row.id}
              className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm"
            >
              <Text className="text-xs uppercase tracking-widest text-slate-500">
                {formatDate(row.occurred_at)}
              </Text>
              <Text className="mt-2 text-sm font-semibold text-slate-800">
                {row.incident_type.toUpperCase()} · {row.severity.toUpperCase()}
              </Text>
              <Text className="mt-2 text-sm text-slate-600">
                {row.location_label || "Lieu non renseigné"}
              </Text>
              <Text className="mt-2 text-sm text-slate-700">{row.details}</Text>
              <TouchableOpacity
                className={`mt-4 rounded-2xl border px-4 py-3 ${
                  exportingId === row.id
                    ? "border-slate-200 bg-slate-100"
                    : "border-emerald-200 bg-emerald-50"
                }`}
                onPress={async () => {
                  try {
                    setExportingId(row.id);
                    await exportIncidentReportPdf({
                      id: row.id,
                      occurredAtIso: row.occurred_at,
                      incidentType: row.incident_type,
                      severity: row.severity,
                      locationLabel: row.location_label ?? null,
                      latitude: row.latitude ?? null,
                      longitude: row.longitude ?? null,
                      details: row.details
                    });
                  } catch (error: any) {
                    setErrorMessage(error?.message ?? "Impossible d'exporter le PDF.");
                  } finally {
                    setExportingId(null);
                  }
                }}
                disabled={exportingId === row.id}
              >
                <Text
                  className={`text-center text-sm font-semibold ${
                    exportingId === row.id ? "text-slate-500" : "text-emerald-800"
                  }`}
                >
                  {exportingId === row.id ? "Export..." : "Exporter PDF"}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
