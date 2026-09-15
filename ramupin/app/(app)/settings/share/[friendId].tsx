import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, BatteryBadge, Button, Screen, ShareLevelIcon, ToggleRow } from '@/components/ui';
import { useFriends, useSaveShareSetting, useShareSetting } from '@/features/friends/queries';
import { applyShareLevel, isToggleLocked } from '@/features/sharing/shareRules';
import { colors, radius } from '@/theme';
import type { FriendShareSetting, LocationShareLevel } from '@/types/models';
import { showToast } from '@/utils/toast';

const LEVELS: LocationShareLevel[] = ['exact', 'blurred', 'hidden'];

/** 피그마: 친구별 상세 공유 (정확 283:33373 / 흐림 363:15493 / 비공개 363:15627) */
export default function FriendShareScreen() {
  const { t } = useTranslation();
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  const { data: friends = [] } = useFriends();
  const friend = friends.find((f) => f.id === friendId);
  const { data: saved, isLoading } = useShareSetting(friendId);
  const save = useSaveShareSetting();

  const [draft, setDraft] = useState<FriendShareSetting | null>(null);
  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);

  const setToggle = (field: 'showStatus' | 'shareRoute' | 'shareBattery', value: boolean) =>
    setDraft((d) => (d ? { ...d, [field]: value } : d));

  const onSave = () => {
    if (!draft) return;
    save.mutate(draft, {
      onSuccess: () => {
        showToast(t('friendShare.saved'));
        router.back();
      },
    });
  };

  return (
    <Screen
      title={t('screens.friendShare')}
      tab="map"
      footer={<Button label={t('friendShare.save')} size="sm" disabled={!draft || save.isPending} onPress={onSave} />}
    >
      {isLoading || !draft ? (
        <ActivityIndicator color={colors.brown} />
      ) : (
        <View style={styles.body}>
          <View style={styles.profile}>
            <Avatar name={friend?.nickname ?? ''} imageUrl={friend?.avatarUrl} size={60} />
            <View style={styles.nameRow}>
              <AppText variant="listTitle">{friend?.nickname}</AppText>
              {friend?.isOnline ? <View style={styles.onlineDot} /> : null}
            </View>
          </View>

          <View style={styles.section}>
            <AppText variant="label1" color={colors.textLabel}>
              {t('friendShare.locationLevel')}
            </AppText>
            <View style={styles.levels}>
              {LEVELS.map((level) => {
                const selected = draft.locationLevel === level;
                return (
                  <Pressable
                    key={level}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setDraft(applyShareLevel(draft, level))}
                    style={styles.level}
                  >
                    <View style={[styles.levelIcon, selected && styles.levelIconSelected]}>
                      <ShareLevelIcon level={level} />
                    </View>
                    <AppText variant="headline">{t(`friendShare.${level}`)}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <AppText variant="label1" color={colors.textLabel}>
              {t('friendShare.scope')}
            </AppText>
            <View style={styles.toggles}>
              <ToggleRow
                icon={<Ionicons name="heart-sharp" size={20} color={colors.textStrong} />}
                iconBackground="#FFD1ED"
                title={t('friendShare.showStatus')}
                description={t('friendShare.showStatusDesc')}
                value={draft.showStatus}
                disabled={isToggleLocked(draft.locationLevel, 'showStatus')}
                onValueChange={(v) => setToggle('showStatus', v)}
              />
              <ToggleRow
                icon={<Ionicons name="git-compare-outline" size={20} color={colors.textStrong} />}
                iconBackground="#94FFA9"
                title={t('friendShare.shareRoute')}
                description={t('friendShare.shareRouteDesc')}
                value={draft.shareRoute}
                disabled={isToggleLocked(draft.locationLevel, 'shareRoute')}
                onValueChange={(v) => setToggle('shareRoute', v)}
              />
              <ToggleRow
                icon={<BatteryBadge level={80} showLabel={false} />}
                iconBackground="#EEEE54"
                title={t('friendShare.shareBattery')}
                description={t('friendShare.shareBatteryDesc')}
                value={draft.shareBattery}
                disabled={isToggleLocked(draft.locationLevel, 'shareBattery')}
                onValueChange={(v) => setToggle('shareBattery', v)}
              />
            </View>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 32 },
  profile: { alignItems: 'center', gap: 4, paddingTop: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.check },
  section: { gap: 12 },
  levels: { flexDirection: 'row', justifyContent: 'center', gap: 64, paddingTop: 12 },
  level: { alignItems: 'center', gap: 12 },
  levelIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelIconSelected: { backgroundColor: colors.primarySoft },
  toggles: { gap: 12 },
});
