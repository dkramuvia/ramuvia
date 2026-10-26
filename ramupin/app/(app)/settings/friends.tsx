import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button, Card, CountActionBar, Popup, Screen, SearchField } from '@/components/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { friendsApi } from '@/api/endpoints/friends';
import { reportsApi } from '@/api/endpoints/reports';
import { friendKeys, useFriends } from '@/features/friends/queries';
import { useColors } from '@/theme';
import type { Friend } from '@/types/models';
import { showToast } from '@/utils/toast';

/** 피그마: 친구 설정 (283:31927). 기획: 친구를 삭제하거나 친구 추가 */
export default function FriendSettingsScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const { data: friends = [] } = useFriends();
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<Friend | null>(null);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  // 차단한 사람 (보완 4.11). 여기서 풀 수 있습니다
  const { data: blocked = [], refetch: refetchBlocked } = useQuery({ queryKey: ['blocks'], queryFn: reportsApi.blocked });

  const unblock = async (userId: string) => {
    try {
      await reportsApi.unblock(userId);
      await refetchBlocked();
      showToast(t('report.unblocked'));
    } catch {
      showToast(t('common.requestFailed'));
    }
  };

  const visible = friends.filter((f) => f.nickname.toLowerCase().includes(query.trim().toLowerCase()));

  // 서버에서 지운 뒤 친구 목록을 다시 받습니다 (예전에는 화면에서만 숨겨 다시 열면 돌아와 있었습니다)
  const remove = async (friend: Friend) => {
    setBusy(true);
    try {
      await friendsApi.remove(friend.id);
      await queryClient.invalidateQueries({ queryKey: friendKeys.list, exact: true });
      showToast(t('friendSettings.removed', { name: friend.nickname }));
    } catch {
      showToast(t('common.requestFailed'));
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <Screen title={t('screens.friendSettings')} tab="map" contentStyle={styles.content}>
      <CountActionBar
        label={t('friendSettings.registered', { count: friends.length })}
        actionLabel={t('friendSettings.addFriend')}
        onAction={() => router.push('/friends/add')}
      />
      <SearchField placeholder={t('groups.searchFriend')} value={query} onChangeText={setQuery} />

      <View style={styles.list}>
        <AppText variant="label1" color={colors.textTertiary}>
          {t('groups.friendName')}
        </AppText>
        {visible.map((f) => (
          <Card key={f.id} style={styles.row} onPress={() => router.push(`/settings/share/${f.id}`)}>
            <Avatar name={f.nickname} imageUrl={f.avatarUrl} />
            <AppText variant="listTitle" style={styles.flex} numberOfLines={1}>
              {f.nickname}
            </AppText>
            <Button label={t('friendSettings.remove')} variant="primaryLight" size="xs" shape="square" onPress={() => setRemoving(f)} />
          </Card>
        ))}
      </View>

      {blocked.length > 0 ? (
        <View style={styles.list}>
          <AppText variant="label1" color={colors.textTertiary}>
            {t('report.blockedTitle')}
          </AppText>
          {blocked.map((b) => (
            <Card key={b.id} style={styles.row}>
              <Avatar name={b.nickname} imageUrl={b.avatarUrl ?? undefined} />
              <AppText variant="listTitle" style={styles.flex} numberOfLines={1}>
                {b.nickname}
              </AppText>
              <Button label={t('report.unblock')} variant="neutral" size="xs" shape="square" onPress={() => void unblock(b.id)} />
            </Card>
          ))}
        </View>
      ) : null}

      <Popup
        visible={!!removing}
        title={t('friendSettings.removeTitle', { name: removing?.nickname })}
        message={t('friendSettings.removeMessage')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setRemoving(null)}
        onDismiss={() => setRemoving(null)}
        confirmLabel={t('friendSettings.remove')}
        onConfirm={() => {
          if (removing && !busy) void remove(removing);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  flex: { flex: 1 },
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingLeft: 8, paddingRight: 16 },
});
