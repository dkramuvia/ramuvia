import { z } from 'zod';

import { parseInput } from '../common/app-error.js';

/**
 * 관리자 화면에서 바꿀 수 있는 정책 항목.
 *
 * 여기 정의가 곧 화면입니다. 항목을 추가하면 관리자 화면에도 자동으로 나타납니다.
 * WBS 2.1(수치 하드코딩 금지)에 따라, 앱은 이 값을 서버에서 받아서 씁니다.
 */

export interface PolicyField {
  key: string;
  label: string;
  /** 화면에 같이 보여 줄 설명 */
  help: string;
  group: string;
  type: 'seconds' | 'count' | 'megabytes' | 'choice' | 'switch';
  min?: number;
  max?: number;
  choices?: { value: string; label: string }[];
}

export const POLICY_FIELDS: PolicyField[] = [
  {
    key: 'gpsIntervalMovingSec',
    label: '이동 중 확인 주기',
    help: '밖에서 걷거나 차를 탈 때. 짧을수록 경로가 촘촘해지고 배터리를 더 씁니다.',
    group: '위치 수집',
    type: 'seconds',
    min: 5,
    max: 600,
  },
  {
    key: 'gpsIntervalStillSec',
    label: '머무는 중 확인 주기',
    help: '한자리에 있을 때. 이상징후 판정 기준이 30분·12·24·48시간이라 짧게 할 이유가 적습니다. 하루의 대부분이 이 구간이라 서버 비용에 가장 큰 영향을 줍니다.',
    group: '위치 수집',
    type: 'seconds',
    min: 10,
    max: 1800,
  },
  {
    key: 'uploadIntervalSec',
    label: '서버 전송 주기',
    help: '모아 둔 위치를 보내는 간격. 확인 주기와 따로 둬서 서버 요청 수를 줄입니다. 길게 하면 보호자 화면이 그만큼 늦게 갱신됩니다.',
    group: '위치 수집',
    type: 'seconds',
    min: 10,
    max: 900,
  },
  { key: 'safeZoneLimit', label: '안심 장소 등록 수', help: '', group: '제한', type: 'count', min: 0, max: 200 },
  { key: 'placeLimit', label: '단일 위치 등록 수', help: '', group: '제한', type: 'count', min: 0, max: 500 },
  { key: 'geofenceAlertLimit', label: '진입·이탈 알림 대상 수', help: '', group: '제한', type: 'count', min: 0, max: 200 },
  {
    key: 'scheduledMessageRecipientLimit',
    label: '예약 메시지 수신인 수',
    help: '',
    group: '제한',
    type: 'count',
    min: 0,
    max: 200,
  },
  { key: 'sosRecipientLimit', label: 'SOS 수신인 수', help: '', group: '제한', type: 'count', min: 0, max: 200 },
  { key: 'photoStorageMb', label: '사진 공유 용량', help: '0 이면 사용할 수 없습니다.', group: '제한', type: 'megabytes', min: 0, max: 102400 },
  {
    key: 'ads',
    label: '광고',
    help: '',
    group: '기능',
    type: 'choice',
    choices: [
      { value: 'none', label: '없음' },
      { value: 'banner', label: '배너만' },
      { value: 'banner+fullscreen', label: '배너 + 전면' },
    ],
  },
  { key: 'features.premiumMap', label: '프리미엄 지도', help: '', group: '기능', type: 'switch' },
  { key: 'features.trafficWeather', label: '교통·날씨', help: '', group: '기능', type: 'switch' },
  { key: 'features.speedingAlert', label: '과속 경고', help: '', group: '기능', type: 'switch' },
  { key: 'features.governmentEmergency', label: '재난 문자', help: '', group: '기능', type: 'switch' },
];

const FIELD_BY_KEY = new Map(POLICY_FIELDS.map((f) => [f.key, f]));

/**
 * 화면에서 온 값 검사. 정의에 없는 키는 조용히 버립니다.
 * 범위를 벗어난 값은 400 으로 돌려보냅니다 (수집 주기를 0 이나 하루로 넣는 사고 방지).
 */
export function parsePolicyPatch(input: unknown): Record<string, unknown> {
  const raw = parseInput(z.record(z.string(), z.unknown()), input);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = FIELD_BY_KEY.get(key);
    if (!field) continue;
    patch[key] = parseInput(schemaFor(field), value);
  }
  return patch;
}

function schemaFor(field: PolicyField): z.ZodType<unknown> {
  if (field.type === 'switch') return z.boolean();
  if (field.type === 'choice') return z.enum(field.choices!.map((c) => c.value) as [string, ...string[]]);
  return z
    .number()
    .int()
    .min(field.min ?? 0)
    .max(field.max ?? Number.MAX_SAFE_INTEGER);
}

/** 'features.premiumMap' 같은 점 표기를 중첩 객체에 반영 */
export function applyPatch(policy: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(policy);
  for (const [key, value] of Object.entries(patch)) {
    const path = key.split('.');
    let cursor = next;
    for (const segment of path.slice(0, -1)) {
      if (typeof cursor[segment] !== 'object' || cursor[segment] === null) cursor[segment] = {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[path[path.length - 1]] = value;
  }
  return next;
}
