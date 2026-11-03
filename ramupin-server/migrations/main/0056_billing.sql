-- 구글 플레이 정기 결제 (플래티넘·트리니티, 월간·연간, 1개월 무료 체험).
-- 앱이 결제하면 받은 영수증(purchase token)을 서버가 구글에 직접 물어보고 맞을 때만 등급을 바꿉니다.
-- 갱신·해지·환불도 구글에 다시 물어 이 표와 member.users.plan / plan_expires_at 에 반영합니다 (billing.module.ts)
CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE billing.subscriptions (
  -- 구글이 결제마다 주는 영수증 값. 같은 구독이 갱신돼도 그대로입니다
  purchase_token  text PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  store           text NOT NULL DEFAULT 'google',
  -- 스토어 상품 (ramupin_platinum / ramupin_trinity) 과 기본 요금제 (monthly / yearly)
  product_id      text NOT NULL,
  base_plan_id    text,
  -- 이 구독이 주는 등급 (platinum / trinity)
  plan            text NOT NULL,
  -- 구글 구독 상태 (SUBSCRIPTION_STATE_ACTIVE · IN_GRACE_PERIOD · ON_HOLD · CANCELED · EXPIRED ...)
  state           text NOT NULL,
  -- 무료 체험 중인지
  trial           boolean NOT NULL DEFAULT false,
  auto_renewing   boolean NOT NULL DEFAULT false,
  expires_at      timestamptz,
  -- 구글 주문번호 (GPA.xxxx). 갱신될 때마다 ..0, ..1 처럼 늘어납니다
  order_id        text,
  -- 테스트 카드 결제(라이선스 테스트 계정)인지. 실제 돈이 나가지 않은 결제입니다
  test_purchase   boolean NOT NULL DEFAULT false,
  -- 업그레이드·재구독으로 이 영수증이 대신하는 이전 영수증
  linked_token    text,
  -- 마지막으로 받은 구글 응답 원문 (문의 대응용)
  raw             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  checked_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_user_idx ON billing.subscriptions (user_id);
-- 만료가 다가온 구독을 다시 확인할 때
CREATE INDEX subscriptions_expires_idx ON billing.subscriptions (expires_at);

GRANT USAGE ON SCHEMA billing TO app_main;
GRANT SELECT, INSERT, UPDATE, DELETE ON billing.subscriptions TO app_main;
