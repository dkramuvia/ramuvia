import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme';

interface SwitchProps {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  /**
   * 조작 불가 상태 (기획: "조작 불가능 OFF").
   * 친구별 상세 공유에서 흐림/비공개일 때 강제로 꺼지는 항목에 사용합니다.
   */
  disabled?: boolean;
  accessibilityLabel?: string;
}

const WIDTH = 40;
const HEIGHT = 22;
const KNOB = 18;

/** 피그마 Switch: 40x22, 켜짐 #13C938 / 꺼짐 #ACB3B9, 흰 원 18 */
export function Switch({ value, onValueChange, disabled, accessibilityLabel }: SwitchProps) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [anim, value]);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, WIDTH - KNOB - 2] });
  const backgroundColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.switchOff, colors.switchOn] });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange?.(!value)}
    >
      <Animated.View style={[styles.track, { backgroundColor }, disabled && styles.disabled]}>
        <Animated.View style={[styles.knob, { transform: [{ translateX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: WIDTH, height: HEIGHT, borderRadius: HEIGHT / 2, justifyContent: 'center' },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: colors.white },
  disabled: { opacity: 0.4 },
});
