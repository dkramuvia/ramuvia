import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { AppText, MenuItem, Screen } from '@/components/ui';
import { LINKS } from '@/config/links';
import { makeStyles, radius, useColors } from '@/theme';
import { showToast } from '@/utils/toast';

/**
 * 라무핀 소개 · 문의하기 (피그마 v2.6 1041 '라무핀이란 › 라무핀 문의사항', 1117, 대표 리포트 2차 '라무핀 정보').
 * 메일 앱이 없는 폰도 있어 주소 복사를 먼저 두고, 보내기는 메일 앱으로 엽니다.
 */
export default function ContactScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const version = Constants.expoConfig?.version ?? '';

  const copyEmail = async () => {
    await Clipboard.setStringAsync(LINKS.supportEmail);
    showToast(t('contact.copied'));
  };

  const sendEmail = async () => {
    const subject = encodeURIComponent(t('contact.mailSubject', { version }));
    try {
      await Linking.openURL(`mailto:${LINKS.supportEmail}?subject=${subject}`);
    } catch {
      // 메일 앱이 없으면 주소만 복사해 둡니다
      await copyEmail();
    }
  };

  return (
    <Screen title={t('contact.title')} tab="map" contentStyle={styles.content}>
      <View style={styles.card}>
        <AppText variant="headline">{t('contact.aboutTitle')}</AppText>
        <AppText variant="body2" color={colors.textSecondary}>
          {t('contact.about')}
        </AppText>
        <AppText variant="label1" color={colors.textTertiary}>
          {t('contact.version', { version })}
        </AppText>
      </View>

      <View style={styles.card}>
        <AppText variant="headline">{t('contact.askTitle')}</AppText>
        <AppText variant="body2" color={colors.textSecondary}>
          {t('contact.ask')}
        </AppText>
        <AppText variant="body2Bold">{LINKS.supportEmail}</AppText>
      </View>

      <MenuItem label={t('contact.copyEmail')} onPress={() => void copyEmail()} />
      <MenuItem label={t('contact.sendEmail')} onPress={() => void sendEmail()} />
      <MenuItem label={t('contact.homepage')} onPress={() => void WebBrowser.openBrowserAsync(LINKS.contactSite)} />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 5 },
  card: { gap: 6, padding: 16, borderRadius: radius.md, backgroundColor: colors.surfaceGlass },
}));
