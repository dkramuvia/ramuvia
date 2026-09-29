-- 알림 설정과 방해 금지 시간 (WBS 8.1)
--
-- 앱 [설정 > 알림] 화면의 값들입니다. 지금까지는 화면 안에서만 켜고 끄던 것을 서버에 둡니다.
-- 알림을 보내는 쪽이 서버라서, 서버가 모르면 끈 의미가 없습니다.

CREATE TABLE member.notification_settings (
  user_id uuid PRIMARY KEY REFERENCES member.users(id) ON DELETE CASCADE,

  -- 방해 금지 시간. 이 사이에는 알림을 보내지 않습니다
  dnd_enabled boolean NOT NULL DEFAULT false,
  dnd_start   time NOT NULL DEFAULT '23:00',
  dnd_end     time NOT NULL DEFAULT '05:00',
  -- 시각은 **사용자가 있는 곳의 시간**입니다. 23시는 서울의 23시이지 UTC 23시가 아닙니다
  timezone    text NOT NULL DEFAULT 'Asia/Seoul',

  -- 종류별 켜고 끄기. 기본값은 앱 화면과 같습니다
  sos              boolean NOT NULL DEFAULT true,
  battery          boolean NOT NULL DEFAULT true,
  geofence         boolean NOT NULL DEFAULT true,
  location_request boolean NOT NULL DEFAULT true,
  friend_request   boolean NOT NULL DEFAULT true,
  group_activity   boolean NOT NULL DEFAULT true,
  notice           boolean NOT NULL DEFAULT true,
  -- 광고성 알림은 받겠다고 한 사람에게만 (정보통신망법)
  marketing        boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 지금 있는 사용자들에게 기본값을 깔아 둡니다.
-- 없으면 서버가 "설정이 없다 = 모름" 을 매번 따져야 합니다
INSERT INTO member.notification_settings (user_id)
SELECT id FROM member.users
ON CONFLICT (user_id) DO NOTHING;
