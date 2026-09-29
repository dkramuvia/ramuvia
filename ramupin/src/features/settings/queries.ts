import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  geofencesApi,
  hideModeApi,
  historyApi,
  notificationSettingsApi,
  profileApi,
  safetyApi,
  scheduledMessagesApi,
} from '@/api/endpoints/settings';
import { useAuthStore } from '@/stores/authStore';
import { saveGeofenceSnapshot } from '@/features/location/geofenceSnapshot';
import type { Geofence, HideModeSetting, HistoryCategory, NotificationSettings, SafetySetting, ScheduledMessage, User } from '@/types/models';

const keys = {
  hideMode: ['settings', 'hide-mode'] as const,
  safety: ['settings', 'safety'] as const,
  notifications: ['settings', 'notifications'] as const,
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

export const useNotificationSettings = () => useQuery({ queryKey: keys.notifications, queryFn: notificationSettingsApi.get });
export function useSaveNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: NotificationSettings) => notificationSettingsApi.save(settings),
    // 화면에서 토글을 누르면 바로 반영돼야 합니다 (서버 응답을 기다리지 않음)
    onMutate: (settings) => queryClient.setQueryData(keys.notifications, settings),
    onSuccess: (saved) => queryClient.setQueryData(keys.notifications, saved),
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

export function useGeofences() {
  const query = useQuery({ queryKey: keys.geofences, queryFn: geofencesApi.list });
  // 백그라운드 수집은 react-query 캐시를 볼 수 없어, 근처 판단에 필요한 것만 기기에 저장해 둡니다.
  // 안심장소 근처에서는 5초 주기로 올려, 경계를 넘은 시각이 정확해집니다 (GPS 보고서 2-1 2번)
  useEffect(() => {
    if (query.data) void saveGeofenceSnapshot(query.data);
  }, [query.data]);
  return query;
}
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
