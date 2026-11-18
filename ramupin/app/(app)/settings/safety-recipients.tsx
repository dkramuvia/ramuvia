import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, CheckCircle, Screen, SearchField } from '@/components/ui';
import { FriendRow } from '@/features/friends/FriendRow';
import { useFriends } from '@/features/friends/queries';
import { useMyGroups } from '@/features/groups/queries';
import { usePlan } from '@/features/policy/usePlan';
import { useSafetySetting, useSaveSafetySetting } from '@/features/settings/queries';
import { countSosRecipients } from '@/features/sos/recipientCount';
import { useAuthStore } from '@/stores/authStore';
import { useColors } from '@/theme';
import { showToast } from '@/utils/toast';

type Mode = 'friends' | 'groups';

/**
 * 피그마 v3.1: SOS 수신 친구 지정 (7113:29466) / 그룹 지정 (7113:29615)
 * 위의 알약 두 개로 [N명의 친구 등록됨 | 그룹 지정하기] 를 오갑니다. 체크는 초록, 저장은 파랑
 * WBS 10.8: 등급별 수신 인원 제한 (서버 정책값)
 */
export default function SafetyRecipientsScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const { data: setting } = useSafetySetting();
  const save = useSaveSafetySetting();
  const { data: friends = [] } = useFriends();
  const { data: groups = [] } = useMyGroups();
  const { limit } = usePlan();
  const recipientLimit = limit('sosRecipientLimit');
  const myId = useAuthStore((s) => s.user?.id);

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
    // 그룹은 멤버 수만큼, 비회원 연락처도 함께 셉니다 (보완 4.4)
    const next = list === friendIds ? { friendIds: [...friendIds, id], groupIds } : { friendIds, groupIds: [...groupIds, id] };
    const count = countSosRecipients(
      { recipientFriendIds: next.friendIds, recipientGroupIds: next.groupIds, contacts: setting?.contacts ?? [] },
      groups,
      myId,
    );
    if (recipientLimit && count > recipientLimit) {
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
      footer={<Button label={t('common.save')} disabled={save.isPending} onPress={onSave} />}
    >
      <View style={styles.pills}>
        {(['friends', 'groups'] as const).map((m) => (
          <Pressable
            key={m}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
            onPress={() => setMode(m)}
            style={[styles.pill, { backgroundColor: mode === m ? PILL_ON : colors.surfaceStrong }]}
          >
            <AppText variant="label1Bold" color={mode === m ? colors.white : colors.textStrong}>
              {m === 'friends' ? t('safety.friendsRegistered', { count: friends.length }) : t('safety.toGroups')}
            </AppText>
          </Pressable>
        ))}
      </View>
      {mode === 'friends' ? (
        <>
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
                checkColor={CHECK}
                onPress={() => toggle(friendIds, setFriendIds, f.id)}
              />
            ))}
          </View>
        </>
      ) : (
        <>
          <View style={styles.list}>
            {groupList.map((g) => (
              <Card key={g.id} onPress={() => toggle(groupIds, setGroupIds, g.id)} style={styles.groupRow}>
                <View style={styles.flex}>
                  <AppText variant="listTitle">{g.name}</AppText>
                  <AppText variant="caption" color={colors.textTertiary}>
                    {t('groupSettings.members', { count: g.memberCount })}
                  </AppText>
                </View>
                <CheckCircle checked={groupIds.includes(g.id)} color={CHECK} />
              </Card>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

/** 피그마 v3.1: 고른 알약 #33AAFF, 체크 초록 */
const PILL_ON = '#33AAFF';
const CHECK = '#34C759';

const styles = StyleSheet.create({
  content: { gap: 16 },
  pills: { flexDirection: 'row', gap: 40 },
  pill: { flex: 1, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  list: { gap: 12 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 62, paddingVertical: 8, paddingLeft: 20, paddingRight: 12 },
});
