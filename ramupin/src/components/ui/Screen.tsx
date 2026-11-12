import { useEffect, useRef, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNav, type TabName } from './BottomNav';
import { Header } from './Header';
import { layout, useColors, useThemeName } from '@/theme';
import { useKeyboardPadding } from '@/utils/useKeyboardPadding';

/**
 * 피그마 v2.6 (11-10): 하얀 바탕 위에 흐린 무지개 배경을 50% 로 깝니다 (디자이너: "흐림 50% 를 줘도 조용하게 보임").
 * 다크 모드 배경은 디자이너가 따로 만든다고 해서, 그때까지 다크는 예전처럼 단색입니다.
 */
const SCREEN_BG = require('../../../assets/images/screen-bg.jpg');
const SCREEN_BG_OPACITY = 0.5;
/** 키보드로 끌어올린 입력칸 아래에 남길 틈 (도움말·글자 수가 보이게) */
const FOCUS_MARGIN = 56;

interface ScreenProps {
  title?: string;
  showBack?: boolean;
  headerRight?: ReactNode;
  /** false 이면 상단 바를 그리지 않음 */
  header?: boolean;
  /**
   * 하위 화면(설정, 그룹 등)에서 하단 탭바를 함께 보여줄 때 선택된 탭.
   * 탭 화면 자체에서는 탭 네비게이터가 그리므로 지정하지 않습니다.
   */
  tab?: TabName;
  scroll?: boolean;
  background?: string;
  /** 스크롤 영역 아래에 고정되는 영역 (하단 CTA 버튼 등) */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function Screen({
  title,
  showBack,
  headerRight,
  header = true,
  tab,
  scroll = true,
  background,
  footer,
  contentStyle,
  children,
}: ScreenProps) {
  const colors = useColors();
  const theme = useThemeName();
  // 화면이 밑색을 따로 정했으면(채팅방 하늘색 등) 그 색을 그대로 둡니다
  const showBg = !background && theme === 'light';
  const insets = useSafeAreaInsets();

  // 대표 리포트 2차 99: 이름을 고칠 때 키보드가 입력칸을 덮었습니다.
  // 안드로이드는 화면 끝까지 그리는 모드라 키보드가 올라와도 화면이 줄지 않아, 키보드 높이만큼 직접 비우고
  // 입력 중인 칸이 키보드 위에 보이도록 스크롤합니다. 키보드가 떠 있는 동안 아래 탭바는 숨깁니다
  const keyboard = useKeyboardPadding();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  useEffect(() => {
    if (!keyboard || !scroll) return;
    // 여백이 적용되어 스크롤 영역이 줄어든 다음에 잽니다
    const timer = setTimeout(() => {
      const input = TextInput.State.currentlyFocusedInput();
      const list = scrollRef.current;
      if (!input || !list) return;
      list.getNativeScrollRef()?.measureInWindow((_x, listY, _w, listHeight) => {
        input.measureInWindow((_ix, inputY, _iw, inputHeight) => {
          const overflow = inputY + inputHeight + FOCUS_MARGIN - (listY + listHeight);
          if (overflow > 0) list.scrollTo({ y: scrollY.current + overflow, animated: true });
        });
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [keyboard, scroll]);
  // 아래 안전 영역을 SafeAreaView 가 이미 비우고 있으면 그만큼은 빼야 두 번 비지 않습니다
  const keyboardSpace = keyboard ? Math.max(0, keyboard - (tab ? 0 : insets.bottom)) : 0;

  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      onScroll={(e) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={64}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, contentStyle]}>{children}</View>
  );

  // 배경 그림은 상태 표시줄 뒤까지 깔리도록 안전 영역 바깥에 둡니다 (피그마도 9:41 뒤까지 칠해져 있음)
  return (
    <View style={[styles.flex, { backgroundColor: background ?? colors.background }]}>
      {showBg ? <Image source={SCREEN_BG} resizeMode="cover" style={styles.bg} /> : null}
      <SafeAreaView edges={tab ? ['top'] : ['top', 'bottom']} style={[styles.flex, { paddingBottom: keyboardSpace }]}>
        {header ? <Header title={title} showBack={showBack} right={headerRight} /> : null}
        {content}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
        {tab && !keyboard ? <BottomNav active={tab} /> : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bg: { ...StyleSheet.absoluteFill, width: '100%', height: '100%', opacity: SCREEN_BG_OPACITY },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: 16, paddingBottom: 24 },
  footer: { paddingHorizontal: layout.screenPadding, paddingVertical: 16 },
});
