import { Linking, Share } from "react-native";

export type IncidentReportPdfPayload = {
  id?: string | null;
  occurredAtIso: string;
  incidentType: string;
  severity: string;
  locationLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  details: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function buildIncidentReportHtml(payload: IncidentReportPdfPayload): string {
  const locationCoords =
    Number.isFinite(payload.latitude) && Number.isFinite(payload.longitude)
      ? `${Number(payload.latitude).toFixed(5)}, ${Number(payload.longitude).toFixed(5)}`
      : "Non disponible";
  const routeLine =
    payload.fromAddress?.trim() && payload.toAddress?.trim()
      ? `${payload.fromAddress.trim()} -> ${payload.toAddress.trim()}`
      : "Non disponible";

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; padding: 28px; }
      h1 { margin: 0 0 10px 0; font-size: 24px; }
      h2 { margin: 20px 0 8px 0; font-size: 14px; color: #334155; text-transform: uppercase; letter-spacing: 1px; }
      p { margin: 4px 0; font-size: 13px; line-height: 1.45; }
      .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; background: #f8fafc; }
      .meta { color: #475569; }
    </style>
  </head>
  <body>
    <h1>Rapport d'incident SafeBack</h1>
    <p class="meta">Généré le ${formatDateTime(new Date().toISOString())}</p>
    <div class="card">
      <p><strong>Référence :</strong> ${escapeHtml(payload.id?.trim() || "Brouillon")}</p>
      <p><strong>Type :</strong> ${escapeHtml(payload.incidentType)}</p>
      <p><strong>Niveau :</strong> ${escapeHtml(payload.severity)}</p>
      <p><strong>Heure de l'incident :</strong> ${escapeHtml(formatDateTime(payload.occurredAtIso))}</p>
      <p><strong>Lieu :</strong> ${escapeHtml(payload.locationLabel?.trim() || "Non renseigné")}</p>
      <p><strong>Coordonnées :</strong> ${escapeHtml(locationCoords)}</p>
      <p><strong>Trajet :</strong> ${escapeHtml(routeLine)}</p>
    </div>
    <h2>Détails</h2>
    <p>${escapeHtml(payload.details || "Aucun détail saisi.")}</p>
  </body>
</html>`;
}

export async function exportIncidentReportPdf(payload: IncidentReportPdfPayload): Promise<string> {
  // L'import dynamique garde un démarrage léger et évite de charger les modules natifs trop tôt.
  const Print = await import("expo-print");

  const { uri } = await Print.printToFileAsync({
    html: buildIncidentReportHtml(payload),
    base64: false
  });

  try {
    // Utilise l'API de partage React Native pour éviter une dépendance native optionnelle.
    await Share.share({
      title: "Exporter le rapport d'incident",
      message: "Rapport d'incident SafeBack",
      url: uri
    });
  } catch {
    // no-op : si le partage n'est pas disponible, on ouvre directement le fichier PDF.
    await Linking.openURL(uri);
  }

  return uri;
}
