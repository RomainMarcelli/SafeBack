// Pont de synchronisation entre l'état applicatif et le widget Android d'accueil.
import { Platform } from "react-native";
import {
  registerWidgetTaskHandler,
  requestWidgetUpdate,
  type WidgetInfo
} from "react-native-android-widget";
import {
  getHomeWidgetState,
  setHomeWidgetState,
  type HomeWidgetState
} from "./homeWidgetState";
import { SafeBackHomeWidget } from "../../widgets/android/SafeBackHomeWidget";

export const SAFEBACK_HOME_WIDGET_NAME = "SafeBackHomeWidget";
const WIDGET_REFRESH_ACTION = "SAFEBACK_WIDGET_REFRESH";

let widgetHandlerRegistered = false;

async function buildWidget(widgetInfo: WidgetInfo) {
  const state = await getHomeWidgetState();
  return <SafeBackHomeWidget widgetInfo={widgetInfo} state={state} />;
}

export function registerSafeBackHomeWidgetTask(): void {
  if (Platform.OS !== "android" || widgetHandlerRegistered) return;
  widgetHandlerRegistered = true;

  registerWidgetTaskHandler(async ({ widgetInfo, widgetAction, clickAction, renderWidget }) => {
    if (widgetAction === "WIDGET_ADDED") {
      await setHomeWidgetState({
        updatedAtIso: new Date().toISOString()
      });
    }
    if (widgetAction === "WIDGET_CLICK" && clickAction === WIDGET_REFRESH_ACTION) {
      await setHomeWidgetState({
        updatedAtIso: new Date().toISOString()
      });
    }
    renderWidget(await buildWidget(widgetInfo));
  });
}

export async function syncSafeBackHomeWidget(patch: Partial<HomeWidgetState>): Promise<void> {
  await setHomeWidgetState(patch);
  if (Platform.OS !== "android") return;

  await requestWidgetUpdate({
    widgetName: SAFEBACK_HOME_WIDGET_NAME,
    renderWidget: buildWidget
  });
}
