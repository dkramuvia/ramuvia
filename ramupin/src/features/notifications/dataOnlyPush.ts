import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import * as TaskManager from 'expo-task-manager';

/**
 * 알림 없이 데이터만 온 푸시 (서버 PushMessage.androidDataOnly, 안드로이드만).
 *
 * 예약 메시지에 "소리로 읽기"가 켜져 있으면 서버가 이렇게 보냅니다 (대표님 11-12).
 * 일반 알림으로 오면 앱이 꺼져 있을 때 앱 코드가 돌지 않아, 알림을 눌러야 읽어 줄 수 있었습니다.
 * 데이터로만 오면 안드로이드가 앱을 뒤에서 깨워 아래 작업을 돌립니다. 그래서
 *   1. 알림을 앱이 직접 띄우고 (서버가 정한 채널이라 예약 메시지 알림음도 그대로)
 *   2. 제목과 내용을 소리로 읽어 줍니다
 *
 * 절전 모드나 제조사 배터리 관리가 앱을 막으면 늦거나 안 올 수 있습니다. 실제 폰에서 확인해야 합니다.
 * 앱이 켜져 있을 때는 usePush 의 받음 처리에서도 같은 함수를 부릅니다. pushId 로 한 번만 처리합니다.
 */

const TASK = 'ramupin-data-only-push';

/** 서버가 싣는 값 (FCM data 는 모두 문자열) */
type DataOnlyPush = {
  dataOnly?: string;
  pushId?: string;
  title?: string;
  body?: string;
  channelId?: string;
  kind?: string;
  tts?: string;
  route?: string;
};

const handled = new Set<string>();

export function isDataOnlyPush(data: unknown): data is DataOnlyPush {
  return !!data && typeof data === 'object' && (data as DataOnlyPush).dataOnly === '1';
}

export async function handleDataOnlyPush(push: DataOnlyPush) {
  const key = push.pushId ?? `${push.title}-${push.body}`;
  if (handled.has(key)) return;
  handled.add(key);

  const { title = '', body = '', channelId, pushId, dataOnly: _dataOnly, tts, ...rest } = push;
  // 읽기는 여기서 합니다. 띄운 알림은 tts 를 빼서 받음·누름 처리에서 다시 읽지 않게 합니다
  if (tts === '1') Speech.speak([title, body].filter(Boolean).join('. '), { language: 'ko-KR' });
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { ...rest, id: pushId, tts: '0' } },
    trigger: channelId ? { channelId } : null,
  });
}

/** FCM 데이터는 키가 그대로 오기도, dataString(JSON) 으로 오기도 합니다 */
function readPayload(payload: Notifications.NotificationTaskPayload): DataOnlyPush | null {
  if ('actionIdentifier' in payload) return null; // 알림 누름은 usePush 가 처리합니다
  const raw = payload.data ?? {};
  if (typeof raw.dataString === 'string') {
    try {
      return JSON.parse(raw.dataString) as DataOnlyPush;
    } catch {
      return null;
    }
  }
  return raw as DataOnlyPush;
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK, async ({ data }) => {
  const push = data ? readPayload(data) : null;
  if (!push || !isDataOnlyPush(push)) return Notifications.BackgroundNotificationTaskResult.NoData;
  try {
    await handleDataOnlyPush(push);
    return Notifications.BackgroundNotificationTaskResult.NewData;
  } catch (error) {
    console.warn('[push] 데이터 푸시 처리 실패', String(error));
    return Notifications.BackgroundNotificationTaskResult.Failed;
  }
});

Notifications.registerTaskAsync(TASK).catch((error: unknown) => console.warn('[push] 백그라운드 알림 작업 등록 실패', String(error)));
