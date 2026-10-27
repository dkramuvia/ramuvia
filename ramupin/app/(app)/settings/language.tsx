import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, ChipTabs, Screen } from '@/components/ui';
import { usePreferencesStore, type Preferences } from '@/stores/preferencesStore';
import { makeStyles, radius, useColors } from '@/theme';

/**
 * 언어 · 지역 · 표시 (보완 화면 설계 4.14, 피그마 v2.4 1015:55691).
 * 나의 프로필 › 설정 › [언어 · 지역]. 지도 설정에 있던 거리 단위를 여기로 옮겼습니다.
 *
 * - 기본값은 기기 지역 설정을 따릅니다 (언어 "기기 설정 따름")
 * - 글자 크기는 기기 접근성 글자 크기 위에 한 번 더 곱합니다
 * - 기기에만 저장하는 화면 설정입니다 (서버와 무관)
 */
export default function LanguageRegionScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const prefs = usePreferencesStore();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function Row<K extends keyof Preferences>({
    label,
    sub,
    field,
    options,
    stacked,
  }: {
    label: string;
    sub?: string;
    field: K;
    options: { value: Preferences[K] & string; label: string }[];
    /** 선택지가 길어 한 줄에 다 못 들어가면 이름 아래에 둡니다 (글자를 크게 해도 이름이 안 사라지게) */
    stacked?: boolean;
  }) {
    return (
      <View style={stacked ? styles.stacked : styles.row}>
        <View style={styles.label}>
          <AppText variant="label1">{label}</AppText>
          {sub ? (
            <AppText variant="caption" color={colors.textTertiary}>
              {sub}
            </AppText>
          ) : null}
        </View>
        <ChipTabs
          tone="dark"
          value={prefs[field] as string}
          onChange={(value) => prefs.set({ [field]: value } as Partial<Preferences>)}
          options={options}
        />
      </View>
    );
  }

  return (
    <Screen title={t('screens.languageRegion')} tab="map" contentStyle={styles.content}>
      <Section title={t('languageRegion.language')}>
        <Row
          label={t('languageRegion.appLanguage')}
          field="language"
          options={[
            { value: 'auto', label: t('languageRegion.followDevice') },
            { value: 'ko', label: '한국어' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Section>

      <Section title={t('languageRegion.units')}>
        <Row label={t('languageRegion.distance')} field="distanceUnit" options={[{ value: 'km', label: 'km' }, { value: 'mile', label: 'mile' }]} />
        <Row label={t('languageRegion.speed')} field="speedUnit" options={[{ value: 'kmh', label: 'km/h' }, { value: 'mph', label: 'mph' }]} />
        <Row label={t('languageRegion.temperature')} field="temperatureUnit" options={[{ value: 'c', label: '°C' }, { value: 'f', label: '°F' }]} />
        <Row
          label={t('languageRegion.timeFormat')}
          field="timeFormat"
          options={[
            { value: '12h', label: t('languageRegion.h12') },
            { value: '24h', label: t('languageRegion.h24') },
          ]}
        />
        <Row
          label={t('languageRegion.dateFormat')}
          field="dateFormat"
          stacked
          options={[
            { value: 'YMD', label: 'YYYY.MM.DD' },
            { value: 'MDY', label: 'MM/DD' },
            { value: 'DMY', label: 'DD/MM' },
          ]}
        />
      </Section>

      <Section title={t('languageRegion.timezone')}>
        <View style={styles.row}>
          <AppText variant="label1" style={styles.flex}>
            {t('languageRegion.myTimezone')}
          </AppText>
          <AppText variant="label1" color={colors.textTertiary}>
            {t('languageRegion.auto')} · {timezone}
          </AppText>
        </View>
        <Row
          label={t('languageRegion.scheduleTime')}
          sub={t('languageRegion.scheduleTimeDesc')}
          field="scheduleTimezone"
          options={[
            { value: 'mine', label: t('languageRegion.mine') },
            { value: 'recipient', label: t('languageRegion.recipient') },
          ]}
        />
      </Section>

      <Section title={t('languageRegion.display')}>
        <Row
          label={t('languageRegion.fontSize')}
          field="fontScale"
          options={[
            { value: 'normal', label: t('languageRegion.normal') },
            { value: 'large', label: t('languageRegion.large') },
            { value: 'xlarge', label: t('languageRegion.xlarge') },
          ]}
        />
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.section}>
      <AppText variant="label1" color={colors.textLabel}>
        {title}
      </AppText>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 20, paddingTop: 16 },
  flex: { flex: 1 },
  section: { gap: 8 },
  card: { gap: 4, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  stacked: { gap: 8, paddingVertical: 10 },
  label: { flexGrow: 1, flexShrink: 1 },
}));
