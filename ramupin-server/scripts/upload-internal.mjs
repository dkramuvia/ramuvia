// 앱 번들(AAB)을 플레이 콘솔 내부 테스트 트랙에 올립니다 (서비스 계정 ramupin-billing).
// 사용: node scripts/upload-internal.mjs <파일.aab> [출시 메모]
// 아직 한 번도 출시하지 않은 앱은 구글이 "초안" 으로만 받아 줍니다 → 콘솔에서 "출시 시작" 을 눌러야 테스터에게 갑니다
import { readFileSync, statSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const [file, note = '테스트 빌드'] = process.argv.slice(2);
if (!file) throw new Error('사용: node scripts/upload-internal.mjs <파일.aab> [출시 메모]');
const pkg = process.env.PLAY_PACKAGE_NAME ?? 'com.ramuviamanager.ramupin';
const auth = new GoogleAuth({ keyFile: process.env.PLAY_SERVICE_ACCOUNT_FILE ?? './secrets/play-billing.json', scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
const client = await auth.getClient();
const api = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`;

async function call(opts) {
  const res = await client.request({ ...opts, validateStatus: () => true });
  if (res.status >= 400) throw new Error(`${opts.method} ${opts.url} → ${res.status} ${JSON.stringify(res.data).slice(0, 500)}`);
  return res.data;
}

const edit = await call({ method: 'POST', url: `${api}/edits` });
console.log(`업로드 중 (${(statSync(file).size / 1024 / 1024).toFixed(1)}MB)...`);
const bundle = await call({
  method: 'POST',
  url: `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${pkg}/edits/${edit.id}/bundles?uploadType=media`,
  headers: { 'Content-Type': 'application/octet-stream' },
  body: readFileSync(file),
  timeout: 15 * 60_000,
});
console.log(`올림: versionCode ${bundle.versionCode}`);

async function release(status) {
  await call({
    method: 'PUT',
    url: `${api}/edits/${edit.id}/tracks/internal`,
    data: { track: 'internal', releases: [{ versionCodes: [String(bundle.versionCode)], status, releaseNotes: [{ language: 'ko-KR', text: note }] }] },
  });
  await call({ method: 'POST', url: `${api}/edits/${edit.id}:commit` });
}

try {
  await release('completed');
  console.log('내부 테스트에 출시했습니다');
} catch (error) {
  // 출시 전 앱: "Only releases with status draft may be created on draft app"
  if (!String(error).includes('draft')) throw error;
  await release('draft');
  console.log('초안으로 올렸습니다 → 플레이 콘솔 > 내부 테스트 에서 "출시 검토" / "출시 시작" 을 눌러 주세요');
}
