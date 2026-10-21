import { describe, expect, it } from 'vitest';

import { encryptSosPlace, withSosPlace } from '../sos/sos-place.js';
import { decryptLocation, decryptNumber, decryptOptional, encryptLocation, encryptOptional, encryptValue, readCoords } from './location-crypto.js';

/**
 * 위치정보 저장 암호화 (위치정보법 기술적 보호조치).
 *
 * 여기서 틀리면 저장된 위치를 다시 못 읽거나(복구 불가), 평문이 그대로 남습니다.
 */
describe('위치 암호화', () => {
  it('위도·경도를 칸마다 암호화했다가 그대로 되돌립니다', () => {
    expect(readCoords(encryptValue(37.4776123), encryptValue(126.8826456))).toEqual({ latitude: 37.4776123, longitude: 126.8826456 });
  });

  it('저장된 값에 숫자가 평문으로 보이지 않습니다', () => {
    const stored = encryptValue(37.4776123);
    expect(stored.toString('latin1')).not.toContain('37.47');
  });

  it('같은 값도 매번 다른 암호문이 됩니다 (같은 장소에 자주 간 것이 드러나지 않게)', () => {
    expect(encryptValue(37.5).equals(encryptValue(37.5))).toBe(false);
  });

  it('저장된 값이 한 글자라도 바뀌면 읽기를 거부합니다 (GCM 인증)', () => {
    const stored = encryptValue(37.5);
    stored[stored.length - 1] ^= 0xff;
    expect(() => decryptNumber(stored)).toThrow();
  });

  it('고도처럼 없을 수 있는 값은 칸을 비웁니다', () => {
    expect(encryptOptional(null)).toBeNull();
    expect(decryptOptional(null)).toBeNull();
    expect(decryptOptional<number>(encryptOptional(42.5))).toBe(42.5);
  });

  it('여러 값을 한 덩어리로 넣고 꺼냅니다', () => {
    const value = { a: 1, b: '서울특별시 금천구', c: null };
    expect(decryptLocation(encryptLocation(value))).toEqual(value);
  });
});

describe('SOS 장소', () => {
  const place = { latitude: 37.5, longitude: 127, altitude: 30, placeName: '코엑스', placeAddress: '서울특별시 강남구 영동대로 513' };
  const expected = { latitude: 37.5, longitude: 127, placeName: '코엑스', placeAddress: '서울특별시 강남구 영동대로 513' };

  it('위치를 하나도 못 잡았으면 모든 칸이 비어 있습니다', () => {
    const columns = encryptSosPlace({ latitude: null, longitude: null, altitude: null, placeName: null, placeAddress: null });
    expect(Object.values(columns).every((v) => v === null)).toBe(true);
  });

  it('칸마다 암호화한 행을 화면이 받는 모양으로 풉니다', () => {
    const row = { id: 'x', ...encryptSosPlace(place) };
    expect(withSosPlace(row)).toEqual({ id: 'x', ...expected });
  });

  it('위치 없이 보낸 SOS 는 장소가 모두 비어 있습니다', () => {
    const none = encryptSosPlace({ latitude: null, longitude: null, altitude: null, placeName: null, placeAddress: null });
    expect(withSosPlace({ id: 'z', ...none })).toEqual({ id: 'z', latitude: null, longitude: null, placeName: null, placeAddress: null });
  });
});
