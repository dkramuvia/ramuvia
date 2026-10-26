// 친구 요청 수락(보완 4.3)·신고·차단(4.11) 확인
//   서버를 띄운 상태에서  node scripts/check-blocks.mjs
// 지원이 강한을 차단하면 친구가 끊기고 강한이 다시 요청할 수 없는지, 차단을 풀고 요청하면
// 강한이 수락하면서 고른 공개 수준(흐림·배터리 끔)이 그대로 저장되는지, 신고가 접수되는지 봅니다.
import { call, login } from './dev-login.mjs';

const 지원 = await login('26460002');
const 강한 = await login('26467878');

const isFriend = async () => (await call('GET', '/friends', 지원.accessToken)).some((f) => f.id === 강한.id);
const wereFriends = process.argv.includes('--were-friends') || (await isFriend());
console.log('처음 친구였나 →', wereFriends);

// 1) 차단 → 친구가 끊기고, 강한은 지원에게 요청할 수 없음 (없는 사용자처럼)
await call('POST', `/blocks/${강한.id}`, 지원.accessToken);
console.log('차단 뒤 친구인가 →', await isFriend());
if (await isFriend()) throw new Error('차단했는데 친구가 남아 있습니다');
const blocked = await call('POST', '/friends/requests', 강한.accessToken, { userId: 지원.id }).catch((e) => e);
console.log('막힌 사람이 보낸 요청 →', blocked instanceof Error ? blocked.message : JSON.stringify(blocked));
if (!(blocked instanceof Error)) throw new Error('차단한 사람에게 요청이 갔습니다');
console.log('차단 목록 →', (await call('GET', '/blocks', 지원.accessToken)).map((b) => b.nickname).join(', '));

// 2) 차단 풀고 요청 → 강한이 "흐림 · 배터리 끔" 으로 수락
await call('DELETE', `/blocks/${강한.id}`, 지원.accessToken);
const sent = await call('POST', '/friends/requests', 지원.accessToken, { userId: 강한.id });
await call('POST', `/friends/requests/${sent.requestId}/accept`, 강한.accessToken, { locationLevel: 'blurred', shareRoute: true, shareBattery: false });
const share = await call('GET', `/friends/${지원.id}/share-setting`, 강한.accessToken);
console.log('강한이 지원에게 공개 →', JSON.stringify(share));
if (share.locationLevel !== 'blurred' || share.shareRoute || share.shareBattery) throw new Error('수락할 때 고른 공개 수준이 저장되지 않았습니다');
const back = await call('GET', `/friends/${강한.id}/share-setting`, 지원.accessToken);
console.log('지원이 강한에게 공개 (기본값) →', JSON.stringify(back));

// 3) 신고 (차단 없이)
await call('POST', '/reports', 지원.accessToken, { targetUserId: 강한.id, targetKind: 'profile', reason: 'tracking', block: false });
console.log('신고 접수 → 친구 유지:', await isFriend());

// 처음 상태로
if (!wereFriends) await call('DELETE', `/friends/${강한.id}`, 지원.accessToken);
console.log('끝');
