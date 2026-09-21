import * as FileSystem from 'expo-file-system/legacy';

import { apiClient, mockResponse } from '../client';
import { mockGroups, mockMe } from '../mock/data';
import { mockPosts } from '../mock/gallery';
import { env, isLive } from '@/config/env';
import type { GalleryPost, MediaAsset, SharedPlace } from '@/types/models';

/** WBS 5.9 / 6: 긴급 공지가 먼저, 그다음 최신 등록순 */
function sortPosts(posts: GalleryPost[]) {
  return [...posts].sort((a, b) => {
    if (!!a.emergencyNotice !== !!b.emergencyNotice) return a.emergencyNotice ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

interface UploadTarget {
  assetId: string;
  uploadUrl: string;
  contentType: string;
}

/** 파일 이름 끝을 보고 형식을 정합니다. 안드로이드 갤러리는 blob.type 이 비어 있을 때가 많습니다 */
const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

/**
 * 파일 크기와 형식. 서버가 등급 용량과 허용 형식을 확인하는 데 씁니다.
 * 파일을 메모리로 읽지 않고 크기만 물어봅니다 (동영상은 수백 MB 가 될 수 있습니다).
 */
async function fileInfo(asset: MediaAsset): Promise<{ contentType: string; bytes: number }> {
  const info = await FileSystem.getInfoAsync(asset.uri);
  if (!info.exists) throw new Error('파일을 찾을 수 없습니다');
  const extension = asset.uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const contentType = BY_EXTENSION[extension] ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
  return { contentType, bytes: info.size };
}

export interface UploadPostInput {
  groupId: string;
  media: MediaAsset[];
  place?: SharedPlace;
}

export const galleryApi = {
  /** 내가 속한 그룹방들의 게시물. groupId 가 없으면 전체 */
  async feed(groupId?: string): Promise<GalleryPost[]> {
    if (!isLive('gallery')) return mockResponse(sortPosts(mockPosts.filter((p) => !groupId || p.groupId === groupId)));
    const { data } = await apiClient.get<GalleryPost[]>('/gallery/posts', { params: { groupId } });
    return data;
  },

  async userPosts(userId: string): Promise<GalleryPost[]> {
    if (!isLive('gallery')) return mockResponse(sortPosts(mockPosts.filter((p) => p.author.id === userId)));
    const { data } = await apiClient.get<GalleryPost[]>(`/gallery/users/${userId}/posts`);
    return data;
  },

  /** 기획: URL 공유 → OS 공유 시트에서 복사. TODO(5단계): 서버 발급 공유 URL (그룹 해지 시 무효화, WBS 6) */
  shareUrl(postId: string): string {
    return `https://ramupin.app/p/${postId}`;
  },

  /**
   * 사진·동영상 업로드 (WBS 5.6, 5.7).
   *
   * 파일을 API 서버로 보내지 않습니다. 서버에서 "올릴 주소"만 받아 저장소로 **직접** 올린 뒤,
   * 다 올라가면 게시물을 만듭니다. 동영상이 서버를 지나가면 몇 명만 동시에 올려도 API 가 막힙니다.
   */
  async upload(input: UploadPostInput): Promise<GalleryPost> {
    if (!isLive('gallery')) {
      const group = mockGroups.find((g) => g.id === input.groupId);
      const post: GalleryPost = {
        id: `p${Date.now()}`,
        groupId: input.groupId,
        groupName: group?.name ?? '',
        author: { id: mockMe.id, nickname: mockMe.nickname, isOnline: true },
        media: input.media,
        place: input.place,
        createdAt: new Date().toISOString(),
      };
      mockPosts.unshift(post);
      return mockResponse(post, 800);
    }

    // 1) 올릴 주소 받기. 등급 용량이 모자라면 여기서 거절당합니다
    const { data: targets } = await apiClient.post<{ targets: UploadTarget[] }>('/gallery/upload-targets', {
      files: await Promise.all(input.media.map(fileInfo)),
    });

    // 2) 저장소에 직접 올리기.
    //    fetch + blob 을 쓰면 파일 전체가 메모리에 올라갔다 base64 로 한 번 더 변환됩니다.
    //    사진은 견디지만 동영상은 앱이 죽습니다. uploadAsync 는 파일을 그대로 흘려보냅니다
    for (const [index, target] of targets.targets.entries()) {
      const result = await FileSystem.uploadAsync(target.uploadUrl, input.media[index].uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': target.contentType },
      });
      if (result.status < 200 || result.status >= 300) throw new Error(`업로드 실패 (${result.status})`);
    }

    // 3) 게시물 만들기. 서버가 저장소에 실제로 있는지 다시 확인합니다
    const { data } = await apiClient.post<GalleryPost>('/gallery/posts', {
      groupId: input.groupId,
      assetIds: targets.targets.map((t) => t.assetId),
      place: input.place
        ? {
            placeName: input.place.placeName ?? null,
            address: input.place.address,
            latitude: input.place.latitude,
            longitude: input.place.longitude,
          }
        : null,
    });
    return data;
  },

  /** 내가 쓴 공유 용량 (설정 화면) */
  async storage(): Promise<{ usedMb: number; limitMb: number }> {
    if (!isLive('gallery')) return mockResponse({ usedMb: 42, limitMb: 300 });
    const { data } = await apiClient.get<{ usedMb: number; limitMb: number }>('/gallery/storage');
    return data;
  },

  async remove(postId: string): Promise<void> {
    if (!isLive('gallery')) return mockResponse(undefined);
    await apiClient.delete(`/gallery/posts/${postId}`);
  },
};
