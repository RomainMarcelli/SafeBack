// Traduction des erreurs de connexion en messages FR actionnables.
type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
  error_description?: string;
};

export type SignInErrorUi = {
  title: string;
  message: string;
  hint?: string;
  code?: string;
  kind: "email_not_confirmed" | "invalid_credentials" | "network" | "generic";
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractAuthError(error: unknown): { code: string; message: string } {
  if (!error || typeof error !== "object") {
    return { code: "", message: "" };
  }
  const value = error as AuthErrorLike;
  return {
    code: normalizeText(value.code),
    message: normalizeText(value.message) || normalizeText(value.error_description)
  };
}

export function toSignInErrorFr(error: unknown): SignInErrorUi {
  const { code, message } = extractAuthError(error);
  const lower = message.toLowerCase();

  if (lower.includes("email not confirmed") || lower.includes("email_not_confirmed")) {
    return {
      kind: "email_not_confirmed",
      title: "Email non confirmé",
      message: "Tu dois confirmer ton email avant de te connecter.",
      hint: "Vérifie tes spams, puis renvoie l'email de confirmation si besoin.",
      code: code || undefined
    };
  }

  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid credentials") ||
    lower.includes("invalid email or password")
  ) {
    return {
      kind: "invalid_credentials",
      title: "Identifiants invalides",
      message: "Email/username ou mot de passe incorrect.",
      hint: "Vérifie la casse et réessaie.",
      code: code || undefined
    };
  }

  if (lower.includes("failed to fetch") || lower.includes("network request failed")) {
    return {
      kind: "network",
      title: "Problème réseau",
      message: "Impossible de contacter le serveur de connexion.",
      hint: "Vérifie ta connexion internet et réessaie.",
      code: code || undefined
    };
  }

  return {
    kind: "generic",
    title: "Connexion impossible",
    message: "Une erreur est survenue pendant la connexion.",
    hint: "Réessaie dans quelques instants.",
    code: code || undefined
  };
}
