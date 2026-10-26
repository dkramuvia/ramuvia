-- 안심존 만들기(반경·종류)와 알림 대상 (보완 화면 설계 4.16·4.17)
--
--   4.16  반경 100m ~ 1km (50m 단위), 종류(집·직장·학교·병원·기타)
--   4.17  친구별로 "그 친구가 내 안심존에 도착·출발할 때 나에게 알림" (도착·출발 따로)
--         + "내가 드나들 때 친구에게 알리기" (정확으로 공유 중인 친구에게만)
--         + 알림 시간: 항상 / 시간 지정
--         + 경계에서 오가는 경우를 막기 위해 3분 이상 머문 뒤에 확정
--
--   예전에는 "내가 드나들 때 고른 친구에게" 만 있었습니다. 그 동작은 notify_friends(기본 켬)로 그대로 둡니다.

ALTER TABLE member.safe_zones
  ADD COLUMN kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('home', 'work', 'school', 'hospital', 'other')),
  -- 내가 드나들 때 알림 받을 친구에게 알릴지
  ADD COLUMN notify_friends boolean NOT NULL DEFAULT true,
  -- 알림 시간. 둘 다 비어 있으면 항상. 사용자 시간대(알림 설정의 timezone) 기준
  ADD COLUMN alert_start time,
  ADD COLUMN alert_end   time,
  -- 3분 확정을 기다리는 중인 진입·이탈. 확정되면 비웁니다
  ADD COLUMN pending_kind  text CHECK (pending_kind IN ('enter', 'leave')),
  ADD COLUMN pending_since timestamptz;

-- 이 장소에 지정한 친구 한 명:
--   - 내가 드나들 때 이 친구에게 알림 (notify_friends 가 켜져 있고, 내가 정확으로 공유 중일 때)
--   - 이 친구가 이 장소에 도착(watch_enter)·출발(watch_leave)할 때 나에게 알림 (친구가 나에게 정확으로 공유 중일 때)
ALTER TABLE member.safe_zone_recipients
  ADD COLUMN watch_enter   boolean NOT NULL DEFAULT true,
  ADD COLUMN watch_leave   boolean NOT NULL DEFAULT true,
  -- 이 친구가 지금 이 장소 안에 있는지와 3분 확정 대기 (친구마다 따로).
  -- 처음엔 모름(null): 첫 위치로 조용히 채웁니다. false 로 두면 이미 안에 있던 친구가 "도착" 으로 울립니다
  ADD COLUMN inside        boolean,
  ADD COLUMN inside_since  timestamptz,
  ADD COLUMN pending_kind  text CHECK (pending_kind IN ('enter', 'leave')),
  ADD COLUMN pending_since timestamptz;

-- 친구의 위치가 들어올 때 "이 친구를 지켜보는 안심존" 을 찾습니다
CREATE INDEX safe_zone_recipients_friend_idx ON member.safe_zone_recipients (friend_id);

-- 드나든 기록(safe_zone_events)은 user_id = 드나든 사람입니다. 친구가 내 장소를 드나든 것도 남기되,
-- 그 친구의 "내 기록" 에는 내 장소 이름이 보이지 않게 조회할 때 장소 주인으로 거릅니다 (safe-zone.service.ts)
