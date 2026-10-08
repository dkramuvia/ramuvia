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
  /** 'YYYY-MM-DD'. 시각이 없는 값이라 글자 그대로 읽습니다 (main-database.module.ts 설명) */
  birth_date: ColumnType<string | null, string | null, string | null>;
  avatar_url: string | null;
  status_message: string | null;
  plan: Generated<string>;
  single_household: Generated<boolean>;
  status: Generated<'active' | 'suspended' | 'withdrawn'>;
  /** 나이를 소셜(카카오·네이버)이 확인해 줬는지. false 면 본인이 적은 값 (WBS 3.6) */
  age_verified: Generated<boolean>;
  /** 숨김 모드: 지금은 아무에게도 내 위치를 보이지 않기 (WBS 9.5) */
  hide_all: Generated<boolean>;
  /** 숨김이 저절로 풀리는 시각. 없으면 직접 끌 때까지 */
  hide_until: Date | null;
  /**
   * 근처 친구 찾기에 내가 나타날지 (WBS 12.9).
   * **기본은 꺼짐** — 아직 친구가 아닌 사람에게 위치를 알리려면 본인 동의가 필요합니다
   */
  nearby_discoverable: Generated<boolean>;
  /**
   * 주소록으로 나를 찾을 수 있게 할지 (WBS 12.9).
   * **기본은 켜짐** — 상대가 내 번호를 이미 알아야 찾을 수 있어, 모르는 사람에게 노출되지 않습니다
   */
  phone_discoverable: Generated<boolean>;
  /**
   * 가입자의 국가 (ISO 3166-1 alpha-2: `KR` `US` `JP` …).
   * **휴대폰 인증 화면에서 고릅니다** — 전원이 거치는 단계라 빠지는 사람이 없습니다.
   * 관리자 관제센터가 이 값으로 국가별 집계를 냅니다
   */
  country: Generated<string>;
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

/**
 * 친구별 맞춤 알림 (피그마 2026-09-28).
 * owner_id = 알림을 받는 사람(나), friend_id = 소식의 주인공.
 */
export interface FriendAlertSettingsTable {
  owner_id: string;
  friend_id: string;
  battery: Generated<boolean>;
  safe_zone: Generated<boolean>;
  speeding: Generated<boolean>;
  nearby: Generated<boolean>;
  updated_at: Generated<Date>;
}

/** 탈퇴 사유. 사용자 행은 지우므로 사유만 남깁니다 (누가 썼는지는 남기지 않습니다) */
export interface WithdrawalReasonsTable {
  id: Generated<string>;
  reason: string;
  plan: string;
  used_days: number;
  created_at: Generated<Date>;
}

/** 안심장소(지오펜스) (WBS 8.8, 9.4) */
export interface SafeZonesTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  address: Generated<string>;
  latitude: number;
  longitude: number;
  radius_m: number;
  enabled: Generated<boolean>;
  /** 지금 이 안에 있는지. 진입·이탈은 달라졌을 때만 알립니다 */
  inside: Generated<boolean>;
  inside_since: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** 이 장소를 드나들 때 알림을 받을 친구 */
export interface SafeZoneRecipientsTable {
  zone_id: string;
  friend_id: string;
}

/** 진입·이탈 기록 (알림을 보낸 근거) */
export interface SafeZoneEventsTable {
  id: Generated<string>;
  zone_id: string;
  user_id: string;
  kind: 'enter' | 'leave';
  occurred_at: Date;
  latitude: number;
  longitude: number;
  created_at: Generated<Date>;
}

/** 푸시 알림 토큰 (WBS 6단계) */
export interface PushTokensTable {
  token: string;
  user_id: string;
  platform: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** 예약 메시지 (WBS 8.2). 보내는 사람 폰이 꺼져 있어도 가야 해서 서버가 보냅니다 */
export interface ScheduledMessagesTable {
  id: Generated<string>;
  /** 예약을 건 사람 */
  user_id: string;
  /** 받을 사람 (건 사람의 친구) */
  target_id: string;
  title: string;
  body: string;
  scheduled_at: Date;
  /** 받는 폰에서 소리로 읽어 줄지 */
  tts: Generated<boolean>;
  /** 보낸 시각. NULL 이면 아직 안 보냈습니다 */
  sent_at: Date | null;
  failed_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * 알림 설정과 방해 금지 시간 (WBS 8.1).
 * 시각 칸은 Postgres `time` 이라 `'23:00:00'` 문자열로 오갑니다.
 */
export interface NotificationSettingsTable {
  user_id: string;
  dnd_enabled: Generated<boolean>;
  dnd_start: Generated<string>;
  dnd_end: Generated<string>;
  /** 방해 금지 시각의 기준. 23시는 사용자가 있는 곳의 23시입니다 */
  timezone: Generated<string>;
  sos: Generated<boolean>;
  battery: Generated<boolean>;
  geofence: Generated<boolean>;
  location_request: Generated<boolean>;
  friend_request: Generated<boolean>;
  group_activity: Generated<boolean>;
  notice: Generated<boolean>;
  marketing: Generated<boolean>;
  /** 친구가 과속 중일 때. SOS 와 달리 방해 금지 시간을 지킵니다 */
  speeding: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * 사진 공유 링크 (WBS 6).
 * 무효화는 따로 청소하지 않습니다 — 열어 볼 때 그룹 소속을 봅니다 (post-share.service.ts)
 */
/** 그룹방 초대 링크 (0032) */
export interface GroupInvitesTable {
  token: string;
  group_id: string;
  created_by: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Generated<Date>;
}

export interface PostSharesTable {
  token: string;
  post_id: string;
  created_by: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Generated<Date>;
}

/**
 * 위험지역 (WBS 9.6). 모두에게 공통인 위험한 곳입니다.
 * 데이터는 공공데이터를 받아 부어 넣습니다 — 표만 먼저 만들어 둡니다
 */
export interface DangerZonesTable {
  id: Generated<string>;
  name: string;
  /** 낙석·침수·공사 등 */
  kind: Generated<string>;
  latitude: number;
  longitude: number;
  radius_m: number;
  enabled: Generated<boolean>;
  /** 어디서 받은 자료인지 */
  source: Generated<string>;
  source_key: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** 누가 어느 위험지역 안에 있는지. 반복 알림을 막으려면 직전 상태가 있어야 합니다 */
export interface DangerZoneVisitsTable {
  user_id: string;
  zone_id: string;
  inside: Generated<boolean>;
  entered_at: Date | null;
  notified_at: Date | null;
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
  'member.withdrawal_reasons': WithdrawalReasonsTable;
  'social.friend_alert_settings': FriendAlertSettingsTable;
  'member.safe_zones': SafeZonesTable;
  'member.safe_zone_recipients': SafeZoneRecipientsTable;
  'member.safe_zone_events': SafeZoneEventsTable;
  'member.scheduled_messages': ScheduledMessagesTable;
  'member.notification_settings': NotificationSettingsTable;
  'media.post_shares': PostSharesTable;
  'social.group_invites': GroupInvitesTable;
  'config.danger_zones': DangerZonesTable;
  'member.danger_zone_visits': DangerZoneVisitsTable;
}
