import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors } from '@/theme';

interface BillingToggleProps {
  yearly: boolean;
  onChange: (yearly: boolean) => void;
  dark?: boolean;
  labels?: [string, string];
}

/** 피그마 "매달 / 연간 -20% off" 전환 */
export function BillingToggle({ yearly, onChange, dark, labels = ['매달', '연간'] }: BillingToggleProps) {
  return (
    <View style={[styles.track, dark ? styles.trackDark : styles.trackLight]} accessibilityRole="radiogroup">
      {[false, true].map((isYearly) => {
        const selected = yearly === isYearly;
        return (
          <Pressable
            key={String(isYearly)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(isYearly)}
            style={[styles.item, selected && styles.itemSelected]}
          >
            <AppText variant={selected ? 'body1Bold' : 'body1'} color={selected ? colors.textStrong : dark ? '#BDBDBD' : colors.textTertiary}>
              {labels[isYearly ? 1 : 0]}
              {isYearly ? (
                <AppText variant="caption" color={selected ? colors.textStrong : dark ? '#BDBDBD' : colors.textTertiary}>
                  {'  -20% off'}
                </AppText>
              ) : null}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', height: 48, borderRadius: 24, padding: 4 },
  trackDark: { backgroundColor: '#111' },
  trackLight: { backgroundColor: colors.surfaceStrong },
  item: { flex: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  itemSelected: { backgroundColor: colors.white },
});
