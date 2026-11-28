/**
 * 푸시 알림 문구 (11-26). 한국어가 아닌 기기에는 영어로 보냅니다.
 *
 * 번역은 대표님이 해 주십니다 → 받은 영어를 `en` 에 그대로 넣으면 됩니다.
 * {{nickname}} 같은 자리는 보낼 때 실제 값으로 바뀝니다 (앱 ko.json 과 같은 모양).
 * 키·자리 이름은 바꾸지 마세요.
 */
export const PUSH_TEXTS = {
  ko: {
    appName: '라무핀',
    safetyAlertTitle: '라무핀 안전 알림',
    someone: '누군가',
    friend: '친구',
    unknownName: '알 수 없음',
    unknownPlace: '위치 확인 필요',

    sosTitle: '{{nickname}}님의 SOS 긴급 발신',
    sosBody: '{{place}} · 지금 확인해 주세요',
    sosAudioTitle: '{{nickname}}님의 SOS 녹음',
    sosAudioBody: 'SOS 에 음성 녹음이 추가되었어요. 눌러서 들어 보세요',
    sosCancelled: 'SOS 가 취소되었습니다.',
    sosResolved: '{{nickname}}님이 안전하다고 알렸습니다.',

    safeZoneEnter: '{{nickname}}님이 {{zone}}에 도착했어요',
    safeZoneLeave: '{{nickname}}님이 {{zone}}에서 나갔어요',
    dangerZoneNear: '{{zone}} 근처예요. 주의해서 이동해 주세요.',
    speeding: '{{nickname}}님이 {{speed}}km/h 로 이동 중이에요',

    batteryLow: '{{nickname}}님의 배터리가 부족합니다',
    phoneOff: '{{nickname}}님의 전화기가 꺼졌습니다',
    phoneOffHours: '{{nickname}}님의 전화기가 꺼진 지 {{hours}}시간이 되었습니다. 확인 바랍니다',
    locationFixedHours: '{{nickname}}님의 위치가 {{hours}}시간 고정되었습니다',
    checkSafety: '{{nickname}}님의 안전을 확인하세요',
    noSignal: '{{nickname}}님의 위치 신호가 확인되지 않습니다',

    friendRequestSent: '{{nickname}}님이 친구 요청을 보냈어요',
    friendRequestAccepted: '{{nickname}}님이 친구 요청을 수락했어요',
    groupKicked: "'{{group}}' 그룹에서 나가게 되었어요",
    groupDeleted: "'{{group}}' 그룹이 삭제되었어요",

    chatLocation: '위치를 공유했어요.',
    chatPhoto: '사진을 보냈어요.',

    sessionReplaced: '다른 기기에서 로그인되어 이 휴대폰의 위치 공유가 중단되었어요',
  },
  // 임시 영어 (대표님 번역본이 오면 바꿉니다)
  en: {
    appName: 'RamuPin',
    safetyAlertTitle: 'RamuPin safety alert',
    someone: 'Someone',
    friend: 'A friend',
    unknownName: 'Unknown',
    unknownPlace: 'Location unknown',

    sosTitle: 'SOS from {{nickname}}',
    sosBody: '{{place}} · Please check now',
    sosAudioTitle: 'SOS voice message from {{nickname}}',
    sosAudioBody: 'A voice recording was added to the SOS. Tap to listen.',
    sosCancelled: 'The SOS was cancelled.',
    sosResolved: '{{nickname}} says they are safe.',

    safeZoneEnter: '{{nickname}} arrived at {{zone}}',
    safeZoneLeave: '{{nickname}} left {{zone}}',
    dangerZoneNear: 'You are near {{zone}}. Please move carefully.',
    speeding: '{{nickname}} is moving at {{speed}} km/h',

    batteryLow: "{{nickname}}'s battery is low",
    phoneOff: "{{nickname}}'s phone has turned off",
    phoneOffHours: "{{nickname}}'s phone has been off for {{hours}} hours. Please check on them",
    locationFixedHours: "{{nickname}}'s location hasn't changed for {{hours}} hours",
    checkSafety: 'Please check that {{nickname}} is safe',
    noSignal: "{{nickname}}'s location signal can't be found",

    friendRequestSent: '{{nickname}} sent you a friend request',
    friendRequestAccepted: '{{nickname}} accepted your friend request',
    groupKicked: "You were removed from the '{{group}}' group",
    groupDeleted: "The '{{group}}' group was deleted",

    chatLocation: 'Shared a location.',
    chatPhoto: 'Sent a photo.',

    sessionReplaced: 'You signed in on another device, so location sharing on this phone has stopped.',
  },
} as const satisfies Record<'ko' | 'en', Record<string, string>>;

export type PushTextKey = keyof (typeof PUSH_TEXTS)['ko'];
type Vars = Record<string, string | number | null | undefined>;

/** 한 언어의 문구. 자리는 vars 로 채웁니다 */
export function pushText(language: 'ko' | 'en', key: PushTextKey, vars: Vars = {}): string {
  const template: string = PUSH_TEXTS[language][key] ?? PUSH_TEXTS.ko[key];
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''));
}

/** 이름 같은 자리가 비었을 때 언어별 대신 쓸 말 */
type Fallback = { [name: string]: PushTextKey };

/**
 * PushMessage 의 title·body·en 을 한 번에 만듭니다.
 * vars 의 값이 없으면 fallback 의 문구로 채웁니다 (예: 닉네임이 없으면 '친구' / 'A friend')
 */
export function pushCopy(title: PushTextKey, body: PushTextKey, vars: Vars = {}, fallback: Fallback = {}) {
  const fill = (language: 'ko' | 'en'): Vars => {
    const out: Vars = { ...vars };
    for (const [name, key] of Object.entries(fallback)) if (!out[name]) out[name] = pushText(language, key);
    return out;
  };
  const ko = fill('ko');
  const en = fill('en');
  return {
    title: pushText('ko', title, ko),
    body: pushText('ko', body, ko),
    en: { title: pushText('en', title, en), body: pushText('en', body, en) },
  };
}
