import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { groupsApi } from '@/api/endpoints/groups';
import { AppText, ChipTabs, MenuItem, Popup, QueryState, Screen } from '@/components/ui';
import { useGroup, useGroupAdmin, useInviteLink, useLeaveGroup } from '@/features/groups/queries';
import { useIsMe } from '@/stores/authStore';
import { makeStyles, radius, useColors } from '@/theme';
import { showToast } from '@/utils/toast';
import { formatDate } from '@/utils/time';

type LinkDays = '1' | '7' | '30';

/**
 * 피그마: 그룹 설정 - 방장 (283:39250) / 멤버 (283:36264)
 * 보완 화면 설계 4.20 (피그마 v2.4 1015:51547): 최대 인원(방장 플랜 기준), 초대 링크(복사·유효기간·새로 만들기·끄기),
 * 멤버 권한(초대·사진 올리기·그룹 기본 위치 공개), 그룹방 나가기(방장은 넘긴 뒤), 그룹 삭제(사진·대화 모두).
 * 그룹 프리미엄은 없앴습니다 (10-26 대표님: 혜택은 개인 등급 플래티넘·트리니티만).
 */
export default function GroupSettingsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const isMe = useIsMe();
  const { data: group, isLoading, isError, refetch } = useGroup(groupId);
  const { data: link, refetch: refetchLink } = useInviteLink(groupId);
  const admin = useGroupAdmin(groupId);
  const leave = useLeaveGroup(groupId);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [days, setDays] = useState<LinkDays>('7');

  const myRole = group?.myRole ?? (isMe(group?.ownerId) ? 'owner' : 'member');
  const isOwner = myRole === 'owner';
  const canInvite = myRole !== 'member' || group?.invitePermission !== 'admins';
  const owner = group?.members.find((m) => m.role === 'owner');

  const onLeave = () =>
    leave.mutate(undefined, {
      onSuccess: () => {
        setConfirmLeave(false);
        router.dismissTo('/people');
      },
      onError: (error) => {
        setConfirmLeave(false);
        const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
        showToast(typeof message === 'string' ? message : t('common.requestFailed'));
      },
    });

  const newLink = () =>
    admin.mutate(async () => {
      await groupsApi.inviteLink(groupId, { days: Number(days) as 1 | 7 | 30, renew: true });
      await refetchLink();
    });

  const offLink = () =>
    admin.mutate(async () => {
      await groupsApi.revokeInviteLink(groupId);
      await refetchLink();
    });

  return (
    <Screen title={t('screens.groupSettings')} tab="people" contentStyle={styles.content}>
      {isLoading || isError || !group ? (
        <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} />
      ) : (
        <>
          <View style={styles.header}>
            <AppText variant="listTitle">{group.name}</AppText>
            <AppText variant="label2" color={colors.textTertiary}>
              {t('groups.ownerAndCount', { owner: owner?.nickname ?? '', count: group.memberCount })}
            </AppText>
          </View>

          <Section title={t('groups.sectionBasic')}>
            <MenuItem label={`${t('groups.manageMembers')} · ${t('groups.memberCount', { count: group.memberCount })}`} onPress={() => router.push(`/groups/${groupId}/members`)} />
            {isOwner ? <MenuItem label={t('groups.rename')} onPress={() => router.push(`/groups/${groupId}/rename`)} /> : null}
            <Row label={t('groups.maxMembers')} value={t('groups.maxMembersValue', { count: group.memberLimit ?? 50 })} />
          </Section>

          {canInvite ? (
            <Section title={t('groups.inviteLink')}>
              <View style={styles.linkBox}>
                <AppText variant="label1" numberOfLines={1} style={styles.flex} color={link ? colors.primary : colors.textMuted}>
                  {link ? link.url.replace(/^https?:\/\//, '') : t('groups.noLink')}
                </AppText>
                {link ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={async () => {
                      await Clipboard.setStringAsync(link.url);
                      showToast(t('groups.linkCopied'));
                    }}
                    style={styles.copy}
                  >
                    <AppText variant="label2">{t('groups.copy')}</AppText>
                  </Pressable>
                ) : null}
              </View>
              {link ? (
                <AppText variant="caption" color={colors.textTertiary}>
                  {t('groups.linkExpires', { date: formatDate(link.expiresAt, 'monthDay') })}
                </AppText>
              ) : null}
              <View style={styles.row}>
                <AppText variant="label1" color={colors.textSecondary} style={styles.flex}>
                  {t('groups.linkDays')}
                </AppText>
                <ChipTabs<LinkDays>
                  tone="dark"
                  value={days}
                  onChange={setDays}
                  options={[
                    { value: '1', label: t('groups.days', { count: 1 }) },
                    { value: '7', label: t('groups.days', { count: 7 }) },
                    { value: '30', label: t('groups.days', { count: 30 }) },
                  ]}
                />
              </View>
              <View style={styles.row}>
                <Pressable accessibilityRole="button" onPress={newLink} style={[styles.linkButton, styles.flex]}>
                  <AppText variant="label1">{t('groups.newLink')}</AppText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={offLink} disabled={!link} style={[styles.linkButton, styles.flex, !link && styles.dimmed]}>
                  <AppText variant="label1" color={colors.danger}>
                    {t('groups.linkOff')}
                  </AppText>
                </Pressable>
              </View>
            </Section>
          ) : null}

          <Section title={t('groups.sectionPermissions')}>
            <PermissionRow
              label={t('groups.permInvite')}
              value={group.invitePermission ?? 'all'}
              editable={isOwner}
              onChange={(v) => admin.mutate(() => groupsApi.updateSettings(groupId, { invitePermission: v }))}
            />
            <PermissionRow
              label={t('groups.permPhoto')}
              value={group.photoPermission ?? 'all'}
              editable={isOwner}
              onChange={(v) => admin.mutate(() => groupsApi.updateSettings(groupId, { photoPermission: v }))}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppText variant="label1">{t('groups.defaultShare')}</AppText>
                <AppText variant="caption" color={colors.textTertiary}>
                  {t('groups.defaultShareNote')}
                </AppText>
              </View>
              {isOwner ? (
                <ChipTabs<'exact' | 'blurred'>
                  tone="dark"
                  value={group.defaultShareLevel ?? 'exact'}
                  onChange={(v) => admin.mutate(() => groupsApi.updateSettings(groupId, { defaultShareLevel: v }))}
                  options={[
                    { value: 'exact', label: t('friendShare.exact') },
                    { value: 'blurred', label: t('friendShare.blurred') },
                  ]}
                />
              ) : (
                <AppText variant="label1Bold">{t(`friendShare.${group.defaultShareLevel ?? 'exact'}`)}</AppText>
              )}
            </View>
          </Section>

          <MenuItem
            variant="plain"
            label={isOwner && group.memberCount > 1 ? `${t('groups.leave')} · ${t('groups.leaveAfterTransfer')}` : t('groups.leave')}
            icon={<Ionicons name="log-in-outline" size={22} color={colors.text} />}
            onPress={() => (isOwner && group.memberCount > 1 ? showToast(t('groups.transferFirst')) : setConfirmLeave(true))}
          />
          {isOwner ? (
            <MenuItem
              variant="plain"
              label={`${t('groups.deleteGroup')} · ${t('groups.deleteGroupNote')}`}
              color={colors.danger}
              icon={<Ionicons name="trash-outline" size={22} color={colors.danger} />}
              onPress={() => setConfirmDelete(true)}
            />
          ) : null}
        </>
      )}

      <Popup
        visible={confirmLeave}
        title={t('groups.leaveTitle')}
        message={t('groups.leaveMessage')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmLeave(false)}
        onDismiss={() => setConfirmLeave(false)}
        confirmLabel={t('groups.leave')}
        onConfirm={onLeave}
      />
      <Popup
        visible={confirmDelete}
        title={t('groups.deleteTitle', { name: group?.name })}
        message={t('groups.deleteMessage')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmDelete(false)}
        onDismiss={() => setConfirmDelete(false)}
        confirmLabel={t('groups.deleteGroup')}
        onConfirm={() => {
          setConfirmDelete(false);
          admin.mutate(() => groupsApi.remove(groupId), { onSuccess: () => router.dismissTo('/people') });
        }}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.section}>
      <AppText variant="label1" color={colors.textLabel}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.row}>
      <AppText variant="label1" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="label1" color={colors.textTertiary}>
        {value}
      </AppText>
    </View>
  );
}

/** 멤버 권한 한 줄: 방장·관리자 / 모두 (방장만 바꿈) */
function PermissionRow({ label, value, editable, onChange }: { label: string; value: 'all' | 'admins'; editable: boolean; onChange: (v: 'all' | 'admins') => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <AppText variant="label1" style={styles.flex}>
        {label}
      </AppText>
      {editable ? (
        <ChipTabs<'all' | 'admins'>
          tone="dark"
          value={value}
          onChange={onChange}
          options={[
            { value: 'admins', label: t('groups.permAdmins') },
            { value: 'all', label: t('groups.permAll') },
          ]}
        />
      ) : (
        <AppText variant="label1Bold">{t(value === 'admins' ? 'groups.permAdmins' : 'groups.permAll')}</AppText>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 24, paddingTop: 24 },
  flex: { flex: 1 },
  dimmed: { opacity: 0.4 },
  header: { alignItems: 'center', gap: 4 },
  section: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  linkBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  copy: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceStrong },
  linkButton: { alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface },
}));
