export type FeatureEntry = {
  id: string;
  title: string;
  description: string;
  howTo: string;
  route?: string;
};

export type FeatureSection = {
  id: string;
  title: string;
  subtitle: string;
  accent: "amber" | "emerald" | "sky" | "rose" | "slate";
  features: FeatureEntry[];
};

// Catalogue central utilisé à la fois par la page in-app et le PDF téléchargeable.
export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    id: "trajets",
    title: "Trajets et Suivi",
    subtitle: "Préparer et suivre un trajet en temps réel.",
    accent: "amber",
    features: [
      {
        id: "new-trip",
        title: "Nouveau trajet",
        description: "Configure départ, destination, mode et ETA avant de partir.",
        howTo: "Accueil -> Nouveau trajet -> renseigner les adresses -> Lancer le trajet.",
        route: "/setup"
      },
      {
        id: "tracking",
        title: "Suivi en direct",
        description: "Visualise le trajet, la distance et la durée estimée.",
        howTo: "Après lancement, appuyer sur Suivre le trajet pour ouvrir l'écran de suivi.",
        route: "/trips"
      },
      {
        id: "trip-history",
        title: "Historique sécurité",
        description: "Timeline des trajets, retards, SOS et confirmations d'arrivée.",
        howTo: "Compte -> Mes trajets, puis consulter la section Timeline sécurité.",
        route: "/trips"
      },
      {
        id: "offline-trip",
        title: "Mode offline",
        description: "Prépare un trajet sans réseau. Synchronisation et alertes envoyées à la reconnexion.",
        howTo: "Lancer un trajet hors ligne: SafeBack le met en file d'attente automatiquement.",
        route: "/setup"
      }
    ]
  },
  {
    id: "alertes",
    title: "Alertes et Sécurité",
    subtitle: "Prévenir les proches et gérer les urgences.",
    accent: "rose",
    features: [
      {
        id: "delay-alerts",
        title: "Alertes de retard",
        description: "Relance automatique utilisateur puis escalade vers les proches.",
        howTo: "Compte -> Alertes, choisir les délais puis Enregistrer.",
        route: "/safety-alerts"
      },
      {
        id: "guardian-check",
        title: "Demande de nouvelles par garant",
        description: "Un garant peut demander si tu es bien rentré selon ton autorisation.",
        howTo: "Compte -> Alertes -> activer Vérification par les garants.",
        route: "/safety-alerts"
      },
      {
        id: "sos",
        title: "SOS discret",
        description: "Prépare un message d'alerte avec position et notifie aussi les garants.",
        howTo: "Écran Suivi -> maintenir le bouton SOS 2 secondes.",
        route: "/quick-sos"
      },
      {
        id: "low-battery",
        title: "Alerte batterie faible",
        description: "En dessous du seuil critique, SafeBack peut prévenir tes garants.",
        howTo: "Pendant un trajet actif, l'app surveille la batterie automatiquement.",
        route: "/trips"
      }
    ]
  },
  {
    id: "contacts",
    title: "Contacts et Réseau",
    subtitle: "Construire un réseau de confiance.",
    accent: "emerald",
    features: [
      {
        id: "favorites",
        title: "Favoris d'adresses",
        description: "Enregistre maison, travail ou lieux fréquents.",
        howTo: "Onglet Favoris -> Ajouter une adresse.",
        route: "/favorites"
      },
      {
        id: "contacts-list",
        title: "Contacts favoris",
        description: "Sélection rapide des proches à prévenir.",
        howTo: "Onglet Favoris -> Ajouter un contact ou importer depuis le téléphone.",
        route: "/favorites"
      },
      {
        id: "guardians",
        title: "Amis et garants",
        description: "Assigner un garant pour recevoir les notifications clés.",
        howTo: "Compte -> Amis, puis gérer les demandes et garants.",
        route: "/friends"
      },
      {
        id: "auto-checkins",
        title: "Arrivées auto (mode Snap)",
        description:
          "Définis plusieurs lieux + proches, puis valide l'arrivée par Position, Wi-Fi maison et/ou téléphone en charge.",
        howTo:
          "Compte -> Arrivées auto (Snap), créer une règle, choisir 1 à 3 conditions puis capturer ton Wi-Fi maison.",
        route: "/auto-checkins"
      },
      {
        id: "friends-live-map",
        title: "Carte des proches en direct",
        description:
          "Affiche les amis visibles avec leur icône personnalisée et leur statut en ligne/hors-ligne.",
        howTo:
          "Réseau proches -> Carte des proches, active le partage puis choisis ton icône de présence.",
        route: "/friends-map"
      }
    ]
  },
  {
    id: "rapports",
    title: "Incidents et Preuves",
    subtitle: "Documenter un incident et exporter un PDF.",
    accent: "sky",
    features: [
      {
        id: "incident-form",
        title: "Rapport incident",
        description: "Formulaire rapide: type, gravité, lieu, heure et détails.",
        howTo: "Accueil -> Rapport incident, puis remplir et enregistrer.",
        route: "/incident-report"
      },
      {
        id: "incident-pdf",
        title: "Export PDF incident",
        description: "Génère un document partageable pour archivage ou déclaration.",
        howTo: "Dans un rapport, appuyer sur Exporter en PDF.",
        route: "/incidents"
      },
      {
        id: "incident-history",
        title: "Historique des rapports",
        description: "Retrouve tous tes incidents et exporte de nouveau à tout moment.",
        howTo: "Compte -> Incidents.",
        route: "/incidents"
      },
      {
        id: "reliability-score",
        title: "Score de fiabilité",
        description: "Score basé sur retards, SOS, confirmations et batterie avec recommandations.",
        howTo: "Compte -> Mes trajets -> bloc Score fiabilité.",
        route: "/trips"
      }
    ]
  },
  {
    id: "quick-actions",
    title: "Actions Rapides",
    subtitle: "Utiliser SafeBack sans ouvrir toute l'application.",
    accent: "slate",
    features: [
      {
        id: "app-shortcuts",
        title: "Raccourcis iOS / Android",
        description: "Actions depuis l'icône de l'app: trajet, SOS, bien rentré, rapport.",
        howTo: "Appui long sur l'icône SafeBack depuis l'écran d'accueil du téléphone."
      },
      {
        id: "android-widget",
        title: "Widget Android",
        description: "Boutons Trajet, SOS, Bien rentré et actualisation.",
        howTo: "Écran d'accueil Android -> Widgets -> SafeBack rapide."
      },
      {
        id: "quick-arrival",
        title: "Je suis bien rentré",
        description: "Confirme immédiatement ton arrivée aux garants.",
        howTo: "Action rapide Bien rentré ou écran dédié.",
        route: "/quick-arrival"
      },
      {
        id: "privacy-center",
        title: "Centre de confidentialité",
        description: "Journal des partages/permissions et reset global en 1 clic.",
        howTo: "Aide ou Compte -> Centre de confidentialité.",
        route: "/privacy-center"
      }
    ]
  }
];
