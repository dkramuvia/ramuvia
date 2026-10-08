import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { ChatGateway, RealtimeModule } from '../chat/chat.gateway.js';
import { parseInput } from '../common/app-error.js';
import { GroupInviteService } from './group-invite.service.js';
import { GroupsService } from './groups.service.js';

const createBody = z.object({ name: z.string().min(1).max(30), memberIds: z.array(z.uuid()).max(49) });
const renameBody = z.object({ name: z.string().min(1).max(30) });
const inviteBody = z.object({ memberIds: z.array(z.uuid()).min(1).max(20) });
const pauseBody = z.object({ paused: z.boolean() });
const directBody = z.object({ friendId: z.uuid() });
/** 초대 토큰 (base64url 18바이트 = 24자) */
const inviteToken = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

@Controller('groups')
@UseGuards(AuthGuard)
class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly invites: GroupInviteService,
    private readonly gateway: ChatGateway,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.groups.list(user.id);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { name, memberIds } = parseInput(createBody, body);
    const group = await this.groups.create(user.id, name, memberIds);
    // 만든 사람과 초대된 사람 모두 실시간 방에 들어갑니다
    await this.gateway.joinRoom([user.id, ...memberIds], group.id);
    this.gateway.emitRoomsChanged(memberIds);
    return group;
  }

  /** 친구와의 1:1 대화방 (없으면 생성) */
  @Post('direct')
  @HttpCode(HttpStatus.OK)
  async direct(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { friendId } = parseInput(directBody, body);
    const group = await this.groups.directRoom(user.id, friendId);
    await this.gateway.joinRoom([user.id, friendId], group.id);
    this.gateway.emitRoomsChanged([friendId]);
    return group;
  }

  @Get(':groupId')
  get(@CurrentUser() user: AuthUser, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.groups.get(user.id, groupId);
  }

  @Patch(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rename(@CurrentUser() user: AuthUser, @Param('groupId', ParseUUIDPipe) groupId: string, @Body() body: unknown) {
    await this.groups.rename(user.id, groupId, parseInput(renameBody, body).name);
    this.gateway.emitRoomsChanged(await this.groups.memberIds(groupId));
  }

  @Post(':groupId/members')
  @HttpCode(HttpStatus.OK)
  async invite(@CurrentUser() user: AuthUser, @Param('groupId', ParseUUIDPipe) groupId: string, @Body() body: unknown) {
    const { memberIds } = parseInput(inviteBody, body);
    const result = await this.groups.invite(user.id, groupId, memberIds);
    await this.gateway.joinRoom(result.added, groupId);
    this.gateway.emitRoomsChanged(await this.groups.memberIds(groupId));
    return result;
  }

  @Delete(':groupId/members/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(@CurrentUser() user: AuthUser, @Param('groupId', ParseUUIDPipe) groupId: string) {
    const before = await this.groups.memberIds(groupId);
    await this.groups.leave(user.id, groupId);
    this.gateway.emitRoomsChanged(before);
  }

  /** 초대 링크 만들기 (피그마 605 '초대 링크') */
  @Post(':groupId/invite-link')
  @HttpCode(HttpStatus.OK)
  inviteLink(@CurrentUser() user: AuthUser, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.invites.create(user.id, groupId);
  }

  /** 초대 내용 보기 (피그마 738 '그룹방 초대') */
  @Get('invites/:token')
  invitePreview(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.invites.preview(user.id, parseInput(inviteToken, token));
  }

  /** 초대 수락 */
  @Post('invites/:token/accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvite(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    const result = await this.invites.accept(user.id, parseInput(inviteToken, token));
    if (result.joined) {
      await this.gateway.joinRoom([user.id], result.groupId);
      this.gateway.emitRoomsChanged(await this.groups.memberIds(result.groupId));
    }
    return result;
  }

  /** 그룹 안에서 내 위치 공유 잠시 끄기 (WBS 7.2) */
  @Put(':groupId/location-sharing')
  setLocationPaused(@CurrentUser() user: AuthUser, @Param('groupId', ParseUUIDPipe) groupId: string, @Body() body: unknown) {
    return this.groups.setLocationPaused(user.id, groupId, parseInput(pauseBody, body).paused);
  }
}

/**
 * 초대 링크를 연 사람에게 보여 주는 작은 페이지 (로그인 없음).
 * 앱이 깔려 있으면 앱의 초대 화면을 열고, 아니면 설치 안내를 보여 줍니다.
 * 토큰이 맞는지는 여기서 확인하지 않습니다 — 그룹 이름 같은 내용을 로그인 없이 보여 주지 않기 위해서입니다.
 */
@Controller('g')
class InviteLandingController {
  @Get(':token')
  landing(@Param('token') token: string, @Res() res: Response) {
    const safe = inviteToken.safeParse(token).success ? token : '';
    const appUrl = `ramupin://group-invite/${safe}`;
    res.type('html').send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>라무핀 그룹방 초대</title>
<style>body{font-family:system-ui,sans-serif;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f4f6f8;color:#1c2129}
main{background:#fff;border-radius:16px;padding:28px 24px;max-width:340px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}
a.btn{display:block;margin-top:20px;padding:14px;border-radius:12px;background:#0095ff;color:#fff;text-decoration:none;font-weight:600}
p{color:#6b7684;font-size:14px;line-height:1.6}</style></head>
<body><main><h2>라무핀 그룹방에 초대받았어요</h2>
<p>앱에서 초대를 확인하고 수락할 수 있어요.<br>앱이 없다면 먼저 설치해 주세요.</p>
<a class="btn" href="${appUrl}">앱에서 열기</a></main>
<script>${safe ? `location.href=${JSON.stringify(appUrl)};` : ''}</script></body></html>`);
  }
}

@Module({
  imports: [RealtimeModule],
  controllers: [GroupsController, InviteLandingController],
  providers: [GroupsService, GroupInviteService],
  exports: [GroupsService],
})
export class GroupsModule {}
