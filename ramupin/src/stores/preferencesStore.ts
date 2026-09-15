import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** 기기에만 저장하는 화면 설정 (서버와 무관). 앱을 다시 켜도 유지됩니다 */
export interface Preferences {
  distanceUnit: 'km' | 'mile';
  mapTheme: 'light' | 'dark';
  mapDimension: '2d' | '3d';
  mapProvider: 'os' | 'naver' | 'mapbox';
  showTraffic: boolean;
  showWeather: boolean;
  /** 지도를 열면 모든 친구가 보이도록 축소 */
  fitAllFriends: boolean;
}

interface PreferencesState extends Preferences {
  set: (patch: Partial<Preferences>) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      distanceUnit: 'km',
      mapTheme: 'light',
      mapDimension: '2d',
      mapProvider: 'os',
      showTraffic: false,
      showWeather: false,
      fitAllFriends: false,
      set: (patch) => set(patch),
    }),
    { name: 'preferences', storage: createJSONStorage(() => Storage) },
  ),
);

/** 거리 표시 (WBS 10.2 km/mile) */
export function formatDistance(meters: number, unit: Preferences['distanceUnit']): string {
  if (unit === 'mile') {
    const miles = meters / 1609.344;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)}mi`;
  }
  const km = meters / 1000;
  return km < 1 ? `${Math.round(meters)}m` : `${km < 10 ? km.toFixed(1) : Math.round(km)}km`;
}
