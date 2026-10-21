import { decryptLocation, decryptOptional, encryptOptional } from '../common/location-crypto.js';

/** SOS 를 누른 곳 */
export interface SosPlace {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  placeName: string | null;
  placeAddress: string | null;
}

/** 저장할 칸: 값마다 따로 암호화합니다 (common/location-crypto.ts). 못 잡은 값은 null */
export function encryptSosPlace(input: SosPlace) {
  return {
    latitude_enc: encryptOptional(input.latitude),
    longitude_enc: encryptOptional(input.longitude),
    altitude_enc: encryptOptional(input.altitude),
    place_name_enc: encryptOptional(input.placeName),
    place_address_enc: encryptOptional(input.placeAddress),
  };
}

/** SOS 장소를 읽을 때 함께 가져올 칸. place_enc 는 칸을 나누기 전 옛 행 때문에 남아 있습니다 (migrations/main/0039) */
export const SOS_PLACE_COLUMNS = ['e.latitude_enc', 'e.longitude_enc', 'e.altitude_enc', 'e.place_name_enc', 'e.place_address_enc', 'e.place_enc'] as const;

interface SosPlaceRow {
  latitude_enc: Buffer | null;
  longitude_enc: Buffer | null;
  altitude_enc: Buffer | null;
  place_name_enc: Buffer | null;
  place_address_enc: Buffer | null;
  place_enc: Buffer | null;
}

/** 읽은 행의 암호화 칸을 풀어 { latitude, longitude, placeName, placeAddress } 로 바꿉니다 (화면이 받는 모양은 그대로) */
export function withSosPlace<T extends SosPlaceRow>(row: T) {
  const { latitude_enc, longitude_enc, altitude_enc, place_name_enc, place_address_enc, place_enc, ...rest } = row;
  const place: SosPlace = place_enc
    ? decryptLocation<SosPlace>(place_enc)
    : {
        latitude: decryptOptional<number>(latitude_enc),
        longitude: decryptOptional<number>(longitude_enc),
        altitude: decryptOptional<number>(altitude_enc),
        placeName: decryptOptional<string>(place_name_enc),
        placeAddress: decryptOptional<string>(place_address_enc),
      };
  return { ...rest, latitude: place.latitude, longitude: place.longitude, placeName: place.placeName, placeAddress: place.placeAddress };
}
