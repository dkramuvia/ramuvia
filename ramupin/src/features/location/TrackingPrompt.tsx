import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { Popup } from '@/components/ui';
import { showToast } from '@/utils/toast';
import { shouldPromptTracking, startBackgroundTracking } from './backgroundTask';

/** 이번 앱 실행에서 이미 물어봤는지. "나중에" 를 누르면 다음 실행 때 다시 묻습니다 */
let askedThisRun = false;

/**
 * 로그인 뒤 지도에서 **위치 수집을 켜자고 묻습니다** (WBS 2.4).
 *
 * 예전에는 설정 > 위치 의 스위치를 직접 켜야만 백그라운드 수집이 시작돼서, 앱을 닫으면 위치가
 * 한 건도 올라가지 않았습니다 — 실서버 시험에서 밤새 0건 (10-13). 위치 공유 앱의 핵심이라
 * 처음 들어올 때 바로 묻습니다. 문구는 설정 화면과 같은 사전 고지입니다 (Play 정책: "항상 허용" 전에 용도 안내).
 */
export function TrackingPrompt() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (askedThisRun) return;
    let cancelled = false;
    void shouldPromptTracking().then((ask) => {
      if (cancelled || !ask) return;
      askedThisRun = true;
      setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const allow = async () => {
    setVisible(false);
    const result = await startBackgroundTracking();
    if (result === 'started') showToast(t('locationSettings.started'));
    else if (result === 'need-background') {
      // 안드로이드는 "항상 허용" 을 앱 안에서 다시 물어볼 수 없어 설정 화면으로 보냅니다
      showToast(t('locationSettings.needBackground'));
      void Linking.openSettings();
    } else if (result === 'need-foreground') showToast(t('locationSettings.needForeground'));
    else showToast(t('locationSettings.startFailed'));
  };

  return (
    <Popup
      visible={visible}
      title={t('locationSettings.disclosureTitle')}
      message={t('locationSettings.disclosureMessage')}
      confirmLabel={t('common.allow')}
      cancelLabel={t('common.later')}
      onConfirm={() => void allow()}
      onCancel={() => setVisible(false)}
      onDismiss={() => setVisible(false)}
    />
  );
}
