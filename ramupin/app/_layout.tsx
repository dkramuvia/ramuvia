import '@/i18n';
// 안드로이드가 앱을 백그라운드에서 깨울 때 위치 수집 태스크가 등록되어 있어야 합니다 (화면보다 먼저 import)
import '@/features/location/backgroundTask';

import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/api/queryClient';
import { ThemedStatusBar } from '@/components/ui';
import { SessionEndedPopup } from '@/features/auth/SessionEndedPopup';
import { useDevServerSession } from '@/features/auth/useDevServerSession';
import { useRealtime } from '@/features/chat/realtime';
import { usePush } from '@/features/notifications/usePush';
import { resumeBackgroundTrackingIfWanted } from '@/features/location/backgroundTask';
import { selectIsSignedIn, useAuthStore } from '@/stores/authStore';
import { fontAssets } from '@/theme';

/**
 * 첫 화면(스플래시)은 첫 화면이 그려질 때까지 둡니다.
 * 저절로 내리게 두면 폰트를 읽는 동안(아래 return null) 흰 화면이 2초쯤 보였습니다 (10-15 폰에서 확인)
 */
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 200 });

export default function RootLayout() {
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const devSession = useDevServerSession();
  useRealtime();
  usePush();

  // 강제 종료 뒤에는 안드로이드가 위치 수집을 되살려 주지 않아서, 앱이 켜질 때 직접 되살립니다
  useEffect(() => {
    void resumeBackgroundTrackingIfWanted();
  }, []);

  // 폰트가 늦게 적용되면 글자가 깜빡이므로 로드가 끝난 뒤 그립니다 (실패하면 시스템 폰트로 진행)
  // 개발용 서버 로그인 중이면 토큰을 받을 때까지 기다립니다 (최대 6초)
  // 화면이 처음 자리를 잡으면 스플래시를 내립니다
  const onReady = useCallback(() => SplashScreen.hide(), []);

  if ((!fontsLoaded && !fontError) || devSession === 'connecting') return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onReady}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemedStatusBar />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Protected guard={!isSignedIn}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            <Stack.Protected guard={isSignedIn}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
          </Stack>
          <SessionEndedPopup />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
