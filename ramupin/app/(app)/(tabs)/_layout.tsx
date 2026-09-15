import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { BottomNav, type TabName } from '@/components/ui';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** 피그마 하단 네비게이션: Gallery / Map / People (첫 화면은 Map) */
function TabBar({ state, navigation }: TabBarProps) {
  const active = state.routes[state.index].name as TabName;
  return (
    <BottomNav
      active={active}
      onPressTab={(name) => {
        const route = state.routes.find((r) => r.name === name);
        if (!route) return;
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!event.defaultPrevented && name !== active) navigation.navigate(name);
      }}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs initialRouteName="map" screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="gallery" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="people" />
    </Tabs>
  );
}
