import Storage from 'expo-sqlite/kv-store';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { apiClient, mockResponse } from '@/api/client';
import { isLive } from '@/config/env';
import type { LocationShareLevel } from '@/types/models';

/** 지금 내 위치를 보고 있는 친구 한 명 (보완 4.12) */
export interface SharingViewer {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  level: Exclude<LocationShareLevel, 'hidden'>;
  sharingSince: string;
  lastViewedAt: string | null;
  /** 지난 24시간에 본 횟수 (10분 단위로 묶어 셈) */
  viewsToday: number;
  /** 평소보다 갑자기 많이 봄 (지난 3일 하루 평균의 3배 이상) */
  unusual: boolean;
}

export async function fetchSharingOverview(): Promise<SharingViewer[]> {
  if (!isLive('friends')) return mockResponse([]);
  const { data } = await apiClient.get<SharingViewer[]>('/friends/sharing-overview');
  return data;
}

const KEY = 'sharing-reminder-shown-at';
/** 표시 주기 (보완 4.12: 30일 제안) */
const INTERVAL_MS = 30 * 86_400_000;

export async function markSharingReminderShown() {
  try {
    await Storage.setItem(KEY, String(Date.now()));
  } catch {
    // 못 적으면 다음에 한 번 더 보일 뿐입니다
  }
}

/**
 * 위치 공유 중 알림을 띄울 때인지 (보완 4.12).
 *   - 마지막으로 보여 준 지 30일이 지났거나
 *   - 마지막으로 보여 준 뒤 새로 공유가 시작됐고, 그 공유가 하루 이상 지났을 때 ("새 공유가 시작된 다음 날")
 *   - 처음이면 지금 공유 중인 사람이 있을 때 30일 기준을 오늘부터 셉니다 (설치 직후 바로 띄우지 않게)
 */
export function shouldShowReminder(viewers: SharingViewer[], lastShownAt: number | null, now = Date.now()): boolean {
  if (viewers.length === 0) return false;
  if (lastShownAt === null) return false;
  if (now - lastShownAt >= INTERVAL_MS) return true;
  return viewers.some((v) => {
    const since = new Date(v.sharingSince).getTime();
    return since > lastShownAt && now - since >= 86_400_000;
  });
}

/** 로그인 뒤 한 번 확인해서 때가 되면 위치 공유 중 알림을 띄웁니다 */
export function useSharingReminder(enabled: boolean) {
  const checked = useRef(false);
  useEffect(() => {
    if (!enabled || checked.current) return;
    checked.current = true;
    void (async () => {
      try {
        const raw = await Storage.getItem(KEY).catch(() => null);
        const lastShownAt = raw ? Number(raw) : null;
        if (lastShownAt === null) {
          // 처음: 지금부터 30일을 셉니다
          await markSharingReminderShown();
          return;
        }
        const viewers = await fetchSharingOverview();
        if (shouldShowReminder(viewers, lastShownAt)) setTimeout(() => router.push('/sharing-reminder'), 1500);
      } catch {
        // 못 받아 오면 다음에 다시 봅니다
      }
    })();
  }, [enabled]);
}
