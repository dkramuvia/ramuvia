import { MOCK_POLICIES } from '@/features/policy/policies';
import type { PlanId } from '@/types/models';

/**
 * 결제 플랜 화면 표시용 정보 (피그마 v2.1 결제 플랜 1015:49092 ~ 1015:50241, 10-26 대표님: 이 화면 기준).
 * 숫자는 서버 등급 정책(migrations/main/0042)과 같아야 합니다.
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
  /** 카드 그라데이션 (피그마 v3.1 구독 플랜 1063~1067) */
  colors: [string, string];
  /** 카드 둘레의 반투명 테두리 */
  frame: string;
  /** 비교표 바탕 */
  tint: string;
  /** 고른 칩·비교표 제목 글자 */
  accent: string;
  /** 카드가 밝아서 글자를 어둡게 쓰는지 (베이직) */
  light?: boolean;
  /** 등급 마크 (3차 리포트: 등급별 마크) */
  mark: number;
  /** 무료 등급 가격 옆 한 줄 설명 (피그마 v3.1) */
  note?: string;
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
    colors: ['#F0EDED', '#F0EDED'],
    frame: '#E2E0E0',
    tint: '#ECEEF1',
    accent: '#FF7F5E',
    light: true,
    mark: require('../../../assets/images/plan-marks/basic.png'),
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
    monthlyPrice: 5500,
    popular: true,
    colors: ['#FF9F76', '#FA6E50'],
    frame: 'rgba(255,167,130,0.5)',
    tint: '#FFE9DB',
    accent: '#FB7757',
    mark: require('../../../assets/images/plan-marks/platinum.png'),
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
    colors: ['#FFA0DF', '#9181FF'],
    frame: 'rgba(182,177,255,0.5)',
    tint: '#EFE6FF',
    accent: '#9181FF',
    mark: require('../../../assets/images/plan-marks/trinity.png'),
    productId: 'ramupin_trinity',
    bullets: [
      '광고 없는 쾌적한 환경',
      'GPS 전송속도 HI',
      '프리미엄 지도 (Naver/MapBox) 제공',
      '장소 등록 50개',
      '안심존 지정 알림 10개',
      '예약 메시지 30명, SOS 전송 20명',
      '관공서 연락 5건',
      '사진 공유 용량 5GB',
      '데이터 서버 저장 기간 30일',
      '운전 속도 경고 기능',
    ],
  },
  {
    id: 'care',
    name: '케어',
    englishName: 'Care',
    free: true,
    colors: ['#3CC28A', '#3CC28A'],
    frame: 'rgba(60,194,138,0.35)',
    tint: '#E1F6EC',
    accent: '#2E9E74',
    mark: require('../../../assets/images/plan-marks/care.png'),
    note: '노인을 위한 무료 특화 플랜입니다.',
    bullets: [
      '광고 없는 쾌적한 환경',
      '초정밀 GPS 위치 갱신 (10초 주기)',
      '기본 OS 지도 제공',
      '장소 등록 10개',
      '안심존 지정 알림 10개',
      '예약 메시지 3명 / SOS 전송 5명',
      '데이터 서버 저장 기간 15일',
      '가족에게만 배터리 잔량 전송',
      '위급 시 관공서 긴급 전송',
      '날씨 정보 제공 (사진 용량 300MB)',
    ],
  },
  {
    id: 'guardian',
    name: '1인 가구 가디언',
    englishName: 'Guardian',
    free: true,
    colors: ['#3D9BFF', '#3D9BFF'],
    frame: 'rgba(61,155,255,0.35)',
    tint: '#E1F0FF',
    accent: '#FF5A3C',
    mark: require('../../../assets/images/plan-marks/guardian.png'),
    note: '1인 가구를 위한 무료 플랜입니다.',
    bullets: [
      '광고 포함 (전체화면 광고 포함)',
      'GPS 위치 갱신 (20초 주기)',
      '장소 등록 10개',
      '안심존 지정 알림 3개',
      '예약 메시지 1명 / SOS 전송 1명',
      '데이터 서버 저장 기간 15일',
      '서버에서 직접 배터리 상태 관리',
      '위급시 관공서 긴급 전송',
    ],
  },
];

/** 피그마 표의 GPS 전송 속도. 실제 초는 관리자가 바꾸므로 화면에는 단계로만 적습니다 (docs/plan-limits-conflict.md 3) */
const GPS_SPEED: Record<PlanId, string> = { basic: 'LOW', platinum: 'MID', trinity: 'HI', care: 'MID', guardian: 'LOW' };

/** 관공서 연락 건수 (피그마 표). 관공서 연계가 붙기 전이라 서버 정책에는 아직 없습니다 */
const GOVERNMENT_CONTACTS: Record<PlanId, number> = { basic: 1, platinum: 3, trinity: 5, care: 2, guardian: 1 };

/** 비교표 행 (피그마 플랜 카드 아래 표와 같은 순서) */
export const COMPARE_ROWS: { label: string; value: (id: PlanId) => string | boolean }[] = [
  { label: '광고', value: (id) => (MOCK_POLICIES[id].ads === 'none' ? '제거' : '광고 있음') },
  { label: '전체화면 광고', value: (id) => MOCK_POLICIES[id].ads === 'banner+fullscreen' },
  { label: 'GPS 전송 속도', value: (id) => GPS_SPEED[id] },
  { label: '장소 등록 개수', value: (id) => `${MOCK_POLICIES[id].placeLimit}개` },
  { label: '지도', value: (id) => (MOCK_POLICIES[id].features.premiumMap ? 'Naver/Mapbox' : 'OS맵') },
  { label: '예약 메시지 인원', value: (id) => `${MOCK_POLICIES[id].scheduledMessageRecipientLimit}명` },
  { label: 'SOS 전송 인원', value: (id) => `${MOCK_POLICIES[id].sosRecipientLimit}명` },
  { label: '관공서 연락', value: (id) => `${GOVERNMENT_CONTACTS[id]}건` },
  { label: '안심존 알림', value: (id) => (MOCK_POLICIES[id].geofenceAlertLimit ? `${MOCK_POLICIES[id].geofenceAlertLimit}개` : false) },
  { label: '사진 공유 용량', value: (id) => formatStorage(MOCK_POLICIES[id].photoStorageMb) },
  { label: '운전 속도 경고', value: (id) => MOCK_POLICIES[id].features.speedingAlert },
  { label: '데이터 서버 저장 기간', value: (id) => `${MOCK_POLICIES[id].locationRetentionDays}일` },
];

function formatStorage(mb: number): string | boolean {
  if (!mb) return false;
  return mb >= 1024 ? `${Math.round(mb / 1024)}GB` : `${mb}MB`;
}

/**
 * 화면에 보여 줄 가격 (피그마 2026-09-28).
 *
 * 연간은 **10% 싼 값을 12개월로 나눈 월 가격**을 보여 줍니다
 * (피그마 v2.1 플래티넘: 월 5,500원).
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

/** 연간 결제 할인 10% (3차 리포트·피그마 v3.1 '연간 -10% off') */
export const YEARLY_DISCOUNT = 0.1;

/** 연간 결제 총액 */
export function yearlyTotalText(plan: PlanDisplay): string | null {
  if (plan.free || !plan.monthlyPrice) return null;
  return `연 ${Math.round(plan.monthlyPrice * 12 * (1 - YEARLY_DISCOUNT)).toLocaleString('ko-KR')}원`;
}
