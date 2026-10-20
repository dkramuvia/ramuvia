import { decryptLocation, encryptLocation } from '../common/location-crypto.js';

/** SOS 를 누른 곳 (암호화해 한 칸에 넣는 덩어리) */
export interface SosPlace {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  placeName: string | null;
  placeAddress: string | null;
}

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

/** SOS 장소를 읽을 때 함께 가져올 칸. 평문 칸은 암호화로 옮기기 전 옛 행 때문에 남아 있습니다 */
export const SOS_PLACE_COLUMNS = ['e.place_enc', 'e.latitude', 'e.longitude', 'e.altitude', 'e.place_name', 'e.place_address'] as const;

/** 읽은 행의 암호화 칸을 풀어 { latitude, longitude, placeName, placeAddress } 로 바꿉니다 (화면이 받는 모양은 그대로) */
export function withSosPlace<
  T extends {
    place_enc: Buffer | null;
    latitude: number | null;
    longitude: number | null;
    altitude: number | null;
    place_name: string | null;
    place_address: string | null;
  },
>(row: T) {
  const { place_enc, latitude, longitude, altitude, place_name, place_address, ...rest } = row;
  const place: SosPlace = place_enc
    ? decryptLocation<SosPlace>(place_enc)
    : {
        latitude,
        longitude,
        altitude,
        placeName: place_name,
        placeAddress: place_address,
      };
  return {
    ...rest,
    latitude: place.latitude,
    longitude: place.longitude,
    placeName: place.placeName,
    placeAddress: place.placeAddress,
  };
}
