import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

/**
 * 기기 로컬 DB (SQLite).
 * - 알림 보관함 (WBS 9.7: 받은 알림은 기기에 저장, 기기 변경 시 이전)
 * - 채팅 메시지 보관 (WBS 7.6: 서버에서 방이 삭제돼도 기기에는 남음)
 * - 위치 전송 대기열 (오프라인이면 쌓았다가 재전송, 2·6단계)
 * - 내 이동 경로 (WBS 4.3: 로컬과 서버 모두 저장)
 *
 * 스키마를 바꿀 때는 MIGRATIONS 끝에 새 항목을 추가합니다 (기존 항목 수정 금지).
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS notification_inbox (
     id TEXT PRIMARY KEY NOT NULL,
     type TEXT NOT NULL,
     category TEXT NOT NULL,
     message TEXT NOT NULL,
     payload TEXT,
     created_at TEXT NOT NULL,
     read_at TEXT
   );
   CREATE INDEX IF NOT EXISTS idx_inbox_created ON notification_inbox (created_at DESC);

   CREATE TABLE IF NOT EXISTS chat_messages (
     id TEXT PRIMARY KEY NOT NULL,
     room_id TEXT NOT NULL,
     sender_id TEXT NOT NULL,
     type TEXT NOT NULL,
     body TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages (room_id, created_at);

   CREATE TABLE IF NOT EXISTS location_outbox (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     payload TEXT NOT NULL,
     measured_at TEXT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0
   );

   CREATE TABLE IF NOT EXISTS my_route_points (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     latitude REAL NOT NULL,
     longitude REAL NOT NULL,
     accuracy REAL,
     speed REAL,
     measured_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_route_time ON my_route_points (measured_at);`,

  // 방 이름을 기기에도 남깁니다. 그룹을 나가면 서버에서 방이 사라지는데,
  // 기기에 남은 대화를 보여 주려면 이름이 필요하기 때문입니다 (WBS 7.6)
  `CREATE TABLE IF NOT EXISTS chat_rooms (
     id TEXT PRIMARY KEY NOT NULL,
     name TEXT NOT NULL,
     member_count INTEGER NOT NULL DEFAULT 0,
     updated_at TEXT NOT NULL
   );`,
];

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync('ramupin.db');
  db.execSync('PRAGMA journal_mode = WAL;');
  const { user_version: version } = db.getFirstSync<{ user_version: number }>('PRAGMA user_version') ?? { user_version: 0 };
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      db!.execSync(MIGRATIONS[v]);
      db!.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}
