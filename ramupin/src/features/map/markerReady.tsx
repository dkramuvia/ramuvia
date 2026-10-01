import { createContext, useContext, type ReactNode } from 'react';

/**
 * 마커 안의 그림이 다 떴다고 알리는 통로.
 *
 * 마커 내용(`children`)은 화면 쪽에서 만들어 넘기기 때문에, 그림이 언제 떴는지
 * 마커가 알 길이 없습니다. 중간에 끼우는 값으로 전달합니다.
 *
 * 지도 밖에서 같은 컴포넌트를 쓸 때는 아무 일도 하지 않습니다 (기본값이 빈 함수).
 */
const MarkerReadyContext = createContext<() => void>(() => {});

export function MarkerReadyProvider({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  return <MarkerReadyContext.Provider value={onReady}>{children}</MarkerReadyContext.Provider>;
}

/** 그림이 떴을 때(또는 실패했을 때) 부르면 됩니다 */
export function useMarkerReady(): () => void {
  return useContext(MarkerReadyContext);
}
