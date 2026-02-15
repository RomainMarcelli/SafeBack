// Boite de confirmation standardisee pour les actions sensibles (partage, garant, permissions).
import { Alert } from "react-native";

export function confirmAction(params: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      params.title,
      params.message,
      [
        {
          text: params.cancelLabel ?? "Annuler",
          style: "cancel",
          onPress: () => resolve(false)
        },
        {
          text: params.confirmLabel ?? "Continuer",
          style: "default",
          onPress: () => resolve(true)
        }
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false)
      }
    );
  });
}

export async function confirmSensitiveAction(params: {
  firstTitle: string;
  firstMessage: string;
  secondTitle: string;
  secondMessage: string;
  firstConfirmLabel?: string;
  secondConfirmLabel?: string;
  delayMs?: number;
}): Promise<boolean> {
  // Double verrouillage anti-erreur: confirmation initiale + seconde validation'après délai.
  const firstOk = await confirmAction({
    title: params.firstTitle,
    message: params.firstMessage,
    confirmLabel: params.firstConfirmLabel ?? "Continuer"
  });
  if (!firstOk) return false;

  const delayMs = Math.max(0, params.delayMs ?? 1400);
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return confirmAction({
    title: params.secondTitle,
    message: params.secondMessage,
    confirmLabel: params.secondConfirmLabel ?? "Confirmer"
  });
}
