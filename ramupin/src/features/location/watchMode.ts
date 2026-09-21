import Storage from 'expo-sqlite/kv-store';

/**
 * "지금 누가 내 지도를 보고 있다" 표시 (GPS 보고서 2-1 6번).
 *
 * 아무도 안 볼 때까지 촘촘하게 보내면 배터리와 서버를 그냥 버리는 셈입니다.
 * 서버가 소켓으로 알려 주면 그때만 주기를 올리고, 끊기면 원래대로 돌아갑니다.
 *
 * 기기에 저장하는 이유: 백그라운드 수집은 화면이 없어 메모리 값을 못 봅니다.
 * 또 안드로이드가 앱 프로세스를 죽였다 깨워도 남아 있어야 합니다.
 */

const KEY = 'location-watch-mode';

/**
 * 이 시간이 지나면 저절로 꺼집니다.
 * 보는 사람이 앱을 강제 종료하거나 인터넷이 끊기면 "꺼라"는 신호가 못 옵니다.
 * 그대로 두면 촘촘한 수집이 계속 돌아 배터리를 먹으므로, 마지막 신호 기준으로 만료시킵니다.
 */
const EXPIRE_MS = 3 * 60_000;

let cached: { on: boolean; at: number } | null = null;

export async function setWatchMode(on: boolean): Promise<void> {
  cached = { on, at: Date.now() };
  try {
    await Storage.setItem(KEY, JSON.stringify(cached));
  } catch (error) {
    console.warn('[location] 조회 상태 저장 실패', String(error));
  }
}

export async function isWatched(): Promise<boolean> {
  try {
    if (!cached) {
      const raw = await Storage.getItem(KEY);
      cached = raw ? (JSON.parse(raw) as { on: boolean; at: number }) : { on: false, at: 0 };
    }
    if (!cached.on) return false;
    if (Date.now() - cached.at > EXPIRE_MS) {
      // 만료됐으면 꺼진 것으로 보고 기록도 정리합니다
      await setWatchMode(false);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
