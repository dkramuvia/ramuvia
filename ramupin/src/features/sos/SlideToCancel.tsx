import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { AppText } from '@/components/ui';
import { colors } from '@/theme';

const KNOB = 46;
const PADDING = 4;

/** 피그마 "밀어서 SOS 취소하기": 오른쪽 손잡이를 왼쪽 끝까지 밀면 취소 (실수로 누르는 것 방지) */
export function SlideToCancel({ label, onCancel }: { label: string; onCancel: () => void }) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const maxTravel = Math.max(0, width - KNOB - PADDING * 2);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => x.setValue(Math.max(-maxTravelRef.current, Math.min(0, g.dx))),
      onPanResponderRelease: (_, g) => {
        if (-g.dx > maxTravelRef.current * 0.8) {
          Animated.timing(x, { toValue: -maxTravelRef.current, duration: 80, useNativeDriver: true }).start(() => {
            onCancelRef.current();
            x.setValue(0);
          });
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  // PanResponder 는 한 번만 만들어지므로 최신 값은 ref 로 전달
  const maxTravelRef = useRef(maxTravel);
  maxTravelRef.current = maxTravel;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  return (
    <View style={styles.track} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={onCancel}>
      <AppText variant="body1" color="#BDBDBD" style={styles.label}>
        {label}
      </AppText>
      <Animated.View style={[styles.knob, { transform: [{ translateX: x }] }]} {...responder.panHandlers}>
        <Ionicons name="arrow-back" size={24} color={colors.white} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: KNOB + PADDING * 2,
    borderRadius: 30,
    backgroundColor: '#3A3A3A',
    justifyContent: 'center',
    paddingHorizontal: PADDING,
  },
  label: { position: 'absolute', left: 0, right: KNOB, textAlign: 'center' },
  knob: {
    alignSelf: 'flex-end',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#5F6B75',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
