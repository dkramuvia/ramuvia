import { describe, expect, it } from 'vitest';

/**
 * 큐에서 꺼낸 것을 언제 지우는지(ack) 판단하는 규칙 (GPS 보고서 4장).
 *
 * 이 규칙을 틀리면 위치가 소리 없이 사라집니다. 저장에 실패했는데 ack 해 버리면
 * 그 사람의 이동 기록이 통째로 비고, 아무도 알아차리지 못합니다.
 * 반대로 읽을 수 없는 항목을 계속 붙들고 있으면 그 뒤가 전부 막힙니다.
 */

type Outcome = 'saved' | 'failed' | 'broken';

/** location.worker.ts + location.queue.ts 의 판단과 같은 규칙 */
function shouldAck(outcome: Outcome): boolean {
  if (outcome === 'saved') return true;
  // 읽을 수 없는 항목은 다시 시도해도 실패합니다. 버리지 않으면 큐가 막힙니다
  if (outcome === 'broken') return true;
  // 저장 실패는 DB 가 잠깐 죽은 경우일 수 있으므로 큐에 남겨 다시 시도합니다
  return false;
}

describe('큐에서 지울지 판단', () => {
  it('저장에 성공하면 지운다', () => {
    expect(shouldAck('saved')).toBe(true);
  });

  it('저장에 실패하면 남겨서 다시 시도한다', () => {
    expect(shouldAck('failed')).toBe(false);
  });

  it('읽을 수 없는 항목은 버린다 (뒤가 막히지 않게)', () => {
    expect(shouldAck('broken')).toBe(true);
  });
});

/**
 * 여러 건을 한 번에 처리할 때, 실패한 건만 남기고 성공한 건만 지워야 합니다.
 * 통째로 지우면 실패한 것이 사라지고, 통째로 남기면 성공한 것이 두 번 저장됩니다
 * (두 번 저장은 onConflict 로 막히지만 쓸데없이 DB 를 두드립니다).
 */
function ackList(results: { id: string; outcome: Outcome }[]): string[] {
  return results.filter((r) => shouldAck(r.outcome)).map((r) => r.id);
}

describe('묶음 처리', () => {
  it('성공한 것만 지운다', () => {
    const acked = ackList([
      { id: '1-0', outcome: 'saved' },
      { id: '2-0', outcome: 'failed' },
      { id: '3-0', outcome: 'saved' },
    ]);
    expect(acked).toEqual(['1-0', '3-0']);
  });

  it('전부 실패하면 아무것도 지우지 않는다', () => {
    expect(ackList([{ id: '1-0', outcome: 'failed' }])).toEqual([]);
  });
});
