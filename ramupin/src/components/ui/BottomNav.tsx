import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { colors, layout, typography } from '@/theme';

export type TabName = 'gallery' | 'map' | 'people';

/** 피그마 하단 네비게이션 순서: Gallery / Map / People. 가운데 Map 아이콘이 더 큽니다. */
const TABS: { name: TabName; icon: number; iconSize: number }[] = [
  { name: 'gallery', icon: require('../../../assets/icons/tab-gallery.png'), iconSize: 45 },
  { name: 'map', icon: require('../../../assets/icons/tab-map.png'), iconSize: 52 },
  { name: 'people', icon: require('../../../assets/icons/tab-people.png'), iconSize: 35 },
];

interface BottomNavProps {
  active: TabName;
  /** 탭 네비게이터 안에서 쓸 때 전달. 없으면 하위 화면에서 해당 탭으로 되돌아갑니다. */
  onPressTab?: (name: TabName) => void;
}

export function BottomNav({ active, onPressTab }: BottomNavProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const handlePress = (name: TabName) => {
    if (onPressTab) onPressTab(name);
    else router.dismissTo(`/${name}`);
  };

  return (
    <View style={[styles.container, { height: layout.tabBarHeight + insets.bottom, paddingBottom: insets.bottom }]}>
      {TABS.map((tab) => {
        const selected = tab.name === active;
        const label = t(`tabs.${tab.name}`);
        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            onPress={() => handlePress(tab.name)}
            style={styles.item}
          >
            <View style={styles.iconBox}>
              <Image
                source={tab.icon}
                // 비선택: 피그마와 같이 채도 제거 + 투명도 60%
                style={[
                  { width: tab.iconSize, height: tab.iconSize },
                  !selected && styles.iconInactive,
                ]}
              />
            </View>
            <AppText style={typography.tab} color={selected ? colors.accent : colors.tabInactive}>
              {label}
            </AppText>
            {selected ? <View style={styles.dot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.tabBar,
    borderTopWidth: 1,
    borderTopColor: colors.tabBarBorder,
    paddingHorizontal: 45,
  },
  item: {
    width: 73,
    height: layout.tabBarHeight,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
    overflow: 'hidden',
  },
  iconBox: { height: 44, justifyContent: 'center', alignItems: 'center' },
  iconInactive: { opacity: 0.6, filter: 'grayscale(1)' },
  // 선택 탭 표시. 피그마는 아래로 반쯤 걸친 원(19px)이지만, 안드로이드는 아래에 시스템 버튼 줄이 있어
  // 잘린 것처럼 보여서 탭 바 안에 온전한 점으로 표시 (docs/design-notes.md 17)
  dot: {
    position: 'absolute',
    bottom: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
});
