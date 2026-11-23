import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { MenuItem, Screen } from '@/components/ui';
import { LEGAL_DOCS } from '@/features/legal/docs';

/**
 * 약관 및 정책 (피그마 v2.6 1041 '법적문제 › 법적내용', 대표 리포트 2차 '법적문제').
 * 문서 내용은 홈페이지(www.ramuvia.com/page/privacy.html) 한곳에서 관리해 앱을 다시 내지 않아도 고칠 수 있게 했습니다.
 */
export default function LegalScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('legal.title')} tab="map" contentStyle={styles.content}>
      {/* 대표 리포트 4차: 브라우저로 열면 문서 제목이 가려져 모두 같은 문서로 보였습니다 → 앱 안 화면(legal-doc)에서 문서 이름과 함께 */}
      {LEGAL_DOCS.map((id) => (
        <MenuItem key={id} label={t(`legal.doc.${id}`)} onPress={() => router.push({ pathname: '/settings/legal-doc', params: { id } })} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: 5 } });
