import { Redirect } from 'expo-router';

import { selectIsSignedIn, useAuthStore } from '@/stores/authStore';
import { useSignUpStore } from '@/stores/signUpStore';

export default function Index() {
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const needsDeviceVerification = useAuthStore((s) => s.pendingDeviceVerification !== null);
  // 소셜 로그인은 했지만 가입(프로필·휴대폰 인증)이 남은 상태
  const signingUp = useSignUpStore((s) => s.signUpToken !== '');
  if (isSignedIn) return <Redirect href="/map" />;
  if (needsDeviceVerification) return <Redirect href="/device-verify" />;
  return <Redirect href={signingUp ? '/profile-setup' : '/start'} />;
}
