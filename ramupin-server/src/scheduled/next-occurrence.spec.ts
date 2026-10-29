import { describe, expect, it } from 'vitest';

import { nextOccurrence } from './scheduled-message.service.js';

describe('nextOccurrence (매일 반복 예약)', () => {
  const now = Date.parse('2026-10-29T01:00:00Z');

  it('한 번만이면 지난 시각도 그대로', () => {
    const at = new Date('2026-10-28T23:00:00Z');
    expect(nextOccurrence(at, 'none', now)).toEqual(at);
  });

  it('매일인데 아직 안 온 시각이면 그대로', () => {
    const at = new Date('2026-10-29T02:00:00Z');
    expect(nextOccurrence(at, 'daily', now)).toEqual(at);
  });

  it('매일인데 지난 시각이면 다음 날 같은 시각', () => {
    expect(nextOccurrence(new Date('2026-10-28T23:00:00Z'), 'daily', now).toISOString()).toBe('2026-10-29T23:00:00.000Z');
  });

  it('며칠 밀렸으면 지난 날들은 건너뜀', () => {
    expect(nextOccurrence(new Date('2026-10-25T23:00:00Z'), 'daily', now).toISOString()).toBe('2026-10-29T23:00:00.000Z');
  });
});
