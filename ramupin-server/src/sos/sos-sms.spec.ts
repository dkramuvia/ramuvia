import { describe, expect, it } from 'vitest';

import { isDomesticMobile, sosSmsText } from './sos-sms.service.js';

describe('isDomesticMobile', () => {
  it('국내 휴대폰 번호만 받습니다', () => {
    expect(isDomesticMobile('010-1234-5678')).toBe(true);
    expect(isDomesticMobile('01112345678')).toBe(true);
    expect(isDomesticMobile('016-123-4567')).toBe(true);
  });

  it('유선·국제·짧은 번호는 받지 않습니다 (알리고는 국내 휴대폰 전용)', () => {
    expect(isDomesticMobile('031-000-0000')).toBe(false);
    expect(isDomesticMobile('+1 415 555 0100')).toBe(false);
    expect(isDomesticMobile('+82 10-1234-5678')).toBe(false);
    expect(isDomesticMobile('112')).toBe(false);
  });
});

describe('sosSmsText', () => {
  const startedAt = new Date('2026-10-26T05:15:00Z'); // 오후 2:15 (서울)

  it('주소와 웹 지도 링크를 넣습니다', () => {
    const text = sosSmsText('강한', { latitude: 37.1234567, longitude: 127.0123456, placeName: null, placeAddress: '경기도 오산시 가수동 39-222', startedAt });
    expect(text).toContain('강한님이 긴급 도움을 요청했어요');
    expect(text).toContain('오후 2:15');
    expect(text).toContain('경기도 오산시 가수동 39-222');
    expect(text).toContain('https://www.google.com/maps/search/?api=1&query=37.123457,127.012346');
  });

  it('위치를 못 잡았으면 전화로 확인해 달라고 합니다', () => {
    const text = sosSmsText('강한', { latitude: null, longitude: null, placeName: null, placeAddress: null, startedAt });
    expect(text).toContain('위치를 확인하지 못했어요');
    expect(text).not.toContain('http');
  });
});
