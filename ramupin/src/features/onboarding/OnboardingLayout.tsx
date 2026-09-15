import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Header } from '@/components/ui';
import { colors, layout } from '@/theme';

interface OnboardingLayoutProps {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  showBack?: boolean;
}

/** 피그마 가입 화면 공통: 따뜻한 흰 배경, 큰 제목(24 bold), 하단 고정 CTA */
export function OnboardingLayout({ title, children, footer, showBack = true }: OnboardingLayoutProps) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {showBack ? <Header /> : <View style={styles.spacer} />}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {title ? (
            <AppText variant="title2" color={colors.textTitle}>
              {title}
            </AppText>
          ) : null}
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundWarm },
  flex: { flex: 1 },
  spacer: { height: 48 },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: 8, paddingBottom: 24, gap: 24 },
  footer: { paddingHorizontal: 16, paddingVertical: 20 },
});
