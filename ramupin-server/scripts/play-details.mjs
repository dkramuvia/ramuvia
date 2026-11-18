// 플레이 스토어 '연락처 정보'(개발자 웹사이트·이메일·전화) 보기 / 웹사이트 바꾸기.
//   node scripts/play-details.mjs                 보기
//   node scripts/play-details.mjs --website <url> 웹사이트만 바꿔서 저장 (AdMob app-ads.txt 가 이 도메인에서 찾음)
import { GoogleAuth } from 'google-auth-library';

const pkg = process.env.PLAY_PACKAGE_NAME ?? 'com.ramuviamanager.ramupin';
const auth = new GoogleAuth({ keyFile: process.env.PLAY_SERVICE_ACCOUNT_FILE ?? './secrets/play-billing.json', scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
const client = await auth.getClient();
const api = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`;

const i = process.argv.indexOf('--website');
const website = i > 0 ? process.argv[i + 1] : null;

const { data: edit } = await client.request({ url: `${api}/edits`, method: 'POST' });
const { data: details } = await client.request({ url: `${api}/edits/${edit.id}/details` });
console.log('지금:', JSON.stringify({ contactWebsite: details.contactWebsite ?? '', hasEmail: !!details.contactEmail, hasPhone: !!details.contactPhone, defaultLanguage: details.defaultLanguage }));

if (!website) {
  await client.request({ url: `${api}/edits/${edit.id}`, method: 'DELETE' });
} else {
  await client.request({ url: `${api}/edits/${edit.id}/details`, method: 'PATCH', data: { contactWebsite: website } });
  await client.request({ url: `${api}/edits/${edit.id}:commit`, method: 'POST' });
  console.log('바꿈:', website);
}
