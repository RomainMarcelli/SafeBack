import AsyncStorage from "@react-native-async-storage/async-storage";

const HOME_WIDGET_STATE_KEY = "safeback:home_widget_state";

export type HomeWidgetStatus = "idle" | "trip_active" | "arrived";

export type HomeWidgetState = {
  status: HomeWidgetStatus;
  fromAddress: string;
  toAddress: string;
  note: string;
  updatedAtIso: string;
};

export const DEFAULT_HOME_WIDGET_STATE: HomeWidgetState = {
  status: "idle",
  fromAddress: "",
  toAddress: "",
  note: "Pret",
  updatedAtIso: ""
};

function isHomeWidgetStatus(value: unknown): value is HomeWidgetStatus {
  return value === "idle" || value === "trip_active" || value === "arrived";
}

function normalizeHomeWidgetState(raw: Partial<HomeWidgetState> | null | undefined): HomeWidgetState {
  // Normalise toutes les valeurs lues du stockage pour éviter de casser le rendu du widget.
  return {
    status: isHomeWidgetStatus(raw?.status) ? raw.status : DEFAULT_HOME_WIDGET_STATE.status,
    fromAddress: String(raw?.fromAddress ?? DEFAULT_HOME_WIDGET_STATE.fromAddress),
    toAddress: String(raw?.toAddress ?? DEFAULT_HOME_WIDGET_STATE.toAddress),
    note: String(raw?.note ?? DEFAULT_HOME_WIDGET_STATE.note),
    updatedAtIso: String(raw?.updatedAtIso ?? DEFAULT_HOME_WIDGET_STATE.updatedAtIso)
  };
}

export async function getHomeWidgetState(): Promise<HomeWidgetState> {
  const raw = await AsyncStorage.getItem(HOME_WIDGET_STATE_KEY);
  if (!raw) return DEFAULT_HOME_WIDGET_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<HomeWidgetState>;
    return normalizeHomeWidgetState(parsed);
  } catch {
    return DEFAULT_HOME_WIDGET_STATE;
  }
}

export async function setHomeWidgetState(
  patch: Partial<HomeWidgetState>
): Promise<HomeWidgetState> {
  const current = await getHomeWidgetState();
  // Le patch reste partiel côté appelant, mais on persiste toujours un état complet.
  const next = normalizeHomeWidgetState({
    ...current,
    ...patch,
    updatedAtIso: patch.updatedAtIso ?? new Date().toISOString()
  });
  await AsyncStorage.setItem(HOME_WIDGET_STATE_KEY, JSON.stringify(next));
  return next;
}

export async function resetHomeWidgetState(): Promise<void> {
  await AsyncStorage.setItem(
    HOME_WIDGET_STATE_KEY,
    JSON.stringify({
      ...DEFAULT_HOME_WIDGET_STATE,
      updatedAtIso: new Date().toISOString()
    })
  );
}

export function formatWidgetStatusLabel(status: HomeWidgetStatus): string {
  if (status === "trip_active") return "Trajet actif";
  if (status === "arrived") return "Bien rentre";
  return "Pret";
}

export function formatWidgetUpdatedAt(value: string): string {
  // Retourne une heure lisible HH:mm, ou un fallback stable si la valeur est invalide.
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
