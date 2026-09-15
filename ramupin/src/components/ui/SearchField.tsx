import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, typography } from '@/theme';

/** 피그마 "친구 검색": 높이 40, 배경 #E3E6E8, 오른쪽 돋보기 */
export function SearchField({ style, ...rest }: TextInputProps) {
  return (
    <View style={styles.box}>
      <TextInput
        placeholderTextColor={colors.textTertiary}
        returnKeyType="search"
        style={[styles.input, style]}
        {...rest}
      />
      <Ionicons name="search" size={22} color={colors.textStrong} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 16,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceStrong,
  },
  input: { flex: 1, ...typography.label1, color: colors.text, paddingVertical: 0 },
});
