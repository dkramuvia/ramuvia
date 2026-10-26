import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, Avatar, MenuItem, Popup, QueryState, Screen, Tag } from '@/components/ui';
import { useGroup, useLeaveGroup } from '@/features/groups/queries';
import { useAuthStore, useIsMe } from '@/stores/authStore';
import { makeStyles, useColors } from '@/theme';

/** 피그마: 그룹 설정 - 방장 (283:39250) / 멤버 (283:36264) */
export default function GroupSettingsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const me = useAuthStore((s) => s.user);
  const isMe = useIsMe();
  const { data: group, isLoading, isError, refetch } = useGroup(groupId);
  const leave = useLeaveGroup(groupId);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const isOwner = isMe(group?.ownerId);

  const onLeave = () =>
    leave.mutate(undefined, {
      onSuccess: () => {
        setConfirmLeave(false);
        router.dismissTo('/people');
      },
    });

  return (
    <Screen title={t('screens.groupSettings')} tab="people" contentStyle={styles.content}>
      {isLoading || isError || !group ? (
        <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} />
      ) : (
        <>
          <View style={styles.profile}>
            <Avatar name={me?.nickname ?? ''} imageUrl={me?.avatarUrl} size={60} />
            <View style={styles.nameRow}>
              <AppText variant="listTitle">{me?.nickname}</AppText>
              <Tag label={t(isOwner ? 'groups.owner' : 'groups.member')} tone={isOwner ? 'strong' : 'muted'} />
            </View>
            <AppText variant="body2" color="#8593A8">
              {t('groups.memberCount', { count: group.memberCount })}
            </AppText>
          </View>

          <View style={styles.menu}>
            {/* 그룹 프리미엄은 없앴습니다 (10-26 대표님: 혜택은 개인 등급 플래티넘·트리니티만) */}
            <MenuItem
              variant="plain"
              label={t('groups.manageMembers')}
              icon={<Ionicons name="people-outline" size={22} color={colors.text} />}
              onPress={() => router.push(`/groups/${groupId}/members`)}
            />
            {isOwner ? (
              <MenuItem
                variant="plain"
                label={t('groups.rename')}
                icon={<Ionicons name="pencil-outline" size={20} color={colors.text} />}
                onPress={() => router.push(`/groups/${groupId}/rename`)}
              />
            ) : null}
            <View style={styles.divider} />
            <MenuItem
              variant="plain"
              label={t('groups.leave')}
              icon={<Ionicons name="log-in-outline" size={22} color={colors.text} />}
              onPress={() => setConfirmLeave(true)}
            />
          </View>
        </>
      )}

      <Popup
        visible={confirmLeave}
        title={t('groups.leaveTitle')}
        message={t(isOwner ? 'groups.leaveOwnerMessage' : 'groups.leaveMessage')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmLeave(false)}
        onDismiss={() => setConfirmLeave(false)}
        confirmLabel={t('groups.leave')}
        onConfirm={onLeave}
      />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 40, paddingTop: 38 },
  profile: { alignItems: 'center', gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  menu: { gap: 12 },
  divider: { height: 1, backgroundColor: 'rgba(133,147,168,0.2)' },
}));
