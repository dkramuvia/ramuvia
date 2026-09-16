import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// 앱이 백그라운드면 주기 갱신을 멈추고, 다시 앞으로 오면 오래된 데이터를 새로 받음
// (이때 서버 요청으로 다른 기기 로그인 여부도 확인됨)
AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
