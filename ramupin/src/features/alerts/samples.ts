import type { AlertPopupPayload, InAppCardPayload } from './alertStore';
import type { HistoryEvent } from '@/types/models';

/**
 * 서버 연동 전 알림 화면 확인용 샘플 (개발용 미리보기, 히스토리 항목 탭).
 * TODO(6단계): 실제 푸시 데이터로 대체
 */
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const COEX = { latitude: 37.5116, longitude: 127.0595, placeName: '코엑스', address: '서울특별시 강남구 영동대로 513' };

export const SAMPLE_POPUPS: AlertPopupPayload[] = [
  { kind: 'sos', name: '지원', place: COEX, sentAt: minutesAgo(3), hasVoice: true },
  { kind: 'dangerZone', zoneName: '낙석 주의 구간', place: { latitude: 37.5796, longitude: 126.977, address: '서울특별시 종로구 북악산로' } },
  { kind: 'gpsLost', name: '지원', place: { ...COEX, placeName: '낙석 주의 구간 부근' }, lastSeenAt: minutesAgo(120) },
  { kind: 'batteryLow', name: '지원', level: 7, minutesLeft: 12 },
  { kind: 'noMovement', name: '지원', hours: 26 },
  { kind: 'speeding', speedKmh: 160 },
];

export const SAMPLE_CARDS: Omit<InAppCardPayload, 'id'>[] = [
  { kind: 'nearby', name: 'RamuVia', href: '/map' },
  { kind: 'friendRequest', name: 'RamuVia', href: '/friends/requests' },
  { kind: 'arrive', name: 'Hyunjin001', place: '제부도', href: '/journey/f1' },
  { kind: 'leave', name: 'Hyunjin001', place: '제부도', href: '/journey/f1' },
  { kind: 'shared', name: 'Hyunjin001', place: '화성시 제부도', href: '/chat/room1' },
];

/** 히스토리 항목을 눌렀을 때 보여줄 팝업 */
export function popupForHistory(event: HistoryEvent): AlertPopupPayload | null {
  switch (event.type) {
    case 'sos':
      return { ...SAMPLE_POPUPS[0], sentAt: event.createdAt } as AlertPopupPayload;
    case 'batteryLow':
      return SAMPLE_POPUPS[3];
    case 'gpsLost':
      return SAMPLE_POPUPS[2];
    case 'noMovement':
      return SAMPLE_POPUPS[4];
    case 'speeding':
      return SAMPLE_POPUPS[5];
    case 'dangerZone':
      return SAMPLE_POPUPS[1];
    default:
      return null;
  }
}
