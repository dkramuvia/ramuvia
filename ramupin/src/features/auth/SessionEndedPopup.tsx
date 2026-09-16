import { useTranslation } from 'react-i18next';

import { Popup } from '@/components/ui';
import { useAuthStore, type SessionEndReason } from '@/stores/authStore';

const TEXT_KEYS: Record<SessionEndReason, { title: string; desc: string }> = {
  replaced: { title: 'session.endedReplacedTitle', desc: 'session.endedReplacedDesc' },
  revoked: { title: 'session.endedRevokedTitle', desc: 'session.endedRevokedDesc' },
  expired: { title: 'session.endedExpiredTitle', desc: 'session.endedExpiredDesc' },
};

/** 로그인이 끊겼을 때 이유 안내 (다른 기기 로그인 등). 루트 레이아웃에 한 번만 둡니다 */
export function SessionEndedPopup() {
  const { t } = useTranslation();
  const reason = useAuthStore((s) => s.sessionEnded);
  const clear = useAuthStore((s) => s.clearSessionEnded);
  if (!reason) return null;

  return (
    <Popup
      visible
      title={t(TEXT_KEYS[reason].title)}
      message={t(TEXT_KEYS[reason].desc)}
      confirmLabel={t('common.confirm')}
      onConfirm={clear}
      onDismiss={clear}
    />
  );
}
