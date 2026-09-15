import { MOCK_POLICIES } from '@/features/policy/policies';
import type { PlanId } from '@/types/models';

/**
 * 결제 플랜 화면 표시용 정보 (피그마 결제 플랜 283:40073 ~ 283:41302).
 * 가격·스토어 상품 ID 는 기획 확정 전 → 서버/스토어에서 받도록 교체 (WBS 3, 3.4, 11.5)
 */
export interface PlanDisplay {
  id: PlanId;
  name: string;
  englishName: string;
  free: boolean;
  popular?: boolean;
  /** 카드 그라데이션 */
  colors: [string, string];
  frame: string;
  bullets: string[];
  /** TODO(7단계): Play 구독 상품 ID */
  productId?: string;
}

export const PLANS: PlanDisplay[] = [
  {
    id: 'basic',
    name: '베이직',
    englishName: 'Basic',
    free: true,
    colors: ['#6F7780', '#4B525A'],
    frame: '#3C4148',
    bullets: [
      '광고 포함 (전체화면 광고 포함)',
      'GPS 위치 갱신 (20초 주기)',
      '기본 OS 지도 제공',
      '안심 장소 4개 / 단일 위치 10개 등록',
      '예약 메시지 2명 / SOS 전송 1명',
      '친구별 위치 및 배터리 잔량 확인',
      '사진 공유 용량 300MB',
    ],
  },
  {
    id: 'platinum',
    name: '플래티넘',
    englishName: 'Platinum',
    free: false,
    popular: true,
    colors: ['#FF9A76', '#FF6A4D'],
    frame: '#8A5A4A',
    productId: 'ramupin_platinum',
    bullets: [
      '광고 없는 쾌적한 환경',
      '초정밀 GPS 위치 갱신 (10초 주기)',
      '프리미엄 지도 (Naver/MapBox) 제공',
      '안심 장소 20개 / 위치 등록 50개',
      '지오펜스 알림 (최대 10개)',
      '사진 공유 용량 1GB',
      '교통 상황, 날씨, 운전 속도 경고 알림',
      '위급시 관공서 긴급 제공',
    ],
  },
  {
    id: 'trinity',
    name: '트리니티',
    englishName: 'Trinity',
    free: false,
    colors: ['#7B8CFF', '#5A4DFF'],
    frame: '#3E3A8A',
    productId: 'ramupin_trinity',
    bullets: [
      '광고 없는 쾌적한 환경',
      '초정밀 GPS 위치 갱신 (10초 주기)',
      '프리미엄 지도 (Naver/MapBox) 제공',
      '안심 장소 50개 / 위치 등록 100개',
      '지오펜스 알림 (최대 30개)',
      '사진 공유 용량 5GB',
      '교통 상황, 날씨, 운전 속도 경고 알림',
      '위급시 관공서 긴급 전송',
    ],
  },
  {
    id: 'care',
    name: '케어',
    englishName: 'Care',
    free: true,
    colors: ['#4FC99A', '#2E9E74'],
    frame: '#2A6B53',
    bullets: [
      '광고 없는 쾌적한 환경',
      '초정밀 GPS 위치 갱신 (10초 주기)',
      '기본 OS 지도 제공',
      '안심 장소 20개 / 위치 등록 10개',
      '예약 메시지 3명 / SOS 전송 5명',
      '지오펜스 알림 (최대 10개)',
      '가족에게만 배터리 잔량 전송',
      '위급 시 관공서 긴급 전송',
      '날씨 정보 제공 (사진 용량 300MB)',
    ],
  },
  {
    id: 'guardian',
    name: '1인 가구 가디언',
    englishName: 'Guardian',
    free: false,
    colors: ['#FFB547', '#F2894A'],
    frame: '#8A6A3A',
    productId: 'ramupin_guardian',
    bullets: [
      '광고 포함 (전체화면 광고 포함)',
      'GPS 위치 갱신 (20초 주기)',
      '안심 장소 3개 / 위치 등록 10개',
      '예약 메시지 1명 / SOS 전송 1명',
      '지오펜스 알림 (최대 3개)',
      '서버에서 직접 배터리 상태 관리',
      '위급시 관공서 긴급 전송',
    ],
  },
];

/** 비교표 행 (피그마 플랜 카드 아래 표) */
export const COMPARE_ROWS: { label: string; value: (id: PlanId) => string | boolean }[] = [
  { label: '광고', value: (id) => (MOCK_POLICIES[id].ads === 'none' ? '제거' : '포함') },
  { label: '전체화면 광고', value: (id) => MOCK_POLICIES[id].ads === 'banner+fullscreen' },
  { label: 'GPS 전송주기', value: (id) => `${MOCK_POLICIES[id].gpsIntervalMovingSec}초` },
  { label: '장소 등록 개수', value: (id) => `${MOCK_POLICIES[id].safeZoneLimit}개` },
  { label: '지도', value: (id) => (MOCK_POLICIES[id].features.premiumMap ? 'Naver/Mapbox' : 'OS') },
  { label: '예약 메시지 인원', value: (id) => `${MOCK_POLICIES[id].scheduledMessageRecipientLimit}명` },
  { label: 'SOS 전송 인원', value: (id) => `${MOCK_POLICIES[id].sosRecipientLimit}명` },
  { label: '위치 등록 (단순)', value: (id) => `${MOCK_POLICIES[id].placeLimit}개` },
  { label: '지오펜스 지정 알림 개수', value: (id) => (MOCK_POLICIES[id].geofenceAlertLimit ? `${MOCK_POLICIES[id].geofenceAlertLimit}개` : false) },
  { label: '교통 상황·날씨', value: (id) => MOCK_POLICIES[id].features.trafficWeather },
  { label: '사진 공유 용량', value: (id) => formatStorage(MOCK_POLICIES[id].photoStorageMb) },
  { label: '운전 속도 경고', value: (id) => MOCK_POLICIES[id].features.speedingAlert },
  { label: '관공서 긴급 전송', value: (id) => MOCK_POLICIES[id].features.governmentEmergency },
];

function formatStorage(mb: number): string | boolean {
  if (!mb) return false;
  return mb >= 1024 ? `${Math.round(mb / 1024)}GB` : `${mb}MB`;
}

/** TODO(7단계): 스토어 가격 문자열로 교체. 기획서 가격 미정 */
export function priceText(plan: PlanDisplay, yearly: boolean): string {
  if (plan.free) return '무료';
  return yearly ? '월 0000원' : '0000원';
}
