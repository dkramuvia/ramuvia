// 문자(알리고) 연동 확인
//   node scripts/check-sms.mjs         키가 맞는지, 남은 건수가 얼마인지만 봅니다 (문자 안 감)
//   node scripts/check-sms.mjs --send         ALIGO_ALLOW_NUMBERS 의 첫 번호로 보냅니다
//   node scripts/check-sms.mjs --send --real  이번 한 번만 테스트 모드를 끄고 진짜로 보냅니다
//
// 서버를 띄우지 않아도 됩니다. `.env` 를 직접 읽어 업체에 물어봅니다.
//
// **번호를 명령줄에 적지 않습니다.** `.env` 에서 읽습니다.
// 명령줄에 적으면 셸 기록과 화면에 남고, 그 화면을 남에게 보여 주게 됩니다.
// 같은 이유로 키도, 번호 원문도 찍지 않습니다 (010-****-5678 로 가립니다).
import { readFileSync } from 'node:fs';

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
if (Number(잔여.result_code) < 0) {
  // 알리고 응답을 직접 찔러 보고 알아낸 뜻입니다. 화면 메시지만으로는 헷갈립니다
  //   -101 "인증오류입니다."      아이디가 그런 계정이 없음
  //   -101 "인증오류입니다.-IP"   아이디·키는 맞고 **보내는 IP 가 등록되지 않음**
  //   -102 "API 인증오류입니다."  계정은 있는데 문자 API 를 쓸 수 없는 상태
  const 메시지 = String(잔여.message ?? '');
  console.log('');
  if (메시지.includes('-IP')) {
    let ip = '확인 실패';
    try {
      const r = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(8000) });
      if (r.ok) ip = (await r.text()).trim();
    } catch {}
    console.log('     아이디와 발급키는 맞습니다. **보내는 IP 가 등록되지 않았습니다.**');
    console.log(`     알리고 관리자 > 발송 가능 IP 에 이 주소를 넣어 주세요 — ${ip}`);
    console.log('     서버로 옮기면 서버 IP 도 넣어야 하고, 회선이 바뀌면 다시 막힙니다');
  } else if (Number(잔여.result_code) === -102) {
    console.log('     계정은 찾았는데 문자 API 를 쓸 수 없는 상태입니다.');
    console.log('     알리고 관리자 > 문자 API 에서 사용 신청·발급키를 확인해 주세요');
  } else {
    console.log('     ALIGO_USER_ID 가 알리고 **로그인 아이디** 인지 봐 주세요 (그런 계정이 없다는 답입니다).');
    console.log('     발급키는 관리자 > 문자 API 의 것이어야 합니다 (다른 서비스 키 아님)');
  }
}
if (Number(잔여.result_code) === 1) {
  console.log(`     남은 건수 — SMS ${잔여.SMS_CNT ?? '?'} · LMS ${잔여.LMS_CNT ?? '?'} · MMS ${잔여.MMS_CNT ?? '?'}`);
  확인('보낼 건수가 남아 있음', Number(잔여.SMS_CNT ?? 0) > 0, '0 이면 충전이 필요합니다');
}

const 보낼까 = process.argv.includes('--send');
// 개발 중 문자를 받아도 되는 번호. 서버도 같은 값을 보고 판단합니다 (src/auth/sms.service.ts)
const 허용 = 값('ALIGO_ALLOW_NUMBERS')
  .split(',')
  .map((n) => n.replace(/\D/g, ''))
  .filter((n) => n.length > 0);
const 받는번호 = 보낼까 ? 허용[0] : undefined;

if (!보낼까) {
  console.log('\n실제로 보내 보려면:  node scripts/check-sms.mjs --send');
  console.log('  (ALIGO_ALLOW_NUMBERS 의 첫 번호로 갑니다. 번호는 .env 에만 적으세요)');
} else if (!받는번호) {
  확인('ALIGO_ALLOW_NUMBERS 에 번호가 있음', false, '.env 에 받을 번호를 적어 주세요');
} else {
  console.log(`\n3. 실제 발송 (${받는번호.slice(0, 3)}-****-${받는번호.slice(-4)})`);
  // --real 은 .env 를 고치지 않고 이번 한 번만 실제로 보냅니다.
  // 받는 번호는 여전히 ALIGO_ALLOW_NUMBERS 안에서만 고르므로 엉뚱한 사람에게 갈 일은 없습니다
  const 이번모드 = process.argv.includes('--real') ? 'N' : testmode;
  if (이번모드 === 'Y') console.log('     테스트 모드 — 요금은 안 나가지만 문자도 오지 않습니다 (--real 을 붙이면 진짜로 갑니다)');
  else console.log('     실제 발송입니다 — 문자가 가고 1건 차감됩니다');
  const 결과 = await 호출('/send/', {
    sender: sender.replace(/\D/g, ''),
    receiver: 받는번호,
    msg: '[라무핀] 인증번호 123456\n3분 안에 입력해 주세요.',
    msg_type: 'SMS',
    testmode_yn: 이번모드,
  });
  확인('업체가 받아들임', Number(결과.result_code) === 1, 결과.message ?? '');
  if (String(결과.message ?? '').includes('발신번호')) {
    // 키·IP 와는 다른 문제입니다. 보내는 쪽 번호를 미리 등록해야 합니다 (전기통신사업법)
    console.log('');
    console.log('     ALIGO_SENDER 번호가 알리고에 등록되어 있지 않습니다.');
    console.log('     알리고 관리자 > 발신번호 사전등록 에서 그 번호를 등록해 주세요.');
    console.log('     통신서비스 이용증명원 같은 서류가 필요하고, 승인까지 시간이 걸립니다.');
    console.log('     이미 등록해 둔 다른 번호가 있으면 ALIGO_SENDER 를 그 번호로 바꿔도 됩니다');
  }
  if (Number(결과.result_code) === 1) console.log(`     성공 ${결과.success_cnt} · 실패 ${결과.error_cnt}`);
}

console.log(실패 === 0 ? '\n모두 통과' : `\n${실패}개 실패`);
process.exitCode = 실패 === 0 ? 0 : 1;
