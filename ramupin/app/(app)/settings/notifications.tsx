import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, ToggleRow } from '@/components/ui';
import { useAlertStore } from '@/features/alerts/alertStore';
import { SAMPLE_CARDS, SAMPLE_POPUPS } from '@/features/alerts/samples';
import { colors, fontFamily, radius } from '@/theme';

type SettingKey =
  | 'dnd'
  | 'sos'
  | 'battery'
  | 'geofence'
  | 'locationRequest'
  | 'friendRequest'
  | 'groupActivity'
  | 'notice'
  | 'marketing';

const SECTIONS: { titleKey: string; items: SettingKey[] }[] = [
  { titleKey: 'sectionSafety', items: ['sos', 'battery'] },
  { titleKey: 'sectionLocation', items: ['geofence', 'locationRequest'] },
  { titleKey: 'sectionSocial', items: ['friendRequest', 'groupActivity'] },
  { titleKey: 'sectionSystem', items: ['notice', 'marketing'] },
];

// TODO(정책): 배터리 경고 기준값은 서버 정책값 사용 (WBS 8.9)
const BATTERY_ALERT_LEVEL = 15;

/** 피그마: 알림 설정 (283:27507) */
export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  // TODO(5단계): 서버 알림 설정 API 연동. 지금은 화면 안에서만 유지
  const [values, setValues] = useState<Record<SettingKey, boolean>>({
    dnd: false,
    sos: true,
    battery: false,
    geofence: false,
    locationRequest: false,
    friendRequest: false,
    groupActivity: false,
    notice: false,
    marketing: false,
  });
  const set = (key: SettingKey) => (value: boolean) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <Screen title={t('screens.notificationSettings')} tab="map" contentStyle={styles.content}>
      <View style={styles.group}>
        <ToggleRow
          title={t('notificationSettings.dnd')}
          description={t('notificationSettings.dndDesc')}
          value={values.dnd}
          onValueChange={set('dnd')}
        />
        {/* TODO: 시간 선택기 연결 */}
        <View style={[styles.timeBox, !values.dnd && styles.timeBoxOff]}>
          <TimeRow label={t('notificationSettings.start')} value="23:00" />
          <View style={styles.divider} />
          <TimeRow label={t('notificationSettings.end')} value="05:00" />
        </View>
      </View>

      {SECTIONS.map((section) => (
        <View key={section.titleKey} style={styles.group}>
          <AppText variant="body2Bold" align="center" style={styles.sectionTitle}>
            {t(`notificationSettings.${section.titleKey}`)}
          </AppText>
          {section.items.map((key) => (
            <ToggleRow
              key={key}
              title={t(`notificationSettings.${key}`)}
              description={t(`notificationSettings.${key}Desc`, { level: BATTERY_ALERT_LEVEL })}
              value={values[key]}
              onValueChange={set(key)}
            />
          ))}
        </View>
      ))}

      {__DEV__ ? <AlertPreview /> : null}
    </Screen>
  );
}

/** 개발용: 서버 없이 긴급 팝업·알림 카드 모양 확인 */
function AlertPreview() {
  const { t } = useTranslation();
  const showPopup = useAlertStore((s) => s.showPopup);
  const pushCard = useAlertStore((s) => s.pushCard);
  return (
    <View style={styles.group}>
      <AppText variant="body2Bold" align="center" style={styles.sectionTitle}>
        {t('alerts.previewTitle')}
      </AppText>
      <View style={styles.previewGrid}>
        {SAMPLE_POPUPS.map((p) => (
          <Button key={p.kind} label={p.kind} variant="neutral" size="xs" shape="square" onPress={() => showPopup(p)} />
        ))}
        {SAMPLE_CARDS.map((c) => (
          <Button key={c.kind} label={`card:${c.kind}`} variant="soft" size="xs" shape="square" onPress={() => pushCard(c)} />
        ))}
      </View>
    </View>
  );
}

function TimeRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.timeRow}>
      <AppText variant="label2" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppText variant="title4" style={styles.timeValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24 },
  group: { gap: 12 },
  sectionTitle: { paddingVertical: 12 },
  timeBox: { borderRadius: radius.lg, backgroundColor: colors.surfaceStrong, paddingHorizontal: 20, paddingVertical: 8 },
  timeBoxOff: { opacity: 0.6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 },
  timeValue: { fontFamily: fontFamily.medium },
  divider: { height: 1, backgroundColor: colors.border },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
