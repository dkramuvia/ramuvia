import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { AppText, QueryState, Screen, ToggleRow } from '@/components/ui';
import { RequestSentPopup } from '@/features/friends/RequestSentPopup';
import { SuggestionCard } from '@/features/friends/SuggestionCard';
import { useNearbyDiscoverable, useNearbyUsers, useSendFriendRequest, useSetNearbyDiscoverable } from '@/features/friends/queries';
import { useColors } from '@/theme';

/**
 * 피그마: 근처 친구 (363:19156)
 *
 * **서로 동의한 사람끼리만 보입니다.** 아직 친구가 아닌 사람에게 "이 근처에 있다" 를
 * 알려 주는 기능이라, 위치정보법상 본인 동의가 필요합니다. 기본은 꺼짐이고,
 * 내가 켜야 남도 보입니다 — 내 위치는 숨기면서 남만 보는 것은 공평하지 않습니다.
 *
 * TODO(2차): BLE 근거리 탐색 (WBS 12.9b)
 */
export default function NearbyFriendsScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const { data: discoverable = false } = useNearbyDiscoverable();
  const setDiscoverable = useSetNearbyDiscoverable();
  const { data: suggestions = [], isLoading, isError, refetch } = useNearbyUsers();
  const send = useSendFriendRequest();
  const [sentTo, setSentTo] = useState<string | null>(null);

  return (
    <Screen
      title={t('friendAdd.nearbySearching')}
      contentStyle={styles.content}
      footer={
        <AppText variant="label2" color={colors.textSecondary} align="center">
          {t('friendAdd.nearbyNotice')}
        </AppText>
      }
    >
      <Image source={require('../../../assets/images/nearby-radar.png')} style={styles.image} />

      <ToggleRow
        title={t('friendAdd.nearbyDiscoverable')}
        description={t('friendAdd.nearbyDiscoverableDesc')}
        value={discoverable}
        onValueChange={(on) => setDiscoverable.mutate(on)}
      />

      <View style={styles.list}>
        <AppText variant="label1" color={colors.textTertiary}>
          {t('friendAdd.nearbyList')}
        </AppText>
        {/* 꺼 두면 목록이 늘 비어 있습니다. 왜 비었는지 알려 줘야 합니다 */}
        {!discoverable ? (
          <AppText variant="label1" color={colors.textMuted}>
            {t('friendAdd.nearbyNeedsOptIn')}
          </AppText>
        ) : null}
        {discoverable ? <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} /> : null}
        {discoverable && !isLoading && !isError && suggestions.length === 0 ? (
          <AppText variant="label1" color={colors.textMuted}>
            {t('friendAdd.nearbyEmpty')}
          </AppText>
        ) : null}
        {suggestions.map((s) => (
          <SuggestionCard
            key={s.user.id}
            suggestion={s}
            pending={send.isPending}
            onRequest={() => send.mutate({ userId: s.user.id }, { onSuccess: () => setSentTo(s.user.nickname) })}
          />
        ))}
      </View>

      <RequestSentPopup nickname={sentTo} onClose={() => setSentTo(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 32 },
  image: { alignSelf: 'center', width: 150, height: 150 },
  list: { gap: 12 },
});
