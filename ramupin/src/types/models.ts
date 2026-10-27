/**
 * 기획서 기반 도메인 모델 초안.
 * 백엔드 API 명세가 나오면 필드명을 맞춰 수정하세요.
 */

export type LocationShareLevel = 'exact' | 'blurred' | 'hidden';

export type PlanId = 'basic' | 'platinum' | 'trinity' | 'care' | 'guardian';

export type Gender = 'male' | 'female';

export interface User {
  /** 서버 내부 ID (uuid). 목업에서는 8자리 ID 와 같은 값 */
  id: string;
  /** 앱에 보이는 8자리 ID (WBS 3.9) */
  publicId: string;
  nickname: string;
  gender?: Gender;
  birthDate?: string; // YYYY-MM-DD
  avatarUrl?: string;
  statusMessage?: string;
  plan: PlanId;
  singleHouseholdMode: boolean;
  batteryLevel?: number;
  /** pending_guardian = 만 14세 미만, 보호자 동의 대기 (보완 4.1). 대기 화면만 보입니다 */
  accountStatus?: 'active' | 'pending_guardian';
}

export interface ChatRoom {
  id: string;
  name: string;
  memberCount: number;
  lastMessage?: string;
  updatedAt: string;
  /** 안 읽은 메시지 수 (서버 연결 시) */
  unreadCount?: number;
  /** 그룹을 나가 서버에는 없고 기기에만 남은 대화 (WBS 7.6) */
  archived?: boolean;
}

export interface SharedPlace extends LatLng {
  /** 장소명이 특정되는 경우 (예: 삼성 코엑스). 없으면 주소만 표시 */
  placeName?: string;
  address: string;
}

export type ChatMessageType = 'text' | 'location' | 'system' | 'photo';

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  type: ChatMessageType;
  text?: string;
  place?: SharedPlace;
  /** 사진 메시지 (보완 4.18). 보내는 중에는 폰 안의 파일 주소 */
  photo?: { uri: string; width: number | null; height: number | null };
  createdAt: string;
  /** 전송 중 (낙관적 업데이트) */
  pending?: boolean;
  /** 전송 실패. 눌러서 다시 보내기 (보완 4.18) */
  failed?: boolean;
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
  /** 화면에 보이는 8자리 ID (서버 연결 시) */
  publicId?: string;
  nickname: string;
  avatarUrl?: string;
  batteryLevel?: number; // 0~100
  /** 내가 이 친구에게 공유하는 수준 */
  myShareLevel: LocationShareLevel;
  /** 이 친구가 나에게 공유하는 수준 (서버 연결 시). 안심존 알림 대상 고르기에 씁니다 */
  theirShareLevel?: LocationShareLevel;
  location?: LatLng & { address?: string; updatedAt: string };
  speedKmh?: number;
  /** 언제부터 한자리에 있는지 (ISO). 지도 마커의 "같은 자리에서 N분" */
  stayedSince?: string;
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
  /** 화면에 보이는 8자리 ID (서버 연결 시) */
  publicId?: string;
  nickname: string;
  avatarUrl?: string;
  /** 공개된 대략적 위치 (예: 화성시 제부도). 위치 비공개면 없음 */
  areaName?: string;
  lastActiveAt?: string;
}

/** ID·QR 로 찾은 사용자와 나의 관계 */
export type UserRelation = 'self' | 'friend' | 'request_sent' | 'request_received' | 'none';

export interface FoundUser extends UserSummary {
  relation: UserRelation;
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

/** 방장 = 모든 권한 / 관리자 = 초대·내보내기(방장 제외) / 멤버 = 보기·사진·대화 (보완 4.19) */
export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupMember extends Pick<Friend, 'id' | 'nickname' | 'avatarUrl' | 'batteryLevel' | 'isOnline'> {
  role: GroupRole;
  /** 이 멤버에 대한 나의 위치 공유 수준 (친구가 아니면 없음) */
  myShareLevel?: LocationShareLevel;
}

export interface GroupDetail extends Group {
  members: GroupMember[];
  /** 내 역할 (서버 연결 시) */
  myRole?: GroupRole;
  /** 그룹 설정 (보완 4.20). all = 누구나 / admins = 방장·관리자만 */
  invitePermission?: 'all' | 'admins';
  photoPermission?: 'all' | 'admins';
  /** 친구별 설정이 없는 멤버에게 쓰는 기본 위치 공개 */
  defaultShareLevel?: 'exact' | 'blurred';
  /** 최대 인원 (방장 등급 기준) */
  memberLimit?: number;
}

export interface GroupInviteLink {
  url: string;
  token: string;
  expiresAt: string;
}

export type GeofenceKind = 'home' | 'work' | 'school' | 'hospital' | 'other';

export interface GeofenceRecipient {
  friendId: string;
  /** 이 친구가 도착할 때 나에게 알림 */
  enter: boolean;
  /** 이 친구가 출발할 때 나에게 알림 */
  leave: boolean;
}

export interface Geofence {
  id: string;
  name: string;
  address: string;
  center: LatLng;
  radiusM: number;
  enabled: boolean;
  /** 집·직장·학교·병원·기타 (보완 4.16) */
  kind?: GeofenceKind;
  /** 내가 드나들 때 지정한 친구에게 알리기 (보완 4.17, 정확으로 공유 중인 친구에게만) */
  notifyFriends?: boolean;
  /** 알림 시간 'HH:MM'. 둘 다 없으면 항상 */
  alertStart?: string | null;
  alertEnd?: string | null;
  /** 지정한 친구와, 그 친구가 이 장소에 도착·출발할 때 나에게 알릴지 (보완 4.17) */
  recipients?: GeofenceRecipient[];
  /** 지정한 친구 id (예전 모양. recipients 와 같은 사람들) */
  recipientFriendIds: string[];
  /** 서버가 판단한 "지금 이 안에 있는지" */
  inside?: boolean;
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

export type HistoryEventType =
  | 'sos'
  | 'geofenceArrive'
  | 'geofenceLeave'
  | 'batteryLow'
  | 'gpsLost'
  | 'noMovement'
  | 'speeding'
  | 'dangerZone'
  // 앱 안 알림 카드에서 온 것 (WBS 9.7: 받은 알림은 모두 기기에 보관)
  | 'nearby'
  | 'friendRequest'
  | 'placeShared';

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
  /**
   * 숨김 모드 종류 (WBS 12.7·12.8).
   * server_only = 친구에게만 숨김, 서버에는 보내 SOS·이상징후 같은 위험 신호는 그대로
   * off_server = 서버에도 안 보냄 (위험 신호 감시도 멈춤)
   */
  scope?: 'server_only' | 'off_server';
}

/** SOS 를 문자로 받을 비회원 연락처 (서버가 알리고로 발송, 국내 휴대폰 번호만) */
export interface SosContact {
  /** 저장 전에는 없습니다 */
  id?: string;
  name: string;
  phone: string;
  maskedPhone?: string;
}

export interface SafetySetting {
  sosEnabled: boolean;
  recipientFriendIds: string[];
  recipientGroupIds: string[];
  /** 비회원 연락처 (보완 4.4, C6). 플래티넘부터 */
  contacts: SosContact[];
  /** 사용자가 직접 등록한 긴급전화 (보완 4.6). 없으면 null */
  emergencyName: string | null;
  emergencyNumber: string | null;
  /** SOS 때 비회원 연락처에 문자도 보내기 */
  smsEnabled: boolean;
  /** SOS 때 10초 녹음 */
  recordEnabled: boolean;
  /** 2초 길게 눌러야 SOS 시작 (오작동 방지) */
  longPressStart: boolean;
}

/** 알림 설정 (WBS 8.1). 앱 [설정 > 알림] 화면 */
export interface NotificationSettings {
  /** 방해 금지 시간을 쓰는지 */
  dndEnabled: boolean;
  /** `23:00` 꼴. **사용자가 있는 곳의 시각**입니다 */
  dndStart: string;
  dndEnd: string;
  /** 기기 시간대 (`Asia/Seoul`) */
  timezone: string;
  /** 화면에서는 끌 수 있지만 **서버는 그래도 보냅니다** — 위험할 때 오는 알림이라 */
  sos: boolean;
  battery: boolean;
  geofence: boolean;
  locationRequest: boolean;
  friendRequest: boolean;
  groupActivity: boolean;
  notice: boolean;
  marketing: boolean;
  /** 친구가 과속 중일 때. SOS 와 달리 방해 금지 시간을 지킵니다 */
  speeding: boolean;
}

export interface ScheduledMessage {
  id: string;
  /** 메시지를 받을 사람 (내가 친구에게 예약, WBS 8.2) */
  targetUserId: string;
  title: string;
  body: string;
  scheduledAt: string;
  tts: boolean;
  /** 이미 보냈는지 (서버가 채웁니다). 지난 예약을 흐리게 보여 줄 때 씁니다 */
  sent?: boolean;
}
