import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { sosApi, type ReceivedSos, type SentSos } from '@/api/endpoints/sos';
import { AppText, Avatar, QueryState, Screen, UnderlineTabs } from '@/components/ui';
import { useReceivedSos } from '@/features/sos/queries';
import { useAuthStore } from '@/stores/authStore';
import { makeStyles, radius, useColors } from '@/theme';
import { showToast } from '@/utils/toast';
import { formatDateTime } from '@/utils/time';

type Tab = 'received' | 'sent';

/**
 * 받은 SOS · 보낸 SOS (WBS 7.9, 9.7).
 *
 * 팝업은 앱이 켜져 있을 때만 뜹니다. 놓친 SOS를 나중에라도 볼 수 있어야 해서 목록으로 따로 둡니다.
 * 대표 리포트 68: 사용자 위치만 보여서 "언제, 어디서" 를 알 수 없었습니다 → 날짜·시각·주소·좌표·고도·상태·녹음
 * 대표 리포트 73: 내가 보낸 SOS 목록이 없었습니다 → [보낸 SOS] 탭
 */
export default function ReceivedSosScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('received');
  const received = useReceivedSos();
  const sent = useQuery({ queryKey: ['sos', 'sent'], queryFn: sosApi.sent, enabled: tab === 'sent' });
  const active = tab === 'received' ? received : sent;
  const list = active.data ?? [];

  // 녹음이 나중에 붙으므로(대표 리포트 88) 화면에 들어올 때마다 새로 받습니다
  const { refetch } = active;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return (
    <Screen title={t('screens.sosReceived')} tab="map" contentStyle={styles.content}>
      <UnderlineTabs
        options={[
          { value: 'received', label: t('sosReceived.tabReceived') },
          { value: 'sent', label: t('sosReceived.tabSent') },
        ]}
        value={tab}
        onChange={setTab}
      />
      <QueryState loading={active.isLoading} error={active.isError} onRetry={() => void active.refetch()} />

      {!active.isLoading && !active.isError && list.length === 0 ? (
        <AppText variant="label1" color={colors.textMuted}>
          {t(tab === 'received' ? 'sosReceived.empty' : 'sosReceived.sentEmpty')}
        </AppText>
      ) : null}

      {tab === 'received'
        ? (received.data ?? []).map((sos) => <ReceivedCard key={sos.id} sos={sos} />)
        : (sent.data ?? []).map((sos) => <SentCard key={sos.id} sos={sos} />)}
    </Screen>
  );
}

function ReceivedCard({ sos }: { sos: ReceivedSos }) {
  const { t } = useTranslation();
  return (
    <SosCard
      sos={sos}
      name={sos.nickname}
      title={t('sosReceived.title', { name: sos.nickname })}
      // 이 사람의 그날 이동 기록으로 (SOS 뒤 어디로 갔는지)
      onPress={() => router.push(`/journey/${sos.userId}`)}
    />
  );
}

function SentCard({ sos }: { sos: SentSos }) {
  const { t } = useTranslation();
  const myId = useAuthStore((s) => s.user?.id);
  const nickname = useAuthStore((s) => s.user?.nickname ?? '');
  const to = sos.toMonitoring
    ? t('sosReceived.sentToMonitoring')
    : sos.recipientNames.length > 0
      ? t('sosReceived.sentTo', { names: sos.recipientNames.join(', ') })
      : t('sosReceived.sentToCount', { count: sos.recipientCount });
  return (
    <SosCard
      sos={sos}
      name={nickname}
      title={t('sosReceived.sentTitle')}
      subtitle={to}
      onPress={myId ? () => router.push(`/journey/${myId}`) : undefined}
    />
  );
}

/** 받은 SOS 와 보낸 SOS 가 같이 쓰는 카드 */
function SosCard({
  sos,
  name,
  title,
  subtitle,
  onPress,
}: {
  sos: ReceivedSos | SentSos;
  name: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const ended = sos.status !== 'sent';
  const hasCoords = sos.latitude != null && sos.longitude != null;
  const place = sos.placeName && sos.placeAddress ? `${sos.placeName} (${sos.placeAddress})` : (sos.placeName ?? sos.placeAddress);

  return (
    <View style={[styles.card, ended && styles.cardDim]}>
      <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} style={styles.header}>
        <Avatar name={name} />
        <View style={styles.flex}>
          <AppText variant="listTitle" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="label2" color={colors.textSecondary} numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {/* 취소·종료된 SOS 도 지우지 않고 남겨 둡니다 — 나중에 "그때 무슨 일이었나"의 근거입니다 */}
        <View style={[styles.status, sos.status === 'sent' && styles.statusActive]}>
          <AppText variant="micro" color={sos.status === 'sent' ? colors.white : colors.textSecondary}>
            {t(`sosReceived.status_${sos.status}`)}
          </AppText>
        </View>
      </Pressable>

      <View style={styles.facts}>
        <Fact label={t('sosReceived.factAt')} value={formatDateTime(sos.startedAt, { withYear: true, seconds: true })} />
        <Fact label={t('sosReceived.factPlace')} value={place ?? t('sosReceived.noPlace')} />
        {hasCoords ? <Fact label={t('sosReceived.factCoords')} value={`${sos.latitude!.toFixed(5)}, ${sos.longitude!.toFixed(5)}`} /> : null}
        {sos.altitude != null ? <Fact label={t('sosReceived.factAltitude')} value={`${Math.round(sos.altitude)} m`} /> : null}
      </View>

      <View style={styles.actions}>
        {hasCoords ? (
          <Pressable
            accessibilityRole="button"
            // 누른 그 자리를 거리뷰로 (친구의 지금 위치가 아니라 SOS 를 보낸 곳)
            onPress={() =>
              router.push({ pathname: '/street-view', params: { lat: sos.latitude!, lng: sos.longitude!, name: sos.placeName ?? sos.placeAddress ?? '' } })
            }
            style={styles.action}
          >
            <Ionicons name="location-outline" size={18} color={colors.primary} />
            <AppText variant="label2" color={colors.primary}>
              {t('sosReceived.showSpot')}
            </AppText>
          </Pressable>
        ) : null}
        {sos.hasAudio ? <VoiceButton sosId={sos.id} /> : null}
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.fact}>
      <AppText variant="label2" color={colors.textTertiary} style={styles.factLabel}>
        {label}
      </AppText>
      {/* 긴 주소는 줄바꿈합니다 */}
      <AppText variant="label2" style={styles.flex}>
        {value}
      </AppText>
    </View>
  );
}

/** SOS 녹음 듣기 (AlertPopupHost 의 VoiceTile 과 같은 방식, 주소는 잠깐 뒤 만료되므로 누를 때 받습니다) */
function VoiceButton({ sosId }: { sosId: string }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const player = useRef<AudioPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(
    () => () => {
      player.current?.remove();
      player.current = null;
    },
    [],
  );

  const toggle = async () => {
    if (playing && player.current) {
      player.current.pause();
      setPlaying(false);
      return;
    }
    try {
      setLoading(true);
      if (!player.current) {
        const url = await sosApi.audioUrl(sosId);
        if (!url) {
          showToast(t('alerts.voiceMissing'));
          return;
        }
        await setAudioModeAsync({ playsInSilentMode: true });
        const created = createAudioPlayer(url);
        created.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            setPlaying(false);
            void created.seekTo(0);
          }
        });
        player.current = created;
      }
      player.current.play();
      setPlaying(true);
    } catch {
      showToast(t('alerts.voiceFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable accessibilityRole="button" disabled={loading} onPress={() => void toggle()} style={styles.action}>
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name={playing ? 'pause-circle-outline' : 'play-circle-outline'} size={18} color={colors.primary} />
      )}
      <AppText variant="label2" color={colors.primary}>
        {t(playing ? 'sosReceived.pauseVoice' : 'sosReceived.playVoice')}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 12 },
  flex: { flex: 1 },
  card: { gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface },
  cardDim: { opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  status: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.surfaceStrong },
  statusActive: { backgroundColor: colors.danger },
  facts: { gap: 4 },
  fact: { flexDirection: 'row', gap: 8 },
  factLabel: { width: 64 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
}));
