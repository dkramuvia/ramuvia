import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors } from '@/theme';

/** 피그마 지오펜스 핀: 검은 말풍선 이름표 + 갈색 위치 핀 */
export function PlacePin({ label, disabled }: { label?: string; disabled?: boolean }) {
  return (
    <View style={[styles.wrap, disabled && styles.disabled]}>
      {label ? (
        <View style={styles.label}>
          <AppText variant="caption" color={colors.white} numberOfLines={1}>
            {label}
          </AppText>
        </View>
      ) : null}
      <Ionicons name="location" size={40} color={colors.brown} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  disabled: { opacity: 0.45 },
  label: { maxWidth: 120, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.black, marginBottom: 2 },
});
