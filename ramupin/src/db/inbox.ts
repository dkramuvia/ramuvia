import { getDb } from './index';
import type { HistoryCategory, HistoryEvent, HistoryEventType } from '@/types/models';

interface InboxRow {
  id: string;
  type: string;
  category: string;
  message: string;
  created_at: string;
}

const RETENTION_DAYS = 180;

/** 알림 보관함 (WBS 9.7) */
export const inbox = {
  add(event: HistoryEvent & { payload?: unknown }) {
    getDb().runSync(
      'INSERT OR REPLACE INTO notification_inbox (id, type, category, message, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      event.id,
      event.type,
      event.category,
      event.message,
      event.payload ? JSON.stringify(event.payload) : null,
      event.createdAt,
    );
  },

  list(category?: HistoryCategory, limit = 200): HistoryEvent[] {
    const rows = category
      ? getDb().getAllSync<InboxRow>('SELECT * FROM notification_inbox WHERE category = ? ORDER BY created_at DESC LIMIT ?', category, limit)
      : getDb().getAllSync<InboxRow>('SELECT * FROM notification_inbox ORDER BY created_at DESC LIMIT ?', limit);
    return rows.map((r) => ({
      id: r.id,
      type: r.type as HistoryEventType,
      category: r.category as HistoryCategory,
      message: r.message,
      createdAt: r.created_at,
    }));
  },

  /** 오래된 알림 정리. TODO(정책): 보관 기간은 서버 정책값 */
  prune() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
    getDb().runSync('DELETE FROM notification_inbox WHERE created_at < ?', cutoff);
  },
};
