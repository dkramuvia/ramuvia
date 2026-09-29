import { StatusBar } from 'expo-status-bar';

import { useThemeName } from '@/theme';

/**
 * 맨 위 상태 표시줄(시계·배터리·신호) 글자 색.
 *
 * `expo-status-bar` 의 `style` 은 **글자 색**을 말합니다. `dark` 면 검은 글자라
 * 밝은 화면용입니다. 앱 전체에 `dark` 로 박아 두었더니, 다크 모드에서
 * 검은 배경에 검은 글자가 되어 시계와 배터리가 거의 안 보였습니다.
 *
 * `auto` 를 쓰면 안 되는 이유: 그건 **기기** 설정을 따라가는데, 우리는 설정에서
 * 앱 화면 색을 따로 고를 수 있습니다 (기기는 라이트, 앱은 다크가 가능합니다).
 *
 * 사진이나 어두운 배경 위에 그리는 화면은 이걸 쓰지 말고 `style="light"` 를
 * 그대로 두세요 (갤러리 사진 보기, 요금제, 로드뷰).
 */
export function ThemedStatusBar() {
  return <StatusBar style={useThemeName() === 'dark' ? 'light' : 'dark'} />;
}
