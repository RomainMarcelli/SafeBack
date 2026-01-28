import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { insertLocationPoint } from "../lib/db";

const TASK_NAME = "safeback-background-location";
const SESSION_KEY = "safeback:sessionId";

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error) {
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] })?.locations;
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
    // ignore errors to avoid crashing background task
  }
});

export async function startBackgroundTracking(sessionId: string) {
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
  const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (started) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
  await AsyncStorage.removeItem(SESSION_KEY);
}
