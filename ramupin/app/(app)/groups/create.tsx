import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, SearchField } from '@/components/ui';
import { FriendRow } from '@/features/friends/FriendRow';
import { useFriends } from '@/features/friends/queries';
import { useGroup, useInviteToGroup } from '@/features/groups/queries';
import { colors, radius } from '@/theme';
import { showToast } from '@/utils/toast';

/**
 * 피그마: 그룹 만들기 - 친구 선택 (283:38591 / 선택됨 283:38916)
 * 같은 화면을 그룹 멤버 초대에도 씁니다: /groups/create?groupId=...
 */
export default function GroupCreateScreen() {
  const { t } = useTranslation();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const isInvite = !!groupId;

  const { data: friends = [] } = useFriends();
  const { data: group } = useGroup(groupId ?? '');
  const invite = useInviteToGroup(groupId ?? '');

  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 초대 모드에서는 이미 그룹에 있는 친구를 뺍니다
  const candidates = useMemo(() => {
    const memberIds = new Set(group?.members.map((m) => m.id));
    return friends.filter((f) => !memberIds.has(f.id) && f.nickname.toLowerCase().includes(query.trim().toLowerCase()));
  }, [friends, group, query]);

  const toggle = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const onSubmit = () => {
    if (isInvite) {
      invite.mutate(selectedIds, {
        onSuccess: () => {
          showToast(t('groups.invited'));
          router.back();
        },
      });
    } else {
      router.push({ pathname: '/groups/create-name', params: { members: selectedIds.join(',') } });
    }
  };

  return (
    <Screen title={t(isInvite ? 'groups.addMember' : 'screens.groupCreate')} tab="people" contentStyle={styles.content}>
      {selectedIds.length === 0 ? (
        <View style={styles.countBar}>
          <AppText variant="label1" color={colors.white}>
            {t('groups.registeredFriends', { count: friends.length })}
          </AppText>
        </View>
      ) : (
        <Button
          label={t('groups.inviteSelected', { count: selectedIds.length })}
          variant="brownLight"
          size="sm"
          shape="rounded"
          disabled={invite.isPending}
          onPress={onSubmit}
          style={styles.submit}
        />
      )}

      <SearchField placeholder={t('groups.searchFriend')} value={query} onChangeText={setQuery} />

      <View style={styles.list}>
        <AppText variant="label1" color={colors.textTertiary}>
          {t('groups.friendName')}
        </AppText>
        {candidates.length === 0 ? (
          <AppText variant="label1" color={colors.textMuted} style={styles.empty}>
            {t('groups.noSearchResult')}
          </AppText>
        ) : null}
        {candidates.map((friend) => (
          <FriendRow key={friend.id} friend={friend} selected={selectedIds.includes(friend.id)} onPress={() => toggle(friend.id)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  countBar: {
    height: 46,
    marginHorizontal: 10,
    borderRadius: radius.xs,
    backgroundColor: colors.brown,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submit: { height: 46, marginHorizontal: 10 },
  list: { gap: 12, marginTop: 4 },
  empty: { paddingVertical: 16 },
});
