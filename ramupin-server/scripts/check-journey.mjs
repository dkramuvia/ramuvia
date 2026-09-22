// 이동 기록과 알림 내역 확인 (WBS 4.5, 9.7)
//   서버를 띄운 상태에서  node scripts/check-journey.mjs
// 지원의 하루 위치를 만들어 올리고, 강한이 그 여정을 볼 수 있는지 / 경로 공개를 끄면 가려지는지 봅니다
import { call, login, wait } from './dev-login.mjs';

const HOME = { latitude: 37.4786, longitude: 126.8776 };
const OFFICE = { latitude: 37.4845, longitude: 126.8966 };

const 지원 = await login('26460002');
const 강한 = await login('26467878');

// 오늘이 아니라 3일 전으로 만듭니다.
// 오늘에 넣으면 다른 확인 스크립트가 올린 점과 섞여, 무엇 때문에 결과가 달라졌는지 알 수 없습니다
const DAY = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString().slice(0, 10);
const midnight = new Date(`${DAY}T00:00:00+09:00`).getTime();
const at = (minutes) => new Date(midnight + minutes * 60_000).toISOString();

const points = [];
const stay = (fromMin, toMin, c) => {
  for (let m = fromMin; m <= toMin; m += 1) {
    points.push({ latitude: c.latitude + ((m % 5) * 2) / 111_320, longitude: c.longitude, accuracy: 10, measuredAt: at(m) });
  }
};
const move = (fromMin, toMin, a, b) => {
  const steps = toMin - fromMin;
  for (let i = 1; i < steps; i += 1) {
    const r = i / steps;
    points.push({
      latitude: a.latitude + (b.latitude - a.latitude) * r,
      longitude: a.longitude + (b.longitude - a.longitude) * r,
      accuracy: 10,
      measuredAt: at(fromMin + i),
    });
  }
};

// 집에 9시까지 → 40분 이동 → 회사에 계속
stay(0, 540, HOME);
move(540, 580, HOME, OFFICE);
stay(580, 900, OFFICE);

console.log(`지원의 하루 위치 ${points.length}건 올리는 중...`);
for (let i = 0; i < points.length; i += 400) {
  await call('POST', '/locations', 지원.accessToken, { points: points.slice(i, i + 400) });
}
// 큐를 거쳐 저장되므로 워커가 처리할 시간을 줍니다
await wait(4000);

// 경로 공개를 켭니다 (친구 목록에 보이는 것과 경로 공개는 별개입니다)
await call('PUT', `/friends/${강한.id}/share-setting`, 지원.accessToken, {
  locationLevel: 'exact',
  showStatus: true,
  shareRoute: true,
  shareBattery: true,
});

const journey = await call('GET', `/users/${지원.id}/journey/today?date=${DAY}`, 강한.accessToken);
console.log(`\n강한이 본 지원의 ${DAY} 여정:`);
for (const s of journey?.stops ?? []) {
  const until = s.leftAt ? new Date(s.leftAt).toTimeString().slice(0, 5) : '지금까지';
  const before = s.movedMinutesBefore != null ? ` (${s.movedMinutesBefore}분 이동 후)` : '';
  const where = s.placeName || s.address || '주소 없음';
  console.log(`  ${new Date(s.arrivedAt).toTimeString().slice(0, 5)} ~ ${until}  ${where}${before}`);
}
console.log(`  총 이동 ${((journey?.totalDistanceM ?? 0) / 1000).toFixed(1)}km, 경로 구간 ${journey?.route.length ?? 0}개`);

// 경로 공개를 끄면 가려져야 합니다
await call('PUT', `/friends/${강한.id}/share-setting`, 지원.accessToken, {
  locationLevel: 'exact',
  showStatus: true,
  shareRoute: false,
  shareBattery: true,
});
const hidden = await call('GET', `/users/${지원.id}/journey/today?date=${DAY}`, 강한.accessToken);
console.log('\n경로 공개를 끈 뒤:', hidden === null ? '안 보임 (맞음)' : '보임 (틀림)');

// 본인은 항상 볼 수 있어야 합니다
const mine = await call('GET', `/users/${지원.id}/journey/today?date=${DAY}`, 지원.accessToken);

const history = await call('GET', '/me/history', 강한.accessToken);
console.log(`\n강한의 알림 내역 ${history.length}건`);
for (const e of history.slice(0, 5)) console.log(`  [${e.type}] ${e.message}`);

const ok =
  (journey?.stops.length ?? 0) === 2 &&
  journey.stops[1].movedMinutesBefore > 35 &&
  journey.stops[1].movedMinutesBefore < 45 &&
  !journey.stops[1].leftAt &&
  journey.route.map((r) => r.kind).join(',') === 'stay,move,stay' &&
  hidden === null &&
  mine !== null;
console.log(ok ? '\n통과: 여정 2곳·이동 1구간, 경로 공개를 끄면 가려지고 본인은 보입니다' : '\n실패');
process.exit(ok ? 0 : 1);
