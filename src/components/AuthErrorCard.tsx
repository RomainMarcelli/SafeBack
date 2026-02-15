// Carte d'erreur homogène pour les écrans d'authentification.
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

export type AuthErrorCardProps = {
  contextLabel: string;
  title: string;
  message: string;
  hint?: string;
  code?: string;
};

export function AuthErrorCard(props: AuthErrorCardProps) {
  return (
    <View className="mt-4 overflow-hidden rounded-3xl border border-rose-200 bg-rose-50">
      <View className="absolute left-0 top-0 h-full w-1.5 bg-rose-500" />
      <View className="px-4 py-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-white">
            <Ionicons name="warning-outline" size={20} color="#be123c" />
          </View>
          <View className="flex-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-rose-600">
              {props.contextLabel}
            </Text>
            <Text className="text-base font-extrabold text-rose-900">{props.title}</Text>
          </View>
        </View>

        <View className="mt-3 rounded-2xl border border-rose-200 bg-white/90 px-3 py-3">
          <Text className="text-sm font-semibold text-rose-900">{props.message}</Text>
          {props.hint ? <Text className="mt-1 text-xs text-rose-700">{props.hint}</Text> : null}
        </View>

        {props.code ? (
          <Text className="mt-2 text-[11px] uppercase tracking-wider text-rose-500">Code: {props.code}</Text>
        ) : null}
      </View>
    </View>
  );
}
