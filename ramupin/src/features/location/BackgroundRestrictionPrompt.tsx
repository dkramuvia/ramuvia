import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Platform } from 'react-native';

import { getBackgroundState } from '../../../modules/ramupin-gps';
import { Popup } from '@/components/ui';

/** 한 번 닫으면 이만큼은 다시 묻지 않습니다 (앱을 열 때마다 뜨면 귀찮아서 끄게 됩니다) */
const QUIET_MS = 6 * 60 * 60_000;
let lastShownAt = 0;

/**
 * 백그라운드 실행이 막혀 있으면 안내 (대표 리포트 4차).
 *
 * S23 에서 라무핀 배터리 설정이 '제한'이라 화면을 끄면 위치가 안 갔고, 친구 히스토리에
 * "위치가 30분 동안 확인되지 않아요" 가 하루 여러 번 쌓였습니다. 앱은 이 상태를 알리지 않았습니다.
 * 앱을 열 때·다시 볼 때 확인해 '제한 없음'으로 바꾸도록 설정 화면으로 보냅니다.
 */
export function BackgroundRestrictionPrompt() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const check = () => {
      if (Date.now() - lastShownAt < QUIET_MS) return;
      if (getBackgroundState()?.restricted) {
        lastShownAt = Date.now();
        setVisible(true);
      }
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, []);

  return (
    <Popup
      visible={visible}
      title={t('bgRestrict.title', '라무핀이 백그라운드에서 멈춰 있어요')}
      message={t(
        'bgRestrict.message',
        "휴대폰 배터리 설정에서 라무핀이 '제한'으로 되어 있어, 화면을 끄면 위치가 친구에게 가지 않아요.\n설정 › 배터리에서 '제한 없음'으로 바꿔 주세요.",
      )}
      confirmLabel={t('bgRestrict.open', '설정 열기')}
      onConfirm={() => {
        setVisible(false);
        void Linking.openSettings();
      }}
      cancelLabel={t('bgRestrict.later', '나중에')}
      onCancel={() => setVisible(false)}
    />
  );
}
