import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { RequestSentPopup } from '@/features/friends/RequestSentPopup';
import { SuggestionCard } from '@/features/friends/SuggestionCard';
import { useNearbyUsers, useSendFriendRequest } from '@/features/friends/queries';
import { colors } from '@/theme';

/**
 * 피그마: 근처 친구 (363:19156)
 * TODO(5단계): 서버가 내 현재 위치 반경 안의 사용자를 찾아줌. BLE 근거리 탐색은 2차 (WBS 12.9b)
 */
export default function NearbyFriendsScreen() {
  const { t } = useTranslation();
  const { data: suggestions = [], isLoading } = useNearbyUsers();
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

      <View style={styles.list}>
        <AppText variant="label1" color={colors.textTertiary}>
          {t('friendAdd.nearbyList')}
        </AppText>
        {isLoading ? <ActivityIndicator color={colors.brown} /> : null}
        {!isLoading && suggestions.length === 0 ? (
          <AppText variant="label1" color={colors.textMuted}>
            {t('friendAdd.nearbyEmpty')}
          </AppText>
        ) : null}
        {suggestions.map((s) => (
          <SuggestionCard
            key={s.user.id}
            suggestion={s}
            pending={send.isPending}
            onRequest={() => send.mutate(s.user.id, { onSuccess: () => setSentTo(s.user.nickname) })}
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
