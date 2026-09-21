import Storage from 'expo-sqlite/kv-store';

/**
 * SOS 진행 중 표시 (GPS 보고서 2-1 1번).
 *
 * SOS 를 누르면 수집 주기가 2초로 올라가야 하는데, 그 신호가 백그라운드 수집까지
 * 닿지 않고 있었습니다. 코드에 `TODO(SOS 화면에서 켜 주기)` 로 남아 있던 부분입니다.
 *
 * 기기에 저장하는 이유: 백그라운드 수집은 화면이 없어 메모리 값을 못 봅니다.
 * 안드로이드가 앱을 죽였다 깨워도 남아 있어야 구조대가 오는 동안 경로가 끊기지 않습니다.
 */

const KEY = 'location-sos-mode';

/**
 * 이 시간이 지나면 저절로 꺼집니다.
 * 끄는 것을 잊거나 앱이 죽으면 2초 수집이 계속 돌아 배터리를 순식간에 먹습니다.
 * 상황이 이어지면 앱이 다시 켜 줍니다.
 */
const EXPIRE_MS = 30 * 60_000;

let cached: { on: boolean; at: number } | null = null;

export async function setSosMode(on: boolean): Promise<void> {
  cached = { on, at: Date.now() };
  try {
    await Storage.setItem(KEY, JSON.stringify(cached));
  } catch (error) {
    console.warn('[location] SOS 상태 저장 실패', String(error));
  }
}

export async function isSosActive(): Promise<boolean> {
  try {
    if (!cached) {
      const raw = await Storage.getItem(KEY);
      cached = raw ? (JSON.parse(raw) as { on: boolean; at: number }) : { on: false, at: 0 };
    }
    if (!cached.on) return false;
    if (Date.now() - cached.at > EXPIRE_MS) {
      await setSosMode(false);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
