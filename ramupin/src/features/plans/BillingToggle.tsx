import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { YEARLY_DISCOUNT } from './planCatalog';
import { makeStyles, useColors } from '@/theme';

interface BillingToggleProps {
  yearly: boolean;
  onChange: (yearly: boolean) => void;
  dark?: boolean;
  labels?: [string, string];
}

/**
 * 피그마 "매달 / 연간 -10% off" 전환 (3차 리포트: 연간 -10%).
 *
 * 고른 쪽은 **항상 흰 알약**이라 그 위 글자도 고정으로 어둡게 둡니다.
 * `colors.textStrong` 을 쓰면 다크에서 흰 글자가 되어 흰 알약 위에서 사라집니다.
 */
const SELECTED_TEXT = '#0C0D0E';

export function BillingToggle({ yearly, onChange, dark, labels = ['매달', '연간'] }: BillingToggleProps) {
  const styles = useStyles();
  const colors = useColors();
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
            <AppText variant={selected ? 'body1Bold' : 'body1'} color={selected ? SELECTED_TEXT : dark ? '#BDBDBD' : colors.textTertiary}>
              {labels[isYearly ? 1 : 0]}
              {isYearly ? (
                <AppText variant="caption" color={selected ? SELECTED_TEXT : dark ? '#BDBDBD' : colors.textTertiary}>
                  {`  -${Math.round(YEARLY_DISCOUNT * 100)}% 할인`}
                </AppText>
              ) : null}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  track: { flexDirection: 'row', height: 48, borderRadius: 24, padding: 4 },
  trackDark: { backgroundColor: '#111' },
  trackLight: { backgroundColor: colors.surfaceStrong },
  item: { flex: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  itemSelected: { backgroundColor: colors.white },
}));
