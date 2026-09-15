import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors } from '@/theme';

interface DraggableSheetProps {
  /** 펼쳤을 때 높이 */
  expandedHeight: number;
  /** 내렸을 때 보이는 높이 */
  collapsedHeight: number;
  /** 처음 상태 */
  initiallyExpanded?: boolean;
  /** 손잡이 영역 아래에 고정되는 헤더 */
  header?: ReactNode;
  /** 시트 윗변에 붙어 함께 움직이는 영역 (이동 상태 칩, 광고 배너 등) */
  above?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const SPRING = { damping: 22, stiffness: 220, mass: 0.8 };

/**
 * 손잡이를 끌어 올리고 내리는 바텀시트 (WBS 4.6 부드러운 슬라이딩).
 * 손잡이·헤더 영역만 드래그를 받고, 내용 영역은 스크롤에 양보합니다.
 */
export function DraggableSheet({ expandedHeight, collapsedHeight, initiallyExpanded = true, header, above, children, style }: DraggableSheetProps) {
  const travel = expandedHeight - collapsedHeight;
  // 0 = 펼침, travel = 접힘
  const offset = useSharedValue(initiallyExpanded ? 0 : travel);
  const start = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = offset.value;
    })
    .onUpdate((e) => {
      offset.value = Math.min(travel, Math.max(0, start.value + e.translationY));
    })
    .onEnd((e) => {
      const shouldCollapse = e.velocityY > 400 || (e.velocityY > -400 && offset.value > travel / 2);
      offset.value = withSpring(shouldCollapse ? travel : 0, SPRING);
    });

  const tap = Gesture.Tap().onEnd(() => {
    offset.value = withSpring(offset.value > travel / 2 ? 0 : travel, SPRING);
  });

  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Animated.View style={[{ height: expandedHeight }, animated]} pointerEvents="box-none">
      {above ? (
        <View style={styles.above} pointerEvents="box-none">
          {above}
        </View>
      ) : null}
      <View style={[styles.sheet, style]}>
        <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
          <View>
            <View style={styles.grabberArea}>
              <View style={styles.grabber} />
            </View>
            {header}
          </View>
        </GestureDetector>
        <View style={styles.body}>{children}</View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  above: { position: 'absolute', left: 0, right: 0, bottom: '100%' },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.background,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
  },
  grabberArea: { paddingVertical: 12, alignItems: 'center' },
  grabber: { width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9' },
  body: { flex: 1 },
});
