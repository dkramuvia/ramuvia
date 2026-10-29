import * as FileSystem from 'expo-file-system/legacy';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

import type { MediaAsset } from '@/types/models';

const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'mp4', 'mov'];

/**
 * 게시물 사진·동영상을 기기 앨범에 저장합니다 (대표 리포트 43: 더보기 › 저장).
 * 저장소 주소는 기한이 있는 주소라 바로 앨범에 넣을 수 없어, 앱 임시 폴더로 받은 뒤 넣습니다.
 * 권한을 거절하면 false
 */
export async function saveMediaToDevice(items: MediaAsset[]): Promise<boolean> {
  const permission = await requestPermissionsAsync(true);
  if (!permission.granted) return false;
  for (const [i, item] of items.entries()) {
    const fromUrl = item.uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    const extension = EXTENSIONS.includes(fromUrl) ? fromUrl : item.type === 'video' ? 'mp4' : 'jpg';
    const target = `${FileSystem.cacheDirectory}ramupin-${Date.now()}-${i}.${extension}`;
    let local = item.uri;
    if (!item.uri.startsWith('file://')) {
      const result = await FileSystem.downloadAsync(item.uri, target);
      if (result.status < 200 || result.status >= 300) throw new Error(`내려받기 실패 (${result.status})`);
      local = result.uri;
    }
    try {
      await Asset.create(local);
    } finally {
      if (local !== item.uri) await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
    }
  }
  return true;
}
