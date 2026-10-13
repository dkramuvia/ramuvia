// 앱 진입점.
//
// 위치 수집 작업(defineTask)을 **화면보다 먼저** 등록합니다. 안드로이드가 재부팅 뒤처럼 화면 없이
// 앱을 깨우면 expo-router 는 화면(app/_layout)을 불러오지 않아, 작업이 등록되지 않은 채
// 위치만 쌓이고 서버로 올라가지 않았습니다 ("No task registered", 10-13 실기기).
import './src/features/location/backgroundTask';
import 'expo-router/entry';
