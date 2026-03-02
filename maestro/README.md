# E2E Device (Maestro)

Ce dossier contient les flows E2E "vrai device" pour SafeBack.

## Pré-requis

- Un build installé sur l'appareil/simulateur avec `appId` `com.kyro31.SafeBack`
- `maestro` CLI installé:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

- Variables d'environnement minimales:
  - `MAESTRO_TEST_EMAIL`
  - `MAESTRO_TEST_PASSWORD`

## Lancer la suite standard

```bash
MAESTRO_TEST_EMAIL="test1@example.com" \
MAESTRO_TEST_PASSWORD="StrongPass123!" \
npm run test:e2e:device
```

La suite standard exécute:
- `maestro/flows/smoke-auth.yaml`
- `maestro/flows/trip-flow.yaml`
- `maestro/flows/sos-flow.yaml`
- `maestro/flows/friends-map-flow.yaml`
- `maestro/flows/onboarding-flow.yaml`

## Lancer un flow précis

```bash
MAESTRO_TEST_EMAIL="test1@example.com" \
MAESTRO_TEST_PASSWORD="StrongPass123!" \
npm run test:e2e:device -- maestro/flows/trip-flow.yaml
```

## Variables optionnelles

- `MAESTRO_APP_ID` (défaut: `com.kyro31.SafeBack`)
- `MAESTRO_FROM_ADDRESS` (défaut: `10 Rue de Rivoli, Paris`)
- `MAESTRO_TO_ADDRESS` (défaut: `11 Rue de Lyon, Paris`)
- `MAESTRO_FRIEND_PUBLIC_ID` (pour `friends-request-flow.yaml`)

Exemple demande d'ami:

```bash
MAESTRO_TEST_EMAIL="test1@example.com" \
MAESTRO_TEST_PASSWORD="StrongPass123!" \
MAESTRO_FRIEND_PUBLIC_ID="ABC12345" \
npm run test:e2e:device -- maestro/flows/friends-request-flow.yaml
```

## Notes de stabilité

- Les flows SOS/Map touchent aux permissions de localisation: les prompts FR/EN sont gérés via `maestro/helpers/accept-location-permission.yaml`.
- Si le compte est déjà connecté, le helper `login-if-needed.yaml` ne ressaisit pas les identifiants.
