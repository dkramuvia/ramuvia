-- 관리자 계정과 정책 변경 이력 (WBS 11.4~12.1 관리자 웹)
--
-- 앱 사용자(member.users)와 완전히 분리합니다. 관리자는 앱에 로그인하지 않고,
-- 앱 사용자는 관리자 화면에 들어올 수 없습니다.

CREATE TABLE config.admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login_id      text NOT NULL UNIQUE,
  -- scrypt 해시. 형식: scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
  password_hash text NOT NULL,
  name          text NOT NULL,
  -- viewer: 보기만 / editor: 정책 수정 / owner: 관리자 계정까지 관리
  role          text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'owner')),
  disabled      boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 수집 주기를 잘못 바꾸면 전체 사용자에게 바로 퍼집니다. 누가 언제 무엇을 바꿨는지 남깁니다.
CREATE TABLE config.policy_audit (
  id         bigserial PRIMARY KEY,
  admin_id   uuid NOT NULL REFERENCES config.admin_users(id),
  -- 'plan' 또는 'user'
  scope      text NOT NULL CHECK (scope IN ('plan', 'user')),
  -- 등급 이름(basic 등) 또는 사용자 public_id
  target     text NOT NULL,
  before     jsonb NOT NULL,
  after      jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX policy_audit_created_idx ON config.policy_audit (created_at DESC);
