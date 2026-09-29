// 알림 설정·방해 금지 시간 확인 (WBS 8.1)
//   서버를 띄운 상태에서  node scripts/check-notification-settings.mjs
//
// 보는 것
//   1. 설정을 읽고 저장할 수 있는가
//   2. 종류를 끄면 그 알림을 안 받는가
//   3. **방해 금지 시간에는 안 받는가** (자정을 넘기는 23:00~05:00 포함)
//   4. **SOS 는 그래도 받는가** — 껐든 방해 금지든 가야 합니다
import { readFileSync } from 'node:fs';

import pg from 'pg';

import { call, login } from './dev-login.mjs';

const db = new pg.Client({
  connectionString: /^MIGRATOR_MAIN_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim(),
});
await db.connect();

const 강한 = await login('26467878');

let 실패 = 0;
const 확인 = (라벨, 조건) => {
  console.log(`  ${조건 ? 'O' : 'X'} ${라벨}`);
  if (!조건) 실패 += 1;
};

/**
 * 서버의 **실제** 거르기 함수에 물어봅니다.
 * 같은 판정을 여기서 다시 구현하면 복사본만 시험하게 되고, 진짜 코드가 달라져도 모릅니다.
 */
const 받는가 = async (category) =>
  (await call('GET', `/me/notification-settings/would-receive?category=${category}`, 강한.accessToken)).receives;

const 기본 = {
  dndEnabled: false,
  dndStart: '23:00',
  dndEnd: '05:00',
  timezone: 'Asia/Seoul',
  sos: true,
  battery: true,
  geofence: true,
  locationRequest: true,
  friendRequest: true,
  groupActivity: true,
  notice: true,
  marketing: false,
};

console.log('1. 읽기·저장');
const 처음 = await call('GET', '/me/notification-settings', 강한.accessToken);
확인('읽힘', typeof 처음.dndEnabled === 'boolean');
const 저장됨 = await call('PUT', '/me/notification-settings', 강한.accessToken, { ...기본, battery: false });
확인('저장됨', 저장됨.battery === false && 저장됨.geofence === true);

console.log('\n2. 끈 종류는 안 감');
확인('배터리 알림 안 감', !(await 받는가('battery')));
확인('안심존 알림은 감', await 받는가('geofence'));

console.log('\n3. 방해 금지 시간');
// 지금 시각을 포함하도록 창을 잡습니다 (자정을 넘기는 구간도 같이 봅니다)
const 지금 = (await db.query("SELECT (now() AT TIME ZONE 'Asia/Seoul')::time AS t")).rows[0].t.slice(0, 5);
const [시, 분] = 지금.split(':').map(Number);
const 두시간전 = `${String((시 + 22) % 24).padStart(2, '0')}:${String(분).padStart(2, '0')}`;
const 두시간후 = `${String((시 + 2) % 24).padStart(2, '0')}:${String(분).padStart(2, '0')}`;
await call('PUT', '/me/notification-settings', 강한.accessToken, {
  ...기본,
  dndEnabled: true,
  dndStart: 두시간전,
  dndEnd: 두시간후,
});
확인(`방해 금지 안(${두시간전}~${두시간후}) — 알림 안 감`, !(await 받는가('geofence')));

// 지금을 벗어난 창
await call('PUT', '/me/notification-settings', 강한.accessToken, {
  ...기본,
  dndEnabled: true,
  dndStart: 두시간후,
  dndEnd: 두시간전,
});
확인('방해 금지 밖 — 알림 감', await 받는가('geofence'));

console.log('\n4. SOS 는 그래도 감');
// 다시 방해 금지 안으로 넣고, SOS 까지 꺼 봅니다
await call('PUT', '/me/notification-settings', 강한.accessToken, {
  ...기본,
  dndEnabled: true,
  dndStart: 두시간전,
  dndEnd: 두시간후,
  sos: false,
});
const { rows: sos } = await db.query('SELECT sos, dnd_enabled FROM member.notification_settings WHERE user_id = $1', [강한.id]);
확인('설정은 꺼져 있음', sos[0].sos === false && sos[0].dnd_enabled === true);
확인('그래도 SOS 는 받음', await 받는가('sos'));
확인('같은 상황에서 다른 알림은 안 받음', !(await 받는가('geofence')));

// 뒷정리
await call('PUT', '/me/notification-settings', 강한.accessToken, 기본);
await db.end();

console.log(실패 === 0 ? '\n모두 통과' : `\n${실패}개 실패`);
process.exit(실패 === 0 ? 0 : 1);
