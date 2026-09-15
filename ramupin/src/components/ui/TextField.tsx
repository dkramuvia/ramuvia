import type { ReactNode, Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from './AppText';
import { colors, radius, typography } from '@/theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  helperText?: string;
  errorText?: string;
  /** 글자 수 표시 ("4/10자"). maxLength 와 함께 사용 */
  showCount?: boolean;
  /** 입력창 오른쪽 버튼 (중복확인 등) */
  right?: ReactNode;
  /** React 19: ref 는 일반 prop 으로 전달되어 TextInput 에 연결됩니다 */
  ref?: Ref<TextInput>;
}

/** 피그마 "Input field": 라벨 14, 입력창 높이 56 / 모서리 12 / 테두리 #C7CDD1, 도움말 12 */
export function TextField({ label, helperText, errorText, showCount, right, maxLength, value = '', style, ...rest }: TextFieldProps) {
  const hasError = !!errorText;
  return (
    <View style={styles.container}>
      {label ? (
        <AppText variant="label1" color={colors.textSecondary}>
          {label}
        </AppText>
      ) : null}
      <View style={[styles.box, hasError && styles.boxError]}>
        <TextInput
          value={value}
          maxLength={maxLength}
          placeholderTextColor={colors.textPlaceholder}
          style={[styles.input, style]}
          {...rest}
        />
        {right}
      </View>
      {helperText || errorText || showCount ? (
        <View style={styles.bottomRow}>
          <AppText variant="caption" color={hasError ? colors.danger : colors.textSecondary} style={styles.helper}>
            {errorText ?? helperText}
          </AppText>
          {showCount && maxLength ? (
            <AppText variant="caption" color={colors.textSecondary}>
              <AppText variant="caption" color={colors.primary}>
                {value.length}
              </AppText>
              /{maxLength}자
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  box: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  boxError: { borderColor: colors.danger },
  input: { flex: 1, ...typography.body1, color: colors.text, paddingVertical: 12 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  helper: { flex: 1 },
});
