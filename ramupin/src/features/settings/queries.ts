import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  geofencesApi,
  hideModeApi,
  historyApi,
  profileApi,
  safetyApi,
  scheduledMessagesApi,
} from '@/api/endpoints/settings';
import { useAuthStore } from '@/stores/authStore';
import type { Geofence, HideModeSetting, HistoryCategory, SafetySetting, ScheduledMessage, User } from '@/types/models';

const keys = {
  hideMode: ['settings', 'hide-mode'] as const,
  safety: ['settings', 'safety'] as const,
  geofences: ['geofences'] as const,
  scheduled: ['scheduled-messages'] as const,
  history: (category?: HistoryCategory) => ['history', category ?? 'all'] as const,
  journey: (userId: string) => ['journey', userId] as const,
};

export const useHideMode = () => useQuery({ queryKey: keys.hideMode, queryFn: hideModeApi.get });
export function useSaveHideMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setting: HideModeSetting) => hideModeApi.save(setting),
    onSuccess: (_d, setting) => queryClient.setQueryData(keys.hideMode, setting),
  });
}

export const useSafetySetting = () => useQuery({ queryKey: keys.safety, queryFn: safetyApi.get });
export function useSaveSafetySetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setting: SafetySetting) => safetyApi.save(setting),
    onSuccess: (_d, setting) => queryClient.setQueryData(keys.safety, setting),
  });
}

export const useGeofences = () => useQuery({ queryKey: keys.geofences, queryFn: geofencesApi.list });
export function useSaveGeofence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (geofence: Omit<Geofence, 'id'> & { id?: string }) => geofencesApi.save(geofence),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.geofences }),
  });
}
export function useRemoveGeofence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: geofencesApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.geofences }),
  });
}

export const useScheduledMessages = () => useQuery({ queryKey: keys.scheduled, queryFn: scheduledMessagesApi.list });
export function useSaveScheduledMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: Omit<ScheduledMessage, 'id'> & { id?: string }) => scheduledMessagesApi.save(message),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.scheduled }),
  });
}
export function useRemoveScheduledMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: scheduledMessagesApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.scheduled }),
  });
}

export const useHistory = (category?: HistoryCategory) =>
  useQuery({ queryKey: keys.history(category), queryFn: () => historyApi.events(category) });

export const useJourney = (userId: string) =>
  useQuery({ queryKey: keys.journey(userId), queryFn: () => historyApi.journey(userId), enabled: !!userId });

export function useUpdateProfile() {
  const updateUser = useAuthStore((s) => s.updateUser);
  return useMutation({
    mutationFn: (patch: Pick<Partial<User>, 'nickname' | 'avatarUrl' | 'gender' | 'statusMessage'>) => profileApi.update(patch),
    onSuccess: (user) => updateUser(user),
  });
}
