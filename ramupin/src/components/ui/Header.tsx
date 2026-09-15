import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, layout } from '@/theme';

interface HeaderProps {
  title?: string;
  /** 기본값: 뒤로 갈 화면이 있으면 표시 */
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
}

/** 피그마 상단 바: 높이 48, 뒤로가기 48x48 영역, 가운데 제목 (SUIT 16 bold) */
export function Header({ title, showBack = router.canGoBack(), onBack, right }: HeaderProps) {
  return (
    <View style={styles.container}>
      <AppText variant="body1Bold" align="center" numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          hitSlop={4}
          onPress={onBack ?? (() => router.back())}
          style={styles.side}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.side} />
      )}
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { position: 'absolute', left: 64, right: 64 },
  side: { minWidth: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  right: { paddingRight: 12, alignItems: 'flex-end' },
});
