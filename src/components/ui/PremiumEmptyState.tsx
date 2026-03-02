// Empty state premium réutilisable avec action claire.
import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View, type ViewStyle } from "react-native";
import { DS } from "../../theme/designSystem";

export function PremiumEmptyState(props: {
  title: string;
  description: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: ViewStyle;
}) {
  const { title, description, icon = "sparkles-outline", actionLabel, onActionPress, style } = props;
  return (
    <View
      style={[
        {
          borderRadius: DS.radius.xl,
          borderWidth: 1,
          borderColor: DS.color.border,
          backgroundColor: "#FFFFFF",
          padding: DS.spacing.xl,
          alignItems: "center"
        },
        style
      ]}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "#E2E8F0",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Ionicons name={icon} size={20} color="#334155" />
      </View>
      <Text className="mt-3 text-base font-extrabold text-slate-900">{title}</Text>
      <Text className="mt-2 text-center text-sm text-slate-600">{description}</Text>
      {actionLabel && onActionPress ? (
        <TouchableOpacity
          className="mt-4 rounded-2xl bg-[#111827] px-4 py-3"
          onPress={onActionPress}
        >
          <Text className="text-sm font-semibold text-white">{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
