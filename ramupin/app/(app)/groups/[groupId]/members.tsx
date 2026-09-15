import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Screen, Tag } from '@/components/ui';
import { FriendRow } from '@/features/friends/FriendRow';
import { useGroup } from '@/features/groups/queries';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme';

/** 피그마: 그룹방 멤버 (283:36361) */
export default function GroupMembersScreen() {
  const { t } = useTranslation();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const me = useAuthStore((s) => s.user);
  const { data: group, isLoading } = useGroup(groupId);
  const others = group?.members.filter((m) => m.id !== me?.id) ?? [];

  return (
    <Screen
      title={t('groups.membersTitle', { count: group?.memberCount ?? 0 })}
      tab="people"
      headerRight={
        // 기획: 우측 상단 사람+ 아이콘 → 그룹 멤버 초대
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('groups.addMember')}
          hitSlop={8}
          onPress={() => router.push({ pathname: '/groups/create', params: { groupId } })}
        >
          <Ionicons name="person-add-outline" size={24} color={colors.text} />
        </Pressable>
      }
      contentStyle={styles.content}
    >
      {isLoading || !group ? (
        <ActivityIndicator color={colors.brown} />
      ) : (
        <>
          <View style={styles.me}>
            <Avatar name={me?.nickname ?? ''} imageUrl={me?.avatarUrl} size={60} />
            <View style={styles.nameRow}>
              <AppText variant="listTitle">{me?.nickname}</AppText>
              <Tag label={t('groups.me')} tone="muted" />
            </View>
          </View>

          <View style={styles.list}>
            {others.map((member) => (
              <FriendRow
                key={member.id}
                friend={member}
                tag={member.role === 'owner' ? <Tag label={t('groups.owner')} /> : undefined}
                onPress={member.myShareLevel ? () => router.push(`/settings/share/${member.id}`) : undefined}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 40, paddingTop: 38 },
  me: { alignItems: 'center', gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { gap: 12 },
});
