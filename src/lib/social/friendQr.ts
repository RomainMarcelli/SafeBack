// Helpers QR SafeBack: lecture robuste d'un payload QR vers un ID public exploitable.
export function parseSafeBackPublicIdFromQr(raw: string): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  // Format interne principal: SAFEBACK|<public_id>
  if (value.toUpperCase().startsWith("SAFEBACK|")) {
    const candidate = value.slice("SAFEBACK|".length).trim();
    return candidate.length > 0 ? candidate : null;
  }

  // Format URL deeplink/web: ...publicId=<id>
  try {
    const url = new URL(value);
    const publicId = url.searchParams.get("publicId")?.trim() ?? "";
    if (publicId.length > 0) return publicId;
  } catch {
    // ignore URL parsing errors
  }

  // Fallback: un QR contenant directement l'ID public.
  if (/^[a-z0-9_-]{4,64}$/i.test(value)) {
    return value;
  }
  return null;
}
