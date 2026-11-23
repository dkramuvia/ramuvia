import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Popup } from '@/components/ui';
import { showToast } from '@/utils/toast';
import { useResolveSos } from './queries';

/**
 * "상황 종료 (안전함)" 를 누르면 먼저 묻습니다 (대표 리포트 4차: 한 번 누르면 확인 없이 바로 종료됐습니다).
 * 전송됨 화면 · 지도 배너 · SOS 기록이 같이 씁니다.
 *
 * 사용: const confirm = useResolveSosConfirm(); confirm.ask(sosId, onDone) 하고 {confirm.popup} 을 그립니다
 */
export function useResolveSosConfirm() {
  const { t } = useTranslation();
  const resolve = useResolveSos();
  const [target, setTarget] = useState<{ sosId: string; onDone?: () => void } | null>(null);

  const close = () => setTarget(null);
  const confirm = () => {
    if (!target) return;
    const { sosId, onDone } = target;
    setTarget(null);
    resolve.mutate(sosId, {
      onSuccess: () => {
        showToast(t('sos.resolvedDone'));
        onDone?.();
      },
      onError: () => showToast(t('sos.resolveFailed')),
    });
  };

  return {
    ask: (sosId: string, onDone?: () => void) => setTarget({ sosId, onDone }),
    pending: resolve.isPending,
    popup: (
      <Popup
        visible={!!target}
        title={t('sos.resolveConfirmTitle')}
        message={t('sos.resolveConfirmMessage')}
        confirmLabel={t('sos.resolveConfirm')}
        onConfirm={confirm}
        cancelLabel={t('common.cancel')}
        onCancel={close}
        onDismiss={close}
      />
    ),
  };
}
