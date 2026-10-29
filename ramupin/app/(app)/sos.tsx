import { Ionicons } from '@expo/vector-icons';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sosApi, type SendSosResult, type SosDeliveries } from '@/api/endpoints/sos';
import { AppText, Button, ThemedStatusBar } from '@/components/ui';
import { useFriends } from '@/features/friends/queries';
import { useMyGroups } from '@/features/groups/queries';
import { describePlace } from '@/features/location/address';
import { setSosMode } from '@/features/location/sosMode';
import { usePlan } from '@/features/policy/usePlan';
import { useSafetySetting } from '@/features/settings/queries';
import { SlideToCancel } from '@/features/sos/SlideToCancel';
import { countSosRecipients } from '@/features/sos/recipientCount';
import { openOfflineSosSms } from '@/features/sos/sosContactsSnapshot';
import type { SharedPlace } from '@/types/models';
import { useAuthStore } from '@/stores/authStore';
import { showToast } from '@/utils/toast';
import { makeStyles, radius, useColors } from '@/theme';
import { formatDateTime, formatTimeOfDay } from '@/utils/time';

// TODO(정책): 카운트다운·녹음 시간은 서버 정책값 (WBS 7.9: 10초)
const COUNTDOWN_SECONDS = 10;
const RECORD_SECONDS = 10;
/** 길게 눌러 시작할 때 누르고 있어야 하는 시간 (보완 4.4: 2초, 오작동 방지) */
const LONG_PRESS_MS = 2000;

type Phase = 'idle' | 'countdown' | 'recording' | 'sending' | 'sent';

/** 취소한 녹음 파일을 지웁니다. 지우지 못해도 SOS 흐름을 막지는 않습니다 */
async function deleteRecording(uri: string | null) {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    console.warn('[sos] 녹음 파일 삭제 실패', String(error));
  }
}

/** 받는 사람 이름을 화면에 보일 만큼만 (3명 넘으면 "외 N명") */
const NAMES_SHOWN = 3;

/**
 * 피그마: SOS (99:35983 대기 / 99:36017 취소됨 / 99:36053 카운트다운 / 99:36579 녹음)
 * 흐름: 탭(또는 길게 누름) → 10초 카운트다운(밀어서 취소) → 위치 바로 전송 + 10초 녹음 → 녹음을 같은 SOS 에 붙임
 * 대표 리포트 88: 예전에는 녹음까지 끝나야 보내서 위치가 20초 늦게 갔습니다
 * WBS 7.9: 취소하면 경보 해제, 녹음 파일 삭제
 * TODO(6단계): 지도에서 두 손가락 탭으로 SOS 진입, 앱이 백그라운드여도 전송 유지
 */
export default function SosScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { data: safety } = useSafetySetting();
  const nickname = useAuthStore((s) => s.user?.nickname ?? '');
  const recipients = useRecipientSummary();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [phase, setPhase] = useState<Phase>('idle');
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const [cancelledBanner, setCancelledBanner] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  const [toMonitoring, setToMonitoring] = useState(false);
  /** 인터넷이 끊겨 서버에 못 보내고 문자 창을 연 경우 (C1) */
  const [offline, setOffline] = useState(false);
  const [sosId, setSosId] = useState<string | null>(null);
  /** 전송 완료 화면에 "무엇을 보냈는지" 를 그대로 보여 줍니다 (피그마 2026-09-28) */
  const [sentInfo, setSentInfo] = useState<SentInfo | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  /** 위치 전송 결과. 녹음하는 동안 이미 보내 두고, 녹음이 끝나면 이 SOS 에 붙입니다 */
  const sendPromise = useRef<Promise<SentResult> | null>(null);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<string>('');
  const locationPromise = useRef<Promise<Location.LocationObject | null> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  const micGranted = useRef(false);

  const start = () => {
    if (!safety?.sosEnabled) return;
    setCancelledBanner(false);
    startedAt.current = new Date().toISOString();
    // 마이크 권한은 카운트다운 시작과 함께 요청 (녹음 시점에 권한 창이 뜨면 10초 녹음이 늦어짐)
    requestRecordingPermissionsAsync()
      .then(({ granted }) => {
        micGranted.current = granted;
        setMicDenied(!granted);
      })
      .catch(() => setMicDenied(true));
    // 카운트다운 동안 미리 위치를 잡아 둡니다
    locationPromise.current = Location.requestForegroundPermissionsAsync()
      .then(({ granted }) => (granted ? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }) : null))
      .catch(() => null);
    // 누른 순간부터 촘촘하게 모읍니다. 구조대가 오는 동안의 경로가 남아야 합니다 (GPS 보고서 2-1)
    void setSosMode(true);
    setPhase('countdown');
    setRemaining(COUNTDOWN_SECONDS);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    let left = COUNTDOWN_SECONDS;
    timer.current = setInterval(() => {
      left -= 1;
      setRemaining(left);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (left <= 0) {
        clearTimer();
        // 위치는 기다리지 않고 바로 보냅니다 (대표 리포트 88)
        sendPromise.current = sendLocation();
        // 녹음을 끈 사람(보완 4.6)이나 마이크 권한이 없으면 녹음 없이 끝냅니다
        if (safety?.recordEnabled === false || !micGranted.current) void finish(false);
        else void startRecording();
      }
    }, 1000);
  };

  /** 위치만 먼저 보냅니다. 실패해도 throw 하지 않고 결과로 돌려줍니다 */
  const sendLocation = async (): Promise<SentResult> => {
    const position = await locationPromise.current;
    const coords = position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : null;
    const place = coords ? await describePlace(coords).catch(() => null) : null;
    try {
      const result = await sosApi.send({
        place,
        altitude: position?.coords.altitude ?? null,
        audioUri: null,
        startedAt: startedAt.current,
      });
      setRecipientCount(result.recipientCount);
      setToMonitoring(result.toMonitoring);
      setSosId(result.sosId);
      return { kind: 'ok', result, position, place, coords };
    } catch (error) {
      // 서버에 닿지 못했을 때만(인터넷 끊김) 문자 창을 엽니다 (C1·C9)
      return { kind: isAxiosError(error) && !error.response ? 'offline' : 'failed', position, place, coords };
    }
  };

  const startRecording = async () => {
    setPhase('recording');
    setRemaining(RECORD_SECONDS);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error) {
      // 녹음이 안 돼도 위치는 이미 갔습니다. 녹음 없이 끝냅니다
      console.warn('[sos] 녹음 시작 실패', String(error));
      void finish(false);
      return;
    }
    let left = RECORD_SECONDS;
    timer.current = setInterval(async () => {
      left -= 1;
      setRemaining(left);
      if (left <= 0) {
        clearTimer();
        await finish(true);
      }
    }, 1000);
  };

  const finish = async (recorded: boolean) => {
    setPhase('sending');
    if (recorded) await recorder.stop();
    const sent = await (sendPromise.current ?? sendLocation());
    sendPromise.current = null;
    if (sent.kind === 'offline') {
      setOffline(true);
      // 사용자가 문자 창에서 [보내기]를 눌러야 갑니다
      const opened = await openOfflineSosSms(nickname, sent.coords);
      if (!opened) showToast(t('sos.offlineNoContacts'));
      if (recorded) await deleteRecording(recorder.uri);
    } else if (sent.kind === 'failed') {
      showToast(t('sos.sendFailed'));
      if (recorded) await deleteRecording(recorder.uri);
      setPhase('idle');
      return;
    }
    let audioAttached = false;
    if (sent.kind === 'ok' && recorded && recorder.uri) {
      audioAttached = await sosApi.attachAudio(sent.result.sosId, recorder.uri).catch(() => false);
    }
    setSentInfo({
      address: sent.place?.address ?? null,
      latitude: sent.position?.coords.latitude ?? null,
      longitude: sent.position?.coords.longitude ?? null,
      altitude: sent.position?.coords.altitude ?? null,
      sentAt: new Date(),
      recorded: audioAttached,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase('sent');
  };

  /**
   * 상황 종료 (안전함). 받은 사람들에게 안전하다고 알리고 SOS 수집 모드를 끕니다.
   * 예전에는 화면만 닫아서 받은 사람에게 아무것도 안 가고, 폰은 30분 동안 가장 촘촘하게 수집했습니다 (10-13)
   */
  const resolve = async () => {
    await setSosMode(false);
    if (sosId) await sosApi.resolve(sosId).catch(() => undefined);
    router.back();
  };

  const cancel = async () => {
    clearTimer();
    if (phase === 'recording' && recorder.isRecording) {
      // 취소하면 녹음을 멈추고 전송하지 않음 (WBS 7.9).
      // 취소한 녹음이 폰에 남아 있으면 안 됩니다 — 주변 소리가 담긴 파일입니다
      await recorder.stop();
      await deleteRecording(recorder.uri);
    }
    // 녹음 중이면 위치는 이미 갔습니다. 받은 사람에게 "취소됨"을 알립니다
    const sent = sendPromise.current ? await sendPromise.current : null;
    sendPromise.current = null;
    if (sent?.kind === 'ok') await sosApi.cancel(sent.result.sosId).catch(() => undefined);
    await setSosMode(false);
    setPhase('idle');
    setCancelledBanner(true);
  };

  const longPress = safety?.longPressStart !== false;

  if (phase === 'idle') {
    return (
      <SafeAreaView style={styles.light}>
        <ThemedStatusBar />
        <View style={styles.lightHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => router.back()} hitSlop={8} style={styles.close}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <AppText variant="body1" color={colors.textSecondary}>
            {t('sos.title')}
          </AppText>
        </View>
        {cancelledBanner ? (
          <View style={styles.cancelBanner}>
            <AppText variant="body1Bold" color={colors.white}>
              {t('sos.cancelled')}
            </AppText>
          </View>
        ) : null}
        <View style={styles.center}>
          {safety && !safety.sosEnabled ? (
            <View style={styles.disabled}>
              <AppText variant="title3" align="center">
                {t('sos.disabledTitle')}
              </AppText>
              <AppText variant="body2" color={colors.textSecondary} align="center">
                {t('sos.disabledDesc')}
              </AppText>
              <Button label={t('sos.openSettings')} variant="danger" onPress={() => router.replace('/settings/safety')} />
            </View>
          ) : (
            <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(longPress ? 'sos.holdToSend' : 'sos.tapToSend')}
              // 길게 눌러 시작을 켜 두면(기본) 2초를 누르고 있어야 합니다. 주머니 속 오작동을 막습니다 (보완 4.4)
              onPress={longPress ? () => showToast(t('sos.holdHint')) : start}
              onLongPress={start}
              delayLongPress={longPress ? LONG_PRESS_MS : undefined}
              style={({ pressed }) => [styles.halo, pressed && styles.pressed]}
            >
              <View style={styles.sosButton}>
                <AppText variant="title2" color={colors.white} align="center">
                  {t(longPress ? 'sos.holdToSend' : 'sos.tapToSend')}
                </AppText>
                <AppText variant="caption" color={colors.white}>
                  {t(longPress ? 'sos.holdSeconds' : 'sos.orLongPress')}
                </AppText>
              </View>
            </Pressable>
            {/* 대표 리포트 74·88: 누르기 전에 누구에게 가는지 보여 줍니다 */}
            <View style={styles.recipientsBox}>
              <AppText variant="body2" color={colors.textSecondary} align="center">
                {recipients.names ? t('sos.recipientsIdle', { names: recipients.names }) : t('sos.recipientsIdleNone')}
              </AppText>
              {recipients.overLimit ? (
                <AppText variant="label2" color={colors.danger} align="center">
                  {t('sos.overLimit', { count: recipients.count, limit: recipients.limit })}
                </AppText>
              ) : null}
            </View>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.dark}>
      <StatusBar style="light" />
      <AppText variant="body1" color="#9E9E9E" align="center" style={styles.darkHeader}>
        {t('sos.title')}
      </AppText>

      {phase === 'sent' ? (
        <SentView
          sosId={sosId}
          offline={offline}
          toMonitoring={toMonitoring}
          recipientCount={recipientCount}
          sentInfo={sentInfo}
          emergencyName={safety?.emergencyName ?? null}
          emergencyNumber={safety?.emergencyNumber ?? null}
          onResolve={() => void resolve()}
        />
      ) : (
        <>
          <View style={styles.darkTexts}>
            <AppText variant="title2" color={colors.white} align="center">
              {t(phase === 'countdown' ? 'sos.requestTitle' : 'sos.recordingTitle')}
            </AppText>
            <AppText variant="body2" color="#D0D0D0" align="center">
              {/* 대표 리포트 74: "그룹 및 비상 연락처" 대신 실제로 받을 사람 이름 */}
              {phase === 'countdown'
                ? recipients.names
                  ? t('sos.requestDescTo', { seconds: COUNTDOWN_SECONDS, names: recipients.names })
                  : t('sos.requestDescMonitoring', { seconds: COUNTDOWN_SECONDS })
                : recipients.names
                  ? t('sos.recordingDescTo', { seconds: RECORD_SECONDS, names: recipients.names })
                  : t('sos.recordingDescMonitoring', { seconds: RECORD_SECONDS })}
            </AppText>
            {recipients.overLimit ? (
              <AppText variant="caption" color="#FFB4A8" align="center">
                {t('sos.overLimit', { count: recipients.count, limit: recipients.limit })}
              </AppText>
            ) : null}
            {micDenied ? (
              <AppText variant="caption" color="#FFB4A8" align="center">
                {t('sos.micDenied')}
              </AppText>
            ) : null}
          </View>

          <View style={styles.darkBody}>
            {phase === 'countdown' ? (
              <>
                <View style={styles.countCircle}>
                  <AppText variant="display" color={colors.white}>
                    {remaining}
                  </AppText>
                </View>
                <View style={styles.micSmall}>
                  <Ionicons name="mic" size={28} color={colors.white} />
                </View>
              </>
            ) : (
              <View style={styles.recordWrap}>
                <Animated.View
                  style={[
                    styles.recordPulse,
                    { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }] },
                  ]}
                />
                <View style={styles.recordRing}>
                  <View style={styles.micBig}>
                    <Ionicons name="mic" size={56} color={colors.white} />
                  </View>
                </View>
                <AppText variant="title3" color={colors.white}>
                  {phase === 'sending' ? t('sos.sending') : `${remaining}`}
                </AppText>
              </View>
            )}
          </View>

          {phase !== 'sending' ? (
            <View style={styles.slide}>
              <SlideToCancel label={t('sos.slideToCancel')} onCancel={cancel} />
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

/**
 * SOS 전송 결과 (보완 화면 설계 4.5, 피그마 v2.4 1015:46425, 수정 반영본 C8).
 * 받은 사람별로 어떻게 갔는지 보여 줍니다: 앱 알림 = 확인한 시각 / 문자 = 전송됨·실패(다시 보내기).
 * 긴급전화 버튼은 사용자가 등록한 번호로 겁니다. 등록하지 않았으면 [긴급전화 등록하기].
 */
function SentView({
  sosId,
  offline,
  toMonitoring,
  recipientCount,
  sentInfo,
  emergencyName,
  emergencyNumber,
  onResolve,
}: {
  sosId: string | null;
  offline: boolean;
  toMonitoring: boolean;
  recipientCount: number;
  sentInfo: SentInfo | null;
  emergencyName: string | null;
  emergencyNumber: string | null;
  onResolve: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  // 친구가 확인하거나 문자가 나가면 바뀌므로 몇 초마다 다시 받습니다
  const { data: deliveries, refetch } = useQuery({
    queryKey: ['sos', 'deliveries', sosId],
    queryFn: () => sosApi.deliveries(sosId!),
    enabled: !!sosId,
    refetchInterval: 4000,
  });
  const time = (iso: string | Date) => formatTimeOfDay(iso);

  const resend = async (deliveryId: string) => {
    if (!sosId) return;
    await sosApi.resendSms(sosId, deliveryId).catch(() => showToast(t('sos.sendFailed')));
    void refetch();
  };

  const sentAt = sentInfo?.sentAt ?? new Date();
  const hasRows = (deliveries?.app.length ?? 0) + (deliveries?.sms.length ?? 0) > 0;

  return (
    <ScrollView contentContainerStyle={styles.sentBody}>
      <View style={styles.sentBadge}>
        <AppText variant="label1Bold" color={colors.white}>
          {t('sos.sentBadgeAt', { time: time(sentAt) })}
        </AppText>
      </View>

      <AppText variant="title1" color={colors.white}>
        {t('sos.sentTitle')}
      </AppText>
      <AppText variant="body1Bold" color="#D0D0D0">
        {offline
          ? t('sos.sentOffline')
          : t(sentInfo?.recorded ? 'sos.sentDescRecorded' : 'sos.sentDescNoAudio', { seconds: RECORD_SECONDS })}
      </AppText>

      {/* 전달 상태 (NEW) */}
      {!offline ? (
        <View style={styles.deliveryCard}>
          <AppText variant="label2" color={FACT_COLOR}>
            {t('sos.deliveryTitle')}
          </AppText>
          {deliveries?.app.map((a) => (
            <DeliveryRow
              key={a.id}
              name={a.nickname}
              channel={t('sos.channelApp')}
              status={a.readAt ? t('sos.statusRead', { time: time(a.readAt) }) : t('sos.statusDelivered')}
              tone={a.readAt ? 'ok' : 'normal'}
            />
          ))}
          {deliveries?.sms.map((m) => (
            <DeliveryRow
              key={m.id}
              name={`${m.name} (${m.maskedPhone})`}
              channel={t('sos.channelSms')}
              status={smsStatusText(m, t)}
              tone={m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'bad' : 'normal'}
              onRetry={m.status === 'failed' ? () => void resend(m.id) : undefined}
            />
          ))}
          {toMonitoring ? <DeliveryRow name={t('sos.monitoringName')} channel={t('sos.channelMonitoring')} status={t('sos.statusReceived')} tone="ok" /> : null}
          {!hasRows && !toMonitoring ? (
            <AppText variant="label2" color={FACT_COLOR}>
              {recipientCount > 0 ? t('sos.statusLoading') : t('sos.sentNoRecipients')}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {/* 보낸 위치 정보 */}
      <View style={styles.sentFacts}>
        {sentInfo?.address ? <Fact label={t('sos.factPlace')} value={sentInfo.address} /> : null}
        {sentInfo?.latitude != null && sentInfo.longitude != null ? (
          <Fact label={t('sos.factCoords')} value={`${sentInfo.latitude.toFixed(4)}, ${sentInfo.longitude.toFixed(4)}`} />
        ) : null}
        {sentInfo?.altitude != null ? <Fact label={t('sos.factAltitude')} value={`${Math.round(sentInfo.altitude)} m`} /> : null}
        <Fact label={t('sos.factSentAt')} value={formatDateTime(sentAt, { withYear: true, seconds: true })} />
      </View>

      <View style={styles.sentActions}>
        {emergencyNumber ? (
          <Button
            label={t('sos.callEmergency', { name: emergencyName ?? t('emergency.defaultName'), number: emergencyNumber })}
            variant="danger"
            onPress={() => Linking.openURL(`tel:${emergencyNumber.replace(/[^0-9+*#]/g, '')}`)}
          />
        ) : (
          <Button label={t('sos.registerEmergency')} variant="danger" onPress={() => router.push('/settings/emergency')} />
        )}
        {/* 대표 리포트 88: 112 옆에 119 도 바로 걸 수 있게 */}
        <View style={styles.callRow}>
          <Button label={t('sos.call112')} variant="danger" onPress={() => Linking.openURL('tel:112')} style={styles.flex} />
          <Button label={t('sos.call119')} variant="danger" onPress={() => Linking.openURL('tel:119')} style={styles.flex} />
        </View>
        <Button label={t('sos.resolve')} variant="white" onPress={onResolve} />
        <AppText variant="caption" color={FACT_COLOR} align="center">
          {t('sos.resolveNote')}
        </AppText>
      </View>
    </ScrollView>
  );
}

function smsStatusText(m: SosDeliveries['sms'][number], t: (key: string, options?: Record<string, unknown>) => string): string {
  if (m.status === 'sent') return t('sos.statusSent');
  if (m.status === 'failed') return t('sos.statusFailed');
  if (m.status === 'skipped') return t('sos.statusSkipped', { reason: m.reason ?? '' });
  return t('sos.statusSending');
}

function DeliveryRow({
  name,
  channel,
  status,
  tone,
  onRetry,
}: {
  name: string;
  channel: string;
  status: string;
  tone: 'ok' | 'bad' | 'normal';
  onRetry?: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View style={styles.deliveryRow}>
      <View style={styles.flex}>
        <AppText variant="body2Bold" color={colors.white} numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="caption" color={FACT_COLOR}>
          {channel}
        </AppText>
      </View>
      <View style={styles.deliveryStatus}>
        <AppText variant="label2" color={tone === 'ok' ? '#5CD67A' : tone === 'bad' ? '#FF8A7A' : FACT_COLOR}>
          {status}
        </AppText>
        {onRetry ? (
          <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
            <AppText variant="label2" color={colors.white} style={styles.underline}>
              {t('sos.retry')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

type Coords = { latitude: number; longitude: number };

type SentResult =
  | { kind: 'ok'; result: SendSosResult; position: Location.LocationObject | null; place: SharedPlace | null; coords: Coords | null }
  | { kind: 'offline' | 'failed'; position: Location.LocationObject | null; place: SharedPlace | null; coords: Coords | null };

/**
 * SOS 설정에서 고른 받는 사람 이름 (친구 · 그룹 · 비회원 연락처).
 * 등급 한도를 넘으면 서버가 앞에서부터 한도만큼만 보내므로 미리 알려 줍니다 (대표 리포트 74)
 */
function useRecipientSummary() {
  const { t } = useTranslation();
  const { data: safety } = useSafetySetting();
  const { data: friends = [] } = useFriends();
  const { data: groups = [] } = useMyGroups();
  const { limit, policy } = usePlan();
  const myId = useAuthStore((s) => s.user?.id);
  if (!safety) return { names: '', count: 0, limit: 0, overLimit: false };

  const labels = [
    ...safety.recipientFriendIds.map((id) => friends.find((f) => f.id === id)?.nickname).filter((n): n is string => !!n),
    ...safety.recipientGroupIds.map((id) => groups.find((g) => g.id === id)?.name).filter((n): n is string => !!n),
    ...safety.contacts.map((c) => c.name),
  ];
  const names =
    labels.length > NAMES_SHOWN
      ? t('sos.namesMore', { names: labels.slice(0, NAMES_SHOWN).join(', '), count: labels.length - NAMES_SHOWN })
      : labels.join(', ');
  const count = countSosRecipients(safety, groups, myId);
  const max = limit('sosRecipientLimit');
  // 정책을 아직 못 받았으면 경고하지 않습니다
  return { names, count, limit: max, overLimit: !!policy && max > 0 && count > max };
}

interface SentInfo {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  sentAt: Date;
  recorded: boolean;
}

/** 보낸 내용 한 줄 (피그마: 17px/26, 흐린 회색) */
function Fact({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <AppText variant="body1Bold" color={FACT_COLOR}>
      {label}: {value}
    </AppText>
  );
}

const FACT_COLOR = '#ACB3B9';

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  light: { flex: 1, backgroundColor: colors.surface },
  lightHeader: { height: 56, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', left: 20 },
  cancelBanner: { height: 44, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  halo: { width: 300, height: 300, borderRadius: 150, backgroundColor: '#FFE5E3', alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.97 }] },
  sosButton: { width: 220, height: 220, borderRadius: 110, backgroundColor: '#FF7563', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabled: { gap: 16, paddingHorizontal: 32 },
  dark: { flex: 1, backgroundColor: '#232323' },
  darkHeader: { paddingTop: 24 },
  darkTexts: { paddingHorizontal: 40, paddingTop: 48, gap: 12 },
  darkBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 40, paddingHorizontal: 32 },
  countCircle: { width: 128, height: 128, borderRadius: 64, backgroundColor: '#FF5A57', alignItems: 'center', justifyContent: 'center' },
  micSmall: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#E84133', alignItems: 'center', justifyContent: 'center' },
  recordWrap: { alignItems: 'center', gap: 24 },
  recordPulse: { position: 'absolute', top: 0, width: 214, height: 214, borderRadius: 107, backgroundColor: '#E84133' },
  recordRing: { width: 214, height: 214, borderRadius: 107, borderWidth: 4, borderColor: '#AEB5BC', alignItems: 'center', justifyContent: 'center' },
  micBig: { width: 114, height: 114, borderRadius: 57, backgroundColor: '#E84133', alignItems: 'center', justifyContent: 'center' },
  slide: { paddingHorizontal: 46, paddingBottom: 100 },
  sentBody: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 24, gap: 12, justifyContent: 'center' },
  deliveryCard: { gap: 12, marginTop: 8, padding: 16, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.06)' },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deliveryStatus: { alignItems: 'flex-end', gap: 2 },
  underline: { textDecorationLine: 'underline' },
  sentBadge: { alignSelf: 'flex-start', borderRadius: radius.full, backgroundColor: colors.danger, paddingHorizontal: 14, paddingVertical: 4 },
  sentFacts: { gap: 4, marginTop: 8 },
  recipientsBox: { marginTop: 24, paddingHorizontal: 32, gap: 6 },
  sentActions: { marginTop: 24, gap: 10 },
  callRow: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  doneButton: { alignSelf: 'stretch' },
}));
