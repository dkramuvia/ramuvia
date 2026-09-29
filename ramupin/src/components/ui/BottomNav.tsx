import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { layout, makeStyles, typography, useColors } from '@/theme';

export type TabName = 'gallery' | 'map' | 'people';

/**
 * 하단 네비게이션 순서: Gallery / Map / People.
 *
 * 고른 탭은 **아이콘이 커지고** 뒤에 어두운 동그라미가 깔립니다 (피그마 2026-09-29).
 * 크기가 아이콘마다 다른 이유: 그림 파일마다 둘레 여백이 달라서, 눈에 보이는 그림이
 * 같은 크기가 되려면 파일 크기를 다르게 줘야 합니다. 피그마에서 재 보니 보이는 그림은
 * 셋 다 같은 크기였습니다 (고름 약 31, 안 고름 약 20).
 */
const TABS: { name: TabName; icon: number; size: number; sizeSelected: number }[] = [
  { name: 'gallery', icon: require('../../../assets/icons/tab-gallery.png'), size: 29, sizeSelected: 45 },
  { name: 'map', icon: require('../../../assets/icons/tab-map.png'), size: 28, sizeSelected: 43 },
  { name: 'people', icon: require('../../../assets/icons/tab-people.png'), size: 27, sizeSelected: 42 },
];

/**
 * 고른 탭 뒤의 동그라미 (피그마 2026-09-29).
 *
 * 예전 디자인은 라벨 아래 작은 점이었습니다. 새 디자인은 아이콘 뒤에 어두운 원을 깔고
 * 둘레에 분홍 빛을 줍니다. 라이트·다크 그림에서 재 보니 **원 색은 양쪽 다 #252525** 라
 * 테마를 따라가지 않습니다.
 *
 * 크기는 피그마에서 화면 너비 대비로 환산한 값입니다 (360 폭 기준 지름 57 → 56).
 */
const INDICATOR = 56;
const INDICATOR_BG = '#252525';

interface BottomNavProps {
  active: TabName;
  /** 탭 네비게이터 안에서 쓸 때 전달. 없으면 하위 화면에서 해당 탭으로 되돌아갑니다. */
  onPressTab?: (name: TabName) => void;
}

export function BottomNav({ active, onPressTab }: BottomNavProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const colors = useColors();

  const handlePress = (name: TabName) => {
    if (onPressTab) onPressTab(name);
    else router.dismissTo(`/${name}`);
  };

  return (
    <View style={[styles.container, { height: layout.tabBarHeight + insets.bottom, paddingBottom: insets.bottom }]}>
      {TABS.map((tab) => {
        const selected = tab.name === active;
        const label = t(`tabs.${tab.name}`);
        const size = selected ? tab.sizeSelected : tab.size;
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
              {selected ? <View style={styles.indicator} /> : null}
              <Image
                source={tab.icon}
                // 비선택: 피그마와 같이 채도 제거 + 투명도 60%
                style={[{ width: size, height: size }, !selected && styles.iconInactive]}
              />
            </View>
            <AppText style={typography.tab} color={selected ? colors.accent : colors.tabInactive}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flexDirection: 'row',
    // 피그마 탭 간격은 112 입니다. 360 폭에서 양옆 32 + space-between 이면 111.5 가 나옵니다
    justifyContent: 'space-between',
    backgroundColor: colors.tabBar,
    borderTopWidth: 1,
    borderTopColor: colors.tabBarBorder,
    paddingHorizontal: 32,
  },
  item: {
    width: 73,
    height: layout.tabBarHeight,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
  },
  iconBox: { height: INDICATOR, width: INDICATOR, justifyContent: 'center', alignItems: 'center' },
  iconInactive: { opacity: 0.6, filter: 'grayscale(1)' },
  indicator: {
    position: 'absolute',
    width: INDICATOR,
    height: INDICATOR,
    borderRadius: INDICATOR / 2,
    backgroundColor: INDICATOR_BG,
    // 둘레 분홍 빛. 피그마의 번짐을 그대로 옮긴 것입니다
    boxShadow: `0px 0px 9px 1px ${colors.accent}E6`,
  },
}));
