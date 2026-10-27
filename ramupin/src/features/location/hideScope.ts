import Storage from 'expo-sqlite/kv-store';

import type { HideModeSetting } from '@/types/models';

/**
 * 숨김 모드 "서버에도 안 보내기" 인지 (WBS 12.7).
 *
 * 백그라운드 위치 수집은 화면 없이 깨어나 바로 위치를 쌓습니다. 그때 서버에 물어볼 수 없으니
 * 숨김 설정을 읽거나 저장할 때마다 기기에 적어 두고, 위치를 쌓기 전에 동기로 읽습니다.
 */
const KEY = 'hide-off-server';

/** 서버에서 받은 숨김 설정을 기기에 적어 둡니다 */
export function rememberHideMode(setting: HideModeSetting) {
  try {
    const offServer = setting.hideAll && setting.scope === 'off_server';
    Storage.setItemSync(KEY, offServer ? JSON.stringify({ until: setting.until }) : '');
  } catch {
    // 기기 저장이 안 되면 서버가 대신 막습니다 (refusesLocation)
  }
}

/** 지금 위치를 서버로 보내지 말아야 하는지 */
export function isHiddenFromServer(now = Date.now()): boolean {
  try {
    const raw = Storage.getItemSync(KEY);
    if (!raw) return false;
    const { until } = JSON.parse(raw) as { until: string | null };
    return !until || new Date(until).getTime() > now;
  } catch {
    return false;
  }
}
