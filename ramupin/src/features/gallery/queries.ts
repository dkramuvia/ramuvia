import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { galleryApi, type UploadPostInput } from '@/api/endpoints/gallery';
import type { GalleryPost } from '@/types/models';

export const galleryKeys = {
  all: ['gallery'] as const,
  feed: (groupId?: string) => ['gallery', 'feed', groupId ?? 'all'] as const,
  user: (userId: string) => ['gallery', 'user', userId] as const,
  counts: ['gallery', 'counts'] as const,
};

export function useGalleryFeed(groupId?: string) {
  return useQuery({ queryKey: galleryKeys.feed(groupId), queryFn: () => galleryApi.feed(groupId) });
}

export function useUserPosts(userId: string) {
  return useQuery({ queryKey: galleryKeys.user(userId), queryFn: () => galleryApi.userPosts(userId) });
}

/** 그룹방별 게시물 수 (갤러리 그룹 목록 옆 숫자) */
export function useGalleryGroupCounts() {
  return useQuery({ queryKey: galleryKeys.counts, queryFn: galleryApi.groupCounts });
}

export function useUploadPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadPostInput) => galleryApi.upload(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: galleryKeys.all }),
  });
}

export function useRemovePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => galleryApi.remove(postId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: galleryKeys.all }),
  });
}

/** 이미 받아 둔 목록(그룹·사람별)에서 게시물 하나를 찾습니다. 사진 크게 보기 화면이 다시 받지 않게 */
export function findCachedPost(queryClient: QueryClient, postId: string): GalleryPost | undefined {
  for (const [, posts] of queryClient.getQueriesData<GalleryPost[]>({ queryKey: galleryKeys.all })) {
    const found = Array.isArray(posts) ? posts.find((p) => p.id === postId) : undefined;
    if (found) return found;
  }
  return undefined;
}
