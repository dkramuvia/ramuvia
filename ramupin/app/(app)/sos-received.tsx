import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import type { ReceivedSos, SentSos } from '@/api/endpoints/sos';
import { AppText, Avatar, QueryState, Screen, UnderlineTabs } from '@/components/ui';
import { useReceivedSos, useSentSos } from '@/features/sos/queries';
import { useResolveSosConfirm } from '@/features/sos/ResolveSosConfirm';
import { formatSeconds, useSosVoice } from '@/features/sos/useSosVoice';
import { useAuthStore } from '@/stores/authStore';
import { makeStyles, radius, useColors } from '@/theme';
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
  // 지도의 'SOS 도움 요청 중' 띠에서 오면 [보낸 SOS] 탭으로 엽니다
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'sent' ? 'sent' : 'received');
  const received = useReceivedSos();
  const sent = useSentSos(tab === 'sent');
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
  const confirm = useResolveSosConfirm();
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
      // 대표 리포트 4차: 전송됨 화면을 벗어나면 끝낼 방법이 없어 '도움 요청 중'으로 계속 남았습니다
      onResolve={sos.status === 'sent' ? () => confirm.ask(sos.id) : undefined}
      resolving={confirm.pending}
      extra={confirm.popup}
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
  onResolve,
  resolving,
  extra,
}: {
  sos: ReceivedSos | SentSos;
  name: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onResolve?: () => void;
  resolving?: boolean;
  extra?: ReactNode;
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
        {/* 대표 리포트 4차: 전송됨 화면과 같은 시각(서버가 받은 시각)으로 맞춥니다. 예전에는 누른 시각이라 20초쯤 달랐습니다 */}
        <Fact label={t('sosReceived.factAt')} value={formatDateTime(sos.createdAt, { withYear: true, seconds: true })} />
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
        {onResolve ? (
          <Pressable accessibilityRole="button" disabled={resolving} onPress={onResolve} style={styles.resolveButton}>
            <AppText variant="label2Bold" color={colors.white}>
              {t('sos.resolveShort')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {sos.hasAudio ? <VoicePlayer sosId={sos.id} /> : null}
      {extra}
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

/**
 * SOS 녹음 듣기 (대표 리포트 4차: 눌러도 화면이 그대로였습니다).
 * 불러오는 중 → 재생 중(진행 막대·시간·일시정지) → 끝, 실패하거나 녹음이 없으면 안내합니다 (useSosVoice)
 */
function VoicePlayer({ sosId }: { sosId: string }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const voice = useSosVoice(sosId);
  const active = voice.state !== 'idle';
  return (
    <View style={[styles.voice, active && styles.voiceActive]}>
      <Pressable accessibilityRole="button" disabled={voice.state === 'loading'} onPress={() => void voice.toggle()} style={styles.action}>
        {voice.state === 'loading' ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name={voice.state === 'playing' ? 'pause-circle' : 'play-circle'} size={28} color={colors.primary} />
        )}
        <AppText variant="label2" color={colors.primary}>
          {voice.state === 'loading' ? t('sos.voiceLoading') : t(voice.state === 'playing' ? 'sosReceived.pauseVoice' : 'sosReceived.playVoice')}
        </AppText>
      </Pressable>
      {active ? (
        <View style={styles.voiceTrackRow}>
          <View style={styles.voiceTrack}>
            <View style={[styles.voiceFill, { width: `${voice.progress * 100}%` }]} />
          </View>
          <AppText variant="micro" color={colors.textSecondary}>
            {formatSeconds(voice.position)} / {formatSeconds(voice.duration)}
          </AppText>
        </View>
      ) : null}
    </View>
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
  resolveButton: { marginLeft: 'auto', paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.danger },
  voice: { gap: 6 },
  voiceActive: { padding: 10, borderRadius: radius.md, backgroundColor: colors.surfaceStrong },
  voiceTrackRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  voiceFill: { height: 4, backgroundColor: colors.primary },
}));
