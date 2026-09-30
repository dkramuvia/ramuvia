// 문자(알리고) 연동 확인
//   node scripts/check-sms.mjs              키가 맞는지, 남은 건수가 얼마인지만 봅니다 (문자 안 감)
//   node scripts/check-sms.mjs 01012345678  그 번호로 인증번호 모양의 문자를 실제로 보냅니다
//
// 서버를 띄우지 않아도 됩니다. `.env` 를 직접 읽어 업체에 물어봅니다.
//
// 키는 화면에 찍지 않습니다. 로그가 남는 곳에서 돌릴 수 있기 때문입니다.
import { readFileSync } from 'node:fs';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const 값 = (이름) => (new RegExp(`^${이름}=(.*)$`, 'm').exec(envText)?.[1] ?? '').trim();

const provider = 값('SMS_PROVIDER') || 'dev';
const user_id = 값('ALIGO_USER_ID');
const key = 값('ALIGO_API_KEY');
const sender = 값('ALIGO_SENDER');
const testmode = 값('ALIGO_TEST_MODE') || 'N';

let 실패 = 0;
const 확인 = (라벨, 조건, 덧붙임 = '') => {
  console.log(`  ${조건 ? 'O' : 'X'} ${라벨}${덧붙임 ? ` — ${덧붙임}` : ''}`);
  if (!조건) 실패 += 1;
};

console.log('1. .env 값이 채워졌는가');
확인('ALIGO_USER_ID (알리고 아이디)', user_id.length > 0);
확인('ALIGO_API_KEY (발급키)', key.length > 0, key ? `${key.length}자` : '비어 있음');
확인('ALIGO_SENDER (사전 등록한 발신번호)', /^0\d{8,10}$/.test(sender.replace(/\D/g, '')), sender ? '' : '비어 있음');
// SMS_PROVIDER 는 실패로 세지 않습니다. 아직 dev 인 채로 "키가 맞는지" 만 보고 싶을 때가 있습니다
// (키 확인은 아래에서 업체에 직접 물어보므로 SMS_PROVIDER 와 상관이 없습니다)
if (provider !== 'aligo') console.log(`  ! SMS_PROVIDER 가 '${provider}' 입니다 — 앱에서는 아직 문자가 가지 않고 인증번호 123456 이 쓰입니다`);

if (실패 > 0) {
  console.log(`\n${실패}개 실패 — .env 를 채운 뒤 다시 돌려 주세요`);
  process.exit(1);
}

/** 알리고에 form 으로 물어봅니다 */
const 호출 = async (길, 더할것 = {}) => {
  const res = await fetch(`https://apis.aligo.in${길}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key, user_id, ...더할것 }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

console.log('\n2. 업체가 키를 받아 주는가 (문자 안 감)');
// 남은 건수 조회. 키가 틀리면 여기서 바로 막힙니다 — 문자를 보내 보지 않고도 알 수 있습니다
const 잔여 = await 호출('/remain/');
확인('키·아이디가 맞음', Number(잔여.result_code) === 1, 잔여.message ?? '');
if (Number(잔여.result_code) === -101) {
  // 알리고는 **키가 틀린 경우·아이디가 틀린 경우·IP 가 등록되지 않은 경우를 모두 같은 말로** 답합니다
  // (직접 확인했습니다 — 세 경우 다 "인증오류입니다."). 그래서 볼 곳을 여기에 적어 둡니다
  let ip = '확인 실패';
  try {
    const r = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(8000) });
    if (r.ok) ip = (await r.text()).trim();
  } catch {}
  console.log('');
  console.log('     알리고는 아래 세 가지를 모두 같은 "인증오류" 로 답해서 구분이 안 됩니다.');
  console.log('     관리자 화면에서 순서대로 봐 주세요:');
  console.log(`     1) 발송 가능 IP 목록에 이 PC 의 IP 가 있는지 — 지금 이 PC: ${ip}`);
  console.log('        등록 안 된 IP 에서는 보낼 수 없습니다. 서버로 옮기면 서버 IP 도 등록해야 합니다');
  console.log('     2) ALIGO_USER_ID 가 알리고 **로그인 아이디** 인지');
  console.log('     3) ALIGO_API_KEY 가 관리자 > 문자 API 의 **발급키** 인지 (다른 서비스 키 아님)');
}
if (Number(잔여.result_code) === 1) {
  console.log(`     남은 건수 — SMS ${잔여.SMS_CNT ?? '?'} · LMS ${잔여.LMS_CNT ?? '?'} · MMS ${잔여.MMS_CNT ?? '?'}`);
  확인('보낼 건수가 남아 있음', Number(잔여.SMS_CNT ?? 0) > 0, '0 이면 충전이 필요합니다');
}

const 받는번호 = process.argv[2]?.replace(/\D/g, '');
if (!받는번호) {
  console.log('\n실제로 보내 보려면 번호를 붙여 주세요:  node scripts/check-sms.mjs 01012345678');
} else {
  console.log(`\n3. 실제 발송 (${받는번호.slice(0, 3)}-****-${받는번호.slice(-4)})`);
  if (testmode === 'Y') console.log('     ALIGO_TEST_MODE=Y 라 요금은 안 나가지만 문자도 오지 않습니다');
  const 결과 = await 호출('/send/', {
    sender: sender.replace(/\D/g, ''),
    receiver: 받는번호,
    msg: '[라무핀] 인증번호 123456\n3분 안에 입력해 주세요.',
    msg_type: 'SMS',
    testmode_yn: testmode,
  });
  확인('업체가 받아들임', Number(결과.result_code) === 1, 결과.message ?? '');
  if (Number(결과.result_code) === 1) console.log(`     성공 ${결과.success_cnt} · 실패 ${결과.error_cnt}`);
}

console.log(실패 === 0 ? '\n모두 통과' : `\n${실패}개 실패`);
process.exitCode = 실패 === 0 ? 0 : 1;
