// 1:1 채팅 사진·읽음 확인 (보완 4.18)
//   서버를 띄운 상태에서  node scripts/check-chat-photo.mjs
// 지원이 강한과의 1:1 방에 사진을 보내면 메시지에 사진 주소가 붙는지,
// 강한이 방을 읽으면 지원 쪽 읽음 상태가 바뀌는지 봅니다.
import { call, login } from './dev-login.mjs';

const 지원 = await login('26460002');
const 강한 = await login('26467878');

const room = await call('POST', '/groups/direct', 지원.accessToken, { friendId: 강한.id });
console.log('1:1 방 →', room.id);

// 1x1 PNG
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const { targets } = await call('POST', '/gallery/upload-targets', 지원.accessToken, { files: [{ contentType: 'image/jpeg', bytes: png.length }] });
const put = await fetch(targets[0].uploadUrl, { method: 'PUT', headers: { 'Content-Type': targets[0].contentType }, body: png });
console.log('저장소에 올림 →', put.status);

const sent = await call('POST', `/chat/rooms/${room.id}/messages`, 지원.accessToken, {
  type: 'photo',
  assetId: targets[0].assetId,
  place: { latitude: 37.1, longitude: 127.07, address: '제부도', placeName: '제부도' },
});
console.log('사진 메시지 →', sent.type, sent.photo?.uri ? '주소 있음' : '주소 없음', sent.place?.placeName);
if (sent.type !== 'photo' || !sent.photo?.uri) throw new Error('사진 메시지에 주소가 없습니다');

// 다른 사람 파일로는 못 보냄
const stolen = await call('POST', `/chat/rooms/${room.id}/messages`, 강한.accessToken, { type: 'photo', assetId: targets[0].assetId }).catch((e) => e);
console.log('남의 사진으로 보내기 →', stolen instanceof Error ? '거절' : '통과(문제)');
if (!(stolen instanceof Error)) throw new Error('남의 사진으로 보낼 수 있습니다');

const before = await call('GET', `/chat/rooms/${room.id}/read-state`, 지원.accessToken);
await call('POST', `/chat/rooms/${room.id}/read`, 강한.accessToken);
const after = await call('GET', `/chat/rooms/${room.id}/read-state`, 지원.accessToken);
console.log('강한이 읽은 시각 →', before[0]?.lastReadAt, '→', after[0]?.lastReadAt);
const read = after[0]?.lastReadAt && after[0].lastReadAt >= sent.createdAt;
console.log(read ? '통과: 사진 보냄, 남의 사진 거절, 읽음 갱신' : '실패: 읽음이 갱신되지 않았습니다');
process.exit(read ? 0 : 1);
