// 조회 모드 확인: 서버 한 대(3000번)를 띄운 상태에서
//   node scripts/check-watch-mode.mjs
// "누가 보고 있다 → 그만 본다" 신호가 정확히 한 번씩 가는지 봅니다
import { io } from 'socket.io-client';
const API='http://localhost:3000';
const post=async(path,body)=>{
  const r=await fetch(`${API}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const t=await r.text();
  if(!r.ok) throw new Error(`${path} ${r.status} ${t}`);
  return JSON.parse(t);
};
async function login(publicId){
  const device={installationId:`test-${publicId}-fixed`,platform:'android',model:'test'};
  let res=await post('/auth/dev-login',{publicId,device});
  // 새 기기는 문자 인증을 거칩니다 (개발 모드 고정 번호 123456)
  if(res.status==='device_verification_required'){
    await post('/auth/device-verification/send',{challengeId:res.challengeId});
    res=await post('/auth/device-verification/verify',{challengeId:res.challengeId,code:'123456'});
  }
  res.id=JSON.parse(Buffer.from(res.accessToken.split('.')[1],'base64url')).sub;
  return res;
}
const A=await login('26467878');           // 강한 (보는 사람)
const B=await login('26460002');           // 지원 (보여지는 사람)
console.log('로그인 OK  A=',A.id,' B=',B.id);

const sockB=io(API,{path:'/ws',transports:['websocket'],auth:{token:B.accessToken}});
const events=[];
sockB.on('watch-mode',(p)=>{events.push(p);console.log('  B 가 받은 watch-mode:',p);});
await new Promise(r=>sockB.on('ready',r));
console.log('B 연결 완료');

const sockA=io(API,{path:'/ws',transports:['websocket'],auth:{token:A.accessToken}});
await new Promise(r=>sockA.on('ready',r));
console.log('A 연결 완료');

sockA.emit('watch',{userIds:[B.id]});
await new Promise(r=>setTimeout(r,1500));
console.log('1) A 가 B 를 보기 시작 →', JSON.stringify(events));

// 서버가 "보는 사람 있음" 으로 판단하는지 Redis 장부로 확인
const { Redis } = await import('ioredis');
const { readFileSync }=await import('node:fs');
const url=/^REDIS_URL=(.+)$/m.exec(readFileSync(new URL('../.env',import.meta.url),'utf8'))[1].trim();
const redis=new Redis(url);
console.log('2) Redis 장부 인원:', await redis.zcard(`watch:${B.id}`));

sockA.emit('unwatch');
await new Promise(r=>setTimeout(r,1500));
console.log('3) A 가 보기를 끝냄 →', JSON.stringify(events));
console.log('4) Redis 장부 인원:', await redis.zcard(`watch:${B.id}`));

sockA.close(); sockB.close(); await redis.quit();
const ok = events.length===2 && events[0].on===true && events[1].on===false;
console.log(ok?'\n통과: 켜짐→꺼짐 신호가 정확히 한 번씩':'\n실패: '+JSON.stringify(events));
process.exit(ok?0:1);
