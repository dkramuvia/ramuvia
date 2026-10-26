import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, CountActionBar, Popup, Screen } from '@/components/ui';
import { useLeaveGroup, useMyGroups } from '@/features/groups/queries';
import { useIsMe } from '@/stores/authStore';
import type { GroupDetail } from '@/types/models';
import { showToast } from '@/utils/toast';

/** 피그마: 그룹 설정 목록 (283:32075). 기획: 그룹을 떠나거나 그룹 만들기 */
export default function GroupListScreen() {
  const { t } = useTranslation();
  const isMe = useIsMe();
  const { data: groups = [] } = useMyGroups();
  const [leaving, setLeaving] = useState<GroupDetail | null>(null);

  // 1:1 방은 "그룹 설정"에서 제외 (WBS 7.4: 1:1 도 그룹방이지만 목록은 여러 명인 방만)
  const list = groups.filter((g) => g.memberCount > 2);

  return (
    <Screen title={t('screens.groupList')} tab="map" contentStyle={styles.content}>
      <CountActionBar
        label={t('groupSettings.joined', { count: list.length })}
        actionLabel={t('groupSettings.create')}
        onAction={() => router.push('/groups/create')}
      />
      <View style={styles.list}>
        {list.map((g) => (
          <Card key={g.id} style={styles.row} onPress={() => router.push(`/groups/${g.id}/settings`)}>
            <View style={styles.flex}>
              <AppText variant="listTitle" numberOfLines={1}>
                {g.name}
              </AppText>
              <AppText variant="label2">{t('groupSettings.members', { count: g.memberCount })}</AppText>
            </View>
            <Button
              label={t('groupSettings.leave')}
              variant="primaryLight"
              size="xs"
              shape="square"
              // 방장은 다른 멤버에게 방장을 넘긴 뒤 나갈 수 있습니다 (보완 4.20)
              onPress={() => (isMe(g.ownerId) && g.memberCount > 1 ? showToast(t('groups.transferFirst')) : setLeaving(g))}
            />
          </Card>
        ))}
      </View>
      {leaving ? <LeavePopup group={leaving} onClose={() => setLeaving(null)} /> : null}
    </Screen>
  );
}

function LeavePopup({ group, onClose }: { group: GroupDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const leave = useLeaveGroup(group.id);
  return (
    <Popup
      visible
      title={t('groups.leaveTitle')}
      message={t('groups.leaveMessage')}
      cancelLabel={t('common.cancel')}
      onCancel={onClose}
      onDismiss={onClose}
      confirmLabel={t('groupSettings.leave')}
      onConfirm={() => leave.mutate(undefined, { onSuccess: onClose })}
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: 32 },
  flex: { flex: 1 },
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 62, paddingVertical: 8, paddingLeft: 20, paddingRight: 16 },
});
