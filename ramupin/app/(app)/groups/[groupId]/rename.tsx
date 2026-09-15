import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button, Screen, TextField } from '@/components/ui';
import { useGroup, useRenameGroup } from '@/features/groups/queries';
import { showToast } from '@/utils/toast';

// TODO(정책): 그룹명 최대 글자 수 서버 정책값 사용
const GROUP_NAME_MAX = 10;

/** 피그마: 그룹 이름 변경 (360:20007) */
export default function GroupRenameScreen() {
  const { t } = useTranslation();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { data: group } = useGroup(groupId);
  const rename = useRenameGroup(groupId);
  const [name, setName] = useState('');

  useEffect(() => {
    if (group) setName(group.name.slice(0, GROUP_NAME_MAX));
  }, [group]);

  const trimmed = name.trim();
  const onSave = () =>
    rename.mutate(trimmed, {
      onSuccess: () => {
        showToast(t('groups.renamed'));
        router.back();
      },
    });

  return (
    <Screen title={t('groups.rename')} tab="people" contentStyle={styles.content}>
      <TextField
        label={t('groups.groupName')}
        placeholder={t('groups.groupNamePlaceholder')}
        value={name}
        onChangeText={setName}
        maxLength={GROUP_NAME_MAX}
        showCount
      />
      <Button
        label={t('groups.rename')}
        variant="brownLight"
        size="sm"
        shape="rounded"
        disabled={!trimmed || trimmed === group?.name || rename.isPending}
        onPress={onSave}
        style={styles.submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 40 },
  submit: { height: 46, marginHorizontal: 10 },
});
