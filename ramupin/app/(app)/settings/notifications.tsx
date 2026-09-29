import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppText, Button, Popup, Screen, TimeWheels, ToggleRow } from '@/components/ui';
import { useAlertStore } from '@/features/alerts/alertStore';
import { SAMPLE_CARDS, SAMPLE_POPUPS } from '@/features/alerts/samples';
import { useNotificationSettings, useSaveNotificationSettings } from '@/features/settings/queries';
import { fontFamily, makeStyles, radius, useColors } from '@/theme';
import type { NotificationSettings } from '@/types/models';

/** 켜고 끄는 항목들 (방해 금지는 따로 다룹니다) */
type SettingKey = 'sos' | 'battery' | 'geofence' | 'locationRequest' | 'friendRequest' | 'groupActivity' | 'notice' | 'marketing';

const SECTIONS: { titleKey: string; items: SettingKey[] }[] = [
  { titleKey: 'sectionSafety', items: ['sos', 'battery'] },
  { titleKey: 'sectionLocation', items: ['geofence', 'locationRequest'] },
  { titleKey: 'sectionSocial', items: ['friendRequest', 'groupActivity'] },
  { titleKey: 'sectionSystem', items: ['notice', 'marketing'] },
];

// TODO(정책): 배터리 경고 기준값은 서버 정책값 사용 (WBS 8.9)
const BATTERY_ALERT_LEVEL = 15;

/** `23:00` → 23시 / 0분 */
const parseHhmm = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return { hours24: h || 0, minutes: m || 0 };
};
const toHhmm = (hours24: number, minutes: number) => `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

/** 피그마: 알림 설정 (283:27507) */
export default function NotificationSettingsScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { data: settings } = useNotificationSettings();
  const save = useSaveNotificationSettings();
  /** 시간 고르는 창: 시작인지 끝인지 */
  const [editing, setEditing] = useState<'start' | 'end' | null>(null);

  if (!settings) return <Screen title={t('screens.notificationSettings')} tab="map" contentStyle={styles.content} />;

  const patch = (changes: Partial<NotificationSettings>) => save.mutate({ ...settings, ...changes });
  const editingValue = editing === 'end' ? settings.dndEnd : settings.dndStart;

  return (
    <Screen title={t('screens.notificationSettings')} tab="map" contentStyle={styles.content}>
      <View style={styles.group}>
        <ToggleRow
          title={t('notificationSettings.dnd')}
          description={t('notificationSettings.dndDesc')}
          value={settings.dndEnabled}
          onValueChange={(dndEnabled) => patch({ dndEnabled })}
        />
        <View style={[styles.timeBox, !settings.dndEnabled && styles.timeBoxOff]}>
          <TimeRow
            label={t('notificationSettings.start')}
            value={settings.dndStart}
            disabled={!settings.dndEnabled}
            onPress={() => setEditing('start')}
          />
          <View style={styles.divider} />
          <TimeRow
            label={t('notificationSettings.end')}
            value={settings.dndEnd}
            disabled={!settings.dndEnabled}
            onPress={() => setEditing('end')}
          />
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
              // SOS 는 꺼도 서버가 보냅니다. 끄면 그 사실을 알려 줍니다
              description={
                key === 'sos' && !settings.sos
                  ? t('notificationSettings.sosAlwaysOn')
                  : t(`notificationSettings.${key}Desc`, { level: BATTERY_ALERT_LEVEL })
              }
              value={settings[key]}
              onValueChange={(value) => patch({ [key]: value } as Partial<NotificationSettings>)}
            />
          ))}
        </View>
      ))}

      {editing ? (
        <TimePopup
          title={t(editing === 'start' ? 'notificationSettings.start' : 'notificationSettings.end')}
          value={editingValue}
          onCancel={() => setEditing(null)}
          onConfirm={(next) => {
            patch(editing === 'start' ? { dndStart: next } : { dndEnd: next });
            setEditing(null);
          }}
        />
      ) : null}

      {__DEV__ ? <AlertPreview /> : null}
    </Screen>
  );
}

/** 시작·끝 시각을 고르는 팝업 (예약 메시지와 같은 휠) */
function TimePopup({
  title,
  value,
  onCancel,
  onConfirm,
}: {
  title: string;
  value: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [time, setTime] = useState(parseHhmm(value));
  return (
    <Popup
      visible
      title={title}
      confirmLabel={t('common.confirm')}
      onConfirm={() => onConfirm(toHhmm(time.hours24, time.minutes))}
      cancelLabel={t('common.cancel')}
      onCancel={onCancel}
      onDismiss={onCancel}
    >
      <TimeWheels hours24={time.hours24} minutes={time.minutes} onChange={(hours24, minutes) => setTime({ hours24, minutes })} />
    </Popup>
  );
}

function TimeRow({ label, value, disabled, onPress }: { label: string; value: string; disabled?: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value}`} disabled={disabled} onPress={onPress} style={styles.timeRow}>
      <AppText variant="label2" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppText variant="title4" style={styles.timeValue}>
        {value}
      </AppText>
    </Pressable>
  );
}

/** 개발용: 서버 없이 긴급 팝업·알림 카드 모양 확인 */
function AlertPreview() {
  const styles = useStyles();
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

const useStyles = makeStyles((colors) => ({
  content: { gap: 24 },
  group: { gap: 12 },
  sectionTitle: { paddingVertical: 12 },
  timeBox: { borderRadius: radius.lg, backgroundColor: colors.surfaceStrong, paddingHorizontal: 20, paddingVertical: 8 },
  timeBoxOff: { opacity: 0.6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 },
  timeValue: { fontFamily: fontFamily.medium },
  divider: { height: 1, backgroundColor: colors.border },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
