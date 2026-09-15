import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button, Card, CountActionBar, Popup, Screen, SearchField } from '@/components/ui';
import { useFriends } from '@/features/friends/queries';
import { colors } from '@/theme';
import type { Friend } from '@/types/models';
import { showToast } from '@/utils/toast';

/** 피그마: 친구 설정 (283:31927). 기획: 친구를 삭제하거나 친구 추가 */
export default function FriendSettingsScreen() {
  const { t } = useTranslation();
  const { data: friends = [] } = useFriends();
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<Friend | null>(null);
  // TODO(5단계): 친구 삭제 API. 지금은 화면에서만 숨김
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const visible = friends.filter((f) => !removedIds.includes(f.id) && f.nickname.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Screen title={t('screens.friendSettings')} tab="map" contentStyle={styles.content}>
      <CountActionBar
        label={t('friendSettings.registered', { count: friends.length - removedIds.length })}
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

      <Popup
        visible={!!removing}
        title={t('friendSettings.removeTitle', { name: removing?.nickname })}
        message={t('friendSettings.removeMessage')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setRemoving(null)}
        onDismiss={() => setRemoving(null)}
        confirmLabel={t('friendSettings.remove')}
        onConfirm={() => {
          if (removing) setRemovedIds((ids) => [...ids, removing.id]);
          showToast(t('friendSettings.removed', { name: removing?.nickname }));
          setRemoving(null);
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
