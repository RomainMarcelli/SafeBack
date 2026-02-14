// Catalogue de navigation de l'accueil pour garder une hiérarchie claire et éviter la surcharge de boutons.
export type HomeHubCategoryId = "essentiel" | "securite" | "support";

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
    | "/privacy-center"
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
    category: "securite"
  },
  {
    id: "friends-map",
    title: "Carte des proches",
    subtitle: "Voir qui est visible en direct, en ligne ou hors-ligne.",
    href: "/friends-map",
    category: "securite"
  },
  {
    id: "delay-alerts",
    title: "Alertes sécurité",
    subtitle: "Retards, escalade et vérifications automatiques.",
    href: "/safety-alerts",
    category: "securite"
  },
  {
    id: "auto-checkin",
    title: "Arrivées auto (Snap)",
    subtitle: "Confirmer automatiquement l'arrivée selon tes règles.",
    href: "/auto-checkins",
    category: "securite"
  },
  {
    id: "forgotten-trip",
    title: "Trajet oublié",
    subtitle: "Détection d'un départ sans trajet lancé.",
    href: "/forgotten-trip",
    category: "securite"
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
  return HOME_HUB_ITEMS.filter((item) => item.category === "essentiel").slice(0, Math.max(1, max));
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
      id: "securite",
      title: "Sécurité",
      items: HOME_HUB_ITEMS.filter((item) => item.category === "securite")
    },
    {
      id: "support",
      title: "Support",
      items: HOME_HUB_ITEMS.filter((item) => item.category === "support")
    }
  ];
}
