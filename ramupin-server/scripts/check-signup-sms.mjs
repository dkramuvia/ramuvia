// 가입 흐름에서 실제 인증번호가 문자로 오는지 확인 (WBS 3.7)
//
//   1) 보내기   node scripts/check-signup-sms.mjs
//   2) 받은 번호로 확인
//              node scripts/check-signup-sms.mjs --code 123456
//
// **`.env` 를 고치지 않습니다.** 환경변수가 `.env` 를 이기므로, 이 스크립트가
// `SMS_PROVIDER=aligo` 로 **따로 서버를 띄웁니다** (기본 3001번). 개발용으로 이미
// 3000번에 떠 있는 서버는 그대로 두고, 확인 스크립트 13개도 계속 dev 로 돌아갑니다.
//
// 받는 번호는 `ALIGO_ALLOW_NUMBERS` 의 첫 번호입니다. 번호를 명령줄에 적지 않습니다.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
/**
 * `.env` 에서 값을 읽습니다.
 *
 * **같은 키가 여러 줄 있으면 마지막 줄이 이깁니다** — Node 의 `--env-file` 과 같게 맞춥니다.
 * 첫 줄을 읽으면 서버가 쓰는 값과 달라져서, 통과했다고 해 놓고 실제로는 다른 설정으로
 * 돌아가게 됩니다 (2026-09-30 에 SMS_PROVIDER 가 두 줄이라 이걸로 헛짚었습니다).
 */
const 값 = (이름) => {
  const 모두 = [...envText.matchAll(new RegExp(`^${이름}=(.*)$`, 'gm'))];
  if (모두.length > 1) console.log(`  ! .env 에 ${이름} 가 ${모두.length}줄 있습니다 — 마지막 줄을 씁니다`);
  return (모두.at(-1)?.[1] ?? '').trim();
};

const PORT = Number(process.env.CHECK_PORT ?? 3001);
const BASE = `http://127.0.0.1:${PORT}`;
// 1단계에서 받은 가입 토큰을 2단계로 넘깁니다. 문자가 손에 오기까지 시간이 걸리므로
// 한 번에 못 하고 두 번 나눠 돌립니다
const 보관 = join(tmpdir(), 'ramupin-check-signup.json');

let 실패 = 0;
const 확인 = (라벨, 조건, 덧붙임 = '') => {
  console.log(`  ${조건 ? 'O' : 'X'} ${라벨}${덧붙임 ? ` — ${덧붙임}` : ''}`);
  if (!조건) 실패 += 1;
};

const 가림 = (n) => `${n.slice(0, 3)}-****-${n.slice(-4)}`;

const call = async (길, body) => {
  const res = await fetch(BASE + 길, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
};

/** 프로세스 트리째 내립니다 (윈도우는 자식의 자식이 남습니다) */
function 내리기(child) {
  if (child.exitCode != null || child.pid == null) return;
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill();
}

/** SMS_PROVIDER=aligo 로 서버를 따로 띄웁니다. 끝나면 반드시 내립니다 */
async function 서버띄우기() {
  const child = spawn('npm', ['run', 'start:dev'], {
    cwd: dirname(dirname(fileURLToPath(import.meta.url))),
    env: { ...process.env, SMS_PROVIDER: 'aligo', API_PORT: String(PORT) },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const 로그 = [];
  const 모으기 = (buf) => 로그.push(String(buf));
  child.stdout.on('data', 모으기);
  child.stderr.on('data', 모으기);

  // 뜰 때까지 기다립니다. 뜨지 못하면 로그를 보여 줍니다 (조용히 실패하면 원인을 못 찾습니다)
  const 시작 = Date.now();
  while (Date.now() - 시작 < 90_000) {
    try {
      const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return { child, 로그 };
    } catch {}
    if (child.exitCode != null) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  내리기(child);
  console.log(로그.join('').slice(-2000));
  throw new Error(`서버가 ${PORT}번에 뜨지 않았습니다`);
}

const 보낼까 = !process.argv.includes('--code');
const 받은코드 = process.argv[process.argv.indexOf('--code') + 1];

const 허용 = 값('ALIGO_ALLOW_NUMBERS')
  .split(',')
  .map((n) => n.replace(/\D/g, ''))
  .filter((n) => n.length > 0);

if (보낼까 && 허용.length === 0) {
  console.log('X ALIGO_ALLOW_NUMBERS 가 비어 있습니다 — .env 에 문자를 받을 번호를 적어 주세요');
  process.exitCode = 1;
} else {
  const { child, 로그 } = await 서버띄우기();
  try {
    if (보낼까) {
      const 번호 = 허용[0];
      console.log(`1. 가입 시작 (SMS_PROVIDER=aligo · ${PORT}번)`);
      const 시작 = await call('/auth/dev-sign-up-token', { providerUserId: `check-${Date.now()}`, nickname: '문자시험' });
      확인('가입 토큰 발급', 시작.status === 200 && typeof 시작.json.signUpToken === 'string', `HTTP ${시작.status}`);
      const signUpToken = 시작.json.signUpToken;

      console.log(`\n2. 번호 받아 인증번호 발송 (${가림(번호)})`);
      const 발송 = await call('/auth/sign-up/sms', { signUpToken, phone: 번호 });
      확인('발송 요청 성공', 발송.status === 200, `HTTP ${발송.status} ${JSON.stringify(발송.json).slice(0, 160)}`);
      확인('이미 가입된 번호가 아님', 발송.json.alreadyRegistered === false, 발송.json.alreadyRegistered ? '이 번호는 이미 회원입니다 — 다른 번호로 시험해 주세요' : '');
      확인('가린 번호를 돌려줌', typeof 발송.json.phoneMasked === 'string', 발송.json.phoneMasked ?? '');
      확인('유효시간이 있음', Number(발송.json.codeExpiresInSec) > 0, `${발송.json.codeExpiresInSec}초`);

      // 서버 로그에 **인증번호가 찍히지 않아야** 합니다. 찍히면 로그를 본 사람이 남의 계정을 가입시킬 수 있습니다
      const 합친로그 = 로그.join('');
      확인('서버 로그에 인증번호가 없음', !/인증번호 \d{6}/.test(합친로그));
      확인('서버 로그에 번호 원문이 없음', !합친로그.includes(번호));

      if (발송.status === 200 && 발송.json.alreadyRegistered === false) {
        writeFileSync(보관, JSON.stringify({ signUpToken, 번호, 때: new Date().toISOString() }));
        console.log(`\n문자를 확인하고, 받은 6자리로 다시 돌려 주세요:`);
        console.log(`  node scripts/check-signup-sms.mjs --code 123456`);
        console.log(`  유효시간 ${발송.json.codeExpiresInSec}초 — 지나면 이 스크립트를 처음부터 다시 돌리세요`);
      }
    } else {
      if (!/^\d{6}$/.test(받은코드 ?? '')) throw new Error('--code 뒤에 받은 6자리를 적어 주세요');
      const { signUpToken } = JSON.parse(readFileSync(보관, 'utf8'));

      console.log('3. 받은 인증번호로 확인');
      const 확인결과 = await call('/auth/sign-up/sms/verify', { signUpToken, code: 받은코드 });
      확인('인증 통과', 확인결과.status === 200, `HTTP ${확인결과.status} ${JSON.stringify(확인결과.json).slice(0, 160)}`);

      console.log('\n4. 틀린 번호는 막는가');
      const 틀린것 = String((Number(받은코드) + 1) % 1_000_000).padStart(6, '0');
      const 틀림 = await call('/auth/sign-up/sms/verify', { signUpToken, code: 틀린것 });
      확인('틀린 번호는 거절', 틀림.status >= 400, `HTTP ${틀림.status}`);
    }
  } finally {
    // 띄운 서버는 반드시 내립니다. 남겨 두면 그 번호 포트가 물려 다음 실행이 실패합니다.
    // 윈도우에서 child.kill() 은 npm 껍데기만 죽이고 그 아래 nest·node 는 남습니다 —
    // 그래서 트리째 죽입니다 (한 번 이걸로 서버가 떠 있는 채 스크립트가 멈췄습니다)
    내리기(child);
  }
  console.log(실패 === 0 ? '\n모두 통과' : `\n${실패}개 실패`);
  process.exitCode = 실패 === 0 ? 0 : 1;
}
