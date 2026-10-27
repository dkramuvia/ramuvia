// 숨김 모드 두 가지(WBS 12.7·12.8)·이동 통계·예약 메시지 받는 사람 시각·SOS 녹음 주소 확인
//   서버를 띄운 상태에서  node scripts/check-hide-stats.mjs
import { call, login } from './dev-login.mjs';

const 지원 = await login('26460002');
const 강한 = await login('26467878');
const t = 지원.accessToken;
const point = () => ({ points: [{ latitude: 37.4781, longitude: 126.8812, accuracy: 10, measuredAt: new Date().toISOString() }] });
let ok = true;
const check = (label, cond, detail) => {
  console.log(`${cond ? '통과' : '실패'} ${label}${detail ? ` → ${detail}` : ''}`);
  if (!cond) ok = false;
};

// 1) 숨김 "서버에도 안 보내기" → 위치를 받지 않음
await call('PUT', '/me/hide-mode', t, { hideAll: true, until: null, scope: 'off_server' });
const hidden = await call('GET', '/me/hide-mode', t);
check('숨김 종류 저장', hidden.scope === 'off_server', JSON.stringify(hidden));
const refused = await call('POST', '/locations', t, point());
check('서버에도 안 보내기 중 위치', refused.received === 0, JSON.stringify(refused));

// 2) 숨김 "친구에게만" → 위치는 받음
await call('PUT', '/me/hide-mode', t, { hideAll: true, until: null, scope: 'server_only' });
const accepted = await call('POST', '/locations', t, point());
check('친구에게만 숨김 중 위치', accepted.received === 1, JSON.stringify(accepted));
await call('PUT', '/me/hide-mode', t, { hideAll: false, until: null });
const off = await call('GET', '/me/hide-mode', t);
check('숨김 끄면 종류는 그대로', off.hideAll === false && off.scope === 'server_only', JSON.stringify(off));

// 3) 최근 7일 이동 통계
const stats = await call('GET', '/me/journey/stats?days=7', t);
check('7일 통계 모양', stats.days === 7 && typeof stats.totalDistanceM === 'number' && Array.isArray(stats.topPlaces), JSON.stringify(stats));
const bad = await call('GET', '/me/journey/stats?days=9', t).catch((e) => e);
check('7·30 말고는 거절', bad instanceof Error);

// 4) 예약 메시지: 받는 사람(강한)이 뉴욕에 있으면 "08:00" 은 뉴욕 08:00
const notif = await call('GET', '/me/notification-settings', 강한.accessToken);
await call('PUT', '/me/notification-settings', 강한.accessToken, { ...notif, timezone: 'America/New_York' });
const created = await call('POST', '/scheduled-messages', t, {
  targetUserId: 강한.id,
  title: '확인',
  body: '받는 사람 시각 기준',
  scheduledAt: '2026-11-30T23:00:00.000Z',
  tts: false,
  timezoneBasis: 'recipient',
  localTime: '2026-12-01T08:00',
});
check('받는 사람 시각 기준', created.scheduledAt === '2026-12-01T13:00:00.000Z', created.scheduledAt);
const mine = await call('PUT', `/scheduled-messages/${created.id}`, t, {
  targetUserId: 강한.id,
  title: '확인',
  body: '내 시각 기준',
  scheduledAt: '2026-11-30T23:00:00.000Z',
  tts: false,
  timezoneBasis: 'mine',
  localTime: '2026-12-01T08:00',
});
check('내 시각 기준', mine.scheduledAt === '2026-11-30T23:00:00.000Z', mine.scheduledAt);
await call('DELETE', `/scheduled-messages/${created.id}`, t);
await call('PUT', '/me/notification-settings', 강한.accessToken, notif);

// 5) SOS 녹음 주소: 남의 SOS 는 404
const audio = await call('GET', '/sos/00000000-0000-4000-8000-000000000000/audio', t).catch((e) => e);
check('없는 SOS 녹음은 404', audio instanceof Error && audio.message.includes('404'));

console.log(ok ? '\n통과' : '\n실패');
process.exit(ok ? 0 : 1);
