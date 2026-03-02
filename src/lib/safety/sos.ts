export type SosCoords = {
  lat: number;
  lon: number;
};

export function formatSosCoords(coords: SosCoords | null | undefined): string {
  if (!coords) return "position inconnue";
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) return "position inconnue";
  return `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`;
}

export function buildSosMessage(params: {
  fromAddress?: string | null;
  toAddress?: string | null;
  currentAddress?: string | null;
  coords?: SosCoords | null;
  now?: Date;
}): string {
  const fallbackFromTo =
    params.fromAddress?.trim() && params.toAddress?.trim()
      ? `${params.fromAddress?.trim()} -> ${params.toAddress?.trim()}`
      : "adresse actuelle inconnue";
  const location = params.currentAddress?.trim() || fallbackFromTo;
  const mapsLink =
    params.coords && Number.isFinite(params.coords.lat) && Number.isFinite(params.coords.lon)
      ? ` https://maps.google.com/?q=${params.coords.lat},${params.coords.lon}`
      : "";

  return `Je suis en danger. Je suis ici : ${location}.${mapsLink}`;
}

export function buildSmsUrl(params: {
  phones: string[];
  body: string;
  platform: "ios" | "android";
}): string | null {
  const recipients = params.phones
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (recipients.length === 0) return null;
  const separator = params.platform === "ios" ? "&" : "?";
  return `sms:${recipients.join(",")}${separator}body=${encodeURIComponent(params.body)}`;
}
