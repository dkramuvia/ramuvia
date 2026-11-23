import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { formatTimeOfDay } from '@/utils/time';
import { useActiveSos } from './queries';
import { useResolveSosConfirm } from './ResolveSosConfirm';

/**
 * 지도 위 "SOS 도움 요청 중 · 상황 종료" 띠 (대표 리포트 4차).
 * 예전에는 상황 종료 버튼이 전송됨 화면에만 있어, 그 화면을 닫거나 앱을 다시 켜면 SOS 를 끝낼 방법이 없었습니다.
 * 서버 기록으로 판단하므로 앱을 다시 켜도 나옵니다. 띠를 누르면 SOS 기록(보낸 SOS)으로 갑니다
 */
export function ActiveSosBanner() {
  const { t } = useTranslation();
  const active = useActiveSos();
  const confirm = useResolveSosConfirm();
  if (!active) return null;

  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/sos-received', params: { tab: 'sent' } })} style={styles.left}>
        <Ionicons name="alert-circle" size={18} color="#FFFFFF" />
        <AppText variant="label1Bold" color="#FFFFFF" numberOfLines={1} style={styles.flex}>
          {t('sos.activeBanner', { time: formatTimeOfDay(active.createdAt) })}
        </AppText>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={confirm.pending} onPress={() => confirm.ask(active.id)} hitSlop={6} style={styles.end}>
        <AppText variant="label2Bold" color="#E8261B">
          {t('sos.resolveShort')}
        </AppText>
      </Pressable>
      {confirm.popup}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E8261B',
  },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  flex: { flex: 1 },
  end: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFFFFF' },
});
