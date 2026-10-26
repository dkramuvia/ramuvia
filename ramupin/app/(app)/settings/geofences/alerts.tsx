import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppText, Avatar, Button, ChipTabs, Popup, Screen, Switch, TimeWheels, ToggleRow } from '@/components/ui';
import { useFriends } from '@/features/friends/queries';
import { zoneDraft } from '@/features/geofence/zoneDraft';
import { useSaveGeofence } from '@/features/settings/queries';
import { makeStyles, radius, useColors } from '@/theme';
import type { GeofenceRecipient } from '@/types/models';

type When = 'always' | 'timed';

const toHm = (text: string | null | undefined, fallback: [number, number]): [number, number] => {
  const m = /^(\d{2}):(\d{2})/.exec(text ?? '');
  return m ? [Number(m[1]), Number(m[2])] : fallback;
};
const fromHm = ([h, m]: [number, number]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/**
 * 안심존 알림 대상 (보완 화면 설계 4.17, 피그마 v2.4 1015:55870).
 * 안심존 만들기 2단계 / 기존 안심존 › 더보기 › 알림 설정.
 *
 * - 누가 드나들 때 알려드릴까요? 친구별 켜기/끄기 + 도착·출발. 친구가 나에게 "정확" 으로 공유 중일 때만 받을 수 있습니다
 * - 내가 드나들 때 친구에게 알리기: 내가 "정확" 으로 공유 중인 친구에게만 갑니다
 * - 알림 시간: 항상 / 시간 지정. 경계에서 오가는 것을 막으려고 3분 이상 머문 뒤에 알립니다 (서버가 판정)
 */
export default function GeofenceAlertsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { data: friends = [] } = useFriends();
  const save = useSaveGeofence();
  const [draft] = useState(() => zoneDraft.get());

  const initial = draft?.recipients ?? draft?.recipientFriendIds.map((friendId) => ({ friendId, enter: true, leave: true })) ?? [];
  const [picked, setPicked] = useState<GeofenceRecipient[]>(initial);
  const [notifyFriends, setNotifyFriends] = useState(draft?.notifyFriends ?? true);
  const [when, setWhen] = useState<When>(draft?.alertStart && draft?.alertEnd ? 'timed' : 'always');
  const [start, setStart] = useState(toHm(draft?.alertStart, [8, 0]));
  const [end, setEnd] = useState(toHm(draft?.alertEnd, [20, 0]));
  const [saved, setSaved] = useState(false);

  if (!draft) {
    // 초안 없이 들어온 경우 (앱을 새로 띄웠을 때 등) — 목록으로 돌려보냅니다
    return (
      <Screen title={t('screens.geofences')} tab="map">
        <Button label={t('common.back')} variant="neutral" onPress={() => router.back()} />
      </Screen>
    );
  }

  const find = (friendId: string) => picked.find((p) => p.friendId === friendId);
  const toggleFriend = (friendId: string, on: boolean) =>
    setPicked(on ? [...picked, { friendId, enter: true, leave: true }] : picked.filter((p) => p.friendId !== friendId));
  const toggleDir = (friendId: string, dir: 'enter' | 'leave') =>
    setPicked(picked.map((p) => (p.friendId === friendId ? { ...p, [dir]: !p[dir] } : p)));

  // 내 드나듦을 받을 수 있는 친구 = 고른 친구 중 내가 "정확" 으로 공유 중인 친구
  const notifiable = friends.filter((f) => find(f.id) && f.myShareLevel === 'exact').map((f) => f.nickname);

  const onSave = () => {
    save.mutate(
      {
        ...draft,
        recipients: picked,
        recipientFriendIds: picked.map((p) => p.friendId),
        notifyFriends,
        alertStart: when === 'timed' ? fromHm(start) : null,
        alertEnd: when === 'timed' ? fromHm(end) : null,
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <Screen
      title={t('geofence.alertsTitle', { name: draft.name })}
      tab="map"
      contentStyle={styles.content}
      footer={<Button label={t('geofence.saveZone')} variant="brownLight" size="lg" disabled={save.isPending} onPress={onSave} />}
    >
      <AppText variant="label1" color={colors.textSecondary}>
        {t('geofence.whoTitle')}
      </AppText>
      {friends.length === 0 ? (
        <AppText variant="label2" color={colors.textMuted}>
          {t('geofence.noFriends')}
        </AppText>
      ) : null}
      {friends.map((f) => {
        const entry = find(f.id);
        // 상대가 흐림·비공개면 그 사람의 안심존 알림은 받을 수 없습니다 (4.17 업무 규칙). 모르면(목업) 막지 않습니다
        const blocked = f.theirShareLevel !== undefined && f.theirShareLevel !== 'exact';
        return (
          <View key={f.id} style={[styles.friend, blocked && styles.dimmed]}>
            <Avatar name={f.nickname} imageUrl={f.avatarUrl} size={36} />
            <View style={styles.flex}>
              <AppText variant="body2Bold">{f.nickname}</AppText>
              {blocked ? (
                <AppText variant="caption" color={colors.textTertiary}>
                  {t('geofence.friendNotExact', { level: t(`friendShare.${f.theirShareLevel}`) })}
                </AppText>
              ) : entry ? (
                <View style={styles.dirs}>
                  {(['enter', 'leave'] as const).map((dir) => (
                    <Pressable
                      key={dir}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: entry[dir] }}
                      onPress={() => toggleDir(f.id, dir)}
                      style={[styles.dir, entry[dir] && styles.dirOn]}
                    >
                      <AppText variant="label2" color={entry[dir] ? colors.white : colors.textSecondary}>
                        {t(dir === 'enter' ? 'geofence.arrive' : 'geofence.depart')}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            {/* 흐림·비공개 친구라도 내 드나듦은 받을 수 있으므로 고르는 것 자체는 막지 않습니다 */}
            <Switch value={!!entry} onValueChange={(on) => toggleFriend(f.id, on)} accessibilityLabel={f.nickname} />
          </View>
        );
      })}

      <AppText variant="label1" color={colors.textSecondary} style={styles.section}>
        {t('geofence.whenMe')}
      </AppText>
      <ToggleRow
        title={t('geofence.notifyFriends')}
        description={notifiable.length ? t('geofence.notifyFriendsTo', { names: notifiable.join(', ') }) : t('geofence.notifyFriendsNone')}
        value={notifyFriends}
        onValueChange={setNotifyFriends}
      />

      <AppText variant="label1" color={colors.textSecondary} style={styles.section}>
        {t('geofence.alertTime')}
      </AppText>
      <ChipTabs<When>
        tone="dark"
        value={when}
        onChange={setWhen}
        options={[
          { value: 'always', label: t('geofence.always') },
          { value: 'timed', label: t('geofence.timed') },
        ]}
      />
      {when === 'timed' ? (
        <View style={styles.times}>
          <View style={styles.time}>
            <AppText variant="label2" color={colors.textTertiary}>
              {t('geofence.timeFrom')}
            </AppText>
            <TimeWheels hours24={start[0]} minutes={start[1]} onChange={(h, m) => setStart([h, m])} />
          </View>
          <View style={styles.time}>
            <AppText variant="label2" color={colors.textTertiary}>
              {t('geofence.timeTo')}
            </AppText>
            <TimeWheels hours24={end[0]} minutes={end[1]} onChange={(h, m) => setEnd([h, m])} />
          </View>
        </View>
      ) : null}

      <AppText variant="caption" color={colors.textTertiary}>
        {t('geofence.dwellNote')}
      </AppText>

      <Popup
        visible={saved}
        title={t('geofence.addedTitle', { name: draft.name })}
        message={t('geofence.addedMessage', { name: draft.name, address: draft.address })}
        confirmLabel={t('common.confirm')}
        onConfirm={() => {
          setSaved(false);
          zoneDraft.clear();
          router.dismissTo('/settings/geofences');
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 12 },
  flex: { flex: 1 },
  section: { marginTop: 12 },
  dimmed: { opacity: 0.5 },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  dirs: { flexDirection: 'row', gap: 6, marginTop: 6 },
  dir: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.surfaceStrong },
  dirOn: { backgroundColor: colors.brown },
  times: { gap: 12 },
  time: { gap: 6 },
}));
