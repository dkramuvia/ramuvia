import i18n from '@/i18n';
import { usePreferencesStore } from '@/stores/preferencesStore';

/** "방금 전", "4분 전", "2시간 전", "3일 전" */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const diffMin = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return i18n.t('time.justNow');
  if (diffMin < 60) return i18n.t('time.minutesAgo', { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return i18n.t('time.hoursAgo', { count: diffHour });
  return i18n.t('time.daysAgo', { count: Math.floor(diffHour / 24) });
}

type DateInput = string | number | Date;
const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));
const pad = (n: number) => String(n).padStart(2, '0');
/** 앱 언어를 따라갑니다 (보완 4.14). 한국어면 "10월 27일 화요일", 영어면 "Tuesday, October 27" */
const locale = () => (i18n.language?.startsWith('en') ? 'en-US' : 'ko-KR');
const prefs = () => usePreferencesStore.getState();

/**
 * 시각: 설정의 "시간 표기"(12시간 · 24시간)를 따릅니다 (보완 4.14).
 * 12시간 "오후 2:09", 24시간 "14:09"
 */
export function formatTimeOfDay(value: DateInput, options: { seconds?: boolean } = {}): string {
  return toDate(value).toLocaleTimeString(locale(), {
    hour: prefs().timeFormat === '24h' ? '2-digit' : 'numeric',
    minute: '2-digit',
    ...(options.seconds ? { second: '2-digit' } : {}),
    hour12: prefs().timeFormat === '12h',
  });
}

/**
 * 날짜 모양.
 *   full "2026년 10월 27일" · fullWeekday "2026년 10월 27일 화요일" · monthDay "10월 27일"
 *   monthDayWeekday "10월 27일 화요일" · yearMonth "2026년 10월"
 */
export type DateStyle = 'full' | 'fullWeekday' | 'monthDay' | 'monthDayWeekday' | 'yearMonth';

const LONG: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  full: { year: 'numeric', month: 'long', day: 'numeric' },
  fullWeekday: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' },
  monthDay: { month: 'long', day: 'numeric' },
  monthDayWeekday: { month: 'long', day: 'numeric', weekday: 'long' },
  yearMonth: { year: 'numeric', month: 'long' },
};

/**
 * 날짜: 설정의 "날짜 형식"을 따릅니다 (보완 4.14).
 * 기본(YYYY.MM.DD)은 지금처럼 글로 쓴 날짜("10월 27일 화요일"), MM/DD · DD/MM 을 고르면 숫자로 "10/27 (화)" · "27/10 (화)"
 */
export function formatDate(value: DateInput, style: DateStyle = 'full'): string {
  const d = toDate(value);
  const format = prefs().dateFormat;
  if (format === 'YMD') return d.toLocaleDateString(locale(), LONG[style]);
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const monthDay = format === 'MDY' ? `${m}/${day}` : `${day}/${m}`;
  const weekday = style.endsWith('Weekday') ? ` (${d.toLocaleDateString(locale(), { weekday: 'short' })})` : '';
  if (style === 'yearMonth') return `${m}/${y}`;
  if (style === 'full' || style === 'fullWeekday') return `${monthDay}/${y}${weekday}`;
  return `${monthDay}${weekday}`;
}

/** 날짜와 시각 함께: "10월 27일 오후 2:09" (연도까지는 withYear) */
export function formatDateTime(value: DateInput, options: { withYear?: boolean; seconds?: boolean } = {}): string {
  return `${formatDate(value, options.withYear ? 'full' : 'monthDay')} ${formatTimeOfDay(value, { seconds: options.seconds })}`;
}

/** 피그마 알림 시각 형식: "08-27 08:52" (날짜 형식이 MM/DD · DD/MM 이면 그 순서, 시각은 시간 표기 설정) */
export function formatMonthDayTime(iso: string): string {
  const d = new Date(iso);
  const format = prefs().dateFormat;
  const monthDay = format === 'DMY' ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : format === 'MDY' ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}` : `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = prefs().timeFormat === '24h' ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : formatTimeOfDay(d);
  return `${monthDay} ${time}`;
}
