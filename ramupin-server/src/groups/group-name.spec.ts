import { describe, expect, it } from 'vitest';

import { displayGroupName } from './group-name.js';

/**
 * 방 이름은 보는 사람마다 다릅니다.
 *
 * 09-21 에 갤러리에서 방 이름이 빈칸으로 나왔습니다. 1:1 방은 이름 없이 만들어지는데
 * 갤러리 조회가 그 규칙을 안 거쳤기 때문입니다. 쓰는 곳이 여러 군데라 규칙을 여기에 고정합니다.
 */

const me = 'me';
const 강한 = { id: 'a', nickname: '강한' };
const 지윤 = { id: 'b', nickname: '지윤' };
const 상원 = { id: 'c', nickname: '상원' };
const 지원 = { id: 'd', nickname: '지원' };
const 민수 = { id: 'e', nickname: '김민수' };

describe('방 이름 표시', () => {
  it('이름이 있으면 그대로', () => {
    expect(displayGroupName({ name: '가족방', members: [{ id: me, nickname: '나' }, 강한], viewerId: me })).toBe('가족방');
  });

  it('공백만 있는 이름은 없는 것으로 본다', () => {
    expect(displayGroupName({ name: '   ', members: [{ id: me, nickname: '나' }, 강한], viewerId: me })).toBe('강한');
  });

  it('1:1 방은 상대방 이름', () => {
    expect(displayGroupName({ name: '', members: [{ id: me, nickname: '나' }, 강한], viewerId: me })).toBe('강한');
  });

  it('보는 사람에 따라 이름이 달라진다', () => {
    const members = [{ id: me, nickname: '나' }, 강한];
    expect(displayGroupName({ name: '', members, viewerId: 'a' })).toBe('나');
  });

  it('여러 명이면 쉼표로 나열', () => {
    expect(displayGroupName({ name: '', members: [{ id: me, nickname: '나' }, 강한, 지윤], viewerId: me })).toBe('강한, 지윤');
  });

  it('네 명 이상이면 세 명까지만 쓰고 나머지는 "외 N명"', () => {
    const members = [{ id: me, nickname: '나' }, 강한, 지윤, 상원, 지원, 민수];
    expect(displayGroupName({ name: '', members, viewerId: me })).toBe('강한, 지윤, 상원 외 2명');
  });

  it('다 나가고 나만 남으면 "나"', () => {
    expect(displayGroupName({ name: '', members: [{ id: me, nickname: '나' }], viewerId: me })).toBe('나');
  });

  it('멤버 정보가 아예 없어도 빈칸을 내보내지 않는다', () => {
    expect(displayGroupName({ name: '', members: [], viewerId: me })).toBe('나');
  });
});
