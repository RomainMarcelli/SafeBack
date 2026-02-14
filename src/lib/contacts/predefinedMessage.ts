// Gestion des modèles de messages prêts à l'emploi pour les notifications sensibles.
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREDEFINED_MESSAGE_KEY = "safeback:predefined_message";
const PREDEFINED_MESSAGE_CUSTOM_KEY = "safeback:predefined_message_custom";

export const DEFAULT_PREDEFINED_MESSAGE = "Je suis bien rentr\u00e9";

export type PredefinedMessageConfig = {
  useCustomMessage: boolean;
  message: string;
};

export async function getPredefinedMessageConfig(): Promise<PredefinedMessageConfig> {
  const [message, customRaw] = await Promise.all([
    AsyncStorage.getItem(PREDEFINED_MESSAGE_KEY),
    AsyncStorage.getItem(PREDEFINED_MESSAGE_CUSTOM_KEY)
  ]);

  return {
    useCustomMessage: customRaw === "true",
    message: message ?? DEFAULT_PREDEFINED_MESSAGE
  };
}

export async function setPredefinedMessageConfig(config: PredefinedMessageConfig): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(PREDEFINED_MESSAGE_KEY, config.message),
    AsyncStorage.setItem(PREDEFINED_MESSAGE_CUSTOM_KEY, config.useCustomMessage ? "true" : "false")
  ]);
}

export async function resetPredefinedMessageConfig(): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(PREDEFINED_MESSAGE_KEY, DEFAULT_PREDEFINED_MESSAGE),
    AsyncStorage.setItem(PREDEFINED_MESSAGE_CUSTOM_KEY, "false")
  ]);
}

export function resolvePredefinedMessage(config: PredefinedMessageConfig): string {
  if (!config.useCustomMessage) return DEFAULT_PREDEFINED_MESSAGE;
  const trimmed = config.message.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_PREDEFINED_MESSAGE;
}

