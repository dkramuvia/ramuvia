import type { PlanId } from '@/types/models';

/** 화면에 보여 주는 등급 이름 ("0000 플랜부터 이용 가능") */
export const PLAN_NAMES: Record<PlanId, string> = {
  basic: '베이직',
  platinum: '플래티넘',
  trinity: '트리니티',
  care: '케어',
  guardian: '가디언',
};

/**
 * 등급별 제한값·기능 (WBS 2.1: 수치 하드코딩 금지 → 서버 정책 API 로 내려받음).
 * 여기 값은 서버 연동 전까지 쓰는 목업이며, 피그마 결제 플랜 화면 기준입니다.
 * 요금 등급 체계는 기획 확정 전 (docs/wbs-check.md §2-1)
 */
export interface PlanPolicy {
  planId: PlanId;
  /** 이동 중 위치 전송 최대 주기(초) */
  gpsIntervalMovingSec: number;
  /** 안심 장소(지오펜스) 등록 수 */
  safeZoneLimit: number;
  /** 단일 위치 등록 수 */
  placeLimit: number;
  /** 지오펜스 진입·이탈 알림 대상 수 */
  geofenceAlertLimit: number;
  scheduledMessageRecipientLimit: number;
  sosRecipientLimit: number;
  /** 사진 공유 용량(MB), 0 = 불가 */
  photoStorageMb: number;
  ads: 'none' | 'banner' | 'banner+fullscreen';
  features: {
    premiumMap: boolean;
    trafficWeather: boolean;
    speedingAlert: boolean;
    governmentEmergency: boolean;
  };
}

const base = {
  gpsIntervalMovingSec: 20,
  safeZoneLimit: 4,
  placeLimit: 10,
  geofenceAlertLimit: 0,
  scheduledMessageRecipientLimit: 2,
  sosRecipientLimit: 1,
  photoStorageMb: 300,
  ads: 'banner+fullscreen',
  features: { premiumMap: false, trafficWeather: false, speedingAlert: false, governmentEmergency: false },
} satisfies Omit<PlanPolicy, 'planId'>;

export const MOCK_POLICIES: Record<PlanId, PlanPolicy> = {
  basic: { planId: 'basic', ...base },
  platinum: {
    planId: 'platinum',
    ...base,
    gpsIntervalMovingSec: 10,
    safeZoneLimit: 20,
    placeLimit: 50,
    geofenceAlertLimit: 10,
    scheduledMessageRecipientLimit: 10,
    sosRecipientLimit: 10,
    photoStorageMb: 1024,
    ads: 'none',
    features: { premiumMap: true, trafficWeather: true, speedingAlert: true, governmentEmergency: true },
  },
  trinity: {
    planId: 'trinity',
    ...base,
    gpsIntervalMovingSec: 10,
    safeZoneLimit: 50,
    placeLimit: 100,
    geofenceAlertLimit: 30,
    scheduledMessageRecipientLimit: 30,
    sosRecipientLimit: 30,
    photoStorageMb: 5120,
    ads: 'none',
    features: { premiumMap: true, trafficWeather: true, speedingAlert: true, governmentEmergency: true },
  },
  care: {
    planId: 'care',
    ...base,
    gpsIntervalMovingSec: 10,
    safeZoneLimit: 20,
    placeLimit: 10,
    geofenceAlertLimit: 10,
    scheduledMessageRecipientLimit: 3,
    sosRecipientLimit: 5,
    ads: 'none',
    features: { premiumMap: false, trafficWeather: true, speedingAlert: false, governmentEmergency: true },
  },
  guardian: {
    planId: 'guardian',
    ...base,
    safeZoneLimit: 3,
    placeLimit: 10,
    geofenceAlertLimit: 3,
    scheduledMessageRecipientLimit: 1,
    sosRecipientLimit: 1,
    photoStorageMb: 0,
    features: { ...base.features, governmentEmergency: true },
  },
};

/** 무료 체험(1개월)·유료 전환 안내에 쓰는 "이 기능이 열리는 최소 플랜" */
export const FEATURE_MIN_PLAN: Record<keyof PlanPolicy['features'], PlanId> = {
  premiumMap: 'platinum',
  trafficWeather: 'platinum',
  speedingAlert: 'platinum',
  governmentEmergency: 'care',
};
