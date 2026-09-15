import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { galleryApi, type UploadPostInput } from '@/api/endpoints/gallery';

export const galleryKeys = {
  all: ['gallery'] as const,
  feed: (groupId?: string) => ['gallery', 'feed', groupId ?? 'all'] as const,
  user: (userId: string) => ['gallery', 'user', userId] as const,
};

export function useGalleryFeed(groupId?: string) {
  return useQuery({ queryKey: galleryKeys.feed(groupId), queryFn: () => galleryApi.feed(groupId) });
}

export function useUserPosts(userId: string) {
  return useQuery({ queryKey: galleryKeys.user(userId), queryFn: () => galleryApi.userPosts(userId) });
}

export function useUploadPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadPostInput) => galleryApi.upload(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: galleryKeys.all }),
  });
}
