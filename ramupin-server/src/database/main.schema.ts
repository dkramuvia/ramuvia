import type { ColumnType, Generated } from 'kysely';

/**
 * 본 DB (ramupin) 테이블 타입. migrations/main 과 맞춰 수정하세요.
 */
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export type ShareLevel = 'exact' | 'blurred' | 'hidden';

export interface UsersTable {
  id: Generated<string>;
  public_id: string;
  nickname: string;
  gender: 'male' | 'female' | null;
  birth_date: ColumnType<Date | null, string | null, string | null>;
  phone_hash: string | null;
  phone_encrypted: Buffer | null;
  avatar_url: string | null;
  status_message: string | null;
  plan: Generated<string>;
  single_household: Generated<boolean>;
  status: Generated<'active' | 'suspended' | 'withdrawn'>;
  last_active_at: Date | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface FriendshipsTable {
  user_id: string;
  friend_id: string;
  created_at: Generated<Timestamp>;
}

export interface FriendShareSettingsTable {
  owner_id: string;
  friend_id: string;
  location_level: Generated<ShareLevel>;
  show_status: Generated<boolean>;
  share_route: Generated<boolean>;
  share_battery: Generated<boolean>;
  updated_at: Generated<Timestamp>;
}

export interface FriendRequestsTable {
  id: Generated<string>;
  from_user_id: string;
  to_user_id: string;
  status: Generated<'pending' | 'accepted' | 'rejected' | 'canceled'>;
  message: string | null;
  created_at: Generated<Timestamp>;
  responded_at: Timestamp | null;
}

export interface PlanPoliciesTable {
  plan: string;
  policy: ColumnType<Record<string, unknown>, string, string>;
  updated_at: Generated<Timestamp>;
}

export interface UserPolicyOverridesTable {
  user_id: string;
  policy: ColumnType<Record<string, unknown>, string, string>;
  updated_at: Generated<Timestamp>;
}

export interface MainDatabase {
  'member.users': UsersTable;
  'social.friendships': FriendshipsTable;
  'social.friend_share_settings': FriendShareSettingsTable;
  'social.friend_requests': FriendRequestsTable;
  'config.plan_policies': PlanPoliciesTable;
  'config.user_policy_overrides': UserPolicyOverridesTable;
}
