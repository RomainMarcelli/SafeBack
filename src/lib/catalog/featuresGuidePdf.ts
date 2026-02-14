import { Linking, Share } from "react-native";

import { FEATURE_SECTIONS, type FeatureSection } from "./featuresCatalog";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNow(): string {
  const date = new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function accentColor(accent: FeatureSection["accent"]) {
  if (accent === "amber") return "#F59E0B";
  if (accent === "emerald") return "#059669";
  if (accent === "sky") return "#0284C7";
  if (accent === "rose") return "#E11D48";
  return "#334155";
}

function buildFeaturesGuideHtml(): string {
  const content = FEATURE_SECTIONS.map((section) => {
    const color = accentColor(section.accent);
    const cards = section.features
      .map(
        (feature) => `
          <div class="feature-card">
            <p class="feature-title">${escapeHtml(feature.title)}</p>
            <p class="feature-desc">${escapeHtml(feature.description)}</p>
            <p class="feature-howto"><strong>Comment faire :</strong> ${escapeHtml(feature.howTo)}</p>
          </div>
        `
      )
      .join("");

    return `
      <section class="section">
        <div class="section-head" style="border-left: 6px solid ${color}">
          <p class="section-title">${escapeHtml(section.title)}</p>
          <p class="section-subtitle">${escapeHtml(section.subtitle)}</p>
        </div>
        <div class="features-grid">${cards}</div>
      </section>
    `;
  }).join("");

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Guide des fonctionnalités SafeBack</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #F7F2EA; color: #0f172a; }
      .page { padding: 28px; }
      .header { background: #111827; color: white; border-radius: 16px; padding: 18px; }
      .header p { margin: 0; }
      .header-title { font-size: 24px; font-weight: 800; }
      .header-subtitle { font-size: 13px; margin-top: 6px; color: #cbd5e1; }
      .meta { font-size: 11px; margin-top: 8px; color: #94a3b8; }
      .section { margin-top: 18px; }
      .section-head { background: white; border-radius: 12px; padding: 12px; }
      .section-title { margin: 0; font-size: 18px; font-weight: 800; }
      .section-subtitle { margin: 4px 0 0 0; font-size: 12px; color: #475569; }
      .features-grid { margin-top: 8px; }
      .feature-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; margin-top: 8px; }
      .feature-title { margin: 0; font-size: 14px; font-weight: 700; }
      .feature-desc { margin: 6px 0 0 0; font-size: 12px; color: #334155; }
      .feature-howto { margin: 6px 0 0 0; font-size: 12px; color: #0f172a; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <p class="header-title">Guide complet des fonctionnalités</p>
        <p class="header-subtitle">SafeBack - version PDF</p>
        <p class="meta">Généré le ${formatNow()}</p>
      </div>
      ${content}
    </div>
  </body>
</html>`;
}

export async function exportFeaturesGuidePdf(): Promise<string> {
  // Les imports dynamiques gardent les modules natifs en lazy-load jusqu'à la demande d'export.
  const Print = await import("expo-print");

  const { uri } = await Print.printToFileAsync({
    html: buildFeaturesGuideHtml(),
    base64: false
  });

  try {
    // API de partage standard pour limiter les erreurs de résolution de modules natifs.
    await Share.share({
      title: "Télécharger le guide SafeBack",
      message: "Guide des fonctionnalités SafeBack",
      url: uri
    });
  } catch {
    // no-op : fallback d'ouverture directe si le partage échoue.
    await Linking.openURL(uri);
  }

  return uri;
}
