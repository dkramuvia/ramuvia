import { describe, expect, it } from 'vitest';

/**
 * 옛 refresh token 이 다시 왔을 때 세션을 끊을지 판단하는 규칙.
 *
 * 09-17 에 실제로 겪은 문제입니다. 앱을 강제 종료하니 세션이 끊겨 로그아웃됐습니다.
 * 앱이 새 토큰을 저장하기 직전에 죽으면 다음 실행 때 옛 토큰을 보내게 되는데,
 * 그걸 토큰 탈취로 보고 세션을 끊었기 때문입니다.
 *
 * 위치를 알려야 하는 앱에서 조용한 로그아웃은 치명적이라, 같은 기기면 끊지 않습니다.
 */

/** session.service.ts refresh() 의 판단 부분과 같은 규칙 */
function decide(input: { isCurrent: boolean; isPrevious: boolean; inGrace: boolean; sameDevice: boolean }) {
  const { isCurrent, isPrevious, inGrace, sameDevice } = input;
  if (!isCurrent && !(isPrevious && (inGrace || sameDevice))) {
    return isPrevious ? 'revoke' : 'invalid';
  }
  return 'issue';
}

describe('refresh token 재사용 판단', () => {
  it('지금 쓰는 토큰이면 새 토큰을 내준다', () => {
    expect(decide({ isCurrent: true, isPrevious: false, inGrace: false, sameDevice: true })).toBe('issue');
  });

  it('유예 시간 안의 옛 토큰이면 내준다 (요청이 겹친 경우)', () => {
    expect(decide({ isCurrent: false, isPrevious: true, inGrace: true, sameDevice: false })).toBe('issue');
  });

  it('같은 기기의 옛 토큰이면 유예가 지나도 내준다 (앱이 저장 전에 죽은 경우)', () => {
    expect(decide({ isCurrent: false, isPrevious: true, inGrace: false, sameDevice: true })).toBe('issue');
  });

  it('다른 기기의 옛 토큰이면 세션을 끊는다 (토큰 탈취)', () => {
    expect(decide({ isCurrent: false, isPrevious: true, inGrace: false, sameDevice: false })).toBe('revoke');
  });

  it('기기 정보를 안 보내는 옛 앱은 유예 시간만 적용된다', () => {
    expect(decide({ isCurrent: false, isPrevious: true, inGrace: false, sameDevice: false })).toBe('revoke');
    expect(decide({ isCurrent: false, isPrevious: true, inGrace: true, sameDevice: false })).toBe('issue');
  });

  it('아예 모르는 토큰이면 세션을 끊지 않고 거절만 한다', () => {
    expect(decide({ isCurrent: false, isPrevious: false, inGrace: false, sameDevice: true })).toBe('invalid');
  });
});
