/**
 * 피그마 [라무핀 v2.0 > 설명] 페이지의 실제 사용값에서 뽑은 색상입니다. (2026-09-14)
 * 피그마에 공식 컬러 스타일이 없어서 화면 노드에서 직접 추출했습니다.
 * 디자이너가 컬러 시스템을 확정하면 값만 교체하세요.
 */
export const colors = {
  white: '#FFFFFF',
  black: '#000000',

  // 배경
  background: '#F7F7F8', // 일반 화면
  backgroundWarm: '#FBFAF9', // 가입/온보딩 화면
  surface: '#EFF0F2', // 리스트 카드, 설정 메뉴 카드
  surfaceStrong: '#E3E6E8', // 세그먼트 트랙, 비활성 버튼, 선택 칩
  surfaceSoft: '#E3E6E866', // 설정 토글 카드
  popup: '#FAFDFF',

  // 글자
  text: '#2E3438', // 기본 본문, 제목
  textStrong: '#0C0D0E',
  textTitle: '#1A1C1E', // 온보딩 큰 제목
  textSecondary: '#464D53',
  textTertiary: '#5D676F',
  textPlaceholder: '#74818B',
  textMuted: '#ACB3B9',
  textLabel: '#6D6E6E', // 섹션 라벨 ("위치 공개" 등)
  textOnDark: '#F7F7F8',

  // 선
  border: '#C7CDD1', // 입력창 테두리
  borderLight: '#E5E5E5',
  divider: '#E3E6E8',

  // 브랜드/강조
  primary: '#0095FF', // 파란 CTA 버튼
  primaryLight: '#33AAFF', // 작은 파란 버튼, 배지
  primarySoft: '#66BFFF', // 선택된 아이콘 박스, 탭 밑줄
  brown: '#473C39', // 팝업 확인 버튼, 채팅 FAB
  brownMedium: '#5B4F4B', // 세그먼트 선택
  brownLight: '#7C6D67', // 그룹 만들기 버튼
  accent: '#FF77E0', // 하단 탭 선택
  softButton: '#DADEFF', // 중복확인 버튼 배경
  softButtonText: '#2206C6',
  danger: '#FF1E00',
  sos: '#FF4B30', // 안전 & SOS 버튼·체크

  // 상태
  online: '#16A34A',
  switchOn: '#13C938',
  switchOff: '#ACB3B9',
  check: '#19C93C',
  battery: '#00A521',
  batteryLow: '#FF3B30',

  // 아바타
  avatarBackground: '#F5F5F5',
  avatarText: '#737373',

  // 하단 탭
  tabBar: '#F3F3F3',
  tabBarBorder: '#F0F0F0',
  tabInactive: '#969696',

  // 이동 경로: 노란 줄 = 머무름, 파란 줄 = 이동
  routeStay: '#FFC700',
  routeMove: '#0095FF',
} as const;

export type ColorName = keyof typeof colors;
