import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** 기기에만 저장하는 화면 설정 (서버와 무관). 앱을 다시 켜도 유지됩니다 */
export interface Preferences {
  /** 앱 언어. auto = 기기 설정 따름 (보완 4.14) */
  language: 'auto' | 'ko' | 'en';
  distanceUnit: 'km' | 'mile';
  speedUnit: 'kmh' | 'mph';
  temperatureUnit: 'c' | 'f';
  timeFormat: '12h' | '24h';
  dateFormat: 'YMD' | 'MDY' | 'DMY';
  /** 예약 메시지를 보낼 시각의 기준 (받는 사람이 다른 나라에 있을 때) */
  scheduleTimezone: 'recipient' | 'mine';
  /** 글자 크기. 기기 접근성 글자 크기 위에 한 번 더 곱합니다 */
  fontScale: 'normal' | 'large' | 'xlarge';
  /**
   * 앱 전체 화면 색 (피그마 2026-09-28 다크 모드).
   * 'auto' 는 기기 설정을 따라갑니다 — 안드로이드에서 다크를 켜면 앱도 어두워집니다.
   * 지도 스타일(mapTheme)과는 별개입니다.
   */
  appTheme: 'auto' | 'light' | 'dark';
  mapTheme: 'light' | 'dark';
  mapDimension: '2d' | '3d';
  mapProvider: 'os' | 'naver' | 'mapbox';
  /**
   * 지도 유형. 기획에는 일반만 있고, 위성·지형은 Google 결제 계정이 있어야 보여서 화면에서는 뺐습니다.
   * (설정 화면 선택지는 09-16 기획 확인 후 제거. 값은 구조만 남겨 둠)
   */
  mapType: 'road' | 'satellite' | 'terrain';
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
      language: 'auto',
      distanceUnit: 'km',
      speedUnit: 'kmh',
      temperatureUnit: 'c',
      timeFormat: '12h',
      dateFormat: 'YMD',
      scheduleTimezone: 'recipient',
      fontScale: 'normal',
      appTheme: 'auto',
      mapTheme: 'light',
      mapDimension: '2d',
      mapProvider: 'os',
      mapType: 'road',
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

/** 글자 크기 배율 (보완 4.14 보통 / 크게 / 아주 크게) */
export const FONT_SCALE: Record<Preferences['fontScale'], number> = { normal: 1, large: 1.15, xlarge: 1.3 };

/** 속도 표시 (km/h · mph) */
export function formatSpeed(kmh: number, unit: Preferences['speedUnit']): string {
  return unit === 'mph' ? `${Math.round(kmh * 0.621371)}mph` : `${Math.round(kmh)}km/h`;
}

/** 온도 표시 (°C · °F) */
export function formatTemperature(celsius: number, unit: Preferences['temperatureUnit']): string {
  return unit === 'f' ? `${Math.round(celsius * 1.8 + 32)}°F` : `${celsius}°C`;
}

/** 시각 표시 (12시간 · 24시간) */
export function formatClock(date: Date, format: Preferences['timeFormat']): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: format === '12h' });
}

/** 날짜 표시 (YYYY.MM.DD · MM/DD/YYYY · DD/MM/YYYY) */
export function formatDay(date: Date, format: Preferences['dateFormat']): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return format === 'MDY' ? `${m}/${d}/${y}` : format === 'DMY' ? `${d}/${m}/${y}` : `${y}.${m}.${d}`;
}
