import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, StyleSheet, View } from 'react-native';

import { AppText, Button, Popup, Screen, ToggleRow } from '@/components/ui';
import {
  currentIntervalSec,
  isBackgroundTrackingOn,
  startBackgroundTracking,
  stopBackgroundTracking,
} from '@/features/location/backgroundTask';
import { outboxStats, flushLocationOutbox, type OutboxStats } from '@/features/location/uploader';
import { colors, radius } from '@/theme';
import { showToast } from '@/utils/toast';

/**
 * 위치 수집 설정 (WBS 2.4, 4.3).
 * 기획에는 없는 화면이지만, "항상 허용" 권한을 쓰려면 Play 정책상 사용자가 끄고 켤 수 있어야 합니다.
 * 아래 수집 현황은 배터리·전송 확인용입니다 (2단계 PoC).
 */
export default function LocationSettingsScreen() {
  const { t } = useTranslation();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<OutboxStats | null>(null);
  const [intervalSec, setIntervalSec] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setOn(await isBackgroundTrackingOn());
    setStats(await outboxStats());
    setIntervalSec(currentIntervalSec());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // 화면을 열어둔 채 확인할 때도 현황이 갱신되도록
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 5000);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && void refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  // Play 정책: "항상 허용"을 묻기 전에 무엇을 위해 쓰는지 앱 안에서 먼저 알려야 합니다 (사전 고지)
  const [disclosure, setDisclosure] = useState(false);

  const toggle = async (next: boolean) => {
    if (next && !on) {
      setDisclosure(true);
      return;
    }
    await apply(next);
  };

  const apply = async (next: boolean) => {
    setBusy(true);
    try {
      if (!next) {
        await stopBackgroundTracking();
        showToast(t('locationSettings.stopped'));
      } else {
        const result = await startBackgroundTracking();
        if (result === 'need-foreground') showToast(t('locationSettings.needForeground'));
        else if (result === 'need-background') {
          // 안드로이드는 "항상 허용"을 앱 안에서 다시 물어볼 수 없어 설정 화면으로 보냅니다
          showToast(t('locationSettings.needBackground'));
          Linking.openSettings();
        } else if (result === 'error') showToast(t('locationSettings.startFailed'));
        else showToast(t('locationSettings.started'));
      }
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  return (
    <Screen title={t('screens.locationSettings')} tab="map" contentStyle={styles.content}>
      <ToggleRow
        title={t('locationSettings.background')}
        description={t('locationSettings.backgroundDesc')}
        value={on}
        onValueChange={(next) => !busy && void toggle(next)}
      />

      <Popup
        visible={disclosure}
        title={t('locationSettings.disclosureTitle')}
        message={t('locationSettings.disclosureMessage')}
        confirmLabel={t('common.allow')}
        cancelLabel={t('common.later')}
        onConfirm={() => {
          setDisclosure(false);
          void apply(true);
        }}
        onCancel={() => setDisclosure(false)}
        onDismiss={() => setDisclosure(false)}
      />

      <View style={styles.card}>
        <AppText variant="title4">{t('locationSettings.status')}</AppText>
        <Row label={t('locationSettings.interval')} value={intervalSec ? intervalText(intervalSec) : '-'} />
        <Row label={t('locationSettings.queued')} value={stats ? `${stats.count}개` : '-'} />
        <Row label={t('locationSettings.oldest')} value={stats?.oldest ? timeText(stats.oldest) : '-'} />
        <Row label={t('locationSettings.newest')} value={stats?.newest ? timeText(stats.newest) : '-'} />
        <AppText variant="label2" color={colors.textMuted}>
          {t('locationSettings.statusDesc')}
        </AppText>
        <Button
          label={t('locationSettings.sendNow')}
          variant="soft"
          onPress={async () => {
            await flushLocationOutbox();
            await refresh();
            showToast(t('locationSettings.sent'));
          }}
        />
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="body2" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppText variant="body2Bold">{value}</AppText>
    </View>
  );
}

/** 60초 이상은 분으로 (180초 → 3분) */
const intervalText = (sec: number) => (sec >= 60 ? `${Math.round(sec / 60)}분마다` : `${sec}초마다`);

const timeText = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const styles = StyleSheet.create({
  content: { gap: 16 },
  card: { gap: 10, padding: 16, borderRadius: radius.sm, backgroundColor: colors.surfaceStrong },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
