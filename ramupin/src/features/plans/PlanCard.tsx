import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { priceText, type PlanDisplay } from './planCatalog';
import { AppText } from '@/components/ui';
import { colors } from '@/theme';

interface PlanCardProps {
  plan: { name: string; englishName?: string; free?: boolean; popular?: boolean; colors: [string, string]; frame: string; bullets: string[] };
  yearly: boolean;
  width: number;
  /** 결제 플랜 카드의 버튼 문구. 없으면 버튼 없음 (결제 정보 화면) */
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  price?: string;
}

/** 피그마 플랜 카드: 두꺼운 테두리 + 그라데이션 + 체크 목록 */
export function PlanCard({ plan, yearly, width, actionLabel, actionDisabled, onAction, price }: PlanCardProps) {
  return (
    <View style={[styles.frame, { width, backgroundColor: plan.frame }]}>
      <LinearGradient colors={plan.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.titleRow}>
          <AppText variant="headline" color={colors.white} style={styles.flex}>
            {plan.englishName ? `${plan.name} (${plan.englishName})` : plan.name}
          </AppText>
          {plan.popular ? (
            <View style={styles.badge}>
              <AppText variant="caption" color="#1A1A40">
                Most Popular
              </AppText>
            </View>
          ) : null}
        </View>
        <View style={styles.priceRow}>
          <AppText variant="title1" color={colors.white}>
            {price ?? priceText(plan as PlanDisplay, yearly)}
          </AppText>
          {!plan.free ? (
            <AppText variant="caption" color="rgba(255,255,255,0.85)">
              {yearly ? '1년 단위 결제' : '매월 결제'}
            </AppText>
          ) : null}
        </View>
        <View style={styles.bullets}>
          {plan.bullets.map((b) => (
            <View key={b} style={styles.bullet}>
              <Ionicons name="checkmark-circle" size={18} color="rgba(255,255,255,0.9)" />
              <AppText variant="label1" color={colors.white} style={styles.flex}>
                {b}
              </AppText>
            </View>
          ))}
        </View>
        {actionLabel ? (
          <Pressable accessibilityRole="button" disabled={actionDisabled} onPress={onAction} style={[styles.action, actionDisabled && styles.actionDisabled]}>
            <AppText variant="body1Bold" color={colors.white}>
              {actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 36, padding: 8 },
  card: { borderRadius: 30, padding: 24, gap: 16 },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.white },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bullets: { gap: 8 },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  action: { height: 44, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  actionDisabled: { opacity: 0.6 },
});
