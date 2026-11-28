/**
 * 수집(backgroundTask)이 마지막으로 판단한 '이동 중인지' (11-27).
 *
 * 지도 배지와 서버로 올리는 state 가 같은 판단을 쓰게 합니다. 예전에는 화면이 활동 인식만 따로 봐서,
 * 달리는 차 안에서 활동 인식이 '정지'라고 하면 위치가 계속 바뀌어도 '머무는 중'으로 보였습니다.
 */
let last: { moving: boolean; at: number } | null = null;

/** 이보다 오래된 판단은 믿지 않습니다 (수집이 멈췄거나 앱이 막 켜짐) */
const FRESH_MS = 3 * 60_000;

export function setMovement(moving: boolean) {
  last = { moving, at: Date.now() };
}

/** 최근 판단. 모르면 null */
export function recentMovement(): boolean | null {
  if (!last || Date.now() - last.at > FRESH_MS) return null;
  return last.moving;
}
