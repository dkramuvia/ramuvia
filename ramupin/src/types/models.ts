/**
 * 기획서 기반 도메인 모델 초안.
 * 백엔드 API 명세가 나오면 필드명을 맞춰 수정하세요.
 */

export type LocationShareLevel = 'exact' | 'blurred' | 'hidden';

export type PlanId = 'basic' | 'platinum' | 'trinity' | 'care' | 'guardian';

export type Gender = 'male' | 'female';

export interface User {
  id: string;
  nickname: string;
  gender?: Gender;
  birthDate?: string; // YYYY-MM-DD
  avatarUrl?: string;
  statusMessage?: string;
  plan: PlanId;
  singleHouseholdMode: boolean;
  batteryLevel?: number;
}

export interface ChatRoom {
  id: string;
  name: string;
  memberCount: number;
  lastMessage?: string;
  updatedAt: string;
}

export interface SharedPlace extends LatLng {
  /** 장소명이 특정되는 경우 (예: 삼성 코엑스). 없으면 주소만 표시 */
  placeName?: string;
  address: string;
}

export type ChatMessageType = 'text' | 'location' | 'system';

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  type: ChatMessageType;
  text?: string;
  place?: SharedPlace;
  createdAt: string;
  /** 전송 중 (낙관적 업데이트) */
  pending?: boolean;
}

export interface MediaAsset {
  uri: string;
  width: number;
  height: number;
  type: 'image' | 'video';
}

export interface GalleryPost {
  id: string;
  groupId: string;
  groupName: string;
  author: Pick<Friend, 'id' | 'nickname' | 'avatarUrl' | 'isOnline'>;
  media: MediaAsset[];
  place?: SharedPlace & { areaName?: string };
  createdAt: string;
  /** WBS 5.9: 긴급 공지는 사진보다 먼저, 큰 글씨로 표시 */
  emergencyNotice?: { title: string; message: string };
}

export type FeedItemType = 'stay' | 'nearby' | 'checkedLocation' | 'arrived' | 'left' | 'sharedLocation';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  message: string;
  createdAt: string;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Friend {
  id: string;
  nickname: string;
  avatarUrl?: string;
  batteryLevel?: number; // 0~100
  /** 내가 이 친구에게 공유하는 수준 */
  myShareLevel: LocationShareLevel;
  location?: LatLng & { address?: string; updatedAt: string };
  speedKmh?: number;
  isOnline?: boolean;
}

/** 친구별 상세 공유 설정 (기획: 설정 2 - 친구별 상세 공유) */
export interface FriendShareSetting {
  friendId: string;
  locationLevel: LocationShareLevel;
  showStatus: boolean;
  shareRoute: boolean;
  shareBattery: boolean;
}

/** 친구가 아닌 사용자 요약 (QR·ID 검색, 연락처·근처 친구 추천) */
export interface UserSummary {
  id: string;
  nickname: string;
  avatarUrl?: string;
  /** 공개된 대략적 위치 (예: 화성시 제부도). 위치 비공개면 없음 */
  areaName?: string;
  lastActiveAt?: string;
}

export interface FriendSuggestion {
  user: UserSummary;
  /** 이미 친구 요청을 보냄 */
  requested: boolean;
  /** 친구 추천 근거 시각 (연락처 동기화/근처 감지) */
  foundAt: string;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'canceled';

export interface FriendRequest {
  id: string;
  from: UserSummary;
  to: UserSummary;
  status: FriendRequestStatus;
  message?: string;
  createdAt: string;
}

/** WBS 7.4: 1:1 채팅도 그룹방입니다. 그룹 id 와 채팅방 id 는 같습니다. */
export interface Group {
  id: string;
  name: string;
  ownerId: string;
  memberCount: number;
  isPremium: boolean;
  createdAt: string;
}

export type GroupRole = 'owner' | 'member';

export interface GroupMember extends Pick<Friend, 'id' | 'nickname' | 'avatarUrl' | 'batteryLevel' | 'isOnline'> {
  role: GroupRole;
  /** 이 멤버에 대한 나의 위치 공유 수준 (친구가 아니면 없음) */
  myShareLevel?: LocationShareLevel;
}

export interface GroupDetail extends Group {
  members: GroupMember[];
}

export interface Geofence {
  id: string;
  name: string;
  address: string;
  center: LatLng;
  radiusM: number;
  enabled: boolean;
}

export interface JourneyStop extends LatLng {
  placeName?: string;
  address: string;
  arrivedAt: string;
  /** 없으면 지금 머무는 중 */
  leftAt?: string;
  /** 이 장소에 오기까지 이동한 시간(분) */
  movedMinutesBefore?: number;
}

/** 경로선: 노란 줄 = 머무름, 파란 줄 = 이동 (기획 지도 메인 메모) */
export interface RouteSegment {
  kind: 'move' | 'stay';
  coordinates: LatLng[];
}

export interface JourneyDay {
  userId: string;
  date: string; // YYYY-MM-DD
  totalDistanceM: number;
  stops: JourneyStop[];
  route: RouteSegment[];
  batteryLevel?: number;
}

export type HistoryCategory = 'safety' | 'place';

export type HistoryEventType = 'sos' | 'geofenceArrive' | 'geofenceLeave' | 'batteryLow' | 'gpsLost' | 'noMovement' | 'speeding' | 'dangerZone';

/** 설정 > 히스토리: 알림 내역 (WBS 9.7: 기기에 보관) */
export interface HistoryEvent {
  id: string;
  type: HistoryEventType;
  category: HistoryCategory;
  message: string;
  createdAt: string;
}

export interface HideModeSetting {
  /** 모든 친구에게 내 위치 숨기기 */
  hideAll: boolean;
  /** 숨기기 종료 시각. 없으면 직접 끌 때까지 */
  until: string | null;
}

export interface EmergencyAgency {
  id: string;
  name: string;
  phone: string;
}

export interface SafetySetting {
  sosEnabled: boolean;
  recipientFriendIds: string[];
  recipientGroupIds: string[];
  /** 관공서 연락처 (WBS 8.4: 비워 두고 준비만) */
  agencies: EmergencyAgency[];
}

export interface ScheduledMessage {
  id: string;
  /** 메시지를 받을 사람 (내가 친구에게 예약, WBS 8.2) */
  targetUserId: string;
  title: string;
  body: string;
  scheduledAt: string;
  tts: boolean;
}
