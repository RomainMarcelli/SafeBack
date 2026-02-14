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
