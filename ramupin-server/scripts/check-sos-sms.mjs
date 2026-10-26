// SOS 비회원 문자 확인 (보완 4.4~4.6, C1·C8)
//   서버를 띄운 상태에서  node scripts/check-sos-sms.mjs
// 비회원 연락처를 저장하고 SOS 를 보내면, 서버가 문자를 보내고 결과 화면용 전달 상태가 "전송됨" 이 되는지 봅니다.
// SMS_PROVIDER=dev 면 실제 문자는 가지 않고 서버 로그에만 남습니다.
import { call, login, wait } from './dev-login.mjs';

const 지원 = await login('26460002'); // SOS 를 누르는 사람

// 1) 안전 설정: 비회원 연락처 둘, 긴급전화, 문자 켬
await call('PUT', '/me/safety', 지원.accessToken, {
  sosEnabled: true,
  recipientFriendIds: [],
  recipientGroupIds: [],
  contacts: [
    { name: '엄마', phone: '010-2222-5678' },
    { name: '아빠', phone: '010-3333-5678' },
  ],
  emergencyName: 'Emergency',
  emergencyNumber: '112',
  smsEnabled: true,
  recordEnabled: false,
  longPressStart: true,
});
const safety = await call('GET', '/me/safety', 지원.accessToken);
console.log('안전 설정 →', JSON.stringify({ ...safety, contacts: safety.contacts.map((c) => `${c.name} ${c.maskedPhone}`) }));
if (safety.contacts.length !== 2) throw new Error('연락처가 저장되지 않았습니다');
if (safety.emergencyNumber !== '112' || safety.recordEnabled !== false) throw new Error('긴급전화·녹음 설정이 저장되지 않았습니다');

// 2) 국내 휴대폰 번호가 아니면 거절
const bad = await fetch(`${process.env.RAMUPIN_API ?? 'http://localhost:3000'}/me/safety`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${지원.accessToken}` },
  body: JSON.stringify({ sosEnabled: true, contacts: [{ name: '사무실', phone: '031-000-0000' }] }),
});
console.log('유선 번호 저장 →', bad.status);
if (bad.status !== 400) throw new Error('유선 번호가 저장되면 안 됩니다');

// 3) SOS
const sent = await call('POST', '/sos', 지원.accessToken, {
  startedAt: new Date().toISOString(),
  place: { placeName: null, address: '경기도 오산시 가수동 39-222', latitude: 37.1499, longitude: 127.0773 },
});
console.log('SOS 보냄 →', JSON.stringify(sent));

await wait(1500);
const d = await call('GET', `/sos/${sent.sosId}/deliveries`, 지원.accessToken);
console.log('전달 상태 →');
for (const s of d.sms) console.log(`  문자 ${s.name} ${s.maskedPhone}: ${s.status}${s.reason ? ` (${s.reason})` : ''}`);
for (const a of d.app) console.log(`  앱 ${a.nickname}: ${a.readAt ? `확인함 ${a.readAt}` : '안 읽음'}`);

await call('POST', `/sos/${sent.sosId}/resolve`, 지원.accessToken);

// 원래대로 (연락처 지움, 녹음 켬)
await call('PUT', '/me/safety', 지원.accessToken, { sosEnabled: true, contacts: [], recordEnabled: true });
console.log('끝 — 설정을 되돌렸습니다');
