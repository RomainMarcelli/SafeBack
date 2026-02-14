// Traduction des erreurs d'authentification en messages utilisateur clairs en français.
type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
  error_description?: string;
};

export type SignupErrorUi = {
  title: string;
  message: string;
  hint?: string;
  code?: string;
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

export function toSignupErrorFr(error: unknown): SignupErrorUi {
  const { code, message } = extractAuthError(error);
  const lower = message.toLowerCase();

  if (lower.includes("user already registered") || lower.includes("already registered")) {
    return {
      title: "Compte deja existant",
      message: "Un compte existe deja avec cette adresse email.",
      hint: "Connecte-toi ou utilise une autre adresse email.",
      code: code || undefined
    };
  }

  if (lower.includes("invalid email") || lower.includes("unable to validate email address")) {
    return {
      title: "Email invalide",
      message: "Le format de l adresse email n est pas valide.",
      hint: "Exemple: prenom.nom@email.com",
      code: code || undefined
    };
  }

  if (lower.includes("password should be at least")) {
    const minLength = message.match(/(\d+)/)?.[1] ?? "6";
    return {
      title: "Mot de passe trop court",
      message: `Ton mot de passe doit contenir au moins ${minLength} caracteres.`,
      hint: "Ajoute lettres, chiffres et caracteres speciaux pour plus de securite.",
      code: code || undefined
    };
  }

  if (lower.includes("weak password") || lower.includes("password is too weak")) {
    return {
      title: "Mot de passe trop faible",
      message: "Le mot de passe choisi n est pas assez robuste.",
      hint: "Utilise au moins 8 caracteres avec chiffres et symboles.",
      code: code || undefined
    };
  }

  if (lower.includes("signup is disabled")) {
    return {
      title: "Inscription indisponible",
      message: "La creation de compte est actuellement desactivee.",
      hint: "Reessaie plus tard ou contacte le support.",
      code: code || undefined
    };
  }

  if (
    lower.includes("email rate limit exceeded") ||
    lower.includes("over email rate limit") ||
    lower.includes("too many requests")
  ) {
    return {
      title: "Trop de tentatives",
      message: "Trop de demandes d inscription ont ete envoyees en peu de temps.",
      hint: "Attends quelques minutes avant de recommencer.",
      code: code || undefined
    };
  }

  if (lower.includes("failed to fetch") || lower.includes("network request failed")) {
    return {
      title: "Probleme reseau",
      message: "Impossible de contacter le serveur pour l inscription.",
      hint: "Verifie ta connexion internet et reessaie.",
      code: code || undefined
    };
  }

  if (lower.includes("database error")) {
    return {
      title: "Erreur serveur",
      message: "Le serveur a rencontre une erreur pendant la creation du compte.",
      hint: "Reessaie dans quelques instants.",
      code: code || undefined
    };
  }

  return {
    title: "Inscription impossible",
    message: "Une erreur est survenue pendant la creation du compte.",
    hint: "Verifie les informations puis reessaie.",
    code: code || undefined
  };
}
