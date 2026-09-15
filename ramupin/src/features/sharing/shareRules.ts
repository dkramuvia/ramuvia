import type { FriendShareSetting, LocationShareLevel } from '@/types/models';

/**
 * 기획 규칙 (설정 2 - 친구별 상세 공유)
 * - 정확: 상태 보이기 / 이동경로 / 배터리 모두 조작 가능
 * - 흐림: 상태 보이기, 배터리는 조작 가능 / 이동경로는 강제 OFF
 * - 비공개: 전부 강제 OFF
 */
export function applyShareLevel(
  setting: FriendShareSetting,
  level: LocationShareLevel,
): FriendShareSetting {
  switch (level) {
    case 'exact':
      return { ...setting, locationLevel: level };
    case 'blurred':
      return { ...setting, locationLevel: level, shareRoute: false };
    case 'hidden':
      return {
        ...setting,
        locationLevel: level,
        showStatus: false,
        shareRoute: false,
        shareBattery: false,
      };
  }
}

export function isToggleLocked(
  level: LocationShareLevel,
  field: 'showStatus' | 'shareRoute' | 'shareBattery',
): boolean {
  if (level === 'hidden') return true;
  if (level === 'blurred') return field === 'shareRoute';
  return false;
}
