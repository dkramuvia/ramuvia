import i18n from '@/i18n';

/** "방금 전", "4분 전", "2시간 전", "3일 전" */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const diffMin = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return i18n.t('time.justNow');
  if (diffMin < 60) return i18n.t('time.minutesAgo', { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return i18n.t('time.hoursAgo', { count: diffHour });
  return i18n.t('time.daysAgo', { count: Math.floor(diffHour / 24) });
}

/** 피그마 알림 시각 형식: "08-27 08:52" */
export function formatMonthDayTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
