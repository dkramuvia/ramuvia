import i18n from '@/i18n';

/**
 * 지도 마커에 띄울 상태 한 줄 (피그마 지도 메인, 2026-09-28판).
 *
 * 디자인에 나오는 문구는 세 가지입니다.
 *   `같은 자리에서 1시간 40분` · `걸어서 이동중` · `18km로 이동중`
 *
 * **속도만 보면 안 됩니다.** 실내에서는 가만히 있어도 위치 오차 때문에 속도가 튀어
 * (09-15 실측: 책상에 둔 폰이 시속 40km) "이동중" 이 뜹니다. 그래서
 * 활동 인식을 먼저 보고, 없을 때만 속도로 판단합니다 — 수집 쪽과 같은 기준입니다.
 */

/** 이 속도(km/h) 아래면 멈춘 것으로 봅니다 (adaptive.ts 의 MOVING_SPEED_KMH 와 같은 값) */
const MOVING_SPEED_KMH = 3;

export interface StatusInput {
  /** 안드로이드 활동 인식 결과 ('walking' | 'vehicle' | 'still' ...). 없으면 속도로 판단 */
  activity?: string | null;
  speedKmh?: number | null;
  /** 언제부터 한자리에 있는지 (ISO). 서버가 주는 값 */
  stayedSince?: string | null;
}

export function statusText({ activity, speedKmh, stayedSince }: StatusInput): string | null {
  const speed = speedKmh ?? null;
  const movingBySpeed = speed != null && speed >= MOVING_SPEED_KMH;
  const walking = activity === 'walking' || activity === 'on_foot';
  const riding = activity === 'vehicle' || activity === 'bicycle' || activity === 'running';
  const still = activity === 'still' || (!activity && !movingBySpeed);

  if (walking) return i18n.t('map.statusWalking');
  if (riding || (!activity && movingBySpeed)) {
    // 속도를 모르면 숫자 없이 "이동중" 만
    return speed != null ? i18n.t('map.statusMoving', { speed: Math.round(speed) }) : i18n.t('map.statusMovingPlain');
  }
  if (still) {
    const minutes = stayedMinutes(stayedSince);
    // 막 멈춘 사람에게 "같은 자리에서 0분" 은 말이 안 됩니다
    if (minutes != null && minutes >= 1) return i18n.t('map.statusStaying', { duration: formatDuration(minutes) });
    return i18n.t('map.statusStill');
  }
  return null;
}

function stayedMinutes(stayedSince?: string | null): number | null {
  if (!stayedSince) return null;
  const since = new Date(stayedSince).getTime();
  if (Number.isNaN(since)) return null;
  return Math.floor((Date.now() - since) / 60_000);
}

/** 100분 → "1시간 40분" (디자인 문구 그대로) */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return i18n.t('map.durationMinutes', { minutes: m });
  if (m === 0) return i18n.t('map.durationHours', { hours: h });
  return i18n.t('map.durationHoursMinutes', { hours: h, minutes: m });
}
