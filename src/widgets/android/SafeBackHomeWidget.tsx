import type { WidgetInfo } from "react-native-android-widget";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import {
  formatWidgetStatusLabel,
  formatWidgetUpdatedAt,
  type HomeWidgetState
} from "../../lib/home/homeWidgetState";

type Props = {
  widgetInfo: WidgetInfo;
  state: HomeWidgetState;
};

function compactAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Non defini";
  if (trimmed.length <= 26) return trimmed;
  return `${trimmed.slice(0, 25)}...`;
}

export function SafeBackHomeWidget({ widgetInfo, state }: Props) {
  const width = widgetInfo.width;
  const isCompact = width < 220;
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: "#0F172A",
        borderRadius: 18,
        padding: 12
      }}
    >
      <TextWidget
        text="SafeBack"
        style={{ color: "#E2E8F0", fontSize: isCompact ? 11 : 12, fontWeight: "700" }}
      />
      <TextWidget
        text={formatWidgetStatusLabel(state.status)}
        style={{ color: "#FFFFFF", fontSize: isCompact ? 16 : 18, marginTop: 4, fontWeight: "700" }}
      />
      <TextWidget
        text={`Maj ${formatWidgetUpdatedAt(state.updatedAtIso)}`}
        style={{ color: "#94A3B8", fontSize: 11, marginTop: 2 }}
      />

      {!isCompact ? (
        <FlexWidget style={{ marginTop: 6 }}>
          <TextWidget
            text={`De: ${compactAddress(state.fromAddress)}`}
            style={{ color: "#CBD5E1", fontSize: 11 }}
          />
          <TextWidget
            text={`Vers: ${compactAddress(state.toAddress)}`}
            style={{ color: "#CBD5E1", fontSize: 11, marginTop: 2 }}
          />
        </FlexWidget>
      ) : null}

      <FlexWidget style={{ flexDirection: "row", marginTop: 10, flexGap: 8 }}>
        <FlexWidget
          style={{
            flex: 1,
            backgroundColor: "#1D4ED8",
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 8
          }}
          clickAction="OPEN_URI"
          clickActionData={{ uri: "safeback://setup" }}
        >
          <TextWidget
            text="Trajet"
            style={{ color: "#EFF6FF", fontSize: 11, textAlign: "center", fontWeight: "700" }}
          />
        </FlexWidget>
        <FlexWidget
          style={{
            flex: 1,
            backgroundColor: "#DC2626",
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 8
          }}
          clickAction="OPEN_URI"
          clickActionData={{ uri: "safeback://quick-sos" }}
        >
          <TextWidget
            text="SOS"
            style={{ color: "#FEE2E2", fontSize: 11, textAlign: "center", fontWeight: "700" }}
          />
        </FlexWidget>
        <FlexWidget
          style={{
            flex: 1,
            backgroundColor: "#059669",
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 8
          }}
          clickAction="OPEN_URI"
          clickActionData={{ uri: "safeback://quick-arrival" }}
        >
          <TextWidget
            text="Bien rentré"
            style={{ color: "#ECFDF5", fontSize: 11, textAlign: "center", fontWeight: "700" }}
          />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget
        style={{
          marginTop: 8,
          backgroundColor: "#334155",
          borderRadius: 10,
          paddingVertical: 6,
          paddingHorizontal: 10
        }}
        clickAction="SAFEBACK_WIDGET_REFRESH"
      >
        <TextWidget
          text="Actualiser"
          style={{ color: "#E2E8F0", fontSize: 10, textAlign: "center", fontWeight: "700" }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
