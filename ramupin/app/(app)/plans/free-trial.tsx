import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { billingApi } from '@/api/endpoints/billing';
import { AppText } from '@/components/ui';
import { BillingToggle } from '@/features/plans/BillingToggle';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme';
import { showToast } from '@/utils/toast';

const BENEFITS: { key: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'trialSpeed', icon: 'flash' },
  { key: 'trialHide', icon: 'eye-off' },
  { key: 'trialNoAds', icon: 'ban' },
];

/**
 * 피그마: 1개월 무료 체험 (360:19858 / 가입 흐름 360:19918)
 * WBS 5.2: 무료 사용자도 처음 1개월은 프리미엄 혜택, 이후 기본 등급
 * TODO(7단계): 스토어 구독의 무료 체험 기간(introductory offer)으로 구현
 */
export default function FreeTrialScreen() {
  const { t } = useTranslation();
  const updateUser = useAuthStore((s) => s.updateUser);
  const [yearly, setYearly] = useState(true);
  const [pending, setPending] = useState(false);

  const start = async () => {
    setPending(true);
    try {
      const result = await billingApi.purchase({ kind: 'freeTrial', yearly });
      if (result.planId) updateUser({ plan: result.planId });
      showToast(t('plans.done', { name: '플래티넘' }));
      router.back();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <LinearGradient colors={['#F8C9E8', '#C9B6FF']} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => router.back()} hitSlop={8} style={styles.close}>
          <Ionicons name="close" size={26} color={colors.textStrong} />
        </Pressable>
        <ScrollView contentContainerStyle={styles.content}>
          <AppText variant="title2" align="center" style={styles.headline}>
            {t('plans.trialHeadline')}
          </AppText>
          <View style={styles.heroIcon}>
            <Ionicons name="gift" size={110} color="#FF5A6E" />
          </View>

          <View style={styles.sheet}>
            <View style={styles.benefits}>
              {BENEFITS.map((b) => (
                <View key={b.key} style={styles.benefit}>
                  <LinearGradient colors={['#FFD3F1', '#C7B8FF']} style={styles.benefitIcon}>
                    <Ionicons name={b.icon} size={30} color={colors.white} />
                  </LinearGradient>
                  <AppText variant="label1Bold" align="center">
                    {t(`plans.${b.key}`)}
                  </AppText>
                </View>
              ))}
            </View>

            <View style={styles.outline}>
              <BillingToggle yearly={yearly} onChange={setYearly} labels={[t('plans.monthly'), t('plans.yearly')]} />
            </View>
            <View style={[styles.outline, styles.price]}>
              <AppText variant="label1">{t('plans.trialPrice')}</AppText>
            </View>

            <Pressable accessibilityRole="button" disabled={pending} onPress={start}>
              <LinearGradient colors={['#F99BD9', '#A48BFF']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.cta, pending && styles.dim]}>
                <AppText variant="headline" color={colors.white}>
                  {t('plans.trialStart')}
                </AppText>
              </LinearGradient>
            </Pressable>
            <AppText variant="caption" color={colors.textTertiary} align="center">
              {t('plans.trialNotice')}
            </AppText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  close: { position: 'absolute', top: 56, right: 20, zIndex: 2 },
  content: { flexGrow: 1, paddingTop: 48 },
  headline: { paddingHorizontal: 24 },
  heroIcon: { alignItems: 'center', paddingVertical: 36 },
  sheet: { flex: 1, borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: colors.white, padding: 16, gap: 16 },
  benefits: { flexDirection: 'row', gap: 10 },
  benefit: { flex: 1, height: 150, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 16 },
  benefitIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  outline: { borderRadius: 28, borderWidth: 2, borderColor: '#D7A4F5', padding: 2 },
  price: { height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  cta: { height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  dim: { opacity: 0.6 },
});
