import { useTranslation } from 'react-i18next';

import { Popup } from '@/components/ui';

interface RequestSentPopupProps {
  nickname: string | null;
  onClose: () => void;
}

/** 피그마: 친구 요청 완료 팝업 (283:23557) */
export function RequestSentPopup({ nickname, onClose }: RequestSentPopupProps) {
  const { t } = useTranslation();
  return (
    <Popup
      visible={!!nickname}
      image={require('../../../assets/images/popup-request-sent.png')}
      title={t('friendAdd.sentTitle', { name: nickname })}
      message={t('friendAdd.sentMessage')}
      confirmLabel={t('common.confirm')}
      onConfirm={onClose}
      onDismiss={onClose}
    />
  );
}
