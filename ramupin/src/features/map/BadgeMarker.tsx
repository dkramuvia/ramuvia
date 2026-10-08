import { PIN } from './PinMarker';
import { BADGE_GEOMETRY, StatusBadge } from './StatusBadge';
import type { MovementStatus } from './statusText';

/**
 * 핀 **위에 뜨는 상태 배지** (피그마 지도 메인 548·550, 2026-10-07).
 *
 * 캐릭터는 그림 파일로 올리고(`markerAvatars.ts`), 글자인 배지는 뷰 그대로 둡니다 —
 * 지도가 뷰를 구울 때 **글자는 잘 들어가고 그림만 빠지기** 때문입니다.
 * 그래서 사람 한 명에 마커가 둘입니다: 핀 하나, 배지 하나.
 *
 * **위로 띄우는 거리는 anchor 로 줍니다** (마커의 `lift`). 처음에는 배지 아래에 투명한
 * 빈 자리를 두고 그 바닥을 좌표에 맞췄는데, 배지 문구가 1분마다 바뀌어 다시 구울 때
 * **빈 자리가 빠진 채로 구워져** 배지가 핀을 덮었습니다 (2026-10-07 폰에서 확인).
 * 그래서 배지 모양만 굽고, 그려진 높이를 재서 anchor 를 계산합니다 (TrackedMarker).
 */

/** 좌표(핀 꼬리 끝)에서 배지 아래쪽까지 */
export const BADGE_BOTTOM_GAP = PIN.height + PIN.badgeGap;

/**
 * 배지 마커의 anchor **짐작값** (그려진 높이를 재기 전, 그리고 높이를 재지 않는 지도에서 씀).
 * 배지 높이의 몇 배만큼 아래가 좌표인지로 띄웁니다 (1 이면 배지 바닥이 좌표, 1 보다 크면 그만큼 위로 뜸).
 * 구글 지도는 1 을 넘는 값을 받습니다. Mapbox 는 받지 않아서 배지 아래 여백으로 띄웁니다 (MapboxImpl).
 */
export function badgeAnchor() {
  return { x: 0.5, y: 1 + BADGE_BOTTOM_GAP / BADGE_GEOMETRY.height };
}

export function BadgeMarker({
  status,
  battery,
  tone,
  who,
}: {
  status: MovementStatus;
  /** 사람 id (걷기 운동화 고르기) */
  who?: string;
  battery?: number | null;
  /** 라이트 지도에서 활성화된 사람만 `light` (StatusBadge 설명) */
  tone: 'light' | 'dark';
}) {
  return <StatusBadge text={status.text} kind={status.kind} battery={battery} tone={tone} who={who} />;
}
