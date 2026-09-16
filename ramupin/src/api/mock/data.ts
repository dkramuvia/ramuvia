import type {
  ChatMessage,
  ChatRoom,
  FeedItem,
  Friend,
  FriendRequest,
  FriendShareSetting,
  GroupDetail,
  GroupMember,
  GroupRole,
  FriendSuggestion,
  User,
  UserSummary,
} from '@/types/models';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

export const mockMe: User = {
  id: '26467878',
  publicId: '26467878',
  nickname: '강한',
  gender: 'male',
  birthDate: '1999-07-13',
  plan: 'basic',
  singleHouseholdMode: false,
  batteryLevel: 68,
};

export const mockFriends: Friend[] = [
  {
    id: 'f1',
    nickname: 'RamuVia001',
    batteryLevel: 95,
    myShareLevel: 'hidden',
    speedKmh: 18,
    isOnline: true,
    location: loc(37.5116, 127.0595, '서울특별시 강남구 영동대로 513', 0),
  },
  { id: 'f2', nickname: '지원', batteryLevel: 68, myShareLevel: 'exact', location: loc(37.5045, 127.049, '서울특별시 강남구 선릉로', 12) },
  {
    id: 'f3',
    nickname: '상원',
    batteryLevel: 68,
    myShareLevel: 'exact',
    isOnline: true,
    location: loc(37.5006, 127.0364, '서울특별시 강남구 역삼동', 3),
  },
  { id: 'f4', nickname: '지윤002', batteryLevel: 68, myShareLevel: 'blurred', location: loc(37.4925, 127.0302, '서울특별시 서초구 서초동', 40) },
  { id: 'f5', nickname: 'caramel001', batteryLevel: 7, myShareLevel: 'blurred', isOnline: true },
];

function loc(latitude: number, longitude: number, address: string, updatedMinutesAgo: number) {
  return { latitude, longitude, address, updatedAt: minutesAgo(updatedMinutesAgo) };
}

export const mockShareSettings: Record<string, FriendShareSetting> = Object.fromEntries(
  mockFriends.map((f) => [
    f.id,
    {
      friendId: f.id,
      locationLevel: f.myShareLevel,
      showStatus: f.myShareLevel !== 'hidden',
      shareRoute: f.myShareLevel === 'exact',
      shareBattery: f.myShareLevel !== 'hidden',
    },
  ]),
);

/** 친구가 아닌 가입자 (QR·ID 검색, 추천 목록용) */
export const mockUsers: UserSummary[] = [
  { id: '26467001', nickname: 'hyunjin001', areaName: '화성시 제부도', lastActiveAt: minutesAgo(5) },
  { id: 'u100', nickname: '김민수', areaName: '화성시 제부도', lastActiveAt: minutesAgo(5) },
  { id: 'u101', nickname: '짱민지', areaName: '서울시 강남구', lastActiveAt: minutesAgo(30) },
  { id: 'u102', nickname: '박지훈', lastActiveAt: minutesAgo(200) },
  { id: 'u103', nickname: '이서연', areaName: '서울시 금천구', lastActiveAt: minutesAgo(1) },
];

export const mockContactSuggestions: FriendSuggestion[] = [
  { user: mockUsers[1], requested: false, foundAt: minutesAgo(120) },
  { user: mockUsers[3], requested: false, foundAt: minutesAgo(120) },
  { user: mockUsers[2], requested: true, foundAt: minutesAgo(120) },
];

export const mockNearbySuggestions: FriendSuggestion[] = [
  { user: mockUsers[4], requested: false, foundAt: minutesAgo(1) },
  { user: mockUsers[1], requested: false, foundAt: minutesAgo(120) },
  { user: mockUsers[2], requested: true, foundAt: minutesAgo(120) },
];

export const mockFriendRequests: FriendRequest[] = [
  {
    id: 'r1',
    from: { id: 'u100', nickname: '김민수', areaName: '화성시 제부도', lastActiveAt: minutesAgo(5) },
    to: { id: mockMe.id, nickname: mockMe.nickname },
    status: 'pending',
    createdAt: minutesAgo(120),
  },
  {
    id: 'r2',
    from: { id: 'u101', nickname: '짱민지' },
    to: { id: mockMe.id, nickname: mockMe.nickname },
    status: 'pending',
    createdAt: minutesAgo(180),
  },
];

export const mockSentRequests: FriendRequest[] = ['김민수', 'hyunjin001', '지오', '지희'].map((nickname, i) => ({
  id: `s${i + 1}`,
  from: { id: mockMe.id, nickname: mockMe.nickname },
  to: { id: `u2${i}`, nickname },
  status: 'pending',
  createdAt: minutesAgo(120 + i * 30),
}));

export const mockGroups: GroupDetail[] = [
  {
    id: 'room1',
    name: '지원',
    ownerId: mockMe.id,
    isPremium: false,
    createdAt: '2026-09-01T10:00:00+09:00',
    memberCount: 0,
    members: [],
  },
  {
    id: 'room2',
    name: '아리따운 홍익 아가들',
    ownerId: mockMe.id,
    isPremium: false,
    createdAt: '2025-06-14T10:00:00+09:00',
    memberCount: 0,
    members: [],
  },
  {
    id: 'room3',
    name: 'Hiking Club',
    ownerId: 'f1',
    isPremium: false,
    createdAt: '2026-08-01T10:00:00+09:00',
    memberCount: 0,
    members: [],
  },
];
// 멤버 구성: room1 = 나 + 지원 (1:1), room2 = 나(방장) + 친구 4명, room3 = RamuVia001(방장) + 나 + 지원
const toMember = (f: Friend, role: GroupRole): GroupMember => ({
  id: f.id,
  nickname: f.nickname,
  avatarUrl: f.avatarUrl,
  batteryLevel: f.batteryLevel,
  isOnline: f.isOnline,
  myShareLevel: f.myShareLevel,
  role,
});
const meAsMember: GroupMember = { id: mockMe.id, nickname: mockMe.nickname, batteryLevel: mockMe.batteryLevel, isOnline: true, role: 'owner' };
mockGroups[0].members = [meAsMember, toMember(mockFriends[1], 'member')];
mockGroups[1].members = [meAsMember, ...mockFriends.slice(0, 4).map((f) => toMember(f, 'member'))];
mockGroups[2].members = [toMember(mockFriends[0], 'owner'), { ...meAsMember, role: 'member' }, toMember(mockFriends[1], 'member')];
mockGroups.forEach((g) => (g.memberCount = g.members.length));

export const mockChatRooms: ChatRoom[] = [
  { id: 'room1', name: '지원', memberCount: 2, lastMessage: '지금 어디야?', updatedAt: minutesAgo(4) },
  { id: 'room2', name: '아리따운 홍익 아가들', memberCount: 5, lastMessage: '그룹채팅을 만들었습니다.', updatedAt: minutesAgo(90) },
  { id: 'room3', name: 'Hiking Club', memberCount: 3, lastMessage: '이번 주 토요일 어때요?', updatedAt: minutesAgo(600) },
];

const msg = (roomId: string, id: string, senderId: string, text: string, minutes: number): ChatMessage => ({
  id,
  roomId,
  senderId,
  type: 'text',
  text,
  createdAt: minutesAgo(minutes),
});

/** 채팅 메시지 (최신이 뒤). room1 = 지원(f2)과 1:1, room2 = 그룹 */
export const mockMessages: Record<string, ChatMessage[]> = {
  room1: [
    msg('room1', 'm1', 'f2', '더미 메시지 텍스트를 추가하세요 안녕하십니까 반갑습니다', 30),
    msg('room1', 'm2', mockMe.id, '더미 메시지 텍스트를', 20),
    msg('room1', 'm3', mockMe.id, '입력하세요.', 20),
    msg('room1', 'm4', 'f2', '지금 어디야?', 4),
  ],
  room2: [
    { id: 'm10', roomId: 'room2', senderId: mockMe.id, type: 'system', text: '그룹채팅을 만들었습니다.', createdAt: '2025-06-14T10:00:00+09:00' },
    msg('room2', 'm11', mockMe.id, '더미 메시지 텍스트를', 95),
    msg('room2', 'm12', mockMe.id, '입력하세요.', 90),
  ],
  room3: [
    msg('room3', 'm20', 'f1', '이번 주 토요일 어때요?', 600),
  ],
};

/** 지도 메인 바텀시트의 알림/상호작용 기록 */
export const mockFeed: FeedItem[] = [
  { id: 'n1', type: 'stay', message: 'CN님이 강남 코엑스에서 머무른지 1시간이 되었습니다.', createdAt: '2026-08-27T08:52:00+09:00' },
  { id: 'n2', type: 'nearby', message: '강한님이 근처에 있습니다!', createdAt: '2026-08-27T08:30:00+09:00' },
  { id: 'n3', type: 'checkedLocation', message: '지원님이 내 위치를 확인했습니다.', createdAt: '2026-08-27T09:15:00+09:00' },
];
