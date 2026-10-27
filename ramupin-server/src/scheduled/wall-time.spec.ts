import { describe, expect, it } from 'vitest';

import { wallTimeToUtc } from './scheduled-message.service.js';

describe('wallTimeToUtc (예약 메시지 받는 사람 시각 기준)', () => {
  it('서울 08:00 은 UTC 전날 23:00', () => {
    expect(wallTimeToUtc('2026-10-27T08:00', 'Asia/Seoul').toISOString()).toBe('2026-10-26T23:00:00.000Z');
  });
  it('뉴욕 서머타임 끝난 뒤(EST, -5) 08:00 은 UTC 13:00', () => {
    expect(wallTimeToUtc('2026-11-10T08:00', 'America/New_York').toISOString()).toBe('2026-11-10T13:00:00.000Z');
  });
  it('뉴욕 서머타임 중(EDT, -4) 08:00 은 UTC 12:00', () => {
    expect(wallTimeToUtc('2026-07-10T08:00', 'America/New_York').toISOString()).toBe('2026-07-10T12:00:00.000Z');
  });
  it('모르는 시간대면 서울로', () => {
    expect(wallTimeToUtc('2026-10-27T08:00', 'Mars/Base').toISOString()).toBe('2026-10-26T23:00:00.000Z');
  });
});
