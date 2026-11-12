// 앱 진입점.
//
// 위치 수집 작업(defineTask)을 **화면보다 먼저** 등록합니다. 안드로이드가 재부팅 뒤처럼 화면 없이
// 앱을 깨우면 expo-router 는 화면(app/_layout)을 불러오지 않아, 작업이 등록되지 않은 채
// 위치만 쌓이고 서버로 올라가지 않았습니다 ("No task registered", 10-13 실기기).
import './src/features/location/backgroundTask';
// 예약 메시지 소리로 읽기: 앱이 꺼져 있을 때 데이터 푸시로 깨어나 읽고 알림을 띄우는 작업 (대표님 11-12)
import './src/features/notifications/dataOnlyPush';
import 'expo-router/entry';
