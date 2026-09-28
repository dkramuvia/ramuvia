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
  /** 월 결제 가격(원). 무료 등급은 없습니다 (피그마 2026-09-28) */
  monthlyPrice?: number;
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
      'GPS 전송속도 LOW',
      '기본 OS 지도 제공',
      '장소 등록 5개',
      '안심존 지정 알림 2개',
      '예약 메시지 2명, SOS 전송 1명',
      '관공서 연락 1건',
      '친구별 위치 및 배터리 잔량 확인',
      '사진 공유 용량 300MB',
      '데이터 서버 저장 기간 7일',
    ],
  },
  {
    id: 'platinum',
    name: '플래티넘',
    englishName: 'Platinum',
    free: false,
    monthlyPrice: 4400,
    popular: true,
    colors: ['#FF9A76', '#FF6A4D'],
    frame: '#8A5A4A',
    productId: 'ramupin_platinum',
    bullets: [
      '광고 없는 쾌적한 환경',
      'GPS 전송속도 MID',
      '프리미엄 지도 (Naver/MapBox) 제공',
      '장소 등록 20개',
      '안심존 지정 알림 5개',
      '예약 메시지 10명, SOS 전송 3명',
      '관공서 연락 3건',
      '사진 공유 용량 1GB',
      '데이터 서버 저장 기간 15일',
      '운전 속도 경고 기능',
    ],
  },
  {
    id: 'trinity',
    name: '트리니티',
    englishName: 'Trinity',
    free: false,
    monthlyPrice: 7700,
    colors: ['#7B8CFF', '#5A4DFF'],
    frame: '#3E3A8A',
    productId: 'ramupin_trinity',
    bullets: [
      '광고 없는 쾌적한 환경',
      '초정밀 GPS 위치 갱신 (10초 주기)',
      '프리미엄 지도 (Naver/MapBox) 제공',
      '안심 장소 50개 / 위치 등록 100개',
      '안심존 알림 (최대 30개)',
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
      '안심존 알림 (최대 10개)',
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
      '안심존 알림 (최대 3개)',
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
  { label: '안심존 지정 알림 개수', value: (id) => (MOCK_POLICIES[id].geofenceAlertLimit ? `${MOCK_POLICIES[id].geofenceAlertLimit}개` : false) },
  { label: '교통 상황·날씨', value: (id) => MOCK_POLICIES[id].features.trafficWeather },
  { label: '사진 공유 용량', value: (id) => formatStorage(MOCK_POLICIES[id].photoStorageMb) },
  { label: '운전 속도 경고', value: (id) => MOCK_POLICIES[id].features.speedingAlert },
  { label: '관공서 긴급 전송', value: (id) => MOCK_POLICIES[id].features.governmentEmergency },
];

function formatStorage(mb: number): string | boolean {
  if (!mb) return false;
  return mb >= 1024 ? `${Math.round(mb / 1024)}GB` : `${mb}MB`;
}

/**
 * 화면에 보여 줄 가격 (피그마 2026-09-28).
 *
 * 연간은 **10% 싼 값을 12개월로 나눈 월 가격**을 보여 줍니다
 * (피그마 플래티넘: 월 4,400원 → 연 47,520원).
 *
 * TODO(7단계): 스토어(구글 플레이)에 등록한 가격 문자열로 교체.
 *   나라마다 통화가 다르고, 스토어가 정한 값과 다르면 심사에서 문제가 됩니다.
 */
export function priceText(plan: PlanDisplay, yearly: boolean): string {
  if (plan.free) return '무료';
  if (!plan.monthlyPrice) return '준비 중';
  if (!yearly) return `${plan.monthlyPrice.toLocaleString('ko-KR')}원`;
  return `월 ${Math.round((plan.monthlyPrice * 12 * (1 - YEARLY_DISCOUNT)) / 12).toLocaleString('ko-KR')}원`;
}

/** 연간 결제 할인. 피그마에 -20% 와 -10% 가 섞여 있어 확인이 필요합니다 (docs/plan-limits-conflict.md) */
export const YEARLY_DISCOUNT = 0.1;

/** 연간 결제 총액 (피그마: 47,520원) */
export function yearlyTotalText(plan: PlanDisplay): string | null {
  if (plan.free || !plan.monthlyPrice) return null;
  return `연 ${Math.round(plan.monthlyPrice * 12 * (1 - YEARLY_DISCOUNT)).toLocaleString('ko-KR')}원`;
}
