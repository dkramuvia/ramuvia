import { apiClient, mockResponse } from '../client';
import { mockGroups, mockMe } from '../mock/data';
import { mockPosts } from '../mock/gallery';
import { env } from '@/config/env';
import type { GalleryPost, MediaAsset, SharedPlace } from '@/types/models';

/** WBS 5.9 / 6: 긴급 공지가 먼저, 그다음 최신 등록순 */
function sortPosts(posts: GalleryPost[]) {
  return [...posts].sort((a, b) => {
    if (!!a.emergencyNotice !== !!b.emergencyNotice) return a.emergencyNotice ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export interface UploadPostInput {
  groupId: string;
  media: MediaAsset[];
  place?: SharedPlace;
}

export const galleryApi = {
  /** 내가 속한 그룹방들의 게시물. groupId 가 없으면 전체 */
  async feed(groupId?: string): Promise<GalleryPost[]> {
    if (env.useMock) return mockResponse(sortPosts(mockPosts.filter((p) => !groupId || p.groupId === groupId)));
    const { data } = await apiClient.get<GalleryPost[]>('/gallery/posts', { params: { groupId } });
    return data;
  },

  async userPosts(userId: string): Promise<GalleryPost[]> {
    if (env.useMock) return mockResponse(sortPosts(mockPosts.filter((p) => p.author.id === userId)));
    const { data } = await apiClient.get<GalleryPost[]>(`/gallery/users/${userId}/posts`);
    return data;
  },

  /** 기획: URL 공유 → OS 공유 시트에서 복사. TODO(5단계): 서버 발급 공유 URL (그룹 해지 시 무효화, WBS 6) */
  shareUrl(postId: string): string {
    return `https://ramupin.app/p/${postId}`;
  },

  /**
   * 사진·동영상 업로드. TODO(5단계): S3 사전 서명 URL 로 파일 업로드 후 게시물 생성, 등급별 용량 제한 (WBS 5.6, 5.7)
   */
  async upload(input: UploadPostInput): Promise<GalleryPost> {
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
    if (env.useMock) {
      mockPosts.unshift(post);
      return mockResponse(post, 800);
    }
    const { data } = await apiClient.post<GalleryPost>('/gallery/posts', input);
    return data;
  },
};
