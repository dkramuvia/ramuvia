import type { ImagePickerAsset } from 'expo-image-picker';
import { Asset } from 'expo-media-library';

import type { LatLng } from '@/types/models';

/**
 * 사진에 찍힌 위치 (EXIF GPS). 대표 리포트 12 ③: 위치 추가를 사진 위치로 미리 채웁니다.
 * 위치가 없거나 읽을 수 없으면 null — 그때는 예전처럼 사용자가 직접 고릅니다.
 * 안드로이드는 ACCESS_MEDIA_LOCATION 권한이 있어야 위치가 남아 있습니다 (app.config.ts isAccessMediaLocationEnabled)
 */
export async function libraryAssetLocation(assetId: string): Promise<LatLng | null> {
  try {
    const location = await new Asset(assetId).getLocation();
    return isUsable(location) ? location : null;
  } catch {
    return null;
  }
}

/**
 * 사진 선택기(exif: true)로 고른 사진의 위치.
 * 안드로이드는 GPSLatitude 가 바로 십진수, iOS 는 '{GPS}' 안에 Latitude 로 옵니다. 남반구·서경은 Ref 로 부호를 붙입니다
 */
export function pickerAssetLocation(asset: Pick<ImagePickerAsset, 'exif'>): LatLng | null {
  const exif = asset.exif as Record<string, unknown> | null | undefined;
  if (!exif) return null;
  const gps = (exif['{GPS}'] as Record<string, unknown> | undefined) ?? undefined;
  const lat = Number(gps?.Latitude ?? exif.GPSLatitude);
  const lng = Number(gps?.Longitude ?? exif.GPSLongitude);
  const latRef = String(gps?.LatitudeRef ?? exif.GPSLatitudeRef ?? 'N');
  const lngRef = String(gps?.LongitudeRef ?? exif.GPSLongitudeRef ?? 'E');
  const location = { latitude: latRef === 'S' ? -Math.abs(lat) : lat, longitude: lngRef === 'W' ? -Math.abs(lng) : lng };
  return isUsable(location) ? location : null;
}

/** 위치를 지운 사진은 0,0 으로 오는 기기가 있습니다 */
function isUsable(location: LatLng | null | undefined): location is LatLng {
  if (!location) return false;
  const { latitude, longitude } = location;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}
