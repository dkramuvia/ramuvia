import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { groupsApi } from '@/api/endpoints/groups';
import { AppText, Avatar, Button, Popup, QueryState, Screen, Tag } from '@/components/ui';
import { FriendRow } from '@/features/friends/FriendRow';
import { useGroup, useGroupAdmin } from '@/features/groups/queries';
import { useAuthStore, useIsMe } from '@/stores/authStore';
import { makeStyles, radius, useColors } from '@/theme';
import type { GroupMember } from '@/types/models';

type Confirm = { kind: 'transfer' | 'kick'; member: GroupMember };

/**
 * 피그마: 그룹방 멤버 (283:36361)
 * 보완 화면 설계 4.19 (피그마 v2.4 1015:51348): 방장 시점에서 인원/최대 인원, 역할(방장·관리자·멤버),
 * 멤버별 메뉴(관리자로 지정, 방장 넘기기, 그룹에서 내보내기).
 *   방장 = 모든 권한 / 관리자 = 초대·내보내기(방장·다른 관리자 제외) / 멤버 = 보기·사진·대화
 */
export default function GroupMembersScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const me = useAuthStore((s) => s.user);
  const isMe = useIsMe();
  const { data: group, isLoading, isError, refetch } = useGroup(groupId);
  const admin = useGroupAdmin(groupId);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const myRole = group?.myRole ?? (isMe(group?.ownerId) ? 'owner' : 'member');
  const others = group?.members.filter((m) => !isMe(m.id)) ?? [];
  const canInvite = myRole !== 'member' || group?.invitePermission !== 'admins';

  /** 이 멤버에게 내가 할 수 있는 것 */
  const actionsFor = (m: GroupMember) => ({
    role: myRole === 'owner' && m.role !== 'owner',
    transfer: myRole === 'owner' && m.role !== 'owner',
    kick: m.role !== 'owner' && (myRole === 'owner' || (myRole === 'admin' && m.role === 'member')),
  });

  const onConfirm = () => {
    if (!confirm) return;
    const { kind, member } = confirm;
    setConfirm(null);
    admin.mutate(kind === 'transfer' ? () => groupsApi.transferOwner(groupId, member.id) : () => groupsApi.kick(groupId, member.id));
  };

  return (
    <Screen title={t('groups.manageMembers')} tab="people" contentStyle={styles.content}>
      {isLoading || isError || !group ? (
        <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} />
      ) : (
        <>
          {/* 인원 / 최대 인원 + 멤버 초대 */}
          <View style={styles.countBar}>
            <AppText variant="body2Bold" style={styles.flex}>
              {t('groups.memberCountLimit', { count: group.memberCount, limit: group.memberLimit ?? 50 })}
            </AppText>
            {canInvite ? (
              <Button label={t('groups.inviteMember')} size="xs" variant="dark" onPress={() => router.push({ pathname: '/groups/create', params: { groupId } })} />
            ) : null}
          </View>

          <View style={styles.meRow}>
            <Avatar name={me?.nickname ?? ''} imageUrl={me?.avatarUrl} size={40} />
            <AppText variant="listTitle" style={styles.flex}>
              {me?.nickname} {t('groups.meSuffix')}
            </AppText>
            <RoleTag role={myRole} />
          </View>

          <View style={styles.list}>
            {others.map((member) => {
              const can = actionsFor(member);
              const hasMenu = can.role || can.transfer || can.kick;
              return (
                <View key={member.id}>
                  <FriendRow
                    friend={member}
                    tag={<RoleTag role={member.role} />}
                    onPress={member.myShareLevel ? () => router.push(`/settings/share/${member.id}`) : undefined}
                    action={
                      hasMenu ? (
                        <Pressable accessibilityRole="button" accessibilityLabel={t('groups.memberMenu')} hitSlop={10} onPress={() => setMenuId(menuId === member.id ? null : member.id)}>
                          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
                        </Pressable>
                      ) : undefined
                    }
                  />
                  {menuId === member.id ? (
                    <View style={styles.menu}>
                      <AppText variant="caption" color={colors.textTertiary} style={styles.menuTitle}>
                        {member.nickname} · {t(`groups.role.${member.role}`)}
                      </AppText>
                      {can.role ? (
                        <MenuAction
                          label={t(member.role === 'admin' ? 'groups.unsetAdmin' : 'groups.setAdmin')}
                          onPress={() => {
                            setMenuId(null);
                            admin.mutate(() => groupsApi.setRole(groupId, member.id, member.role === 'admin' ? 'member' : 'admin'));
                          }}
                        />
                      ) : null}
                      {can.transfer ? (
                        <MenuAction
                          label={t('groups.transferOwner')}
                          onPress={() => {
                            setMenuId(null);
                            setConfirm({ kind: 'transfer', member });
                          }}
                        />
                      ) : null}
                      {can.kick ? (
                        <MenuAction
                          label={t('groups.kick')}
                          danger
                          onPress={() => {
                            setMenuId(null);
                            setConfirm({ kind: 'kick', member });
                          }}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          <View style={styles.note}>
            <AppText variant="caption" color={colors.textTertiary}>
              {t('groups.kickNote')}
            </AppText>
          </View>
        </>
      )}

      <Popup
        visible={!!confirm}
        title={confirm?.kind === 'transfer' ? t('groups.transferTitle', { name: confirm.member.nickname }) : t('groups.kickTitle', { name: confirm?.member.nickname })}
        message={confirm?.kind === 'transfer' ? t('groups.transferMessage') : t('groups.kickMessage')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirm(null)}
        onDismiss={() => setConfirm(null)}
        confirmLabel={confirm?.kind === 'transfer' ? t('groups.transferOwner') : t('groups.kick')}
        onConfirm={onConfirm}
      />
    </Screen>
  );
}

function RoleTag({ role }: { role: GroupMember['role'] }) {
  const { t } = useTranslation();
  if (role === 'member') return null;
  return <Tag label={t(`groups.role.${role}`)} tone={role === 'owner' ? 'strong' : 'muted'} />;
}

function MenuAction({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuItem}>
      <AppText variant="body2" color={danger ? colors.danger : colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 16, paddingTop: 16 },
  flex: { flex: 1 },
  countBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  list: { gap: 12 },
  menu: { marginTop: 6, borderRadius: radius.md, backgroundColor: colors.card, paddingVertical: 4, borderWidth: 1, borderColor: colors.borderLight },
  menuTitle: { paddingHorizontal: 16, paddingTop: 8 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  note: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight },
}));
