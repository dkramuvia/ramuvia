import { create } from 'zustand';

import { queryClient } from '@/api/queryClient';
import { inbox } from '@/db/inbox';
import i18n from '@/i18n';
import type { HistoryEventType, SharedPlace } from '@/types/models';

/** 피그마 [설정 2 > 알림] 긴급 팝업 6종 */
export type AlertPopupPayload =
  | { kind: 'sos'; name: string; avatarUrl?: string; place: SharedPlace; sentAt: string; hasVoice: boolean }
  | { kind: 'dangerZone'; zoneName: string; place: SharedPlace }
  | { kind: 'gpsLost'; name: string; place: SharedPlace; lastSeenAt: string }
  | { kind: 'batteryLow'; name: string; level: number; minutesLeft: number }
  | { kind: 'noMovement'; name: string; hours: number }
  | { kind: 'speeding'; speedKmh: number };

/** 피그마 앱 안 알림 카드 (100m 반경 친구 접근 등) */
export type InAppCardPayload = {
  id: string;
  kind: 'nearby' | 'friendRequest' | 'arrive' | 'leave' | 'shared';
  name: string;
  place?: string;
  /** 누르면 이동할 화면 */
  href?: string;
};

interface AlertState {
  popup: AlertPopupPayload | null;
  cards: InAppCardPayload[];
  /** save=false: 이미 보관함에 있는 알림을 다시 볼 때 */
  showPopup: (payload: AlertPopupPayload, save?: boolean) => void;
  dismissPopup: () => void;
  pushCard: (card: Omit<InAppCardPayload, 'id'>) => void;
  removeCard: (id: string) => void;
}

/**
 * 앱이 켜져 있을 때 받은 알림을 화면에 띄우는 곳.
 * TODO(6단계): 푸시 수신 핸들러에서 showPopup / pushCard 호출, 받은 알림은 로컬 보관함에 저장 (WBS 9.7)
 */
export const useAlertStore = create<AlertState>((set) => ({
  popup: null,
  cards: [],
  showPopup: (popup, save = true) => {
    if (save) saveToInbox(popup);
    set({ popup });
  },
  dismissPopup: () => {
    set({ popup: null });
    // 히스토리 화면이 새 보관함 내용을 다시 읽도록
    queryClient.invalidateQueries({ queryKey: ['history'] });
  },
  pushCard: (card) => set((s) => ({ cards: [...s.cards, { ...card, id: `card-${Date.now()}` }].slice(-3) })),
  removeCard: (id) => set((s) => ({ cards: s.cards.filter((c) => c.id !== id) })),
}));

const TYPE_BY_KIND: Record<AlertPopupPayload['kind'], HistoryEventType> = {
  sos: 'sos',
  dangerZone: 'dangerZone',
  gpsLost: 'gpsLost',
  batteryLow: 'batteryLow',
  noMovement: 'noMovement',
  speeding: 'speeding',
};

/** 받은 긴급 알림은 기기 알림 보관함에 저장 (WBS 9.7) */
function saveToInbox(popup: AlertPopupPayload) {
  const t = i18n.t.bind(i18n);
  const message = (() => {
    switch (popup.kind) {
      case 'sos':
        return t('alerts.sosTitle', { name: popup.name });
      case 'dangerZone':
        return t('alerts.dangerTitle');
      case 'gpsLost':
        return t('alerts.gpsTitle', { name: popup.name });
      case 'batteryLow':
        return t('alerts.batteryTitle', { name: popup.name, level: popup.level });
      case 'noMovement':
        return t('alerts.noMovementTitle', { name: popup.name, hours: popup.hours });
      case 'speeding':
        return t('alerts.speedTitle');
    }
  })();
  try {
    inbox.add({ id: `inbox-${Date.now()}`, type: TYPE_BY_KIND[popup.kind], category: 'safety', message, createdAt: new Date().toISOString(), payload: popup });
  } catch {
    // 보관함 저장 실패가 알림 표시를 막지 않게 함
  }
}
