import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Screen, ShareLevelIcon, Switch } from '@/components/ui';
import { useFriends } from '@/features/friends/queries';
import { useHideMode, useSaveHideMode } from '@/features/settings/queries';
import { makeStyles, radius, useColors } from '@/theme';
import type { LocationShareLevel } from '@/types/models';
import { formatDateTime } from '@/utils/time';

const PERIODS: { key: string; hours: number | null }[] = [
  { key: 'periodNone', hours: null },
  { key: 'period1h', hours: 1 },
  { key: 'period8h', hours: 8 },
  { key: 'period24h', hours: 24 },
];

const LEVELS: LocationShareLevel[] = ['exact', 'blurred', 'hidden'];

/**
 * 피그마: 숨기기 모드 (283:33251)
 * 기획: 켜면 모든 친구에게 내 위치 숨김, 끄면 이전 공개 설정 복원. 아래에 공개 수준별 친구 목록, 아바타를 누르면 친구별 상세 공유
 * 숨기는 방법 두 가지 (WBS 12.7·12.8):
 *   - 친구에게만 숨기기: 서버에는 보내 SOS·이상징후 같은 위험 신호는 그대로 갑니다 (기본)
 *   - 서버에도 보내지 않기: 위치가 아무 데도 가지 않습니다. 대신 위험 신호 감시도 멈춥니다 (SOS 를 누르면 그동안은 보냄)
 */
export default function HideModeScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { data: setting } = useHideMode();
  const save = useSaveHideMode();
  const { data: friends = [] } = useFriends();
  const [periodOpen, setPeriodOpen] = useState(false);

  const hideAll = setting?.hideAll ?? false;
  const until = setting?.until ? new Date(setting.until) : null;
  const scope = setting?.scope ?? 'server_only';

  const setHideAll = (value: boolean) => save.mutate({ hideAll: value, until: value ? (setting?.until ?? null) : null, scope });
  const setPeriod = (hours: number | null) => {
    setPeriodOpen(false);
    save.mutate({ hideAll: true, until: hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null, scope });
  };
  const setScope = (next: 'server_only' | 'off_server') => save.mutate({ hideAll, until: setting?.until ?? null, scope: next });

  return (
    <Screen title={t('screens.hideMode')} tab="map" contentStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.row}>
          <AppText variant="headline" style={styles.flex}>
            {t('hideMode.hideAll')}
          </AppText>
          <Switch value={hideAll} onValueChange={setHideAll} accessibilityLabel={t('hideMode.hideAll')} />
        </View>
        <AppText variant="label2" color={colors.textSecondary}>
          {t('hideMode.hideAllDesc')}
        </AppText>
        <View style={styles.divider} />
        <Pressable accessibilityRole="button" onPress={() => setPeriodOpen((v) => !v)} style={styles.row}>
          <AppText variant="headline" style={styles.flex}>
            {t('hideMode.period')}
          </AppText>
          <AppText variant="label1" color={colors.textTertiary}>
            {until ? t('hideMode.until', { time: formatDateTime(until) }) : ''}
          </AppText>
          <Ionicons name={periodOpen ? 'chevron-down' : 'chevron-forward'} size={20} color={colors.textTertiary} />
        </Pressable>
        {periodOpen
          ? PERIODS.map((p) => (
              <Pressable key={p.key} accessibilityRole="button" onPress={() => setPeriod(p.hours)} style={styles.periodItem}>
                <AppText variant="body2">{t(`hideMode.${p.key}`)}</AppText>
              </Pressable>
            ))
          : null}
        <View style={styles.divider} />
        <AppText variant="headline">{t('hideMode.scope')}</AppText>
        {(['server_only', 'off_server'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected: scope === value }}
            onPress={() => setScope(value)}
            style={styles.scopeRow}
          >
            <Ionicons name={scope === value ? 'radio-button-on' : 'radio-button-off'} size={20} color={scope === value ? colors.brown : colors.textMuted} />
            <View style={styles.flex}>
              <AppText variant="body2Bold">{t(`hideMode.${value === 'server_only' ? 'scopeFriends' : 'scopeServer'}`)}</AppText>
              <AppText variant="label2" color={value === 'off_server' ? colors.danger : colors.textSecondary}>
                {t(`hideMode.${value === 'server_only' ? 'scopeFriendsDesc' : 'scopeServerDesc'}`)}
              </AppText>
            </View>
          </Pressable>
        ))}
      </View>

      {LEVELS.map((level) => {
        const list = friends.filter((f) => f.myShareLevel === level);
        return (
          <View key={level} style={[styles.levelSection, hideAll && styles.dimmed]}>
            <View style={styles.levelTitle}>
              <AppText variant="headline">{t(`hideMode.${level}`)}</AppText>
              <ShareLevelIcon level={level} size={18} />
            </View>
            <AppText variant="label2" color={colors.textSecondary}>
              {t(`hideMode.${level}Desc`)}
            </AppText>
            <View style={styles.avatars}>
              {list.length === 0 ? (
                <AppText variant="label2" color={colors.textMuted}>
                  {t('hideMode.none')}
                </AppText>
              ) : (
                list.map((f) => (
                  <Pressable key={f.id} accessibilityRole="button" onPress={() => router.push(`/settings/share/${f.id}`)} style={styles.friend}>
                    <Avatar name={f.nickname} imageUrl={f.avatarUrl} />
                    <AppText variant="label1Bold" numberOfLines={1}>
                      {f.nickname}
                    </AppText>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 24 },
  flex: { flex: 1 },
  card: { borderRadius: radius.lg, backgroundColor: colors.surface, padding: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  divider: { height: 1, backgroundColor: colors.surfaceStrong, marginVertical: 4 },
  periodItem: { paddingVertical: 10, paddingHorizontal: 8 },
  scopeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  levelSection: { gap: 8 },
  dimmed: { opacity: 0.4 },
  levelTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingTop: 8 },
  friend: { alignItems: 'center', gap: 6, maxWidth: 100 },
}));
