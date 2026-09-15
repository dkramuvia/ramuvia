import { Stack } from 'expo-router';

import { AlertPopupHost } from '@/features/alerts/AlertPopupHost';
import { InAppCardHost } from '@/features/alerts/InAppCardHost';
import { colors } from '@/theme';

// 상단 바는 각 화면의 <Screen> 컴포넌트가 피그마 디자인으로 직접 그립니다.
export default function AppLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sos" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
      {/* 앱이 켜져 있을 때 받은 긴급 팝업·알림 카드 */}
      <AlertPopupHost />
      <InAppCardHost />
    </>
  );
}
