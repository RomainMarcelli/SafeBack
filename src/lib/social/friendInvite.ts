// Helper de message d'invitation ami pour un partage plus clair et plus premium.
export function buildFriendInviteMessage(params: {
  publicId: string;
  appName?: string;
  note?: string;
}): string {
  const appName = String(params.appName ?? "SafeBack").trim() || "SafeBack";
  const publicId = String(params.publicId ?? "").trim();
  const note = String(params.note ?? "").trim();

  const header = `Hey, on se connecte sur ${appName} ?`;
  const body =
    "Je t'ajoute en proche de confiance pour les trajets (arrivee, SOS, verification rapide).";
  const idLine = publicId ? `Mon identifiant: ${publicId}` : "Mon identifiant: (indisponible)";
  const hint = "Ouvre l'app > Reseau proches > Rechercher un profil.";
  const personalNote = note ? `\nMessage perso: ${note}` : "";

  return `${header}\n${body}\n${idLine}\n${hint}${personalNote}`;
}
