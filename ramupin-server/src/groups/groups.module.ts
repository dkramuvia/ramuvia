import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { ChatGateway, RealtimeModule } from '../chat/chat.gateway.js';
import { parseInput } from '../common/app-error.js';
import { GroupsService } from './groups.service.js';

const createBody = z.object({ name: z.string().min(1).max(30), memberIds: z.array(z.uuid()).max(49) });
const renameBody = z.object({ name: z.string().min(1).max(30) });
const inviteBody = z.object({ memberIds: z.array(z.uuid()).min(1).max(20) });
const pauseBody = z.object({ paused: z.boolean() });
const directBody = z.object({ friendId: z.uuid() });

@Controller('groups')
@UseGuards(AuthGuard)
class GroupsController {
  constructor(
    private readonly groups: GroupsService,
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

  /** 그룹 안에서 내 위치 공유 잠시 끄기 (WBS 7.2) */
  @Put(':groupId/location-sharing')
  setLocationPaused(@CurrentUser() user: AuthUser, @Param('groupId', ParseUUIDPipe) groupId: string, @Body() body: unknown) {
    return this.groups.setLocationPaused(user.id, groupId, parseInput(pauseBody, body).paused);
  }
}

@Module({
  imports: [RealtimeModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
