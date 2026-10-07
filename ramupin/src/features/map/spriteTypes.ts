/** 프레임 PNG 묶음 하나 (scripts/make-map-sprites.py 가 만듭니다) */
export interface SpriteSheet {
  /** 그림 크기(px). 3배 화면 기준으로 만들어 둡니다 */
  w: number;
  h: number;
  /** require() 한 프레임들. 앞에서부터 TICK_MS 간격으로 돌립니다 */
  frames: number[];
}
