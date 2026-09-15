import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Avatar, Screen } from '@/components/ui';
import { useGroup } from '@/features/groups/queries';
import { colors, radius } from '@/theme';

const FEATURES: { n: number; icon: ComponentProps<typeof Ionicons>['name']; color: string }[] = [
  { n: 1, icon: 'ban', color: '#FFCDEF' },
  { n: 2, icon: 'chatbubbles', color: '#D6E8FF' },
  { n: 3, icon: 'battery-half', color: '#DDF6D8' },
  { n: 4, icon: 'shield-checkmark', color: '#FFE3CC' },
  { n: 5, icon: 'people', color: '#E6DBFF' },
];

/**
 * 피그마: 그룹 프리미엄 기능 소개 (283:39353, 카드 283:39495~39538)
 * 기획: 방장만 가입 버튼, 넘겨서 프리미엄 기능 확인 → 결제 정보
 */
export default function GroupPremiumScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { data: group } = useGroup(groupId);
  const [index, setIndex] = useState(0);
  const cardWidth = width - 72;

  return (
    <Screen title={t('plans.groupPremiumTitle')} tab="people" contentStyle={styles.content}>
      <FlatList
        data={FEATURES}
        horizontal
        pagingEnabled={false}
        snapToInterval={cardWidth + 16}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        keyExtractor={(f) => String(f.n)}
        style={styles.carousel}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 16)))}
        renderItem={({ item }) => (
          <View style={[styles.feature, { width: cardWidth }]}>
            <View style={[styles.featureArt, { backgroundColor: item.color }]}>
              <Ionicons name={item.icon} size={72} color={colors.textStrong} />
            </View>
            <View style={styles.featureTexts}>
              <AppText variant="title4">{t(`plans.feature${item.n}Title`)}</AppText>
              <AppText variant="label1" color={colors.textSecondary}>
                {t(`plans.feature${item.n}Desc`)}
              </AppText>
            </View>
          </View>
        )}
      />
      <View style={styles.dots}>
        {FEATURES.map((f, i) => (
          <View key={f.n} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={group?.isPremium}
        onPress={() => router.push({ pathname: '/plans/checkout', params: { groupId } })}
        style={styles.ctaWrap}
      >
        <LinearGradient colors={['#F062D6', '#8F7BFF']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.cta, group?.isPremium && styles.dim]}>
          <AppText variant="body1Bold" color={colors.white}>
            {group?.isPremium ? t('plans.groupAlready') : t('plans.groupPremiumCta')}
          </AppText>
        </LinearGradient>
      </Pressable>

      <View style={styles.section}>
        <AppText variant="body2Bold">{t('plans.groupMembers')}</AppText>
        <View style={styles.members}>
          {group?.members.map((m) => (
            <View key={m.id} style={styles.member}>
              <Avatar name={m.nickname} imageUrl={m.avatarUrl} />
              <AppText variant="label2" numberOfLines={1}>
                {m.nickname}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingHorizontal: 0 },
  carousel: { flexGrow: 0 },
  feature: { borderRadius: radius.md, backgroundColor: colors.white, overflow: 'hidden', elevation: 3, shadowColor: colors.black, shadowOpacity: 0.1, shadowRadius: 8 },
  featureArt: { height: 170, alignItems: 'center', justifyContent: 'center' },
  featureTexts: { padding: 20, gap: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.surfaceStrong },
  dotActive: { backgroundColor: colors.textSecondary },
  ctaWrap: { marginHorizontal: 40 },
  cta: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.6 },
  section: { gap: 12, paddingHorizontal: 20 },
  members: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.md, backgroundColor: colors.surfaceStrong, padding: 12, rowGap: 12 },
  member: { width: '33%', alignItems: 'center', gap: 4 },
});
