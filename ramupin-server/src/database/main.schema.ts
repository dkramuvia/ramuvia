import type { ColumnType, Generated } from 'kysely';

/**
 * 본 DB (ramupin) 테이블 타입. migrations/main 과 맞춰 수정하세요.
 */
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;

export type ShareLevel = 'exact' | 'blurred' | 'hidden';

export interface UsersTable {
  id: Generated<string>;
  public_id: string;
  nickname: string;
  gender: 'male' | 'female' | null;
  birth_date: ColumnType<Date | null, string | null, string | null>;
  avatar_url: string | null;
  status_message: string | null;
  plan: Generated<string>;
  single_household: Generated<boolean>;
  status: Generated<'active' | 'suspended' | 'withdrawn'>;
  last_active_at: Date | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SocialAccountsTable {
  id: Generated<string>;
  user_id: string;
  /** kakao, naver, google, apple, x, facebook */
  provider: string;
  provider_user_id: string;
  created_at: Timestamp;
}

export interface TermsAgreementsTable {
  user_id: string;
  term_key: string;
  version: string;
  agreed_at: Timestamp;
}

/** 전화번호는 회원 테이블과 분리해서 보관 (src/phone/phone.service.ts 만 접근) */
export interface UserPhonesTable {
  user_id: string;
  phone_hash: string;
  phone_encrypted: Buffer;
  verified_at: Timestamp;
  updated_at: Timestamp;
}

export interface PhoneAccessLogsTable {
  id: Generated<string>;
  user_id: string;
  purpose: string;
  actor: Generated<string>;
  created_at: Timestamp;
}

export interface DevicesTable {
  id: Generated<string>;
  user_id: string;
  installation_id: string;
  device_key_hash: string | null;
  platform: 'android' | 'ios';
  model: string | null;
  os_version: string | null;
  app_version: string | null;
  push_token: string | null;
  created_at: Timestamp;
  verified_at: NullableTimestamp;
  last_login_at: NullableTimestamp;
  last_seen_at: Timestamp;
}

export type SessionRevokeReason = 'logout' | 'replaced' | 'reused' | 'admin' | 'withdrawn';

export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  device_id: string;
  auth_method: string;
  refresh_token_hash: string;
  previous_refresh_token_hash: string | null;
  refreshed_at: Timestamp;
  expires_at: Timestamp;
  created_at: Timestamp;
  revoked_at: NullableTimestamp;
  revoke_reason: SessionRevokeReason | null;
}

export interface GroupsTable {
  id: Generated<string>;
  name: string;
  owner_id: string;
  is_direct: Generated<boolean>;
  is_premium: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface GroupMembersTable {
  group_id: string;
  user_id: string;
  role: Generated<'owner' | 'member'>;
  location_paused: Generated<boolean>;
  joined_at: Timestamp;
  last_read_at: Timestamp;
}

export interface DirectRoomsTable {
  user_a: string;
  user_b: string;
  group_id: string;
}

export interface ChatMessagesTable {
  id: Generated<string>;
  room_id: string;
  sender_id: string | null;
  type: 'text' | 'location' | 'system';
  text: string | null;
  place: ColumnType<SharedPlace | null, string | null, string | null>;
  created_at: Timestamp;
}

/** 위치 공유 메시지 내용 (앱 types/models.ts SharedPlace) */
export interface SharedPlace {
  latitude: number;
  longitude: number;
  address: string;
  placeName?: string;
}

export interface FriendshipsTable {
  user_id: string;
  friend_id: string;
  created_at: Timestamp;
}

export interface FriendShareSettingsTable {
  owner_id: string;
  friend_id: string;
  location_level: Generated<ShareLevel>;
  show_status: Generated<boolean>;
  share_route: Generated<boolean>;
  share_battery: Generated<boolean>;
  updated_at: Timestamp;
}

export interface FriendRequestsTable {
  id: Generated<string>;
  from_user_id: string;
  to_user_id: string;
  status: Generated<'pending' | 'accepted' | 'rejected' | 'canceled'>;
  message: string | null;
  created_at: Timestamp;
  responded_at: NullableTimestamp;
}

export interface PlanPoliciesTable {
  plan: string;
  policy: ColumnType<Record<string, unknown>, string, string>;
  updated_at: Timestamp;
}

export interface UserPolicyOverridesTable {
  user_id: string;
  policy: ColumnType<Record<string, unknown>, string, string>;
  updated_at: Timestamp;
}

/** 이상징후 발생 기록 (docs/anomaly-alerts.md) */
/** 안전 설정 (WBS 7.9) */
export interface SafetySettingsTable {
  user_id: string;
  sos_enabled: Generated<boolean>;
  updated_at: Timestamp;
}

/** SOS 를 받을 사람 (친구 한 명 또는 그룹방 전체) */
export interface SosRecipientsTable {
  user_id: string;
  kind: 'friend' | 'group';
  target_id: string;
}

/** SOS 발생 기록 (WBS 7.9 / 8.3 / 9.3) */
export interface SosEventsTable {
  id: Generated<string>;
  user_id: string;
  started_at: Timestamp;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  place_name: string | null;
  place_address: string | null;
  audio_asset_id: string | null;
  status: Generated<'sent' | 'cancelled' | 'resolved'>;
  recipient_count: Generated<number>;
  /** 지정 수신인이 없어 회사가 받은 건 (WBS 9.3) */
  to_monitoring: Generated<boolean>;
  created_at: Timestamp;
  cancelled_at: NullableTimestamp;
  resolved_at: NullableTimestamp;
  acknowledged_at: NullableTimestamp;
}

/** 누가 이 SOS 를 받았는지. 받은 사람만 상세를 볼 수 있습니다 */
export interface SosDeliveriesTable {
  sos_id: string;
  recipient_user_id: string;
  read_at: NullableTimestamp;
}

/** 저장소에 올린 파일 한 개 (WBS 5.6) */
export interface MediaAssetsTable {
  id: Generated<string>;
  owner_id: string;
  object_key: string;
  kind: 'image' | 'video' | 'audio';
  content_type: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  uploaded_at: NullableTimestamp;
  created_at: Timestamp;
}

/** 갤러리 게시물 (WBS 5.8, 5.9) */
export interface MediaPostsTable {
  id: Generated<string>;
  group_id: string;
  author_id: string;
  place_name: string | null;
  place_address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** 있으면 긴급 공지 (WBS 5.9) */
  emergency_title: string | null;
  emergency_message: string | null;
  created_at: Timestamp;
  deleted_at: NullableTimestamp;
}

export interface MediaPostAssetsTable {
  post_id: string;
  asset_id: string;
  position: number;
}

/** 관리자 계정 (앱 사용자와 분리) */
export interface AdminUsersTable {
  id: Generated<string>;
  login_id: string;
  /** scrypt$N$r$p$salt$hash */
  password_hash: string;
  name: string;
  role: Generated<'viewer' | 'editor' | 'owner'>;
  disabled: Generated<boolean>;
  last_login_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** 정책을 누가 언제 무엇에서 무엇으로 바꿨는지 */
export interface PolicyAuditTable {
  id: Generated<number>;
  admin_id: string;
  scope: 'plan' | 'user';
  target: string;
  before: ColumnType<Record<string, unknown>, string, string>;
  after: ColumnType<Record<string, unknown>, string, string>;
  created_at: Timestamp;
}

export interface AnomalyEventsTable {
  id: Generated<string>;
  user_id: string;
  /** battery / gps_fixed / fixed_battery_zero / fixed_charging / no_signal */
  track: string;
  /** low / zero / 30m / 3h / 12h / 24h / 48h */
  stage: string;
  /** friends = 친구에게 알림 / monitoring = 모니터링 사이트에만 표시 */
  target: string;
  detected_at: Generated<Date>;
  /** 다시 움직이거나 전화기를 켜면 자동 해제 */
  cleared_at: Date | null;
  /** 모니터링 사이트에서 사람이 확인한 시각 */
  acknowledged_at: Date | null;
}

/** 푸시 알림 토큰 (WBS 6단계) */
export interface PushTokensTable {
  token: string;
  user_id: string;
  platform: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MainDatabase {
  'member.users': UsersTable;
  'member.social_accounts': SocialAccountsTable;
  'member.terms_agreements': TermsAgreementsTable;
  'member.user_phones': UserPhonesTable;
  'member.phone_access_logs': PhoneAccessLogsTable;
  'member.devices': DevicesTable;
  'member.sessions': SessionsTable;
  'social.groups': GroupsTable;
  'social.group_members': GroupMembersTable;
  'social.direct_rooms': DirectRoomsTable;
  'chat.messages': ChatMessagesTable;
  'social.friendships': FriendshipsTable;
  'social.friend_share_settings': FriendShareSettingsTable;
  'social.friend_requests': FriendRequestsTable;
  'config.plan_policies': PlanPoliciesTable;
  'config.user_policy_overrides': UserPolicyOverridesTable;
  'member.safety_settings': SafetySettingsTable;
  'member.sos_recipients': SosRecipientsTable;
  'member.sos_events': SosEventsTable;
  'member.sos_deliveries': SosDeliveriesTable;
  'media.assets': MediaAssetsTable;
  'media.posts': MediaPostsTable;
  'media.post_assets': MediaPostAssetsTable;
  'config.admin_users': AdminUsersTable;
  'config.policy_audit': PolicyAuditTable;
  'member.anomaly_events': AnomalyEventsTable;
  'member.push_tokens': PushTokensTable;
}
