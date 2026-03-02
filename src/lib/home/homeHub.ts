// Catalogue de navigation de l'accueil pour garder une hiérarchie claire et éviter la surcharge de boutons.
export type HomeHubCategoryId = "essentiel" | "sécurité" | "support";

export type HomeHubItem = {
  id: string;
  title: string;
  subtitle: string;
  href:
    | "/setup"
    | "/trips"
    | "/messages"
    | "/favorites"
    | "/friends"
    | "/friends-map"
    | "/notifications"
    | "/incident-report"
    | "/incidents"
    | "/predefined-message"
    | "/safety-alerts"
    | "/forgotten-trip"
    | "/auto-checkins"
    | "/guardian-dashboard"
    | "/live-companion"
    | "/safety-drill"
    | "/privacy-center"
    | "/sessions-devices"
    | "/accessibility"
    | "/voice-assistant"
    | "/features-guide";
  category: HomeHubCategoryId;
};

export const HOME_HUB_ITEMS: HomeHubItem[] = [
  {
    id: "trip-new",
    title: "Nouveau trajet",
    subtitle: "Préparer départ, destination et proches en 1 écran.",
    href: "/setup",
    category: "essentiel"
  },
  {
    id: "trips-history",
    title: "Mes trajets",
    subtitle: "Historique, timeline sécurité et score de fiabilité.",
    href: "/trips",
    category: "essentiel"
  },
  {
    id: "messages",
    title: "Messagerie proches",
    subtitle: "Conversations et confirmations d'arrivée.",
    href: "/messages",
    category: "essentiel"
  },
  {
    id: "favorites",
    title: "Favoris",
    subtitle: "Adresses et contacts pour aller plus vite.",
    href: "/favorites",
    category: "essentiel"
  },
  {
    id: "friends",
    title: "Réseau proches",
    subtitle: "Amis, garants et demandes de nouvelles.",
    href: "/friends",
    category: "essentiel"
  },
  {
    id: "friends-map",
    title: "Carte des proches",
    subtitle: "Voir qui est visible en direct, en ligne ou hors-ligne.",
    href: "/friends-map",
    category: "essentiel"
  },
  {
    id: "delay-alerts",
    title: "Alertes sécurité",
    subtitle: "Retards, escalade et vérifications automatiques.",
    href: "/safety-alerts",
    category: "sécurité"
  },
  {
    id: "auto-checkin",
    title: "Arrivées auto (Snap)",
    subtitle: "Confirmer automatiquement l'arrivée selon tes règles.",
    href: "/auto-checkins",
    category: "sécurité"
  },
  {
    id: "guardian-dashboard",
    title: "Dashboard proches",
    subtitle: "Personnes suivies, statuts réseau et actions rapides.",
    href: "/guardian-dashboard",
    category: "sécurité"
  },
  {
    id: "live-companion",
    title: "Accompagnement direct",
    subtitle: "Mode co-pilote: checkpoints, messages et rappel ETA.",
    href: "/live-companion",
    category: "sécurité"
  },
  {
    id: "safety-drill",
    title: "Simulation de crise",
    subtitle: "Teste faux SOS/faux retard pour valider le système.",
    href: "/safety-drill",
    category: "sécurité"
  },
  {
    id: "forgotten-trip",
    title: "Trajet oublié",
    subtitle: "Détection d'un départ sans trajet lancé.",
    href: "/forgotten-trip",
    category: "sécurité"
  },
  {
    id: "notifications",
    title: "Centre notifications",
    subtitle: "Alertes in-app et suivi des événements.",
    href: "/notifications",
    category: "support"
  },
  {
    id: "incident-report",
    title: "Rapport incident",
    subtitle: "Signaler vite un incident et générer un PDF.",
    href: "/incident-report",
    category: "support"
  },
  {
    id: "incidents",
    title: "Historique incidents",
    subtitle: "Retrouver et exporter tes rapports.",
    href: "/incidents",
    category: "support"
  },
  {
    id: "privacy-center",
    title: "Confidentialité",
    subtitle: "Permissions, journal de partage et reset global.",
    href: "/privacy-center",
    category: "support"
  },
  {
    id: "sessions-devices",
    title: "Sessions & appareils",
    subtitle: "Appareils connectés et déconnexion des autres sessions.",
    href: "/sessions-devices",
    category: "support"
  },
  {
    id: "accessibility",
    title: "Accessibilité",
    subtitle: "Lisibilité, contraste, haptique et commandes vocales.",
    href: "/accessibility",
    category: "support"
  },
  {
    id: "voice-assistant",
    title: "Assistant vocal",
    subtitle: "Commande rapide via dictée clavier.",
    href: "/voice-assistant",
    category: "support"
  },
  {
    id: "features-guide",
    title: "Guide complet",
    subtitle: "Toutes les fonctionnalités expliquées pas à pas.",
    href: "/features-guide",
    category: "support"
  },
  {
    id: "predefined-message",
    title: "Message prédéfini",
    subtitle: "Texte automatique envoyé aux proches à l'arrivée.",
    href: "/predefined-message",
    category: "support"
  }
];

export function getPrimaryHomeHubItems(max = 4): HomeHubItem[] {
  const priorityOrder = ["/setup", "/friends-map", "/friends", "/messages", "/guardian-dashboard"] as const;
  const prioritized = priorityOrder
    .map((href) => HOME_HUB_ITEMS.find((item) => item.href === href))
    .filter((item): item is HomeHubItem => Boolean(item));
  if (max <= prioritized.length) return prioritized.slice(0, Math.max(1, max));
  const fallback = HOME_HUB_ITEMS.filter(
    (item) => !prioritized.some((priorityItem) => priorityItem.id === item.id)
  );
  return [...prioritized, ...fallback].slice(0, Math.max(1, max));
}

export function getHomeHubSections(): Array<{
  id: HomeHubCategoryId;
  title: string;
  items: HomeHubItem[];
}> {
  return [
    {
      id: "essentiel",
      title: "Essentiel",
      items: HOME_HUB_ITEMS.filter((item) => item.category === "essentiel")
    },
    {
      id: "sécurité",
      title: "Sécurité",
      items: HOME_HUB_ITEMS.filter((item) => item.category === "sécurité")
    },
    {
      id: "support",
      title: "Support",
      items: HOME_HUB_ITEMS.filter((item) => item.category === "support")
    }
  ];
}
