import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, radius } from '@/theme';

export interface TermItem {
  key: string;
  label: string;
  required: boolean;
  /** 약관 본문 (펼쳤을 때 표시). TODO: 약관 URL 확정 후 웹뷰로 */
  body?: string;
}

interface TermsAgreementProps {
  title?: string;
  items: TermItem[];
  checked: string[];
  onChange: (checked: string[]) => void;
}

/** 피그마 약관 동의 (가입 348:15195 / 결제 283:39554): 전체 동의 + 항목별 체크 + 펼치기 */
export function TermsAgreement({ title, items, checked, onChange }: TermsAgreementProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const allChecked = items.every((i) => checked.includes(i.key));

  const toggle = (key: string) => onChange(checked.includes(key) ? checked.filter((k) => k !== key) : [...checked, key]);

  return (
    <View style={styles.container}>
      {title ? <AppText variant="title4">{title}</AppText> : null}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allChecked }}
        onPress={() => onChange(allChecked ? [] : items.map((i) => i.key))}
        style={[styles.all, allChecked && styles.allChecked]}
      >
        <Ionicons name={allChecked ? 'checkmark-circle' : 'checkmark-circle-outline'} size={26} color={allChecked ? colors.primary : colors.textMuted} />
        <AppText variant="body1Bold">약관 전체 동의</AppText>
      </Pressable>
      {items.map((item) => {
        const on = checked.includes(item.key);
        return (
          <View key={item.key}>
            <View style={styles.row}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(item.key)} style={styles.rowLeft} hitSlop={6}>
                <Ionicons name="checkmark" size={20} color={on ? colors.primary : colors.textMuted} />
                <AppText variant="body2">
                  <AppText variant="body2Bold">{item.required ? '[필수] ' : '[선택] '}</AppText>
                  {item.label}
                </AppText>
              </Pressable>
              {item.body ? (
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setOpenKey(openKey === item.key ? null : item.key)}>
                  <Ionicons name={openKey === item.key ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            {openKey === item.key ? (
              <View style={styles.body}>
                <AppText variant="caption" color={colors.textSecondary}>
                  {item.body}
                </AppText>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function requiredAgreed(items: TermItem[], checked: string[]) {
  return items.filter((i) => i.required).every((i) => checked.includes(i.key));
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  all: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.xs, backgroundColor: '#F1F1F9' },
  allChecked: { backgroundColor: '#E3F2FF' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingLeft: 6 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  body: { marginLeft: 36, marginBottom: 8, padding: 10, borderRadius: radius.xs, backgroundColor: colors.surface, maxHeight: 160 },
});
