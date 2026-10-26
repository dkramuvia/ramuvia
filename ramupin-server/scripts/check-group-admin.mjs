// 그룹 멤버 관리·그룹 설정 확인 (보완 4.19·4.20)
//   서버를 띄운 상태에서  node scripts/check-group-admin.mjs
import { call, login } from './dev-login.mjs';

const 지원 = await login('26460002');
const 강한 = await login('26467878');
const fails = [];
const expectFail = async (label, promise) => {
  const r = await promise.then(() => null).catch((e) => e);
  console.log(`${label} →`, r ? r.message.split(' ').slice(2, 4).join(' ') : '통과(문제)');
  if (!r) fails.push(label);
};

const group = await call('POST', '/groups', 지원.accessToken, { name: '관리 시험방', memberIds: [강한.id] });
console.log('그룹 →', group.name, '내 역할', group.myRole, '최대', group.memberLimit, '초대', group.invitePermission);

await call('PUT', `/groups/${group.id}/members/${강한.id}/role`, 지원.accessToken, { role: 'admin' });
await call('PUT', `/groups/${group.id}/settings`, 지원.accessToken, { invitePermission: 'admins', photoPermission: 'admins', defaultShareLevel: 'blurred' });
const g1 = await call('GET', `/groups/${group.id}`, 강한.accessToken);
console.log('강한 역할 →', g1.myRole, '/ 설정', g1.invitePermission, g1.photoPermission, g1.defaultShareLevel);
if (g1.myRole !== 'admin' || g1.defaultShareLevel !== 'blurred') fails.push('관리자 지정·설정');

await expectFail('방장이 넘기지 않고 나가기', call('DELETE', `/groups/${group.id}/members/me`, 지원.accessToken));
await expectFail('관리자가 방장 내보내기', call('DELETE', `/groups/${group.id}/members/${지원.id}`, 강한.accessToken));

await call('PUT', `/groups/${group.id}/owner`, 지원.accessToken, { userId: 강한.id });
const g2 = await call('GET', `/groups/${group.id}`, 지원.accessToken);
console.log('방장 넘긴 뒤 지원 역할 →', g2.myRole, '/ 방장', g2.ownerId === 강한.id ? '강한' : '?');
if (g2.myRole !== 'admin' || g2.ownerId !== 강한.id) fails.push('방장 넘기기');

const link1 = await call('POST', `/groups/${group.id}/invite-link`, 강한.accessToken, { days: 1 });
const link2 = await call('POST', `/groups/${group.id}/invite-link`, 강한.accessToken, { days: 30, renew: true });
await expectFail('새 링크 뒤 옛 링크 열기', call('GET', `/groups/invites/${link1.token}`, 지원.accessToken));
const days = Math.round((new Date(link2.expiresAt) - Date.now()) / 86_400_000);
console.log('새 링크 유효기간 →', days, '일');
await call('DELETE', `/groups/${group.id}/invite-link`, 강한.accessToken);
const current = await call('GET', `/groups/${group.id}/invite-link`, 강한.accessToken);
console.log('링크 끈 뒤 →', current);
if (current) fails.push('링크 끄기');

await call('DELETE', `/groups/${group.id}/members/${지원.id}`, 강한.accessToken);
await expectFail('내보낸 사람이 그룹 보기', call('GET', `/groups/${group.id}`, 지원.accessToken));

await call('DELETE', `/groups/${group.id}`, 강한.accessToken);
await expectFail('삭제한 그룹 보기', call('GET', `/groups/${group.id}`, 강한.accessToken));

console.log(fails.length ? `\n실패: ${fails.join(', ')}` : '\n통과: 관리자 지정, 설정, 방장 넘기기, 링크 새로 만들기·끄기, 내보내기, 삭제');
process.exit(fails.length ? 1 : 0);
