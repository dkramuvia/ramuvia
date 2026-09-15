import type {
  Geofence,
  HideModeSetting,
  HistoryEvent,
  JourneyDay,
  SafetySetting,
  ScheduledMessage,
} from '@/types/models';

const at = (daysAgo: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export const mockHideMode: HideModeSetting = { hideAll: false, until: null };

export const mockSafety: SafetySetting = {
  sosEnabled: true,
  recipientFriendIds: ['f2'],
  recipientGroupIds: ['room3'],
  agencies: [
    { id: 'a1', name: '응급 병원', phone: '' },
    { id: 'a2', name: '경찰서', phone: '' },
  ],
};

export const mockGeofences: Geofence[] = [
  { id: 'g1', name: '우리 집', address: '서울특별시 금천구 가산디지털2로 169-23', center: { latitude: 37.4786, longitude: 126.8776 }, radiusM: 150, enabled: true },
  { id: 'g2', name: '직장', address: '서울특별시 강남구 영동대로 513', center: { latitude: 37.5116, longitude: 127.0595 }, radiusM: 200, enabled: true },
  { id: 'g3', name: '부모님 댁', address: '경기도 오산시 가수동 390-12', center: { latitude: 37.1498, longitude: 127.0772 }, radiusM: 150, enabled: false },
];

export const mockScheduledMessages: ScheduledMessage[] = [
  { id: 's1', targetUserId: 'f2', title: '병원', body: '오늘 10시 병원 예약 일정이 있습니다.\n제시간에 도착할 수 있도록 미리 준비해 주세요.', scheduledAt: at(-1, 9, 30), tts: true },
  { id: 's2', targetUserId: 'f2', title: '약 드실 시간', body: '저녁 약 드실 시간이에요! 빨간색, 흰색, 주황색 알약을 꼼꼼히 확인해 주세요.', scheduledAt: at(-1, 19, 0), tts: true },
  { id: 's3', targetUserId: 'f3', title: '학교', body: '학교 갈 시간이에요.', scheduledAt: at(-2, 7, 50), tts: false },
];

export const mockHistory: HistoryEvent[] = [
  { id: 'h1', type: 'sos', category: 'safety', message: '지원님이 긴급 SOS를 요청했습니다!', createdAt: at(0, 14, 15) },
  { id: 'h2', type: 'geofenceArrive', category: 'place', message: "지원님이 '집' 안심존에 도착했습니다.", createdAt: at(0, 20, 30) },
  { id: 'h3', type: 'batteryLow', category: 'safety', message: '지원님의 휴대폰 배터리가 10% 미만입니다.', createdAt: at(0, 20, 30) },
  { id: 'h4', type: 'geofenceArrive', category: 'place', message: "상원님이 '학교' 안심존에 도착했습니다.", createdAt: at(1, 8, 30) },
  { id: 'h5', type: 'batteryLow', category: 'safety', message: 'caramel001님의 휴대폰 배터리가 10% 미만입니다.', createdAt: at(1, 21, 10) },
];

/** 하루 여정 (목업: 가산디지털단지 주변. 친구 목업 현재 위치와는 따로 움직입니다) */
export function mockJourney(userId: string, batteryLevel?: number): JourneyDay {
  const home = { latitude: 37.4786, longitude: 126.8776 };
  const cross = { latitude: 37.4818, longitude: 126.8826 };
  const office = { latitude: 37.4845, longitude: 126.8966 };
  return {
    userId,
    date: new Date().toISOString().slice(0, 10),
    totalDistanceM: 12_000,
    batteryLevel,
    stops: [
      { ...home, placeName: '다솔', address: '서울특별시 금천구 가산동 39-222', arrivedAt: at(0, 3, 45), leftAt: at(0, 12, 30) },
      { ...cross, placeName: '교차로', address: '서울특별시 금천구 가산디지털1로', arrivedAt: at(0, 13, 15), leftAt: at(0, 15, 30), movedMinutesBefore: 45 },
      { ...office, placeName: '현대테라타워', address: '서울특별시 금천구 가산디지털1로 168', arrivedAt: at(0, 15, 45), movedMinutesBefore: 15 },
    ],
    route: [
      { kind: 'stay', coordinates: [home, { latitude: 37.4789, longitude: 126.8779 }] },
      { kind: 'move', coordinates: [{ latitude: 37.4789, longitude: 126.8779 }, { latitude: 37.4802, longitude: 126.8801 }, cross] },
      { kind: 'stay', coordinates: [cross, { latitude: 37.482, longitude: 126.8832 }] },
      { kind: 'move', coordinates: [{ latitude: 37.482, longitude: 126.8832 }, { latitude: 37.4831, longitude: 126.8898 }, office] },
    ],
  };
}
