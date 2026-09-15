import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav, type TabName } from './BottomNav';
import { Header } from './Header';
import { colors, layout } from '@/theme';

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
  background = colors.background,
  footer,
  contentStyle,
  children,
}: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={tab ? ['top'] : ['top', 'bottom']} style={[styles.flex, { backgroundColor: background }]}>
      {header ? <Header title={title} showBack={showBack} right={headerRight} /> : null}
      {content}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
      {tab ? <BottomNav active={tab} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: 16, paddingBottom: 24 },
  footer: { paddingHorizontal: layout.screenPadding, paddingVertical: 16 },
});
