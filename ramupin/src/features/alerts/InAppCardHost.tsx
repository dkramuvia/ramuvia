import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlertStore, type InAppCardPayload } from './alertStore';
import { AppText, Avatar } from '@/components/ui';
import { colors, radius } from '@/theme';

const ICONS: Record<InAppCardPayload['kind'], number> = {
  nearby: require('../../../assets/icons/feed-nearby.png'),
  friendRequest: require('../../../assets/icons/card-request.png'),
  arrive: require('../../../assets/icons/card-place.png'),
  leave: require('../../../assets/icons/card-place.png'),
  shared: require('../../../assets/icons/card-place.png'),
};

const AUTO_HIDE_MS = 6000;

/** 피그마: 앱 안 알림 카드 (363:20164 ~ 363:20281) — 화면 위에 잠시 떴다 사라짐, 누르면 해당 화면으로 */
export function InAppCardHost() {
  const cards = useAlertStore((s) => s.cards);
  const insets = useSafeAreaInsets();
  if (cards.length === 0) return null;

  return (
    <View style={[styles.stack, { top: insets.top + 8 }]} pointerEvents="box-none">
      {cards.map((card) => (
        <InAppCard key={card.id} card={card} />
      ))}
    </View>
  );
}

function InAppCard({ card }: { card: InAppCardPayload }) {
  const { t } = useTranslation();
  const remove = useAlertStore((s) => s.removeCard);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => remove(card.id), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [card.id, remove]);

  const titles: Record<InAppCardPayload['kind'], [string, string]> = {
    nearby: [t('alerts.nearbyTitle', { name: card.name }), t('alerts.nearbyMessage')],
    friendRequest: [t('alerts.requestTitle', { name: card.name }), t('alerts.requestMessage')],
    arrive: [t('alerts.arriveTitle', { name: card.name, place: card.place }), t('alerts.arriveMessage')],
    leave: [t('alerts.leaveTitle', { name: card.name, place: card.place }), t('alerts.leaveMessage')],
    shared: [t('alerts.sharedTitle', { name: card.name }), t('alerts.sharedMessage', { place: card.place })],
  };
  const [title, message] = titles[card.kind];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        remove(card.id);
        if (card.href) router.push(card.href as Href);
      }}
      style={styles.card}
    >
      <View style={styles.header}>
        <Avatar name={card.name} size={32} />
        <AppText variant="body2Bold" style={styles.flex} numberOfLines={1}>
          {title}
        </AppText>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setExpanded((v) => !v)}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
      {expanded ? (
        <View style={styles.body}>
          <Image source={ICONS[card.kind]} style={styles.icon} />
          <AppText variant="body2" style={styles.flex}>
            {message}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', left: 12, right: 12, gap: 8, zIndex: 100 },
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceStrong,
    padding: 12,
    gap: 8,
    elevation: 6,
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 12 },
  icon: { width: 40, height: 40 },
  flex: { flex: 1 },
});
