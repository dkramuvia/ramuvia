import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { MenuItem, Screen } from '@/components/ui';
import { LINKS } from '@/config/links';

/** 홈페이지 약관 페이지의 article id. 주소 뒤 #id 로 열면 그 문서만 펼쳐 보여 줍니다 */
const DOCS = ['terms', 'location-terms', 'privacy', 'location-privacy', 'child', 'payment'] as const;

/**
 * 약관 및 정책 (피그마 v2.6 1041 '법적문제 › 법적내용', 대표 리포트 2차 '법적문제').
 * 문서 내용은 홈페이지(www.ramuvia.com/page/privacy.html) 한곳에서 관리해 앱을 다시 내지 않아도 고칠 수 있게 했습니다.
 */
export default function LegalScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('legal.title')} tab="map" contentStyle={styles.content}>
      {DOCS.map((id) => (
        <MenuItem key={id} label={t(`legal.doc.${id}`)} onPress={() => void WebBrowser.openBrowserAsync(`${LINKS.policyPage}#${id}`)} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: 5 } });
