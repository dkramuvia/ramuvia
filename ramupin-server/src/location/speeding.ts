/**
 * 과속 판정 (WBS 8.1).
 *
 * 화면 문구: "안전을 위해 속도를 줄여주세요. **계속 초과 시** 보호자(친구)에게 경고가
 * 자동 발송됩니다." — 그래서 두 단계입니다.
 *   1. 기준을 넘으면 **본인에게** 경고
 *   2. 그래도 계속 넘으면 **보호자에게** 알림
 *
 * **한 번 튄 값으로 알리지 않습니다.** GPS 속도는 터널·고가도로·신호 반사로 순간적으로
 * 튑니다 (09-15 실측: 책상에 둔 폰이 시속 40km). 잠깐 넘은 것으로 알리면
 * 가짜 경고가 쌓여 사람들이 알림을 꺼 버립니다.
 */

/**
 * 과속 기준 (km/h).
 *
 * **대표님 확인이 필요한 값입니다.** 피그마에는 `80km로 제한 속도를...` 이라는 문구가
 * 있고 팝업 예시는 160km 입니다. 도로마다 제한 속도가 다른데 앱은 그것을 모르므로,
 * "어느 도로에서든 위험한 속도" 하나로 잡았습니다. 고속도로 제한(110)보다 위입니다.
 */
export const SPEEDING_KMH = 120;

/** 이만큼 이어서 넘어야 경고합니다. 한 점이 튄 것으로는 알리지 않습니다 */
export const SPEEDING_MIN_SECONDS = 30;

/** 보호자에게 알리는 기준. 본인 경고보다 한참 더 이어졌을 때만 */
export const GUARDIAN_MIN_SECONDS = 120;

/** 같은 사람에게 이 시간 안에는 다시 알리지 않습니다 (고속도로 주행 내내 울리지 않게) */
export const REPEAT_COOLDOWN_MS = 10 * 60_000;

export interface SpeedPoint {
  /** km/h. 없으면 판정에서 뺍니다 */
  speedKmh: number | null;
  measuredAt: Date;
}

export type SpeedingStage = 'none' | 'warn' | 'guardian';

/**
 * 이어서 과속한 시간(초)을 셉니다.
 *
 * **뒤에서부터** 봅니다. 지금 과속 중인지가 관심사이지, 아까 한 번 넘었는지가 아닙니다.
 * 기준 아래인 점이 나오면 거기서 끊습니다.
 */
export function speedingSeconds(points: SpeedPoint[], threshold = SPEEDING_KMH): number {
  const sorted = [...points].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  const last = sorted.at(-1);
  if (!last || last.speedKmh == null || last.speedKmh < threshold) return 0;

  let since = last.measuredAt.getTime();
  for (let i = sorted.length - 2; i >= 0; i -= 1) {
    const point = sorted[i];
    if (point.speedKmh == null || point.speedKmh < threshold) break;
    since = point.measuredAt.getTime();
  }
  return Math.round((last.measuredAt.getTime() - since) / 1000);
}

/**
 * 지금 어느 단계인가.
 *
 * `warnSeconds` 를 넘으면 본인 경고, `guardianSeconds` 를 넘으면 보호자 알림입니다.
 */
export function speedingStage(
  seconds: number,
  warnSeconds = SPEEDING_MIN_SECONDS,
  guardianSeconds = GUARDIAN_MIN_SECONDS,
): SpeedingStage {
  if (seconds >= guardianSeconds) return 'guardian';
  if (seconds >= warnSeconds) return 'warn';
  return 'none';
}

/** 마지막으로 알린 뒤 충분히 지났는가 */
export function canNotifyAgain(lastNotifiedAt: Date | null, now: Date, cooldownMs = REPEAT_COOLDOWN_MS): boolean {
  if (!lastNotifiedAt) return true;
  return now.getTime() - lastNotifiedAt.getTime() >= cooldownMs;
}

/** 이 구간에서 가장 빨랐던 속도 (알림에 보여 줄 숫자) */
export function peakSpeed(points: SpeedPoint[]): number {
  return Math.round(Math.max(0, ...points.map((p) => p.speedKmh ?? 0)));
}
