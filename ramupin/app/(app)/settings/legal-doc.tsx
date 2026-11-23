import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Screen } from '@/components/ui';
import { LINKS } from '@/config/links';
import { LEGAL_DOCS, type LegalDocId } from '@/features/legal/docs';

/**
 * 약관 한 개를 앱 안에서 보여 줍니다 (대표 리포트 4차: 약관 5개가 모두 같은 문서로 열림).
 *
 * 홈페이지는 주소 뒤 #id 로 그 문서만 펼쳐 주는데, 브라우저가 #id 위치로 뛰면서 문서 제목이
 * 홈페이지 위쪽 고정 머리글 밑에 가려졌습니다. 문서마다 '제1조'부터 보여 모두 같아 보였습니다.
 * 그래서 앱 화면 제목에 문서 이름을 적고, 홈페이지의 머리글·메뉴·바닥글을 숨겨 그 문서만 맨 위부터 보이게 합니다.
 * 문서 내용은 그대로 홈페이지 한곳에서 관리합니다.
 */
const CLEAN_PAGE = `
(function () {
  var css = document.createElement('style');
  css.textContent = '#hdr,.main-nav,#privacy-hero,.policy-nav,footer,.footer-compact{display:none!important}' +
    '.policy-band{padding-top:0!important}body{padding-top:0!important}';
  document.head.appendChild(css);
  setTimeout(function () { window.scrollTo(0, 0); }, 50);
  setTimeout(function () { window.scrollTo(0, 0); }, 400);
})();
true;
`;

export default function LegalDocScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const id: LegalDocId = LEGAL_DOCS.includes(params.id as LegalDocId) ? (params.id as LegalDocId) : 'terms';
  const [loading, setLoading] = useState(true);
  const url = `${LINKS.policyPage}#${id}`;

  return (
    <Screen title={t(`legal.doc.${id}`)} tab="map" scroll={false} contentStyle={styles.content}>
      <WebView
        source={{ uri: url }}
        injectedJavaScript={CLEAN_PAGE}
        onLoadEnd={() => setLoading(false)}
        // 문서 안의 다른 링크(홈페이지 다른 화면·메일 등)는 앱 밖 브라우저로
        onShouldStartLoadWithRequest={(req) => {
          if (req.url.split('#')[0] === LINKS.policyPage) return true;
          void WebBrowser.openBrowserAsync(req.url);
          return false;
        }}
        style={styles.web}
      />
      {loading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 0 },
  web: { flex: 1, backgroundColor: 'transparent' },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
