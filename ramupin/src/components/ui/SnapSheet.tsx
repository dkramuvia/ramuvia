import BottomSheet, { BottomSheetScrollView, type BottomSheetHandleProps } from '@gorhom/bottom-sheet';
import { useCallback, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { colors } from '@/theme';

interface SnapSheetProps {
  /** 멈출 높이들 (작은 것부터). 숫자는 px, 문자열은 '55%' 처럼 화면 비율 */
  snapPoints: Array<number | string>;
  /** 처음 멈춰 있을 위치 (snapPoints 순번). 기본은 가장 높이 */
  initialIndex?: number;
  /** 시트 아래에 고정된 영역 높이 (하단 탭 등). 시트가 그 위에서 멈춤 */
  bottomInset?: number;
  /** 손잡이 아래 고정 헤더 (여기를 끌어도 시트가 움직임) */
  header?: ReactNode;
  /** 시트 윗변에 붙어 함께 움직이는 영역 (이동 상태 칩, 광고 배너 등) */
  above?: ReactNode;
  /** 스냅 위치가 바뀔 때 (지도 여백 조정 등) */
  onIndexChange?: (index: number) => void;
  /** 스크롤 내용은 SheetScrollView 로 감싸야 끝까지 스크롤한 뒤 시트가 이어서 움직입니다 */
  children: ReactNode;
}

/**
 * 끌어서 올리고 내리는 바텀시트 (WBS 4.6 부드러운 슬라이딩).
 * 놓으면 가까운 높이로 스냅되고, 빠르게 튕기면 그 방향으로 이동합니다.
 * 내용을 맨 위까지 스크롤한 상태에서 더 내리면 시트가 내려갑니다. 손잡이를 누르면 펼침/접힘 전환.
 * 부모 View 전체 영역을 기준으로 바닥에 붙습니다 (부모는 화면 전체 크기여야 함).
 */
export function SnapSheet({ snapPoints, initialIndex, bottomInset = 0, header, above, onIndexChange, children }: SnapSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const lastIndex = snapPoints.length - 1;
  const index = useRef(initialIndex ?? lastIndex);
  // 시트 윗변의 화면 y 좌표
  const position = useSharedValue(0);

  const aboveStyle = useAnimatedStyle(() => ({ transform: [{ translateY: position.value }] }));

  const Handle = useCallback(
    (_props: BottomSheetHandleProps) => (
      <Pressable
        accessibilityRole="adjustable"
        onPress={() => sheetRef.current?.snapToIndex(index.current === lastIndex ? 0 : lastIndex)}
        style={styles.grabberArea}
      >
        <View style={styles.grabber} />
      </Pressable>
    ),
    [lastIndex],
  );

  return (
    <>
      {above ? (
        <Animated.View pointerEvents="box-none" style={[styles.aboveAnchor, aboveStyle]}>
          <View pointerEvents="box-none" style={styles.above}>
            {above}
          </View>
        </Animated.View>
      ) : null}
      <BottomSheet
        ref={sheetRef}
        index={initialIndex ?? lastIndex}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        bottomInset={bottomInset}
        animatedPosition={position}
        overDragResistanceFactor={6}
        handleComponent={Handle}
        backgroundStyle={styles.background}
        style={styles.shadow}
        onChange={(next) => {
          index.current = next;
          onIndexChange?.(next);
        }}
      >
        {header}
        {children}
      </BottomSheet>
    </>
  );
}

/** 시트 안의 스크롤 영역 */
export const SheetScrollView = BottomSheetScrollView;

const styles = StyleSheet.create({
  aboveAnchor: { position: 'absolute', top: 0, left: 0, right: 0, height: 0 },
  above: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  background: { borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.background },
  shadow: {
    elevation: 8,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  grabberArea: { paddingVertical: 12, alignItems: 'center' },
  grabber: { width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9' },
});
