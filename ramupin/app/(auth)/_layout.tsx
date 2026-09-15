import { Stack } from 'expo-router';

import { colors } from '@/theme';

// 상단 바는 각 화면(OnboardingLayout)이 직접 그립니다
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.backgroundWarm } }} />;
}
