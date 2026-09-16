// 개발용: 시드 친구들이 가산디지털단지 근처를 움직이는 것처럼 위치를 서버로 보냅니다.
// 앱과 똑같이 개발용 로그인 → POST /locations 경로를 사용하므로 서버 전체 흐름을 확인할 수 있습니다.
//   npm run dev:simulate            (10초마다 계속 전송, Ctrl+C 로 종료)
//   npm run dev:simulate -- --once  (한 번만 전송)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (process.env.NODE_ENV === 'production') throw new Error('운영 환경에서는 실행하지 않습니다');

const API = process.env.SIMULATE_API_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? 3000}`;
const INTERVAL_MS = 10_000;
const once = process.argv.includes('--once');

// 친구마다 출발점과 움직임 (speed m/s, 0 이면 제자리)
const friends = [
  { publicId: '26460001', name: 'RamuVia001', start: [37.4812, 126.8822], speed: 1.3, heading: 45, battery: 82 },
  { publicId: '26460002', name: '지원', start: [37.4769, 126.8791], speed: 11, heading: 120, battery: 67 },
  { publicId: '26460003', name: '상원', start: [37.4843, 126.8953], speed: 0, heading: 0, battery: 35 },
  { publicId: '26460004', name: '지윤002', start: [37.4751, 126.8847], speed: 1.1, heading: 300, battery: 15 },
  { publicId: '26460005', name: 'caramel001', start: [37.4798, 126.8741], speed: 4, heading: 200, battery: 90 },
];

async function request(path, init) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers } });
  if (!res.ok) {
    const error = new Error(`${init.method} ${path} → ${res.status} ${await res.text()}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

// 가상 기기의 기기 키를 보관 (기기 1대 로그인 규칙: 키가 맞아야 문자 인증 없이 로그인). git 에 올리지 않음
const KEYS_FILE = new URL('./.simulator-device-keys.json', import.meta.url);
const deviceKeys = existsSync(KEYS_FILE) ? JSON.parse(readFileSync(KEYS_FILE, 'utf8')) : {};

async function login(f) {
  const device = { installationId: `simulator-${f.publicId}`, platform: 'android', model: 'simulator', deviceKey: deviceKeys[f.publicId] };
  let result = await request('/auth/dev-login', { method: 'POST', body: JSON.stringify({ publicId: f.publicId, device }) });
  if (result.status === 'device_verification_required') {
    // 다른 기기(폰 등)로 로그인했던 계정이면 개발용 인증번호(123456)로 이 가상 기기를 인증
    await request('/auth/device-verification/send', { method: 'POST', body: JSON.stringify({ challengeId: result.challengeId }) });
    result = await request('/auth/device-verification/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId: result.challengeId, code: '123456' }),
    });
  }
  f.token = result.accessToken;
  f.refreshToken = result.refreshToken;
  deviceKeys[f.publicId] = result.deviceKey;
  writeFileSync(KEYS_FILE, JSON.stringify(deviceKeys, null, 2));
}

for (const f of friends) {
  await login(f);
  [f.lat, f.lng] = f.start;
}

/** access token 이 만료되면 refresh, 세션이 끊겼으면 다시 로그인 */
async function upload(f, point) {
  const send = () =>
    request('/locations', { method: 'POST', headers: { authorization: `Bearer ${f.token}` }, body: JSON.stringify({ points: [point] }) });
  try {
    return await send();
  } catch (error) {
    if (error.status !== 401) throw error;
    try {
      const tokens = await request('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: f.refreshToken }) });
      f.token = tokens.accessToken;
      f.refreshToken = tokens.refreshToken;
    } catch {
      await login(f);
    }
    return send();
  }
}

const M_PER_DEG_LAT = 111_320;

async function tick() {
  const now = new Date().toISOString();
  const results = await Promise.all(
    friends.map(async (f) => {
      if (f.speed > 0) {
        // 조금씩 방향을 틀면서 이동, 출발점에서 800m 넘게 멀어지면 되돌아옴
        f.heading = (f.heading + (Math.random() - 0.5) * 30 + 360) % 360;
        const dist = f.speed * (INTERVAL_MS / 1000);
        const rad = (f.heading * Math.PI) / 180;
        f.lat += (dist * Math.cos(rad)) / M_PER_DEG_LAT;
        f.lng += (dist * Math.sin(rad)) / (M_PER_DEG_LAT * Math.cos((f.lat * Math.PI) / 180));
        const away = Math.hypot((f.lat - f.start[0]) * M_PER_DEG_LAT, (f.lng - f.start[1]) * M_PER_DEG_LAT * 0.79);
        if (away > 800) f.heading = (f.heading + 180) % 360;
      }
      const point = {
        latitude: f.lat,
        longitude: f.lng,
        measuredAt: now,
        accuracy: 8 + Math.random() * 10,
        speed: f.speed > 0 ? f.speed : 0,
        heading: f.speed > 0 ? f.heading : null,
        provider: 'simulated',
        battery: f.battery,
        state: f.speed > 0 ? 'moving' : 'still',
      };
      const { saved } = await upload(f, point);
      return `${f.name}(${saved})`;
    }),
  );
  console.log(`[${now}] ${results.join(' ')}`);
}

await tick();
if (!once) setInterval(() => tick().catch((e) => console.error(String(e))), INTERVAL_MS);
