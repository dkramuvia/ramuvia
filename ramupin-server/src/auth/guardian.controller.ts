import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { AuthGuard, CurrentUser, type AuthUser } from './auth.guard.js';
import { GuardianService } from './guardian.service.js';

/** 동의 링크 토큰 (base64url 24바이트 = 32자) */
const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

/** 앱: 대기 화면에서 상태 보기 · 다시 보내기 (보완 4.1) */
@Controller('me/guardian')
@UseGuards(AuthGuard)
export class GuardianMeController {
  constructor(private readonly guardian: GuardianService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.guardian.status(user.id);
  }

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  resend(@CurrentUser() user: AuthUser) {
    return this.guardian.resend(user.id);
  }
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(title: string, body: string) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;margin:0;background:#F7F7F8;color:#2E3438}
main{max-width:480px;margin:0 auto;padding:32px 20px}h1{font-size:22px;margin:0 0 12px}p{line-height:1.6;color:#464D53}
.card{background:#fff;border-radius:12px;padding:16px;margin:16px 0}label{display:flex;gap:10px;align-items:flex-start;margin:12px 0;line-height:1.5}
button{width:100%;padding:16px;border:0;border-radius:12px;background:#473C39;color:#fff;font-size:17px;font-weight:700}
small{color:#5D676F}</style></head><body><main>${body}</main></body></html>`;
}

/**
 * 보호자가 문자 링크로 여는 동의 페이지 (로그인 없음, 보완 4.1).
 * 동의 내용(필수 2개, 선택 1개)을 보여 주고, [동의합니다] 를 누르면 가입이 완료됩니다.
 */
@Controller('consent')
export class GuardianConsentPageController {
  constructor(private readonly guardian: GuardianService) {}

  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async show(@Param('token') token: string) {
    if (!TOKEN_RE.test(token)) return page('라무핀 보호자 동의', '<h1>잘못된 주소예요</h1>');
    const info = await this.guardian.preview(token);
    if (!info) return page('라무핀 보호자 동의', '<h1>동의 요청을 찾을 수 없어요</h1><p>24시간이 지나 정보가 지워졌을 수 있어요. 아이에게 다시 가입해 달라고 해 주세요.</p>');
    if (info.consented_at) return page('라무핀 보호자 동의', '<h1>이미 동의했어요</h1><p>아이의 라무핀 가입이 완료되었어요.</p>');
    if (info.expired) return page('라무핀 보호자 동의', '<h1>동의 기간이 지났어요</h1><p>24시간 안에 동의하지 않아 입력한 정보는 자동으로 지워져요.</p>');
    const nickname = escapeHtml(info.nickname);
    return page(
      '라무핀 보호자 동의',
      `<h1>${escapeHtml(info.guardian_name)}님, 보호자 동의가 필요해요</h1>
<p><b>${nickname}</b>님(생년월일 ${escapeHtml(info.birth_date ?? '')})이 위치 공유 앱 <b>라무핀</b>에 가입하려고 해요.
만 14세 미만은 위치정보법·개인정보보호법에 따라 보호자가 동의해야 가입이 완료돼요.</p>
<form method="post" action="/consent/${token}">
<div class="card">
<label><input type="checkbox" required> <span><b>[필수]</b> 보호자의 위치정보 이용 동의<br><small>친구에게 위치 공유, SOS 때 정확한 위치 전달, 안심존 알림에 위치를 씁니다.</small></span></label>
<label><input type="checkbox" required> <span><b>[필수]</b> 아동 개인정보 수집·이용 동의<br><small>닉네임·생년월일·성별·휴대폰 번호·위치 기록을 서비스 제공을 위해 보관합니다.</small></span></label>
${info.sos_link ? '<p><small>[선택] 보호자에게 SOS 자동 연결: 아이가 SOS 를 보내면 이 번호로 위치 링크 문자가 갑니다.</small></p>' : ''}
</div>
<button type="submit">동의합니다</button>
</form>
<p><small>동의하지 않으면 24시간 뒤 입력한 정보가 자동으로 지워져요.</small></p>`,
    );
  }

  @Post(':token')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async agree(@Param('token') token: string, @Req() req: Request, @Body() _body: unknown) {
    if (!TOKEN_RE.test(token)) return page('라무핀 보호자 동의', '<h1>잘못된 주소예요</h1>');
    const result = await this.guardian.consent(token, { ip: req.ip ?? null, agent: req.get('user-agent') ?? null });
    if (result === 'ok') return page('라무핀 보호자 동의', '<h1>동의가 완료되었어요</h1><p>아이의 라무핀 가입이 끝났어요. 이 창을 닫아도 돼요.</p>');
    if (result === 'expired') return page('라무핀 보호자 동의', '<h1>동의 기간이 지났어요</h1><p>아이에게 다시 가입해 달라고 해 주세요.</p>');
    return page('라무핀 보호자 동의', '<h1>동의 요청을 찾을 수 없어요</h1>');
  }
}
