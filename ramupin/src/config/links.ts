/**
 * 앱 밖으로 나가는 주소를 한곳에 둡니다.
 *
 * 약관·처리방침은 홈페이지 한 페이지에 문서별 article 로 있고, 주소 뒤 #id 로 그 문서만 펼칩니다.
 * (예전 /privacy 주소는 302 로 호스팅 404 페이지에 가서 11-11 에 바꿨습니다.) 스토어 심사 전에 실제로 열리는 주소여야 합니다.
 */
export const LINKS = {
  policyPage: 'https://www.ramuvia.com/page/privacy.html',
  privacyPolicy: 'https://www.ramuvia.com/page/privacy.html#privacy',
  contactSite: 'https://www.ramuvia.com',
  contactEmail: 'privacy@ramuvia.com',
  /** 앱 문의 (피그마 v2.6 1117) */
  supportEmail: 'info@ramuvia.com',
} as const;
