// 서버 두 대 실시간 전달 확인 (WBS 7.5)
//   node dist/main.js  와  API_PORT=3001 node dist/main.js  를 둘 다 띄운 뒤
//   node scripts/check-two-servers.mjs
// 1번 서버에 붙은 사람이 2번 서버에 붙은 사람의 위치를 실시간으로 받는지 봅니다
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';

import { call, login } from './dev-login.mjs';
const S1='http://localhost:3000', S2='http://localhost:3001';
// 2번 서버가 떠 있어야 합니다
if (!(await fetch(S2 + '/health').then((r) => r.ok).catch(() => false))) {
  console.error(`2번 서버(${S2})가 없습니다. API_PORT=3001 node dist/main.js 로 띄운 뒤 다시 실행하세요`);
  process.exit(1);
}

const A=await login('26467878', S1);   // 보는 사람 → 1번 서버
const B=await login('26460002', S2);   // 보여지는 사람 → 2번 서버

const sockB=io(S2,{path:'/ws',transports:['websocket'],auth:{token:B.accessToken}});
const got=[]; const locs=[];
sockB.on('watch-mode',p=>{got.push(p);console.log('  [2번 서버의 B] watch-mode:',p);});
await new Promise(r=>sockB.on('ready',r));

const sockA=io(S1,{path:'/ws',transports:['websocket'],auth:{token:A.accessToken}});
sockA.on('friend-location',p=>{locs.push(p);console.log('  [1번 서버의 A] friend-location 수신');});
await new Promise(r=>sockA.on('ready',r));
console.log('A→1번 서버, B→2번 서버 연결 완료');

sockA.emit('watch',{userIds:[B.id]});
await new Promise(r=>setTimeout(r,1500));

// B 가 2번 서버로 위치를 올리면, 1번 서버에 붙은 A 에게 닿아야 합니다
const up=await fetch(S2+'/locations',{method:'POST',
  headers:{'content-type':'application/json',authorization:`Bearer ${B.accessToken}`},
  body:JSON.stringify({points:[{latitude:37.4763,longitude:126.8879,accuracy:10,battery:80,measuredAt:new Date().toISOString()}]})});
console.log('B 위치 업로드:',up.status);
await new Promise(r=>setTimeout(r,2500));

const { Redis }=await import('ioredis');
const redis=new Redis(/^REDIS_URL=(.+)$/m.exec(readFileSync(new URL('../.env',import.meta.url),'utf8'))[1].trim());
console.log('unwatch 직전 장부:',await redis.zcard(`watch:${B.id}`));
sockA.emit('unwatch');
await new Promise(r=>setTimeout(r,2000));
console.log('unwatch 직후 장부:',await redis.zcard(`watch:${B.id}`));
await redis.quit();
sockA.close(); sockB.close();

// 60초 심장박동으로 on:true 가 여러 번 올 수 있습니다 (폰 쪽 3분 만료를 막기 위한 것)
const okWatch = got.length>=2 && got[0].on===true && got.at(-1).on===false && got.slice(0,-1).every(e=>e.on===true);
const okLoc = locs.length>0;
console.log(`\n서버 A→B 조회 신호 전달: ${okWatch?'통과':'실패 '+JSON.stringify(got)}`);
console.log(`서버 넘어 위치 실시간 전달: ${okLoc?'통과':'실패 (0건)'}`);
process.exit(okWatch&&okLoc?0:1);
