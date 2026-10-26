import { Inject, Injectable, Logger } from '@nestjs/common';

import { SmsService } from '../auth/sms.service.js';
import { appError } from '../common/app-error.js';
import { decryptPhone, encryptPhone, maskPhone, normalizePhone } from '../common/phone.js';
import { policyFeature, policyNumber, resolvePolicy } from '../config/policy.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { SOS_PLACE_COLUMNS, withSosPlace } from './sos-place.js';

/**
 * SOS 문자 — 비회원 연락처에 라무핀 서버가 알리고로 자동 발송 (보완 4.4~4.6, 수정 반영본 C1·C6·C8·C9).
 *
 * 앱이 문자를 보내지 않는 이유: iPhone 은 앱이 문자를 자동으로 못 보내고, Android 도 Play 가
 * 문자 발송 권한을 거의 허가하지 않습니다. 서버가 보내면 두 폰 모두 똑같이 되고, 보낸 결과도 압니다.
 *
 * 지키는 것
 *   - 국내 휴대폰 번호만 (알리고는 국내 전용)
 *   - 등급: features.sosSms (플래티넘부터). SOS 한 번에 최대 sosSmsMaxPerEvent 건 (문자 비용 한도)
 *   - 문자에는 위치 링크(웹 지도)만. 녹음은 보내지 않습니다
 *   - SOS 응답을 기다리게 하지 않습니다. 업체가 느려도 친구 알림은 이미 나갔습니다
 */

export interface SosSmsPlace {
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  placeAddress: string | null;
  startedAt: Date;
}

/** 01X 로 시작하는 10~11자리. 유선·국제 번호는 받지 않습니다 */
export function isDomesticMobile(phone: string): boolean {
  return /^01[016789]\d{7,8}$/.test(normalizePhone(phone));
}

/** SOS 문자 본문. 링크는 어느 폰에서나 열리는 웹 지도입니다 */
export function sosSmsText(nickname: string, place: SosSmsPlace): string {
  const time = place.startedAt.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' });
  const lines = [`[라무핀 SOS] ${nickname}님이 긴급 도움을 요청했어요 (${time}).`];
  const where = place.placeAddress ?? place.placeName;
  if (where) lines.push(where);
  if (place.latitude != null && place.longitude != null) {
    lines.push(`위치: https://www.google.com/maps/search/?api=1&query=${place.latitude.toFixed(6)},${place.longitude.toFixed(6)}`);
  } else {
    lines.push('위치를 확인하지 못했어요. 전화로 확인해 주세요.');
  }
  return lines.join('\n');
}

@Injectable()
export class SosSmsService {
  private readonly logger = new Logger(SosSmsService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly sms: SmsService,
  ) {}

  /** 내 비회원 연락처. 내가 적은 번호라 본인에게는 원문을 돌려줍니다 (인터넷이 끊겼을 때 문자 창에 씀) */
  async contacts(userId: string) {
    const rows = await this.db
      .selectFrom('member.sos_contacts')
      .select(['id', 'name', 'phone_encrypted'])
      .where('user_id', '=', userId)
      .orderBy('created_at')
      .execute();
    return rows.map((r) => {
      const phone = decryptPhone(r.phone_encrypted);
      return { id: r.id, name: r.name, phone, maskedPhone: maskPhone(phone) };
    });
  }

  /**
   * 연락처를 통째로 다시 씁니다 (안전 설정 저장과 같은 방식).
   * 국내 휴대폰 번호가 아니면 400 입니다 — 저장해 두고 SOS 때 조용히 빠지면 안 됩니다.
   */
  async replaceContacts(userId: string, contacts: { name: string; phone: string }[], trx: MainDb = this.db) {
    for (const c of contacts) {
      if (!isDomesticMobile(c.phone)) {
        throw appError(400, 'SOS_CONTACT_PHONE', `국내 휴대폰 번호만 등록할 수 있어요 (${c.name})`);
      }
    }
    await trx.deleteFrom('member.sos_contacts').where('user_id', '=', userId).execute();
    if (contacts.length === 0) return;
    await trx
      .insertInto('member.sos_contacts')
      .values(contacts.map((c) => ({ user_id: userId, name: c.name, phone_encrypted: encryptPhone(c.phone) })))
      .execute();
  }

  /**
   * SOS 가 나갈 때 부릅니다. 발송 기록을 먼저 남기고(결과 화면이 바로 보여 줄 수 있게),
   * 실제 발송은 기다리지 않고 뒤에서 합니다. 문자를 보낸 연락처 수를 돌려줍니다.
   */
  async startForSos(
    userId: string,
    sosId: string,
    nickname: string,
    place: SosSmsPlace,
    options: { smsEnabled: boolean; /** SOS 수신인 한도에서 친구를 빼고 남은 자리 */ capacity: number },
  ): Promise<number> {
    const { smsEnabled, capacity } = options;
    const contacts = await this.db
      .selectFrom('member.sos_contacts')
      .select(['id', 'name', 'phone_encrypted'])
      .where('user_id', '=', userId)
      .orderBy('created_at')
      .execute();
    if (contacts.length === 0) return 0;

    const policy = await resolvePolicy(this.db, userId);
    const allowed = smsEnabled && policyFeature(policy, 'sosSms');
    // 문자 비용 한도(sosSmsMaxPerEvent)와 SOS 수신인 한도 중 작은 쪽
    const max = Math.min(policyNumber(policy, 'sosSmsMaxPerEvent', 5), Math.max(0, capacity));
    const skipReason = !smsEnabled ? '문자 보내기 꺼짐' : !allowed ? '지금 등급에서는 문자를 보낼 수 없음' : null;

    const rows = await this.db
      .insertInto('member.sos_sms_deliveries')
      .values(
        contacts.map((c, index) => {
          const reason = skipReason ?? (index >= max ? 'SOS 수신인 한도 초과' : null);
          return {
            sos_id: sosId,
            contact_id: c.id,
            name: c.name,
            phone_encrypted: c.phone_encrypted,
            status: reason ? ('skipped' as const) : ('sending' as const),
            reason,
          };
        }),
      )
      .returning(['id', 'status', 'phone_encrypted'])
      .execute();

    const text = sosSmsText(nickname, place);
    const toSend = rows.filter((r) => r.status === 'sending');
    // 기다리지 않습니다. 업체가 10초씩 걸려도 SOS 응답은 바로 나가야 합니다
    void this.sendAll(toSend, text);
    return toSend.length;
  }

  /**
   * 보낸 사람의 결과 화면용 전달 상태 (C8).
   * 앱 알림 = 받은 친구와 확인한 시각 / 문자 = 연락처와 전송 상태
   */
  async deliveries(userId: string, sosId: string) {
    const event = await this.db
      .selectFrom('member.sos_events')
      .select(['id', 'status'])
      .where('id', '=', sosId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!event) throw appError(404, 'SOS_NOT_FOUND', 'SOS 를 찾을 수 없습니다');

    const [app, sms] = await Promise.all([
      this.db
        .selectFrom('member.sos_deliveries as d')
        .innerJoin('member.users as u', 'u.id', 'd.recipient_user_id')
        .select(['u.id', 'u.nickname', 'u.avatar_url as avatarUrl', 'd.read_at as readAt'])
        .where('d.sos_id', '=', sosId)
        .execute(),
      this.db
        .selectFrom('member.sos_sms_deliveries')
        .select(['id', 'name', 'phone_encrypted', 'status', 'reason', 'sent_at'])
        .where('sos_id', '=', sosId)
        .orderBy('created_at')
        .execute(),
    ]);

    return {
      status: event.status,
      app: app.map((r) => ({ id: r.id, nickname: r.nickname, avatarUrl: r.avatarUrl, readAt: r.readAt?.toISOString() ?? null })),
      sms: sms.map((r) => ({
        id: r.id,
        name: r.name,
        maskedPhone: maskPhone(decryptPhone(r.phone_encrypted)),
        status: r.status,
        reason: r.reason,
        sentAt: r.sent_at?.toISOString() ?? null,
      })),
    };
  }

  /** 실패한 문자 한 건 다시 보내기 ("전송 실패 · 다시 보내기") */
  async resend(userId: string, sosId: string, deliveryId: string) {
    const row = await this.db
      .selectFrom('member.sos_sms_deliveries as s')
      .innerJoin('member.sos_events as e', 'e.id', 's.sos_id')
      .innerJoin('member.users as u', 'u.id', 'e.user_id')
      .select(['s.id', 's.status', 's.phone_encrypted', 'u.nickname', 'e.started_at'])
      .where('s.id', '=', deliveryId)
      .where('s.sos_id', '=', sosId)
      .where('e.user_id', '=', userId)
      .executeTakeFirst();
    if (!row) throw appError(404, 'SOS_SMS_NOT_FOUND', '다시 보낼 문자가 없습니다');
    if (row.status !== 'failed') throw appError(409, 'SOS_SMS_NOT_FAILED', '실패한 문자만 다시 보낼 수 있어요');

    const place = await this.placeOf(sosId, row.started_at);
    await this.db.updateTable('member.sos_sms_deliveries').set({ status: 'sending', reason: null }).where('id', '=', deliveryId).execute();
    await this.sendAll([{ id: deliveryId, phone_encrypted: row.phone_encrypted }], sosSmsText(row.nickname, place));
    return { ok: true };
  }

  private async sendAll(rows: { id: string; phone_encrypted: Buffer }[], text: string) {
    for (const row of rows) {
      try {
        await this.sms.send(decryptPhone(row.phone_encrypted), text, 'SOS', 'LMS');
        await this.db.updateTable('member.sos_sms_deliveries').set({ status: 'sent', sent_at: new Date() }).where('id', '=', row.id).execute();
      } catch (error) {
        this.logger.error(`SOS 문자 실패 (${row.id}): ${String(error)}`);
        await this.db
          .updateTable('member.sos_sms_deliveries')
          .set({ status: 'failed', reason: error instanceof Error ? error.message : String(error) })
          .where('id', '=', row.id)
          .execute()
          .catch(() => undefined);
      }
    }
  }

  /** 다시 보낼 때 쓸 위치. 암호화된 칸을 풀어 처음 문자와 같은 내용을 만듭니다 */
  private async placeOf(sosId: string, startedAt: Date): Promise<SosSmsPlace> {
    const row = await this.db.selectFrom('member.sos_events as e').select([...SOS_PLACE_COLUMNS]).where('e.id', '=', sosId).executeTakeFirstOrThrow();
    const place = withSosPlace(row);
    return { latitude: place.latitude, longitude: place.longitude, placeName: place.placeName, placeAddress: place.placeAddress, startedAt };
  }
}
