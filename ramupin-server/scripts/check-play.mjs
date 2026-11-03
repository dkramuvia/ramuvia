// 구글 플레이 결제 API 연결 확인: 서비스 계정 키로 등록된 구독 상품 목록을 불러옵니다
// 사용: node scripts/check-play.mjs
import { GoogleAuth } from 'google-auth-library';

const pkg = process.env.PLAY_PACKAGE_NAME ?? 'com.ramuviamanager.ramupin';
const auth = new GoogleAuth({ keyFile: process.env.PLAY_SERVICE_ACCOUNT_FILE ?? './secrets/play-billing.json', scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
const client = await auth.getClient();
const res = await client.request({ url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/subscriptions`, validateStatus: () => true });
console.log(res.status, JSON.stringify(res.data).slice(0, 500));
