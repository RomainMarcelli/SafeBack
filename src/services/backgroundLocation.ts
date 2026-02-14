import Constants from "expo-constants";

const TASK_NAME = "safeback-background-location";
const SESSION_KEY = "safeback:sessionId";

type BackgroundLocationPayload = {
  locations?: Array<{
    coords: { latitude: number; longitude: number; accuracy?: number | null };
  }>;
};

let taskDefined = false;

const isExpoGo = () => Constants.appOwnership === "expo";

async function ensureTaskDefined() {
  if (taskDefined) return;
  const TaskManager = await import("expo-task-manager");
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  const { insertLocationPoint } = await import("../lib/core/db");

  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) {
      return;
    }
    const locations = (data as BackgroundLocationPayload | undefined)?.locations;
    if (!locations?.length) return;

    const sessionId = await AsyncStorage.getItem(SESSION_KEY);
    if (!sessionId) return;

    const loc = locations[0];
    try {
      await insertLocationPoint({
        session_id: sessionId,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? null
      });
    } catch {
      // Ignore les erreurs pour éviter de faire planter la tâche en arrière-plan.
    }
  });

  taskDefined = true;
}

export async function startBackgroundTracking(sessionId: string) {
  if (isExpoGo()) {
    throw new Error("Suivi en arriere-plan indisponible sur Expo Go.");
  }
  await ensureTaskDefined();
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  const Location = await import("expo-location");

  await AsyncStorage.setItem(SESSION_KEY, sessionId);
  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Permission background refusee");
  }
  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15000,
    distanceInterval: 15,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "SafeBack",
      notificationBody: "Suivi du trajet en cours"
    }
  });
}

export async function stopBackgroundTracking() {
  if (isExpoGo()) {
    return;
  }
  const Location = await import("expo-location");
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;

  const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (started) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
  await AsyncStorage.removeItem(SESSION_KEY);
}
