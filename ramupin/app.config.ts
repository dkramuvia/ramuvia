import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json 의 기본 설정에 네이티브 빌드용 비밀값(.env)을 더합니다.
 * 키는 JS 번들에 들어가지 않도록 EXPO_PUBLIC_ 이 아닌 이름을 씁니다.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    // 연락처는 읽기만 합니다. 불필요한 권한은 Play 데이터 보안 심사에 불리
    blockedPermissions: ['android.permission.WRITE_CONTACTS'],
    // 신체 활동(이동 상태 감지, 권한 안내 화면) / 알림(Android 13+). 다음 네이티브 빌드부터 적용
    permissions: ['android.permission.ACTIVITY_RECOGNITION', 'android.permission.POST_NOTIFICATIONS'],
  },
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-location',
      {
        locationWhenInUsePermission: '친구와 위치를 공유하고 지도에 내 위치를 표시하기 위해 위치 정보를 사용합니다.',
        // 백그라운드 위치는 6단계에서 켭니다 (Play 권한 신고 필요)
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'QR 코드로 친구를 추가하기 위해 카메라를 사용합니다.',
        // 주의: recordAudioAndroid/microphonePermission 을 false 로 두면 RECORD_AUDIO 가 manifest 에서 제거되어 SOS 녹음(expo-audio)이 막힙니다
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: '긴급 상황(SOS) 시 주변 소리를 녹음해 보호자에게 전송하기 위해 마이크를 사용합니다.',
        recordAudioAndroid: true,
      },
    ],
    [
      'expo-contacts',
      {
        contactsPermission: '주소록에서 라무핀을 사용 중인 친구를 찾기 위해 연락처를 사용합니다.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: '프로필 사진 설정과 갤러리 업로드를 위해 사진에 접근합니다.',
        cameraPermission: '사진을 촬영해 갤러리에 올리기 위해 카메라를 사용합니다.',
        microphonePermission: '동영상을 촬영할 때 소리를 함께 녹음합니다.',
      },
    ],
    [
      'react-native-maps',
      {
        // Google Cloud 키: 패키지명 com.ramuviamanager.ramupin + SHA-1 로 제한해서 사용
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    ],
  ],
});
