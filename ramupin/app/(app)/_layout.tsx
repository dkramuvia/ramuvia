import { router, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { syncDeviceTimezone } from '@/api/endpoints/settings';
import { AlertPopupHost } from '@/features/alerts/AlertPopupHost';
import { InAppCardHost } from '@/features/alerts/InAppCardHost';
import { useDeviceRestoreStore, usePostSignupStore } from '@/features/auth/deviceRestore';
import { useSharingReminder } from '@/features/safety/sharingReminder';
import { useAuthStore } from '@/stores/authStore';
import { useColors } from '@/theme';

// 상단 바는 각 화면의 <Screen> 컴포넌트가 피그마 디자인으로 직접 그립니다.
export default function AppLayout() {
  const colors = useColors();
  // 만 14세 미만 보호자 동의 대기 중이면 대기 화면만 (보완 4.1)
  const pendingGuardian = useAuthStore((s) => s.user?.accountStatus === 'pending_guardian');
  const pathname = usePathname();
  useEffect(() => {
    if (pendingGuardian && pathname !== '/guardian-waiting') setTimeout(() => router.replace('/guardian-waiting'), 0);
  }, [pendingGuardian, pathname]);
  // 다른 기기에서 쓰던 계정으로 막 로그인했으면 "새 휴대폰에서 로그인했어요" (보완 4.21)
  const replaced = useDeviceRestoreStore((s) => s.replaced);
  useEffect(() => {
    if (replaced) setTimeout(() => router.push('/device-restore'), 0);
  }, [replaced]);
  const openSolo = usePostSignupStore((s) => s.openSolo);
  useEffect(() => {
    if (!openSolo) return;
    usePostSignupStore.getState().set(false);
    setTimeout(() => router.push('/settings/solo-mode'), 0);
  }, [openSolo]);
  // 기기 시간대를 서버에 맞춤 (받는 사람 시각 기준 예약 메시지·방해 금지 시간)
  useEffect(() => {
    void syncDeviceTimezone().catch(() => undefined);
  }, []);
  // 30일마다 + 새 공유가 시작된 다음 날 "지금 내 위치를 N명이 보고 있어요" (보완 4.12). 새 기기 화면을 먼저 봅니다
  useSharingReminder(!replaced && !pendingGuardian);
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
