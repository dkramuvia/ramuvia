import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { LINKS } from '@/config/links';
import { makeStyles, radius, useColors } from '@/theme';

const PURPOSES = [
  { key: 'sos', icon: 'shield-outline' },
  { key: 'share', icon: 'location-outline' },
  { key: 'zone', icon: 'home-outline' },
  { key: 'inactivity', icon: 'time-outline' },
] as const;

/**
 * 백그라운드 위치 사전 고지 (보완 화면 설계 4.10, 피그마 v2.4 1015:45737).
 *
 * Google Play 는 백그라운드 위치를 요청하기 전 정해진 형식의 "눈에 띄는 고지"를 요구합니다.
 * 반드시 "앱이 닫혀 있거나 사용 중이 아닐 때에도 위치 정보를 수집" 한다는 뜻과 사용 목적이 들어가야 하고,
 * [동의하고 계속] 을 눌러야만 OS 의 "항상 허용" 요청을 띄웁니다. 번역할 때도 이 뜻이 빠지면 안 됩니다.
 */
export function BgLocationDisclosure({ onAgree, onDecline, busy }: { onAgree: () => void; onDecline: () => void; busy?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <View style={styles.body}>
        <AppText variant="title2">{t('bgLocation.title')}</AppText>
        <AppText variant="body2" color={colors.textSecondary}>
          {t('bgLocation.lead')}
          <AppText variant="body2Bold">{t('bgLocation.required')}</AppText>
          {t('bgLocation.leadEnd')}
        </AppText>

        <View style={styles.list}>
          {PURPOSES.map((p) => (
            <View key={p.key} style={styles.item}>
              <Ionicons name={p.icon} size={20} color={p.key === 'sos' ? colors.sos : colors.textSecondary} />
              <AppText variant="body2" style={styles.flex}>
                {t(`bgLocation.purpose.${p.key}`)}
              </AppText>
            </View>
          ))}
        </View>

        <View style={styles.note}>
          <AppText variant="label2" color={colors.textSecondary}>
            {t('bgLocation.note')}
            <AppText variant="label2" color={colors.primary} style={styles.link} onPress={() => void Linking.openURL(LINKS.privacyPolicy)}>
              {t('bgLocation.privacyPolicy')}
            </AppText>
            {t('bgLocation.noteEnd')}
          </AppText>
        </View>
      </View>

      <View style={styles.buttons}>
        <Button label={t('bgLocation.decline')} variant="neutral" size="lg" onPress={onDecline} style={styles.decline} disabled={busy} />
        <Button label={t('bgLocation.agree')} variant="brown" size="lg" onPress={onAgree} style={styles.flex} disabled={busy} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flex: 1, justifyContent: 'space-between', gap: 24 },
  body: { gap: 16 },
  flex: { flex: 1 },
  list: { gap: 14, marginTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  note: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surface },
  link: { textDecorationLine: 'underline' },
  buttons: { flexDirection: 'row', gap: 8 },
  decline: { flex: 0.5 },
}));
