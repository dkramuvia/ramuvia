import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 키보드가 올라온 만큼 아래 여백을 만들어 입력창이 가려지지 않게 합니다.
 * Android 는 화면 끝까지 그리는 모드(edge-to-edge)라 KeyboardAvoidingView 만으로는 가려져서 직접 계산합니다.
 * 키보드 높이에는 하단 시스템 버튼 영역이 포함되므로 그만큼 뺍니다.
 */
export function useKeyboardPadding(): number {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    // iOS 는 키보드 높이에 홈 인디케이터 영역이 포함되므로 그만큼 빼고, Android 는 그대로 사용합니다
    const inset = Platform.OS === 'ios' ? insets.bottom : 0;
    const show = Keyboard.addListener(showEvent, (e) => setHeight(Math.max(0, e.endCoordinates.height - inset)));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [insets.bottom]);

  return height;
}
