// Système de toast global unifié (succès/erreur/info) avec accessibilité.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { FeedbackMessage } from "./FeedbackMessage";

type ToastKind = "error" | "success" | "info";

type ToastPayload = {
  kind: ToastKind;
  message: string;
  durationMs?: number;
};

type ToastContextValue = {
  showToast: (payload: ToastPayload) => void;
  clearToast: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function AppToastProvider(props: { children: ReactNode }) {
  const { children } = props;
  const [toast, setToast] = useState<(ToastPayload & { id: string }) | null>(null);

  const showToast = useCallback((payload: ToastPayload) => {
    const message = String(payload.message ?? "").trim();
    if (!message) return;
    setToast({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      kind: payload.kind,
      message,
      durationMs: payload.durationMs
    });
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const value = useMemo(
    () => ({
      showToast,
      clearToast
    }),
    [showToast, clearToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 999
        }}
        accessibilityLiveRegion="polite"
        accessible
      >
        {toast ? (
          <FeedbackMessage
            key={toast.id}
            kind={toast.kind}
            message={toast.message}
            mode="toast"
            durationMs={toast.durationMs ?? 3200}
          />
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useAppToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useAppToast doit être utilisé dans AppToastProvider.");
  }
  return context;
}
