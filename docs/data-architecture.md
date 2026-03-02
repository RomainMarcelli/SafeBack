# Data Architecture - SafeBack

## Objectif
Ce document décrit le modèle de données SafeBack, les flux principaux et les règles de sécurité appliquées côté Supabase.

## Stockage et localisation
- Backend principal: Supabase (Auth + PostgreSQL + Storage).
- URL projet (runtime Expo): `EXPO_PUBLIC_SUPABASE_URL` dans `.env`.
- Région des données: région du projet Supabase configurée dans le dashboard (`Project Settings > General > Region`).
- Données locales sensibles: `expo-secure-store` (via `src/lib/core/secureStorage.ts`).

## Tables principales

### Compte et profil
- `public.profiles`: identité applicative (username, prénom/nom, téléphone, consentements, préférences carte).
- `public.user_device_sessions`: sessions/appareils connectés pour la sécurité compte.

### Trajets
- `public.sessions`: trajets utilisateur (départ, destination, ETA, partage live).
- `public.locations`: positions GPS horodatées par trajet.
- `public.session_contacts`: liaison trajet <-> contacts notifiés.
- `public.favorite_addresses`: adresses favorites utilisateur.
- `public.contacts`: proches utilisateur (canal, groupe, téléphone/email).

### Communication et social
- `public.friend_requests`, `public.friendships`: graphe social.
- `public.guardianships`: relation propriétaire <-> garant.
- `public.conversations`, `public.conversation_participants`, `public.messages`: messagerie.
- `public.app_notifications`: notifications in-app.
- `public.friend_map_presence`: présence live sur carte des proches.
- `public.friend_wellbeing_pings`: demandes "bien arrivé ?" en 1 clic.

### Sécurité et incidents
- `public.incident_reports`: incidents utilisateur (SOS/retard/autre).
- `public.runtime_error_events`: erreurs runtime collectées.
- `public.ux_metric_events`: métriques UX collectées.

## Relations clés
- `auth.users(id)` -> clé de référence pour les tables utilisateur (`profiles`, `sessions`, `contacts`, etc.).
- `sessions(id)` -> parent de `locations` et `session_contacts`.
- `conversations(id)` -> parent de `conversation_participants` et `messages`.
- `friendships` et `guardianships` modélisent la confiance entre utilisateurs.

## Flux de données principaux

### 1) Tracking trajet
1. L'utilisateur crée un trajet (`sessions`).
2. Les points GPS sont envoyés (`locations`).
3. Les proches ciblés sont liés (`session_contacts`) et notifiés (`app_notifications` + canaux externes).

### 2) Social / messagerie
1. Demande d'ami (`friend_requests`), acceptation (`friendships`).
2. Conversation directe/groupe (`conversations`, `conversation_participants`).
3. Messages texte/vocaux (`messages`).

### 3) Carte live proches
1. L'utilisateur autorise le partage (`profiles.map_share_enabled`).
2. La présence est mise à jour (`friend_map_presence`).
3. Les amis autorisés consultent la position selon RLS et consentements.

### 4) Monitoring
1. L'app queue localement les erreurs/métriques.
2. Flush vers Supabase (`runtime_error_events`, `ux_metric_events`).
3. Purge serveur planifiée (rétention).

## RGPD / vie privée
- Export complet JSON: RPC `public.export_my_data()`.
- Suppression compte complète: RPC `public.delete_my_account()`.
- Consentements granulaires: colonnes `consent_*` dans `profiles`.
- Journal local confidentialité: `src/lib/privacy/privacyCenter.ts` (stockage local app).

## Rétention automatique
- Purge logs runtime > 90 jours: `public.purge_runtime_error_events_retention(interval)`.
- Purge positions anciennes > 90 jours: `public.purge_locations_retention(interval)`.
- Planification automatique via `pg_cron` si disponible (jobs SQL dans `supabase/migrations/010_rgpd_export_and_retention.sql`).

## Sécurité d'accès (RLS)
- RLS activé sur les tables métier.
- Politiques basées sur `auth.uid()` pour isoler chaque utilisateur.
- Fonctions sensibles en `security definer` pour encapsuler suppression/export sans exposer des accès bruts.

## Fichiers de référence
- Schéma consolidé: `supabase/all_in_one.sql`
- Migrations versionnées: `supabase/migrations/`
- Accès DB client: `src/lib/core/db.ts`
- Centre confidentialité UI: `app/(info)/privacy-center.tsx`
