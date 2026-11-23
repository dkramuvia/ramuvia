import { router } from 'expo-router';

import { useAlertStore, type AlertPopupPayload } from './alertStore';
import { queryClient } from '@/api/queryClient';
import { sosApi, type ReceivedSos } from '@/api/endpoints/sos';
import { friendKeys } from '@/features/friends/queries';
import { sosKeys } from '@/features/sos/queries';
import type { Friend, HistoryEvent } from '@/types/models';

/**
 * 히스토리 항목을 눌렀을 때 (대표 리포트 4차).
 *
 * 예전에는 종류마다 정해 둔 예시(늘 '지원님', 배터리 7%, '낙석 주의 구간')를 띄웠습니다.
 * 이제 그 알림의 실제 값으로 채웁니다:
 * 1. 기기에 남은 알림은 받을 때의 팝업 내용(payload)을 그대로 다시 엽니다
 * 2. 서버에서 온 항목은 서버가 붙여 준 detail(누구·어떤 SOS·어떤 단계) + 친구 목록의 현재 위치·배터리로 채웁니다
 * 3. 모르는 값은 '정보 없음'으로 보입니다 (팝업 쪽에서 null 처리)
 *
 * SOS 는 상태에 따라 다릅니다. 진행 중인 받은 SOS 는 긴급 팝업, 종료(안전함)·취소된 SOS 는
 * '안전 확인됨' 팝업(전화 버튼 없음), 내가 보낸 SOS 는 SOS 기록 화면으로 갑니다.
 * 종료 알림을 눌렀는데 '구조대 직접 전화'가 뜨던 문제가 이것입니다.
 */
export async function openHistoryItem(event: HistoryEvent): Promise<void> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const detail = event.detail ?? {};

  if (event.type === 'sos') {
    await openSos(event, payload, detail);
    return;
  }

  // 받을 때 띄웠던 팝업이 기기에 남아 있으면 그 값 그대로 (그때의 위치·배터리)
  if (isPopup(payload) && payload.kind === event.type) {
    useAlertStore.getState().showPopup(payload, false);
    return;
  }

  const popup = popupFromDetail(event, payload, detail);
  if (popup) useAlertStore.getState().showPopup(popup, false);
}

async function openSos(event: HistoryEvent, payload: Record<string, unknown>, detail: NonNullable<HistoryEvent['detail']>) {
  const mine = event.id.startsWith('sos-sent-');
  const sosId = detail.sosId ?? (typeof payload.sosId === 'string' ? payload.sosId : undefined);
  if (mine || !sosId) {
    router.push({ pathname: '/sos-received', params: { tab: mine ? 'sent' : 'received' } });
    return;
  }
  let sos: ReceivedSos | undefined;
  try {
    const list = await queryClient.fetchQuery({ queryKey: sosKeys.received, queryFn: sosApi.received, staleTime: 10_000 });
    sos = list.find((s) => s.id === sosId);
  } catch {
    // 인터넷이 없으면 SOS 기록 화면이 알아서 안내합니다
  }
  if (!sos) {
    router.push({ pathname: '/sos-received', params: { tab: 'received' } });
    return;
  }
  // 종료·취소된 SOS 는 '안전 확인됨' 모양(종료 시각·원래 SOS 시각·위치, 전화 버튼 없음)으로 엽니다
  const ended = sos.status === 'sent' ? undefined : (sos.status === 'resolved' ? sos.resolvedAt : sos.cancelledAt) ?? undefined;
  useAlertStore.getState().showPopup(
    {
      kind: 'sos',
      sosId: sos.id,
      name: sos.nickname,
      place: { placeName: sos.placeName ?? undefined, address: sos.placeAddress ?? '', latitude: sos.latitude ?? 0, longitude: sos.longitude ?? 0 },
      sentAt: sos.createdAt,
      hasVoice: sos.hasAudio ?? false,
      altitude: sos.altitude ?? undefined,
      status: sos.status,
      ...(ended ? { endedAt: ended } : {}),
    },
    false,
  );
}

function popupFromDetail(event: HistoryEvent, payload: Record<string, unknown>, detail: NonNullable<HistoryEvent['detail']>): AlertPopupPayload | null {
  const userId = detail.userId ?? str(payload.userId);
  const name = detail.nickname ?? str(payload.nickname) ?? nameFromMessage(event.message) ?? '';
  const stage = detail.stage ?? str(payload.stage);
  const friend = userId ? queryClient.getQueryData<Friend[]>(friendKeys.list)?.find((f) => f.id === userId) : undefined;

  switch (event.type) {
    case 'gpsLost':
      return {
        kind: 'gpsLost',
        name,
        place: friend?.location ? { latitude: friend.location.latitude, longitude: friend.location.longitude, address: friend.location.address ?? '' } : null,
        lastSeenAt: friend?.location?.updatedAt ?? event.createdAt,
      };
    case 'batteryLow':
      return { kind: 'batteryLow', name, level: friend?.batteryLevel ?? null, minutesLeft: null };
    case 'noMovement':
      return { kind: 'noMovement', name, hours: stageHours(stage) };
    default:
      return null;
  }
}

const POPUP_KINDS = new Set(['sos', 'dangerZone', 'gpsLost', 'batteryLow', 'noMovement', 'speeding']);
const isPopup = (p: Record<string, unknown>): p is AlertPopupPayload & Record<string, unknown> => typeof p.kind === 'string' && POPUP_KINDS.has(p.kind);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** "1550님의 위치가…" → "1550" (예전 기기 알림처럼 이름이 따로 없을 때) */
function nameFromMessage(message: string): string | undefined {
  return /^(?:[^·]*·\s*)?(.+?)님/.exec(message)?.[1];
}

/** 단계 이름 → 시간 ('48h' → 48, '30m' → 0.5). 모르면 null */
function stageHours(stage?: string): number | null {
  const m = stage ? /^(\d+)([hm])$/.exec(stage) : null;
  if (!m) return null;
  return m[2] === 'h' ? Number(m[1]) : Math.round((Number(m[1]) / 60) * 10) / 10;
}
