import { Redirect } from 'expo-router';

import { selectIsSignedIn, useAuthStore } from '@/stores/authStore';

export default function Index() {
  const isSignedIn = useAuthStore(selectIsSignedIn);
  return <Redirect href={isSignedIn ? '/map' : '/start'} />;
}
