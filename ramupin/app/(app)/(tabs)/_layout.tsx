import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomNav, type TabName } from '@/components/ui';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** 피그마 하단 네비게이션: Gallery / Map / People (첫 화면은 Map) */
function TabBar({ state, navigation }: TabBarProps) {
  const active = state.routes[state.index].name as TabName;
  // 지도 탭에서는 메뉴를 지도 위에 띄워 뒤의 지도가 비치게 합니다 (대표 리포트 2차 105). 지도 화면이 시트를 그만큼 올립니다
  const onMap = active === 'map';
  return (
    <View style={onMap ? styles.overlay : undefined}>
      <BottomNav
        active={active}
        onPressTab={(name) => {
          const route = state.routes.find((r) => r.name === name);
          if (!route) return;
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!event.defaultPrevented && name !== active) navigation.navigate(name);
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
