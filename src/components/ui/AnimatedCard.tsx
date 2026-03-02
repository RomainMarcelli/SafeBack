// Carte animée (entrée/sortie légère) pour homogénéiser les transitions visuelles.
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";
import { DS } from "../../theme/designSystem";

export function AnimatedCard(props: {
  children: ReactNode;
  delayMs?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { children, delayMs = 0, style } = props;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: DS.motion.normal,
        delay: delayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: DS.motion.normal,
        delay: delayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [delayMs, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
