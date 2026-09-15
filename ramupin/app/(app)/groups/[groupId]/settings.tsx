import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, MenuItem, Popup, Screen, Tag } from '@/components/ui';
import { useGroup, useLeaveGroup } from '@/features/groups/queries';
import { useAuthStore } from '@/stores/authStore';
import { colors, radius } from '@/theme';

/** 피그마: 그룹 설정 - 방장 (283:39250) / 멤버 (283:36264) */
export default function GroupSettingsScreen() {
  const { t } = useTranslation();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const me = useAuthStore((s) => s.user);
  const { data: group, isLoading } = useGroup(groupId);
  const leave = useLeaveGroup(groupId);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const isOwner = group?.ownerId === me?.id;

  const onLeave = () =>
    leave.mutate(undefined, {
      onSuccess: () => {
        setConfirmLeave(false);
        router.dismissTo('/people');
      },
    });

  return (
    <Screen title={t('screens.groupSettings')} tab="people" contentStyle={styles.content}>
      {isLoading || !group ? (
        <ActivityIndicator color={colors.brown} />
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
            {/* 기획: 그룹을 개설한 방장에게만 '그룹 프리미엄 기능' 가입하기 노출 */}
            {isOwner ? (
              <View style={styles.premiumCard}>
                <View style={styles.premiumIcon}>
                  <Ionicons name="chatbubble-ellipses" size={26} color={colors.white} />
                </View>
                <AppText variant="listTitle" style={styles.flex}>
                  {t('groups.premium')}
                </AppText>
                <Pressable accessibilityRole="button" onPress={() => router.push(`/groups/${groupId}/premium`)}>
                  <LinearGradient colors={['#F062D6', '#A07BFF']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.joinButton}>
                    <AppText variant="headline" color={colors.backgroundWarm}>
                      {t('groups.join')}
                    </AppText>
                  </LinearGradient>
                </Pressable>
              </View>
            ) : null}

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

const styles = StyleSheet.create({
  content: { gap: 40, paddingTop: 38 },
  flex: { flex: 1 },
  profile: { alignItems: 'center', gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  menu: { gap: 12 },
  premiumCard: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingLeft: 20,
    paddingRight: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
  },
  premiumIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md },
  divider: { height: 1, backgroundColor: 'rgba(133,147,168,0.2)' },
});
