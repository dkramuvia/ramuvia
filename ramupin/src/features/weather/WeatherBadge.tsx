import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors } from '@/theme';
import type { Weather, WeatherCondition } from './useWeather';

/**
 * 지역명 아래 작은 날씨 표시 (피그마 지도 메인: 아이콘 18px + `13.9°C` 12px/18 700).
 * 날씨를 못 가져왔으면 아무것도 그리지 않습니다.
 */

const ICONS: Record<WeatherCondition, ComponentProps<typeof Ionicons>['name']> = {
  clear: 'sunny',
  cloudy: 'partly-sunny',
  rain: 'rainy',
  snow: 'snow',
  fog: 'cloud',
  storm: 'thunderstorm',
};

const ICON_COLORS: Record<WeatherCondition, string> = {
  clear: '#FDB812',
  cloudy: '#9AA4AC',
  rain: '#4F9BE8',
  snow: '#8FC3E8',
  fog: '#B0B8BE',
  storm: '#6B72E8',
};

export function WeatherBadge({ weather }: { weather?: Weather | null }) {
  if (!weather) return null;
  const condition = ICONS[weather.condition] ? weather.condition : 'clear';

  return (
    <View style={styles.row}>
      <Ionicons name={ICONS[condition]} size={18} color={ICON_COLORS[condition]} />
      <AppText variant="microBold" color={colors.textStrong}>
        {weather.temperature}°C
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
