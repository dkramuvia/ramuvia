/** 홈페이지 약관 페이지의 article id (www.ramuvia.com/page/privacy.html#<id>). 설정 › 약관 및 정책 목록 순서 */
export const LEGAL_DOCS = ['terms', 'location-terms', 'privacy', 'location-privacy', 'child', 'payment'] as const;
export type LegalDocId = (typeof LEGAL_DOCS)[number];
