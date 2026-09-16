import { apiClient, mockResponse } from '../client';
import { mockChatRooms, mockFriends, mockGroups, mockMe } from '../mock/data';
import { isLive } from '@/config/env';
import type { Friend, GroupDetail, GroupMember } from '@/types/models';

function findMockGroup(groupId: string) {
  const group = mockGroups.find((g) => g.id === groupId);
  if (!group) throw new Error(`group not found: ${groupId}`);
  return group;
}

/** 목업 객체를 화면에서 바꿔도 원본이 바뀌지 않도록 복사 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const friendToMember = (f: Friend): GroupMember => ({
  id: f.id,
  nickname: f.nickname,
  avatarUrl: f.avatarUrl,
  batteryLevel: f.batteryLevel,
  isOnline: f.isOnline,
  myShareLevel: f.myShareLevel,
  role: 'member',
});

/** 서버 응답 (없는 값은 null) */
interface GroupDetailResponse extends Omit<GroupDetail, 'members'> {
  isDirect: boolean;
  members: (Omit<GroupMember, 'avatarUrl'> & { avatarUrl: string | null; publicId: string })[];
}

const toGroup = (g: GroupDetailResponse): GroupDetail => ({
  ...g,
  members: g.members.map((m) => ({ ...m, avatarUrl: m.avatarUrl ?? undefined })),
});

export const groupsApi = {
  /** 내가 속한 그룹방 목록 */
  async list(): Promise<GroupDetail[]> {
    if (!isLive('groups')) return mockResponse(clone(mockGroups));
    const { data } = await apiClient.get<GroupDetailResponse[]>('/groups');
    return data.map(toGroup);
  },

  async get(groupId: string): Promise<GroupDetail> {
    if (!isLive('groups')) return mockResponse(clone(findMockGroup(groupId)));
    const { data } = await apiClient.get<GroupDetailResponse>(`/groups/${groupId}`);
    return toGroup(data);
  },

  /** 그룹 만들기 → 생성된 그룹(=채팅방) */
  async create(name: string, memberIds: string[]): Promise<GroupDetail> {
    if (!isLive('groups')) {
      const id = `room${Date.now()}`;
      const members = mockFriends.filter((f) => memberIds.includes(f.id)).map(friendToMember);
      const group: GroupDetail = {
        id,
        name,
        ownerId: mockMe.id,
        isPremium: false,
        createdAt: new Date().toISOString(),
        memberCount: members.length + 1,
        members: [
          { id: mockMe.id, nickname: mockMe.nickname, batteryLevel: mockMe.batteryLevel, isOnline: true, role: 'owner' },
          ...members,
        ],
      };
      mockGroups.push(group);
      mockChatRooms.unshift({
        id,
        name,
        memberCount: group.memberCount,
        lastMessage: '그룹채팅을 만들었습니다.',
        updatedAt: group.createdAt,
      });
      return mockResponse(clone(group));
    }
    const { data } = await apiClient.post<GroupDetailResponse>('/groups', { name, memberIds });
    return toGroup(data);
  },

  /** 친구와의 1:1 대화방 (없으면 만들고, 있으면 그대로) */
  async directRoom(friendId: string): Promise<GroupDetail> {
    if (!isLive('groups')) {
      const friend = mockFriends.find((f) => f.id === friendId);
      const existing = mockGroups.find((g) => g.memberCount === 2 && g.members.some((m) => m.id === friendId));
      if (existing) return mockResponse(clone(existing));
      return groupsApi.create(friend?.nickname ?? '대화', [friendId]);
    }
    const { data } = await apiClient.post<GroupDetailResponse>('/groups/direct', { friendId });
    return toGroup(data);
  },

  async rename(groupId: string, name: string): Promise<void> {
    if (!isLive('groups')) {
      findMockGroup(groupId).name = name;
      const room = mockChatRooms.find((r) => r.id === groupId);
      if (room) room.name = name;
      return mockResponse(undefined);
    }
    await apiClient.patch(`/groups/${groupId}`, { name });
  },

  async invite(groupId: string, memberIds: string[]): Promise<void> {
    if (!isLive('groups')) {
      const group = findMockGroup(groupId);
      mockFriends
        .filter((f) => memberIds.includes(f.id) && !group.members.some((m) => m.id === f.id))
        .forEach((f) => group.members.push(friendToMember(f)));
      group.memberCount = group.members.length;
      return mockResponse(undefined);
    }
    await apiClient.post(`/groups/${groupId}/members`, { memberIds });
  },

  /** 그룹방 나가기. 마지막 멤버가 나가면 서버의 대화도 삭제됩니다 (WBS 7.3) */
  async leave(groupId: string): Promise<void> {
    if (!isLive('groups')) {
      const index = mockGroups.findIndex((g) => g.id === groupId);
      if (index >= 0) mockGroups.splice(index, 1);
      const roomIndex = mockChatRooms.findIndex((r) => r.id === groupId);
      if (roomIndex >= 0) mockChatRooms.splice(roomIndex, 1);
      return mockResponse(undefined);
    }
    await apiClient.delete(`/groups/${groupId}/members/me`);
  },

  /** 그룹 안에서 내 위치 공유 잠시 끄기 (WBS 7.2) */
  async setLocationSharing(groupId: string, paused: boolean): Promise<void> {
    if (!isLive('groups')) return mockResponse(undefined);
    await apiClient.put(`/groups/${groupId}/location-sharing`, { paused });
  },
};
