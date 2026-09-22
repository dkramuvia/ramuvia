import { useQuery, useQueryClient } from '@tanstack/react-query';

import { sosApi } from '@/api/endpoints/sos';

/** 내가 받은 SOS (WBS 7.9). 팝업을 놓쳤을 때 나중에라도 볼 수 있게 */
export const sosKeys = { received: ['sos', 'received'] as const };

export function useReceivedSos() {
  return useQuery({ queryKey: sosKeys.received, queryFn: sosApi.received });
}

/** 소켓으로 새 SOS 를 받으면 목록을 다시 읽습니다 */
export function useRefreshReceivedSos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: sosKeys.received });
}
