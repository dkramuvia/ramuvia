import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { sosApi, type SentSos } from '@/api/endpoints/sos';
import { setSosMode } from '@/features/location/sosMode';

/** 내가 받은 SOS (WBS 7.9). 팝업을 놓쳤을 때 나중에라도 볼 수 있게 */
export const sosKeys = { received: ['sos', 'received'] as const, sent: ['sos', 'sent'] as const };

export function useReceivedSos() {
  return useQuery({ queryKey: sosKeys.received, queryFn: sosApi.received });
}

/** 소켓으로 새 SOS 를 받으면 목록을 다시 읽습니다 */
export function useRefreshReceivedSos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: sosKeys.received });
}

/** 내가 보낸 SOS (대표 리포트 73) */
export function useSentSos(enabled = true) {
  return useQuery({ queryKey: sosKeys.sent, queryFn: sosApi.sent, enabled });
}

/**
 * 진행 중인 SOS 를 "아직 끝나지 않은 것"으로 볼 기간.
 * 서버에는 종료하지 않은 SOS 가 '도움 요청 중'으로 계속 남습니다. 하루가 지난 것까지 지도에 띄우면
 * 예전 시험 기록이 계속 배너로 떠서, 지도 배너는 하루 안의 것만 봅니다 (SOS 기록 화면에서는 언제든 종료 가능)
 */
const ACTIVE_WINDOW_MS = 24 * 60 * 60_000;

/**
 * 지금 진행 중인 내 SOS (대표 리포트 4차: 전송됨 화면을 벗어나면 종료할 방법이 없었습니다).
 * 서버 기록을 기준으로 하므로 앱을 다시 켜도 그대로 보입니다
 */
export function useActiveSos(): SentSos | null {
  const { data } = useQuery({
    queryKey: sosKeys.sent,
    queryFn: sosApi.sent,
    refetchInterval: 60_000,
    select: (list) => list.find((s) => s.status === 'sent' && Date.now() - new Date(s.createdAt).getTime() < ACTIVE_WINDOW_MS) ?? null,
  });
  return data ?? null;
}

/** 상황 종료 (안전함): 받은 사람에게 안전 알림 + 촘촘한 위치 수집(SOS 모드) 끄기 */
export function useResolveSos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sosId: string) => {
      await setSosMode(false);
      await sosApi.resolve(sosId);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['sos'] }),
  });
}
