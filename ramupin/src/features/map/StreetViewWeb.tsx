import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { AppText } from '@/components/ui';
import { env } from '@/config/env';
import { colors } from '@/theme';
import type { LatLng } from '@/types/models';

/**
 * 네이버 로드뷰(거리뷰).
 * 네이버 모바일 SDK 에는 파노라마가 없어서, 지도 JS API 의 panorama 모듈을 WebView 로 띄웁니다.
 * 네이버 클라우드 콘솔 > Application > Web 서비스 URL 에 http://localhost 가 등록되어 있어야 합니다.
 */

type Status = 'loading' | 'ready' | 'no-coverage' | 'error';

/** 새 키(ncpKeyId)와 이전 키(ncpClientId) 둘 다 시도합니다 */
const panoramaHtml = (clientId: string, { latitude, longitude }: LatLng) => `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>html,body,#pano{margin:0;padding:0;width:100%;height:100%;background:#000}</style>
</head><body><div id="pano"></div>
<script>
  var KEY = ${JSON.stringify(clientId)};
  var POS = { lat: ${latitude}, lng: ${longitude} };
  var send = function (type, message) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, message: message }));
  };
  var start = function () {
    try {
      var pano = new naver.maps.Panorama('pano', {
        position: new naver.maps.LatLng(POS.lat, POS.lng),
        pov: { pan: 0, tilt: 0, fov: 100 },
        flightSpot: true,
        logoControl: true,
        zoomControl: false,
      });
      naver.maps.Event.addListener(pano, 'init', function () { send('ready'); });
      naver.maps.Event.addListener(pano, 'init_error', function () { send('no-coverage'); });
    } catch (e) {
      send('error', String(e));
    }
  };
  // 키 이름이 콘솔 종류에 따라 달라서, 실패하면 다른 이름으로 한 번 더 시도합니다
  var load = function (param, next) {
    var s = document.createElement('script');
    s.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?' + param + '=' + encodeURIComponent(KEY) + '&submodules=panorama';
    s.onload = function () { (window.naver && window.naver.maps && window.naver.maps.Panorama) ? start() : next(); };
    s.onerror = next;
    document.head.appendChild(s);
  };
  load('ncpKeyId', function () {
    load('ncpClientId', function () { send('error', '지도 키를 불러오지 못했습니다'); });
  });
</script></body></html>`;

export function StreetViewWeb({ coordinate, onStatusChange }: { coordinate: LatLng; onStatusChange?: (status: Status) => void }) {
  const [status, setStatus] = useState<Status>('loading');
  const clientId = env.map.naverClientId;
  const html = useMemo(() => panoramaHtml(clientId, coordinate), [clientId, coordinate]);

  const update = (next: Status) => {
    setStatus(next);
    onStatusChange?.(next);
  };

  if (!clientId) return <Notice text="네이버 지도 키가 설정되어 있지 않습니다" />;

  return (
    <View style={styles.container}>
      <WebView
        // baseUrl 을 localhost 로 두어야 네이버 콘솔에 등록한 Web 서비스 URL 과 맞습니다
        source={{ html, baseUrl: 'http://localhost' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        // 로드뷰는 화면을 꽉 채워야 해서 확대/축소 UI 를 숨깁니다
        scalesPageToFit={false}
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data) as { type: Status };
            update(data.type);
          } catch {
            update('error');
          }
        }}
        onError={() => update('error')}
        style={styles.web}
      />
      {status === 'loading' ? <Notice text="로드뷰를 불러오는 중…" /> : null}
      {status === 'no-coverage' ? <Notice text="이 위치에는 로드뷰가 없습니다" /> : null}
      {status === 'error' ? <Notice text="로드뷰를 불러오지 못했습니다" /> : null}
    </View>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <AppText variant="body1" color={colors.white}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  web: { flex: 1, backgroundColor: colors.black },
  notice: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
  },
});
