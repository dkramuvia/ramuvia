-- 숨김 모드 (WBS 9.5) 와 탈퇴 사유 (WBS 11.2)
--
-- 숨김 모드: "지금은 내 위치를 아무에게도 보이지 않기".
-- 위치 수집 자체는 계속합니다 — 끄면 이상징후 판정("어제 살아 계셨나")이 멈추기 때문입니다.
-- 보여 주는 쪽만 막습니다.

ALTER TABLE member.users
  ADD COLUMN hide_all   boolean     NOT NULL DEFAULT false,
  -- 이 시각이 지나면 저절로 풀립니다. 비어 있으면 직접 끌 때까지
  ADD COLUMN hide_until timestamptz;

-- 탈퇴 사유. 사용자 행은 지우므로 사유만 따로 남깁니다 (누가 썼는지는 남기지 않습니다)
CREATE TABLE member.withdrawal_reasons (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  reason     text NOT NULL,
  plan       text NOT NULL,
  -- 가입부터 탈퇴까지 며칠 썼는지. 사람을 특정하지 않으면서 이탈 시점을 볼 수 있습니다
  used_days  int  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON member.withdrawal_reasons TO app_main;
