import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout } from '@/theme';

export type TabName = 'gallery' | 'map' | 'people';

/**
 * 하단 네비게이션 순서: Gallery / Map / People (피그마 v3.1 공용 컨트롤 'Glass Tab Bar', 11-16).
 *
 * 화면 아래에 둥근 막대가 떠 있고, 아이콘은 흰 선 그림입니다 (글자 없음).
 * 고른 탭은 아이콘 뒤에 흰 테두리 알약이 깔립니다.
 * 피그마는 953 폭 그림이라 402 폭으로 줄인 값입니다 (÷2.37).
 */
const TABS: { name: TabName; icon: number }[] = [
  { name: 'gallery', icon: require('../../../assets/icons/tab-gallery.png') },
  { name: 'map', icon: require('../../../assets/icons/tab-map.png') },
  { name: 'people', icon: require('../../../assets/icons/tab-people.png') },
];

/** 막대 높이 150 → 63, 양옆 27 → 11, 아래 31 → 13 */
const BAR_HEIGHT = 63;
const BAR_SIDE = 11;
const BAR_BOTTOM = 13;
/** 고른 탭 알약 280×110 → 118×46, 아이콘 100 → 42 */
const PILL_WIDTH = 118;
const PILL_HEIGHT = 46;
const ICON = 42;

interface BottomNavProps {
  active: TabName;
  /** 탭 네비게이터 안에서 쓸 때 전달. 없으면 하위 화면에서 해당 탭으로 되돌아갑니다. */
  onPressTab?: (name: TabName) => void;
  /**
   * 바탕 불투명도 (0~1). 피그마 메모(11-07, v3.1 확정): 지도처럼 뒤에 배경이 있으면 50%, 설정 등 그 밖의 화면은 40%.
   * 바탕은 위 흰색 → 아래 검정으로 넘어가는 유리 느낌입니다
   */
  opacity?: number;
}

export function BottomNav({ active, onPressTab, opacity = 0.4 }: BottomNavProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const handlePress = (name: TabName) => {
    if (onPressTab) onPressTab(name);
    else router.dismissTo(`/${name}`);
  };

  return (
    <View pointerEvents="box-none" style={[styles.container, { height: layout.tabBarHeight + insets.bottom, paddingBottom: insets.bottom + BAR_BOTTOM }]}>
      <View style={styles.bar}>
        <LinearGradient
          // 피그마: 흰색 0% → 검정 62% 지점, 둘 다 62% 에 막대 80% (= 약 50%). 메모대로 화면마다 불투명도만 바꿉니다
          colors={[`rgba(255,255,255,${opacity})`, `rgba(0,0,0,${opacity})`]}
          locations={[0, 0.62]}
          style={StyleSheet.absoluteFill}
        />
        {TABS.map((tab) => {
          const selected = tab.name === active;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`tabs.${tab.name}`)}
              onPress={() => handlePress(tab.name)}
              style={styles.item}
            >
              <View style={[styles.pill, selected && styles.pillSelected]}>
                <Image source={tab.icon} style={[styles.icon, !selected && styles.iconInactive]} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'flex-end', paddingHorizontal: BAR_SIDE },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    // 피그마 안쪽 빛 (위 흰 테두리)
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  item: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  pill: { width: PILL_WIDTH, height: PILL_HEIGHT, borderRadius: PILL_HEIGHT / 2, alignItems: 'center', justifyContent: 'center' },
  // 피그마: #F6FBD9 10% 바탕, 흰 테두리 2(→1)
  pillSelected: { backgroundColor: 'rgba(246,251,217,0.1)', borderWidth: 1, borderColor: '#FFFFFF' },
  icon: { width: ICON, height: ICON, opacity: 0.72 },
  iconInactive: { opacity: 0.65 },
});
