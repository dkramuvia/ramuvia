import * as FileSystem from 'expo-file-system/legacy';

import { apiClient, mockResponse } from '../client';
import { mockSafety } from '../mock/settings';
import { isLive } from '@/config/env';
import type { SharedPlace } from '@/types/models';

export interface SendSosInput {
  place: SharedPlace | null;
  altitude: number | null;
  /** 기기에 녹음된 파일 경로. 저장소에 올린 뒤 그 id 만 서버에 넘깁니다 */
  audioUri: string | null;
  startedAt: string;
}

export interface SendSosResult {
  sosId: string;
  /** 알림을 받은 사람 수 */
  recipientCount: number;
  /** 지정한 수신인이 없어 회사(관제)가 받은 경우 (WBS 9.3) */
  toMonitoring: boolean;
}

/**
 * SOS (WBS 7.9 / 8.3 / 9.3 / 10.8).
 *
 * 앱은 위치와 녹음만 올리고, 누구에게 어떻게 알릴지는 전부 서버가 정합니다.
 * 지정한 수신인이 없으면 회사가 받습니다 — 혼자 사는 분이 수신인을 등록하지 않았다고
 * 해서 아무 데도 안 가면 안 되기 때문입니다.
 */
export const sosApi = {
  async send(input: SendSosInput): Promise<SendSosResult> {
    if (!isLive('sos')) {
      const count = mockSafety.recipientFriendIds.length + mockSafety.recipientGroupIds.length;
      return mockResponse({ sosId: `sos${Date.now()}`, recipientCount: count, toMonitoring: count === 0 }, 900);
    }

    // 녹음이 있으면 먼저 저장소에 올립니다. 실패해도 SOS 는 보냅니다 — 위치가 더 급합니다
    const audioAssetId = input.audioUri ? await uploadAudio(input.audioUri).catch(() => null) : null;

    const { data } = await apiClient.post<SendSosResult>('/sos', {
      startedAt: input.startedAt,
      altitude: input.altitude,
      place: input.place
        ? {
            placeName: input.place.placeName ?? null,
            address: input.place.address,
            latitude: input.place.latitude,
            longitude: input.place.longitude,
          }
        : null,
      audioAssetId,
    });
    return data;
  },

  /** 보낸 뒤 취소. 받은 사람들에게 "취소됨"이 전달됩니다 */
  async cancel(sosId: string): Promise<void> {
    if (!isLive('sos')) return mockResponse(undefined);
    await apiClient.post(`/sos/${sosId}/cancel`);
  },

  /** 내가 받은 SOS (알림 보관함) */
  async received(): Promise<ReceivedSos[]> {
    if (!isLive('sos')) return mockResponse([]);
    const { data } = await apiClient.get<ReceivedSos[]>('/sos/received');
    return data;
  },
};

export interface ReceivedSos {
  id: string;
  userId: string;
  nickname: string;
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  placeAddress: string | null;
  status: 'sent' | 'cancelled' | 'resolved';
  startedAt: string;
  createdAt: string;
  readAt: string | null;
}

/** 녹음 파일을 사진과 같은 방식으로 저장소에 올립니다 */
async function uploadAudio(uri: string): Promise<string | null> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return null;
  const { data } = await apiClient.post<{ targets: { assetId: string; uploadUrl: string; contentType: string }[] }>(
    '/gallery/upload-targets',
    { files: [{ contentType: 'audio/m4a', bytes: info.size }] },
  );
  const target = data.targets[0];
  const result = await FileSystem.uploadAsync(target.uploadUrl, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': target.contentType },
  });
  if (result.status < 200 || result.status >= 300) return null;
  return target.assetId;
}
