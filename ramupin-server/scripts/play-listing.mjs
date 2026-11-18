// 플레이 스토어 등록 정보(제목·간단한 설명·자세한 설명·그래픽) 보기 / 올리기.
//   node scripts/play-listing.mjs                       보기
//   node scripts/play-listing.mjs --apply <폴더>         폴더 안 listing.json + 이미지로 바꿔서 저장
//
// <폴더> 구성
//   listing.json             { "language": "ko-KR", "title": "...", "shortDescription": "...", "fullDescription": "..." }
//   featureGraphic.png       1024×500 (필수)
//   phoneScreenshots/*.png   2~8장, 이름 순서대로 올림 (기존 휴대폰 스크린샷은 모두 지우고 새로)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleAuth } from 'google-auth-library';

const pkg = process.env.PLAY_PACKAGE_NAME ?? 'com.ramuviamanager.ramupin';
const auth = new GoogleAuth({ keyFile: process.env.PLAY_SERVICE_ACCOUNT_FILE ?? './secrets/play-billing.json', scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
const client = await auth.getClient();
const api = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`;
const upload = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${pkg}`;

const i = process.argv.indexOf('--apply');
const dir = i > 0 ? process.argv[i + 1] : null;

const { data: edit } = await client.request({ url: `${api}/edits`, method: 'POST' });
const e = `${api}/edits/${edit.id}`;

const { data: listings } = await client.request({ url: `${e}/listings` });
for (const l of listings.listings ?? []) {
  console.log(`[${l.language}] 제목: ${l.title}`);
  console.log(`  간단한 설명: ${l.shortDescription ?? ''}`);
  console.log(`  자세한 설명: ${(l.fullDescription ?? '').length}자`);
  for (const type of ['icon', 'featureGraphic', 'phoneScreenshots']) {
    const { data } = await client.request({ url: `${e}/listings/${l.language}/${type}` });
    console.log(`  ${type}: ${(data.images ?? []).length}장`);
  }
}

if (!dir) {
  await client.request({ url: e, method: 'DELETE' });
} else {
  const spec = JSON.parse(readFileSync(join(dir, 'listing.json'), 'utf8'));
  const lang = spec.language ?? 'ko-KR';
  await client.request({
    url: `${e}/listings/${lang}`,
    method: 'PUT',
    data: { language: lang, title: spec.title, shortDescription: spec.shortDescription, fullDescription: spec.fullDescription },
  });
  const put = (type, file) =>
    client.request({ url: `${upload}/edits/${edit.id}/listings/${lang}/${type}?uploadType=media`, method: 'POST', headers: { 'Content-Type': 'image/png' }, body: readFileSync(file) });
  if (existsSync(join(dir, 'featureGraphic.png'))) {
    await client.request({ url: `${e}/listings/${lang}/featureGraphic`, method: 'DELETE' });
    await put('featureGraphic', join(dir, 'featureGraphic.png'));
  }
  const shots = join(dir, 'phoneScreenshots');
  if (existsSync(shots)) {
    await client.request({ url: `${e}/listings/${lang}/phoneScreenshots`, method: 'DELETE' });
    for (const f of readdirSync(shots).filter((f) => f.endsWith('.png')).sort()) await put('phoneScreenshots', join(shots, f));
  }
  await client.request({ url: `${e}:commit`, method: 'POST' });
  console.log('저장함:', lang);
}
