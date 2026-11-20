import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, View } from 'react-native';

import { priceText, type PlanDisplay } from './planCatalog';
import { AppText } from '@/components/ui';
import { makeStyles } from '@/theme';

interface PlanCardProps {
  plan: PlanDisplay;
  yearly: boolean;
  width: number;
  /** 결제 플랜 카드의 버튼 문구. 없으면 버튼 없음 (결제 정보 화면) */
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  price?: string;
}

/**
 * 피그마 v3.1 구독 플랜 카드 (7091:77020 ~ 7091:77752):
 * 반투명 테두리 + 그라데이션 카드, 오른쪽에 등급 마크, 흰 동그라미 체크 목록.
 * 베이직만 밝은 회색 카드라 글자를 어둡게 씁니다.
 * 카드는 테마와 상관없이 늘 같은 색이라 글자 색도 고정입니다.
 */
export function PlanCard({ plan, yearly, width, actionLabel, actionDisabled, onAction, price }: PlanCardProps) {
  const styles = useStyles();
  const ink = plan.light ? '#1D2127' : '#FFFFFF';
  const sub = plan.light ? '#464D53' : 'rgba(255,255,255,0.9)';
  const tag = plan.id === 'platinum' ? '인기' : plan.id === 'trinity' ? '프리미엄' : null;
  return (
    <View style={[styles.frame, { width, backgroundColor: plan.frame }]}>
      <LinearGradient colors={plan.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.titleRow}>
          <AppText variant="body1Bold" color={ink} style={styles.flex}>
            {`${plan.name} (${plan.englishName})`}
          </AppText>
          {tag ? (
            <View style={styles.tag}>
              <AppText variant="caption" color="#181059">
                {tag}
              </AppText>
            </View>
          ) : null}
        </View>
        <View style={styles.priceRow}>
          <View style={styles.flex}>
            <AppText variant="title1" color={ink}>
              {price ?? priceText(plan, yearly)}
            </AppText>
            <AppText variant="caption" color={sub}>
              {plan.free ? (plan.note ?? '') : yearly ? '1년 단위 결제' : '매월 결제'}
            </AppText>
          </View>
          <Image source={plan.mark} style={styles.mark} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>
        <View style={styles.bullets}>
          {plan.bullets.map((b) => (
            <View key={b} style={styles.bullet}>
              <View style={[styles.check, { backgroundColor: plan.light ? '#3A3F45' : 'rgba(255,255,255,0.8)' }]}>
                <Ionicons name="checkmark" size={11} color={plan.light ? '#FFFFFF' : plan.colors[1]} />
              </View>
              <AppText variant="label1" color={ink} style={styles.flex}>
                {b}
              </AppText>
            </View>
          ))}
        </View>
        {actionLabel ? (
          <Pressable
            accessibilityRole="button"
            disabled={actionDisabled}
            onPress={onAction}
            style={[styles.action, { backgroundColor: actionDisabled ? (plan.light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.2)') : '#FFFFFF' }]}
          >
            <AppText variant="body1" color={actionDisabled ? ink : plan.accent}>
              {actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  frame: { borderRadius: 32, padding: 8 },
  card: { borderRadius: 30, padding: 24, gap: 14 },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#FFFFFF' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 60, height: 60 },
  bullets: { gap: 10 },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  action: { height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
}));
