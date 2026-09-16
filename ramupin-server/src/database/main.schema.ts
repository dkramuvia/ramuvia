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

export interface MainDatabase {
  'member.users': UsersTable;
  'member.social_accounts': SocialAccountsTable;
  'member.terms_agreements': TermsAgreementsTable;
  'member.user_phones': UserPhonesTable;
  'member.phone_access_logs': PhoneAccessLogsTable;
  'member.devices': DevicesTable;
  'member.sessions': SessionsTable;
  'social.friendships': FriendshipsTable;
  'social.friend_share_settings': FriendShareSettingsTable;
  'social.friend_requests': FriendRequestsTable;
  'config.plan_policies': PlanPoliciesTable;
  'config.user_policy_overrides': UserPolicyOverridesTable;
}
