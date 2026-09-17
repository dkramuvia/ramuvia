# Play 스토어 "항상 허용" 위치 권한 신고 준비

작성: 2026-09-17 · 대상: 백그라운드 위치(`ACCESS_BACKGROUND_LOCATION`), 포그라운드 서비스(`FOREGROUND_SERVICE_LOCATION`)

구글은 이 두 권한을 쓰는 앱을 **따로 심사**합니다. 심사가 길고(보통 2~4주, 반려되면 더 걸림) 통과하지 못하면 앱을 올릴 수 없습니다.
그래서 기능이 완성되기 전이라도 **미리 제출**하는 편이 안전합니다.

---

## 1. 앱에 이미 반영한 것

| 구글 요구사항 | 어디에 있는지 |
|---|---|
| 권한을 묻기 **전에** 앱 안에서 용도를 알리는 안내(사전 고지) | 설정 > 위치 수집에서 스위치를 켜면 뜨는 팝업 (`app/(app)/settings/location.tsx`) |
| 사용자가 끄고 켤 수 있어야 함 | 같은 화면의 "앱을 꺼도 위치 알리기" 스위치 |
| 수집 중에는 알림이 계속 보여야 함 (포그라운드 서비스) | `src/features/location/backgroundTask.ts` 의 `foregroundService` |
| "앱 사용 중에만 허용"을 먼저 받고 그다음 "항상 허용" | `startBackgroundTracking()` 순서 |
| 백그라운드 위치가 **없으면 안 되는** 핵심 기능이어야 함 | 보호자 알림·긴급 상황 감지 (WBS 2.4, 8, 9) |

## 2. 제출할 때 적을 내용 (초안 — 기획·법무 확인 필요)

**핵심 기능 설명 (영문 제출):**

> RamuPin is a family safety app. Guardians are notified when a protected family member
> (a child or an elderly parent) leaves a safe zone, enters a dangerous area, stops moving
> for an unusual amount of time, or triggers an SOS alert.
> These notifications must work while the app is closed or not in use, because the person
> being protected is not looking at their phone during an emergency.
> Background location is therefore required for the core purpose of the app.

**수집 주기·데이터:** 30초 또는 30m 이동마다 1개, 등급별 정책값으로 조정. 위경도·정확도·속도·배터리.
**보관 기간:** 서버 6개월 후 파기 (WBS 4.3) — 위치정보법 확인 필요.

## 3. 시연 영상에 반드시 담아야 하는 장면

구글은 영상에서 **권한을 묻기 전 안내 → 권한 허용 → 기능이 실제로 동작**하는 흐름을 봅니다.
화면 녹화로 찍고, 자막(영문)을 넣습니다. 3분 이내.

1. 앱 실행 → 설정 > 위치 수집 화면으로 이동
2. "앱을 꺼도 위치 알리기" 스위치를 켬 → **사전 고지 팝업이 뜨는 장면** (글자가 읽히도록 2~3초 멈춤)
3. "허용하기" → 안드로이드 권한 창에서 **"항상 허용"** 선택
4. 상단 알림에 "라무핀이 위치를 확인하고 있어요"가 뜬 것을 알림창을 내려서 보여줌
5. **앱을 완전히 종료**(최근 앱에서 밀어 끄기)
6. 폰을 들고 이동 (또는 위치 모의 이동)
7. 다른 기기(보호자 계정)에서 **위치가 갱신되고 알림이 오는 것**을 보여줌
8. 다시 설정 > 위치 수집에서 스위치를 끄면 알림이 사라지는 것을 보여줌

> 7번은 보호자 쪽 화면이 필요합니다. 폰 2대(또는 폰 + 에뮬레이터)로 찍어야 합니다.

## 4. 남은 확인 사항

- [ ] 위치기반서비스사업자 신고 (위치정보법) — 회사·법무. **이게 없으면 출시 자체가 불가**
- [ ] 개인정보처리방침 URL, 위치기반서비스 이용약관 URL (Play 제출에 필수)
- [ ] 데이터 보안(Data safety) 양식: 위치 수집·공유 여부, 암호화, 삭제 요청 방법
- [ ] 위치 보관 6개월이 위치정보법의 확인자료 보관 의무와 맞는지 (wbs-check §2-8)
- [ ] 영상 촬영용 보호자 테스트 계정 2개
