# SafeBack

Application mobile Expo/React Native pour securiser les trajets:
- preparation d un trajet (depart, destination, ETA)
- alerte des proches (SMS, WhatsApp, email, app)
- suivi de position en direct
- confirmation "bien rentre"
- messagerie et gestion de garants

## Sommaire
- [Fonctionnalites](#fonctionnalites)
- [Stack technique](#stack-technique)
- [Prerequis](#prerequis)
- [Installation rapide](#installation-rapide)
- [Variables d environnement](#variables-d-environnement)
- [Lancement du projet](#lancement-du-projet)
- [Configuration Supabase](#configuration-supabase)
- [Architecture du projet](#architecture-du-projet)
- [Tests](#tests)
- [Guide des fonctionnalites](#guide-des-fonctionnalites)
- [Expo Go et limites](#expo-go-et-limites)
- [Depannage](#depannage)

## Fonctionnalites

### Trajets et suivi
- Creation de trajet avec depart/destination et mode de deplacement (a pied, voiture, transit)
- Estimation de duree et distance
- Tracking en direct sur carte
- Partage de suivi via lien ami (`/friend-view`)
- Arret automatique du partage possible a l arrivee

### Contacts et notifications
- Favoris adresses + contacts
- Groupes de contacts (`family`, `colleagues`, `friends`)
- Profils de notification par groupe
- Envoi multi canal (SMS, WhatsApp, email, app)
- Alertes de retard (rappel + escalation)
- Option vie privee: autoriser/refuser les demandes de nouvelles par les garants

### Social et communication
- Messagerie (texte, vocal placeholder, messages d arrivee)
- Assignation de garants
- Notifications in-app via table `app_notifications`
- Recherche/gestion de profils publics et demandes d amis

### Productivite et securite
- Widget Android (actions rapides)
- Action rapide "Je suis bien rentre"
- Detection de trajet oublie
- Mode SOS (envoi message + lien de position)
- Mode offline: preparation de trajet sans reseau + synchronisation differée
- Alerte batterie faible proactive vers les garants
- Centre de confidentialite (permissions, journal, reset 1 clic)

## Stack technique
- Expo SDK 54 + React Native 0.81 + React 19
- Expo Router (routing fichiers)
- Supabase (Auth + Postgres + RLS + fonctions SQL)
- NativeWind (Tailwind pour React Native)
- Vitest (tests unitaires des libs/services)

## Prerequis
- Node.js LTS recommande (20.x ou 22.x)
- npm
- Un projet Supabase
- Expo Go (optionnel pour tests rapides sur iOS/Android)

## Installation rapide

```bash
npm install
```

Puis cree un fichier `.env` a la racine du projet.

## Variables d environnement

Variables utilisees par le code:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
# Optionnel (necessaire pour certaines routes/maps premium)
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<google-maps-api-key>
```

## Lancement du projet

### Developpement
```bash
npm run start
```

### iOS avec Expo Go
```bash
npx expo start --tunnel
```
Puis scanner le QR code avec Expo Go sur iPhone.

### Android / iOS natif (dev build)
```bash
npm run android
npm run ios
```

### Web
```bash
npm run web
```

### Sync offline des trajets
Si un trajet est lance hors ligne, il est ajoute a une file locale et synchronise automatiquement
quand la connexion revient (session + notification garants).

## Configuration Supabase

Le projet inclut maintenant une structure SQL propre dans le dossier `supabase/`.

Option simple (recommandee):
1. Executer uniquement `supabase/all_in_one.sql`

Option migrations separees:
1. `supabase/migrations/001_align_app.sql`
2. `supabase/migrations/002_messaging_notifications.sql`
3. `supabase/migrations/003_social_graph.sql`
4. `supabase/migrations/004_fix_42702_user_id_ambiguous.sql`
5. `supabase/migrations/005_guardian_check_requests.sql`
6. `supabase/migrations/006_incident_reports.sql`
7. `supabase/migrations/007_friend_map_and_wellbeing_ping.sql`

Script legacy disponible:
- `supabase/legacy/supabase_legacy.sql` (ancien schema historique)

Application automatique depuis le terminal:
```bash
SUPABASE_DB_URL='postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require' npm run db:apply
```
Le script utilise `psql` et applique `supabase/all_in_one.sql` d un seul coup.

Ce que les scripts configurent:
- Tables metier (sessions, contacts, favoris, locations, conversations, messages, notifications)
- Fonctions SQL (conversation directe, partage de session, social graph)
- Triggers et index
- RLS policies pour l isolation des donnees utilisateur

## Architecture du projet

```text
app/
  (auth)/                ecrans authentification
  (main)/                home, setup trajet, messages, favoris, compte
  (features)/            tracking, SOS, incidents, social, securite, premium...
  (info)/                aide, guide, legal, about
  _layout.tsx            layout global + tabs
src/
  lib/                   logique metier + acces Supabase + export PDF
  services/              tracking background, detecteur trajet oublie
  widgets/android/       composant widget Android
supabase/
  all_in_one.sql         script unique pret a executer
  migrations/            scripts SQL versionnes
  legacy/                ancien schema conserve pour reference
docs/
  data-architecture.md   schema, relations, flux et RLS
```

## Tests

Executer tous les tests:

```bash
npm run test
```

Mode watch:

```bash
npm run test:watch
```

Executer les scenarios E2E (niveau service: inscription, trajet, SOS, amis, map live, onboarding):

```bash
npm run test:e2e
```

Executer les E2E device (Maestro, iOS/Android):

```bash
MAESTRO_TEST_EMAIL="test1@example.com" \
MAESTRO_TEST_PASSWORD="StrongPass123!" \
npm run test:e2e:device
```

Details des flows, variables et prerequisites:
- `maestro/README.md`

Tests resiliences offline/reseau faible + reprise apres crash:
- `src/lib/trips/offlineRecovery.test.ts`
- `src/lib/trips/offlineTripQueue.test.ts`

Monitoring runtime + metriques UX:
- capture erreurs JS globales + promesses non gerees
- file locale persistante puis flush Supabase automatique
- tables:
  - `public.runtime_error_events`
  - `public.ux_metric_events`
- metriques onboarding:
  - temps de configuration complet
  - abandon d etape
  - completion d etape

## Guide des fonctionnalites

L application inclut une page dediee pour tout retrouver:
- route: `/features-guide`
- acces depuis:
  - `Aide / FAQ`
  - `Accueil` (raccourcis)
  - `Compte` (raccourcis)
- contenu:
  - toutes les fonctionnalites classees par sections
  - recherche instantanee
  - filtres par categories (Trajets, Alertes, Incidents, Actions rapides...)
  - explication + "comment faire" pour chaque fonctionnalite
  - bouton direct vers les ecrans associes

PDF du guide:
- depuis `/features-guide`, bouton `Telecharger le guide en PDF`
- le PDF reutilise le meme catalogue que la page app (meme contenu fonctionnel)

Centre de confidentialite:
- route: `/privacy-center`
- acces depuis:
  - `Aide / FAQ`
  - `Accueil` (bloc Securite)
  - `Compte` (raccourcis)
- inclut:
  - etat des permissions (localisation, contacts, notifications)
  - journal des evenements de partage/confidentialite
  - reset global en 1 clic

Score de fiabilite:
- visible dans `Mes trajets` (`/trips`)
- base sur trajets, confirmations d arrivee, retards, SOS, alertes batterie
- recommandations personnalisees affichees automatiquement

Actions rapides iOS/Android:
- actions app icon configurees via `expo-quick-actions`:
  - `Demarrer un trajet`
  - `SOS rapide`
  - `Je suis bien rentre`
  - `Rapport incident`
- Android widget `SafeBack rapide`:
  - `Trajet`
  - `SOS`
  - `Bien rentre`
  - `Actualiser`

Rapports incident:
- ecran de creation: `/incident-report`
- historique + export PDF: `/incidents`
- table Supabase: `public.incident_reports` (script `supabase/migrations/006_incident_reports.sql`)

## Expo Go et limites

Certaines fonctions sont limitees ou indisponibles dans Expo Go:
- notifications locales planifiees avancees
- tracking en arriere plan (`expo-task-manager` + background location)
- widget Android
- quick actions app icon iOS/Android (a valider idealement en dev build)

Pour tester ces fonctions, utiliser un dev build (`npm run android` / `npm run ios`).

## Depannage

### `Cannot determine which native SDK version... expo is not installed`
```bash
npm install
```

### `Cannot find module 'react-native/package.json'`
Arbre `node_modules` incomplet/corrompu:
```bash
rm -rf node_modules package-lock.json
npm install
```

Si votre environnement bloque certains postinstall (ex: EPERM sur montage externe), essayer:
```bash
npm install --ignore-scripts
```

### Erreur navigation / cache Metro
```bash
npx expo start -c
```

### Les notifications ne partent pas
- Verifier les permissions systeme (iOS/Android)
- Verifier les variables Supabase dans `.env`
- Sur Expo Go, certaines notifications sont volontairement limitees

---

Si tu veux, je peux aussi te generer:
1. un `.env.example`
2. un guide "premier deploiement Supabase" pas a pas
3. une section contribution/CI avec checks automatiques
