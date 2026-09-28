import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button, QueryState, Screen, ToggleRow } from '@/components/ui';
import { useFriendAlerts, useSaveFriendAlerts } from '@/features/friends/queries';
import { useFriends } from '@/features/friends/queries';
import { colors } from '@/theme';
import { showToast } from '@/utils/toast';

/**
 * 친구별 맞춤 알림 설정 (피그마 2026-09-28).
 *
 * 지금까지 알림은 전체 켜기/끄기뿐이었습니다. 친구가 여러 명이면
 * "어머니 것만 받고 싶다" 를 할 수 없었습니다. 친구마다 따로 정합니다.
 */

type AlertKey = 'battery' | 'safeZone' | 'speeding' | 'nearby';

const ITEMS: AlertKey[] = ['battery', 'safeZone', 'speeding', 'nearby'];

export default function FriendAlertsScreen() {
  const { t } = useTranslation();
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  const { data: friends = [] } = useFriends();
  const friend = friends.find((f) => f.id === friendId);

  const { data: saved, isLoading, isError, refetch } = useFriendAlerts(friendId);
  const save = useSaveFriendAlerts(friendId);
  const [value, setValue] = useState<Record<AlertKey, boolean> | null>(null);

  useEffect(() => {
    if (saved) setValue({ battery: saved.battery, safeZone: saved.safeZone, speeding: saved.speeding, nearby: saved.nearby });
  }, [saved]);

  const name = friend?.nickname ?? '';

  return (
    <Screen
      title={t('screens.friendAlerts')}
      tab="map"
      contentStyle={styles.content}
      footer={
        <Button
          label={t('friendAlerts.save')}
          size="lg"
          disabled={!value || save.isPending}
          onPress={() =>
            value &&
            save.mutate(value, {
              onSuccess: () => {
                showToast(t('friendAlerts.saved'));
                router.back();
              },
            })
          }
        />
      }
    >
      <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} />

      {value ? (
        <>
          <View style={styles.who}>
            <Avatar name={name} imageUrl={friend?.avatarUrl} />
            <AppText variant="listTitle">{name}</AppText>
          </View>
          <AppText variant="label1" color={colors.textSecondary}>
            {t('friendAlerts.question', { name })}
          </AppText>

          {ITEMS.map((key) => (
            <ToggleRow
              key={key}
              title={t(`friendAlerts.${key}`)}
              description={t(`friendAlerts.${key}Desc`)}
              value={value[key]}
              onValueChange={(next) => setValue({ ...value, [key]: next })}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
