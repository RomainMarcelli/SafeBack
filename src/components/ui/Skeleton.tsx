// Skeleton loaders premium avec effet shimmer pour les états de chargement.
import { useEffect, useRef } from "react";
import { Animated, Easing, View, type ViewStyle } from "react-native";

type SkeletonWidth = number | `${number}%` | "auto";

export function SkeletonLine(props: { width?: SkeletonWidth; height?: number; rounded?: number }) {
  const { width = "100%", height = 12, rounded = 8 } = props;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.85]
  });

  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: rounded,
        backgroundColor: "#CBD5E1",
        opacity
      }}
    />
  );
}

export function SkeletonCard(props: { lines?: Array<{ width?: SkeletonWidth; height?: number }>; style?: ViewStyle }) {
  const { lines = [{ width: "60%" }, { width: "85%" }, { width: "40%" }], style } = props;

  return (
    <View
      style={[
        {
          borderRadius: 24,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          backgroundColor: "#F8FAFC",
          padding: 16,
          gap: 10
        },
        style
      ]}
    >
      {lines.map((line, index) => (
        <SkeletonLine
          key={`skeleton-line-${index}`}
          width={line.width}
          height={line.height ?? (index === 0 ? 16 : 12)}
          rounded={8}
        />
      ))}
    </View>
  );
}
