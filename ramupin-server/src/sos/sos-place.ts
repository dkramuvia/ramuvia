import { decryptLocation, encryptLocation } from '../common/location-crypto.js';

/** SOS 를 누른 곳 (암호화해 한 칸에 넣는 덩어리) */
export interface SosPlace {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  placeName: string | null;
  placeAddress: string | null;
}

const NO_PLACE: SosPlace = { latitude: null, longitude: null, altitude: null, placeName: null, placeAddress: null };

/** 위치를 하나도 못 잡았으면 null (암호화할 것이 없습니다) */
export function encryptSosPlace(input: SosPlace): Buffer | null {
  const place: SosPlace = {
    latitude: input.latitude,
    longitude: input.longitude,
    altitude: input.altitude,
    placeName: input.placeName,
    placeAddress: input.placeAddress,
  };
  return Object.values(place).every((v) => v == null) ? null : encryptLocation(place);
}

/** 읽은 행의 암호화 칸(place_enc)을 풀어 { latitude, longitude, placeName, placeAddress } 로 바꿉니다 (화면이 받는 모양은 그대로) */
export function withSosPlace<T extends { place_enc: Buffer | null }>(row: T) {
  const { place_enc, ...rest } = row;
  const place = place_enc ? decryptLocation<SosPlace>(place_enc) : NO_PLACE;
  return { ...rest, latitude: place.latitude, longitude: place.longitude, placeName: place.placeName, placeAddress: place.placeAddress };
}
