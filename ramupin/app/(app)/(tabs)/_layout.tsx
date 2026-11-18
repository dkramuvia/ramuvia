import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomNav, type TabName } from '@/components/ui';
import { useInterstitial } from '@/features/ads/useInterstitial';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** 피그마 하단 네비게이션: Gallery / Map / People (첫 화면은 Map) */
function TabBar({ state, navigation }: TabBarProps) {
  const active = state.routes[state.index].name as TabName;
  // 지도 탭에서는 메뉴를 지도 위에 띄워 뒤의 지도가 비치게 합니다 (대표 리포트 2차 105). 지도 화면이 시트를 그만큼 올립니다
  const onMap = active === 'map';
  const runAfterAd = useInterstitial();
  return (
    <View style={onMap ? styles.overlay : undefined}>
      <BottomNav
        active={active}
        // 피그마 메모: 뒤에 지도가 비치면 50%, 그 밖의 화면은 40%
        opacity={onMap ? 0.5 : 0.4}
        onPressTab={(name) => {
          const route = state.routes.find((r) => r.name === name);
          if (!route) return;
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (event.defaultPrevented || name === active) return;
          // 전면 광고 (WBS 2.8): 광고를 본 뒤 메뉴로 갑니다. 지도(SOS 가 있는 곳)로 돌아갈 때는 막지 않습니다
          if (name === 'map') navigation.navigate(name);
          else runAfterAd(() => navigation.navigate(name));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ overlay: { position: 'absolute', left: 0, right: 0, bottom: 0 } });

export default function TabsLayout() {
  return (
    <Tabs initialRouteName="map" screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="gallery" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="people" />
    </Tabs>
  );
}
