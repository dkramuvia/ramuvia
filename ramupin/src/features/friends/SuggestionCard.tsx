import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button } from '@/components/ui';
import { colors, radius } from '@/theme';
import type { FriendSuggestion } from '@/types/models';
import { formatRelativeTime } from '@/utils/time';

interface SuggestionCardProps {
  suggestion: FriendSuggestion;
  onRequest: () => void;
  pending?: boolean;
}

/** 피그마 연락처 친구 / 근처 친구 카드: 이름 + 시간, 오른쪽 "친구 요청" 또는 "요청됨 ✓" */
export function SuggestionCard({ suggestion, onRequest, pending }: SuggestionCardProps) {
  const { t } = useTranslation();
  const { user, requested } = suggestion;

  return (
    <View style={styles.card}>
      <View style={styles.person}>
        <Avatar name={user.nickname} imageUrl={user.avatarUrl} />
        <View style={styles.texts}>
          <AppText variant="listTitle" numberOfLines={1}>
            {user.nickname}
          </AppText>
          <AppText variant="caption" color={colors.textTertiary}>
            {formatRelativeTime(suggestion.foundAt)}
          </AppText>
        </View>
      </View>
      {requested ? (
        <View style={[styles.button, styles.requested]}>
          <AppText variant="body1" color={colors.textOnDark}>
            {t('friendAdd.requested')}
          </AppText>
          <Ionicons name="checkmark" size={20} color={colors.textOnDark} />
        </View>
      ) : (
        <Button
          label={t('friendAdd.request')}
          variant="primaryLight"
          size="sm"
          disabled={pending}
          onPress={onRequest}
          style={styles.button}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  texts: { flex: 1, gap: 2 },
  button: { width: 119, height: 36 },
  requested: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.full,
    backgroundColor: '#99D5FF',
  },
});
