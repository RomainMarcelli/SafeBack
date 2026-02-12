import { Platform } from "react-native";
import { registerSafeBackHomeWidgetTask } from "./src/lib/androidHomeWidget";

if (Platform.OS === "android") {
  registerSafeBackHomeWidgetTask();
}

import "expo-router/entry";
