import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/components/ui';
import { FriendRow } from '@/features/friends/FriendRow';
import { useFriends } from '@/features/friends/queries';
import { useCreateGroup } from '@/features/groups/queries';
import { colors } from '@/theme';

// TODO(정책): 그룹명 최대 글자 수 서버 정책값 사용
const GROUP_NAME_MAX = 10;

/** 피그마: 그룹 만들기 - 그룹명 지정 (283:39047) */
export default function GroupCreateNameScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ members?: string }>();
  const { data: friends = [] } = useFriends();
  const create = useCreateGroup();

  const [name, setName] = useState('');
  // 여기서 체크를 해제하면 초대 대상에서 빠집니다
  const [selectedIds, setSelectedIds] = useState<string[]>(() => (params.members ? params.members.split(',') : []));
  const invited = friends.filter((f) => params.members?.split(',').includes(f.id));

  const toggle = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const onCreate = () =>
    create.mutate(
      { name: name.trim(), memberIds: selectedIds },
      {
        onSuccess: (group) => {
          // 친구 선택·그룹명 화면을 닫고 새 그룹 채팅방으로 이동
          router.dismissTo('/people');
          router.push(`/chat/${group.id}`);
        },
      },
    );

  return (
    <Screen title={t('screens.groupCreate')} tab="people" contentStyle={styles.content}>
      <TextField
        label={t('groups.groupName')}
        placeholder={t('groups.groupNamePlaceholder')}
        value={name}
        onChangeText={setName}
        maxLength={GROUP_NAME_MAX}
        showCount
      />

      <View style={styles.list}>
        <AppText variant="label1" color={colors.textTertiary}>
          {t('groups.invitedMembers')}
        </AppText>
        {invited.map((friend) => (
          <FriendRow key={friend.id} friend={friend} selected={selectedIds.includes(friend.id)} onPress={() => toggle(friend.id)} />
        ))}
      </View>

      <Button
        label={t('groups.createSelected', { count: selectedIds.length })}
        variant="brownLight"
        size="sm"
        shape="rounded"
        disabled={!name.trim() || selectedIds.length === 0 || create.isPending}
        onPress={onCreate}
        style={styles.submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24 },
  list: { gap: 12 },
  submit: { height: 46, marginHorizontal: 10 },
});
