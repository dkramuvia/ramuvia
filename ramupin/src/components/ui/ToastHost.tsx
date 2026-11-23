import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { hideToast, useToastStore } from '@/utils/toast';

const SHOW_MS = 2200;

/** showToast() 로 띄운 안내를 화면 아래(하단 메뉴 위)에 잠깐 보여 줍니다 */
export function ToastHost() {
  const { message, seq } = useToastStore();
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => hideToast());
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [message, seq, opacity]);

  if (!message) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 110, opacity }]}>
      <AppText variant="body2" color="#FFFFFF" align="center">
        {message}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '86%',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(40,40,40,0.92)',
  },
});
