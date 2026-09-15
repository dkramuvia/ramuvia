import { Alert, Platform, ToastAndroid } from 'react-native';

// TODO(디자인): 피그마 토스트 디자인이 나오면 공통 Toast 컴포넌트로 교체
export function showToast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}
