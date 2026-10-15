/**
 * 앱으로 들어오는 주소를 화면 이동 전에 거릅니다 (expo-router `+native-intent`).
 *
 * **소셜 로그인이 끝나고 돌아오는 주소는 화면이 아닙니다.**
 * 구글(`com.googleusercontent.apps.…:/oauth`), X(`ramupin://x-auth`), 네이버(`ramupin://naver-auth`), 페이스북(`ramupin://facebook-auth`)은
 * 로그인 창(expo-web-browser)이 받아 코드를 꺼내 쓰는 주소입니다. 라우터도 같은 주소로 화면을 찾다가
 * 없는 화면이라 "Unmatched Route" 가 잠깐 떴습니다 (10-13 구글 로그인 시험에서 확인).
 *
 * 빈 값을 돌려주면 라우터만 이동하지 않고, 로그인 창은 원래 주소를 그대로 받습니다
 * (expo-router linking.js 는 결과가 비면 이동을 건너뜀).
 */
const AUTH_RETURN = [/^com\.googleusercontent\.apps\.[^:]+:\/oauth/i, /^ramupin:\/\/(x-auth|naver-auth|facebook-auth)\b/i];

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    if (typeof path === 'string' && AUTH_RETURN.some((pattern) => pattern.test(path))) return null;
    return path;
  } catch {
    return path;
  }
}
