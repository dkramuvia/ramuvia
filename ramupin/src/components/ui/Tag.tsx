import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors } from '@/theme';

interface TagProps {
  label: string;
  /** strong = 방장 (진한 갈색), muted = 나/멤버 (연한 갈색) */
  tone?: 'strong' | 'muted';
}

/** 피그마 이름 옆 작은 라벨 ("방장", "멤버", "나") */
export function Tag({ label, tone = 'strong' }: TagProps) {
  return (
    <View style={[styles.tag, { backgroundColor: tone === 'strong' ? colors.brownMedium : '#ACA09C' }]}>
      <AppText variant="label1Bold" color={colors.white}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { height: 24, minWidth: 41, paddingHorizontal: 8, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
});
