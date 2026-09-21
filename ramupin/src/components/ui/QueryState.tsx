import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from './AppText';
import { Button } from './Button';
import { colors } from '@/theme';

/**
 * 불러오는 중 / 실패했을 때 보여 주는 화면.
 *
 * 09-21 에 친구별 상세 공유가 로딩바만 도는 문제가 있었습니다. 서버에 닿지 못하면
 * 요청이 실패하는데 화면에는 로딩 분기밖에 없어, 사용자 눈에는 앱이 멈춘 것으로 보입니다.
 * 지하철이나 통신 장애에서 실제로 겪는 상황이라 같은 화면이 13곳에 있었습니다.
 *
 * 쓰는 법:
 *   const { data, isLoading, isError, refetch } = useSomething();
 *   if (isLoading || isError) return <QueryState loading={isLoading} error={isError} onRetry={refetch} />;
 */
export function QueryState({
  loading,
  error,
  onRetry,
  style,
  tone = 'light',
}: {
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  style?: object;
  /** 어두운 배경 화면(갤러리)에서는 흰색으로 */
  tone?: 'light' | 'dark';
}) {
  const { t } = useTranslation();
  const fg = tone === 'dark' ? colors.white : colors.brown;

  if (error) {
    return (
      <View style={[styles.center, style]}>
        <AppText variant="body2" color={tone === 'dark' ? colors.white : colors.textSecondary} align="center">
          {t('common.loadFailed')}
        </AppText>
        {onRetry ? <Button label={t('common.retry')} size="sm" variant={tone === 'dark' ? 'white' : 'neutral'} onPress={onRetry} /> : null}
      </View>
    );
  }
  if (loading) return <ActivityIndicator style={[styles.loading, style]} color={fg} />;
  return null;
}

const styles = StyleSheet.create({
  loading: { marginTop: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
});
