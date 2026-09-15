import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, CheckCircle, CountActionBar, Screen, SearchField } from '@/components/ui';
import { FriendRow } from '@/features/friends/FriendRow';
import { useFriends } from '@/features/friends/queries';
import { useMyGroups } from '@/features/groups/queries';
import { usePlan } from '@/features/policy/usePlan';
import { useSafetySetting, useSaveSafetySetting } from '@/features/settings/queries';
import { colors } from '@/theme';
import { showToast } from '@/utils/toast';

type Mode = 'friends' | 'groups';

/**
 * 피그마: SOS 수신 친구 지정 (283:32758) / 수신 그룹 지정 (283:32888)
 * 기획: 상단 "그룹 지정하기"를 누르면 그룹 지정, 그룹 화면에서 "친구 지정하기"를 누르면 친구 개별 지정
 * WBS 10.8: 등급별 수신 인원 제한 (서버 정책값)
 */
export default function SafetyRecipientsScreen() {
  const { t } = useTranslation();
  const { data: setting } = useSafetySetting();
  const save = useSaveSafetySetting();
  const { data: friends = [] } = useFriends();
  const { data: groups = [] } = useMyGroups();
  const { limit } = usePlan();
  const recipientLimit = limit('sosRecipientLimit');

  const [mode, setMode] = useState<Mode>('friends');
  const [query, setQuery] = useState('');
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);

  useEffect(() => {
    if (!setting) return;
    setFriendIds(setting.recipientFriendIds);
    setGroupIds(setting.recipientGroupIds);
  }, [setting]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    if (list.includes(id)) return set(list.filter((x) => x !== id));
    if (recipientLimit && friendIds.length + groupIds.length >= recipientLimit) {
      showToast(t('safety.limit', { limit: recipientLimit }));
      return;
    }
    set([...list, id]);
  };

  const onSave = () => {
    if (!setting) return;
    save.mutate(
      { ...setting, recipientFriendIds: friendIds, recipientGroupIds: groupIds },
      {
        onSuccess: () => {
          showToast(t('safety.saved'));
          router.back();
        },
      },
    );
  };

  const groupList = groups.filter((g) => g.memberCount > 2);
  const filteredFriends = friends.filter((f) => f.nickname.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Screen
      title={t('screens.safety')}
      tab="map"
      contentStyle={styles.content}
      footer={
        <Button
          variant="danger"
          label={mode === 'friends' ? t('safety.pickFriends', { count: friendIds.length }) : t('safety.pickGroups', { count: groupIds.length })}
          disabled={save.isPending}
          onPress={onSave}
        />
      }
    >
      {mode === 'friends' ? (
        <>
          <CountActionBar
            label={t('safety.friendsRegistered', { count: friends.length })}
            actionLabel={t('safety.toGroups')}
            onAction={() => setMode('groups')}
          />
          <SearchField placeholder={t('groups.searchFriend')} value={query} onChangeText={setQuery} />
          <View style={styles.list}>
            <AppText variant="label1" color={colors.textTertiary}>
              {t('groups.friendName')}
            </AppText>
            {filteredFriends.map((f) => (
              <FriendRow
                key={f.id}
                friend={f}
                selected={friendIds.includes(f.id)}
                checkColor={colors.sos}
                onPress={() => toggle(friendIds, setFriendIds, f.id)}
              />
            ))}
          </View>
        </>
      ) : (
        <>
          <CountActionBar
            label={t('safety.groupsJoined', { count: groupList.length })}
            actionLabel={t('safety.toFriends')}
            onAction={() => setMode('friends')}
          />
          <View style={styles.list}>
            {groupList.map((g) => (
              <Card key={g.id} onPress={() => toggle(groupIds, setGroupIds, g.id)} style={styles.groupRow}>
                <View style={styles.flex}>
                  <AppText variant="listTitle">{g.name}</AppText>
                  <AppText variant="label2">{t('groupSettings.members', { count: g.memberCount })}</AppText>
                </View>
                <CheckCircle checked={groupIds.includes(g.id)} color={colors.sos} />
              </Card>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  flex: { flex: 1 },
  list: { gap: 12 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 62, paddingVertical: 8, paddingLeft: 20, paddingRight: 12 },
});
