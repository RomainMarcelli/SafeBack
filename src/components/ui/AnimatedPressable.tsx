// Bouton pressable avec micro-animation cohérente + haptique/voice hint.
import { useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  type StyleProp,
  type ViewStyle,
  type GestureResponderEvent,
  type PressableProps
} from "react-native";
import { DS } from "../../theme/designSystem";
import { useAppAccessibility } from "../AppAccessibilityProvider";

export function AnimatedPressable(
  props: Omit<PressableProps, "style"> & {
    containerStyle?: StyleProp<ViewStyle>;
    voiceHint?: string;
    haptic?: "light" | "success" | "warning";
  }
) {
  const {
    onPress,
    onPressIn,
    onPressOut,
    containerStyle,
    children,
    voiceHint,
    haptic = "light",
    ...rest
  } = props;
  const scale = useRef(new Animated.Value(1)).current;
  const { announce, haptic: triggerHaptic } = useAppAccessibility();

  const animateTo = (toValue: number) => {
    Animated.timing(scale, {
      toValue,
      duration: DS.motion.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    }).start();
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    animateTo(0.97);
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    animateTo(1);
    onPressOut?.(event);
  };

  const handlePress = async (event: GestureResponderEvent) => {
    onPress?.(event);
    await triggerHaptic(haptic);
    if (voiceHint) {
      await announce(voiceHint);
    }
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, containerStyle]}>
      <Pressable {...rest} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handlePress}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
