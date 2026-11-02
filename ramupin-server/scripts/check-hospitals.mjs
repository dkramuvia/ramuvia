// 지도 영역 병원 조회 확인 (hospitals.module.ts). node scripts/check-hospitals.mjs
import { call, login } from './dev-login.mjs';

const { accessToken: token } = await login(process.env.RAMUPIN_PUBLIC_ID ?? '26467878');
const box = (lat, lng, dLat, dLng) => `south=${lat - dLat / 2}&west=${lng - dLng / 2}&north=${lat + dLat / 2}&east=${lng + dLng / 2}`;

// 앱 첫 화면 정도 (강남역, 위도 범위 0.012)
const near = await call('GET', `/hospitals?${box(37.4979, 127.0276, 0.012, 0.006)}`, token);
console.log('강남역 확대:', near.hospitals.length, '곳 / 묶음', near.clusters.length, '→', near.hospitals.slice(0, 3).map((h) => `${h.name}(${h.kind})`).join(', '));

// 서울 전체가 보일 만큼 축소
const wide = await call('GET', `/hospitals?${box(37.55, 126.99, 0.3, 0.2)}`, token);
console.log('서울 축소:', wide.hospitals.length, '곳 / 묶음', wide.clusters.length, '개, 합계', wide.clusters.reduce((a, c) => a + c.count, 0));

// 시골 (영월)
const rural = await call('GET', `/hospitals?${box(37.18, 128.46, 0.05, 0.03)}`, token);
console.log('영월 읍내:', rural.hospitals.length, '곳 / 묶음', rural.clusters.length);

// 잘못된 영역은 거절
try {
  await call('GET', '/hospitals?south=30&west=120&north=40&east=135', token);
  console.log('너무 넓은 영역: 거절 안 됨 (오류)');
} catch (e) {
  console.log('너무 넓은 영역: 거절됨', String(e.message).slice(0, 40));
}
