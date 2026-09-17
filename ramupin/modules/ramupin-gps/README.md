# ramupin-gps

GPS 부가 정보를 읽는 안드로이드 네이티브 모듈 (WBS 2.2·2.3).

`expo-location` 은 위경도·정확도·속도까지만 줍니다. WBS 가 요구하는 아래 값은
안드로이드 API 를 직접 불러야 해서 이 모듈을 만들었습니다.

- 위성 수 (보이는 수 / 실제로 위치 계산에 쓰인 수)
- 신호 강도 (평균 C/N0, dB-Hz)
- 위치 제공자 (GPS / 네트워크 켜짐 여부)

## 쓰는 법

```ts
import { startSatelliteUpdates, getSatellites } from '@/../modules/ramupin-gps';

startSatelliteUpdates();      // 위치 권한이 있어야 true
getSatellites();              // { satellitesVisible, satellitesUsed, signalStrength }
```

## 주의

- **네이티브 코드라 개발 빌드를 다시 만들어야 동작합니다.** 모듈이 없는 빌드에서도
  앱이 죽지 않도록, `index.ts` 가 모듈을 못 찾으면 조용히 null 을 돌려줍니다.
- 실내에서는 위성이 잡히지 않아 `satellitesUsed` 가 0 입니다. 이때 위치는 Wi-Fi·기지국으로 계산되고
  오차가 100m 까지 벌어집니다.
- iOS 는 아직 없습니다. iOS 에는 위성 수를 주는 공개 API 가 없어, 10단계에서 대체 방법을 찾아야 합니다.

## 남은 것

- 걷기·자전거·차량 판별 (ActivityRecognition). 권한 확인만 되어 있고 구독은 미구현
