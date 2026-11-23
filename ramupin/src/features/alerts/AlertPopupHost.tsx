import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAlertStore, type AlertPopupPayload } from './alertStore';
import { AppText, Avatar, Button } from '@/components/ui';
import { formatDuration, minutesSince } from '@/features/journey/routeLayers';
import { AppMapView } from '@/features/map/AppMapView';
import { useSosVoice } from '@/features/sos/useSosVoice';
import { makeStyles, radius, useColors } from '@/theme';
import type { LatLng } from '@/types/models';
import { formatDate, formatTimeOfDay } from '@/utils/time';
import { useFriendAvatar } from './useFriendAvatar';

const RED = '#FF1E00';
const GREEN = '#34C759';

/** 피그마: SOS 수신 (363:19884) / 위험 지역 (363:20071) / GPS 끊김 (363:20093) / 배터리 (363:20119) / 무움직임 (363:20136) / 과속 (363:20153) */
export function AlertPopupHost() {
  const styles = useStyles();
  const popup = useAlertStore((s) => s.popup);
  const dismiss = useAlertStore((s) => s.dismissPopup);
  if (!popup) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.body} bounces={false}>
            <PopupContent popup={popup} />
          </ScrollView>
          <View style={styles.footer}>
            <PopupButtons popup={popup} dismiss={dismiss} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PopupContent({ popup }: { popup: AlertPopupPayload }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  switch (popup.kind) {
    case 'sos':
      return popup.status === 'resolved' || popup.status === 'cancelled' ? <EndedSosContent popup={popup} /> : <SosContent popup={popup} />;
    case 'dangerZone':
      return (
        <>
          <AppText variant="title2">{t('alerts.dangerTitle')}</AppText>
          <AppText variant="headlineMedium">{t('alerts.dangerMessage', { zone: popup.zoneName })}</AppText>
          <MapCircle center={popup.place} />
        </>
      );
    case 'gpsLost':
      return (
        <>
          <AppText variant="title2">{t('alerts.gpsTitle', { name: popup.name })}</AppText>
          <AppText variant="headline">{t('alerts.gpsSubtitle', { duration: formatDuration(minutesSince(popup.lastSeenAt)) })}</AppText>
          <AppText variant="body2" color={colors.textSecondary}>
            {t('alerts.gpsMessage', { name: popup.name })}
          </AppText>
          <AppText variant="headline" color={RED}>
            {t('alerts.lastLocation')}
          </AppText>
          {popup.place ? <MapCircle center={popup.place} name={popup.name} /> : null}
          <AppText variant="body2" color={colors.textSecondary}>
            {t('alerts.lastInfo', {
              place: popup.place?.placeName || popup.place?.address || t('alerts.unknown'),
              time: `${formatDuration(minutesSince(popup.lastSeenAt))} 전 (${formatTimeOfDay(popup.lastSeenAt)})`,
            })}
          </AppText>
        </>
      );
    case 'batteryLow':
      return (
        <IllustratedContent
          name={popup.name}
          title={popup.level == null ? t('alerts.batteryTitleUnknown', { name: popup.name }) : t('alerts.batteryTitle', { name: popup.name, level: popup.level })}
          image={require('../../../assets/icons/alert-battery.png')}
          message={t('alerts.batteryMessage', { name: popup.name })}
          info={t('alerts.batteryInfoText', {
            level: popup.level == null ? t('alerts.unknown') : `${popup.level}%`,
            minutes: popup.minutesLeft == null ? t('alerts.unknown') : t('alerts.minutes', { count: popup.minutesLeft }),
          })}
        />
      );
    case 'noMovement':
      return (
        <IllustratedContent
          name={popup.name}
          title={popup.hours == null ? t('alerts.noMovementTitleUnknown', { name: popup.name }) : t('alerts.noMovementTitle', { name: popup.name, hours: popup.hours })}
          image={require('../../../assets/icons/alert-no-movement.png')}
          message={t('alerts.noMovementMessage')}
          info={popup.hours == null ? t('alerts.noMovementInfoUnknown') : t('alerts.noMovementInfo', { hours: popup.hours })}
        />
      );
    case 'speeding':
      return (
        <>
          <AppText variant="title2">{t('alerts.speedTitle')}</AppText>
          <AppText variant="headlineMedium">{t('alerts.speedMessage')}</AppText>
          <Image source={require('../../../assets/icons/alert-speeding.png')} style={styles.illustration} />
          <AppText variant="title1" align="center">
            {Math.round(popup.speedKmh)}KM
          </AppText>
        </>
      );
  }
}

type SosPopup = Extract<AlertPopupPayload, { kind: 'sos' }>;

/**
 * 지금 시각. 팝업이 열려 있는 동안 30초마다 바뀝니다.
 * 대표 리포트 4차: "현재 시각: 오전 8:21 · 0분 전" 이 열어 둔 채로 2분이 지나도 그대로였습니다
 */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** 피그마 v3.1 (7116:87038): 위에 [전송시간 · 음성] 칸, 가운데 지도, 아래 '현재 주소' 에 위치·좌표·고도·일시·전화번호를 모읍니다 */
function SosContent({ popup }: { popup: SosPopup }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const now = useNow();
  const sent = new Date(popup.sentAt);
  const details = [
    t('alerts.detailPlace', { place: [popup.place.placeName, popup.place.address].filter(Boolean).join(', ') || '-' }),
    t('alerts.detailCoords', { lat: popup.place.latitude.toFixed(4), lng: popup.place.longitude.toFixed(4) }),
    popup.altitude != null ? t('alerts.detailAltitude', { altitude: popup.altitude.toFixed(1) }) : null,
    t('alerts.detailDate', { date: formatDate(sent, 'full') }),
    t('alerts.detailTime', { time: formatTimeOfDay(popup.sentAt) }),
    popup.phone ? t('alerts.detailPhone', { phone: popup.phone }) : null,
  ].filter(Boolean);
  return (
    <>
      <AppText variant="title2">{t('alerts.sosTitle', { name: popup.name })}</AppText>
      <AppText variant="headlineMedium">{t('alerts.sosMessage', { name: popup.name })}</AppText>
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <AppText variant="headlineMedium">{t('alerts.sentAt')}</AppText>
          <AppText variant="label2" color={colors.textSecondary}>
            {t('alerts.sentAtInfo', {
              date: formatDate(sent, 'full'),
              sent: formatTimeOfDay(popup.sentAt),
              ago: formatDuration(Math.max(0, Math.floor((now.getTime() - sent.getTime()) / 60_000))),
              now: formatTimeOfDay(now),
            })}
          </AppText>
        </View>
        <VoiceTile sosId={popup.sosId} hasVoice={popup.hasVoice} />
      </View>
      <MapCircle center={popup.place} name={popup.name} />
      <View style={styles.section}>
        <AppText variant="headline">{t('alerts.currentAddress')}</AppText>
        <AppText variant="label1" color={colors.textSecondary}>
          {details.join('\n')}
        </AppText>
      </View>
      <View style={styles.divider} />
    </>
  );
}

/**
 * 끝난 SOS ('안전 확인됨' / '취소됨'). 대표 리포트 4차: "안전하다고 알렸습니다" 를 눌렀는데 긴급 발신 화면과
 * 구조대 전화 버튼이 떴습니다 → 안전 알림 시각, 원래 SOS 시각·위치, 상태 '종료'만 보여 주고 전화 버튼은 두지 않습니다
 */
function EndedSosContent({ popup }: { popup: SosPopup }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const resolved = popup.status === 'resolved';
  const place = [popup.place.placeName, popup.place.address].filter(Boolean).join(', ');
  const lines = [
    popup.endedAt ? t(resolved ? 'sos.endedAt' : 'sos.cancelledAt', { time: `${formatDate(new Date(popup.endedAt), 'full')} ${formatTimeOfDay(popup.endedAt)}` }) : null,
    t('sos.originalSentAt', { time: `${formatDate(new Date(popup.sentAt), 'full')} ${formatTimeOfDay(popup.sentAt)}` }),
    place ? t('sos.originalPlace', { place }) : null,
    t('sos.statusEnded'),
  ].filter(Boolean);
  const hasSpot = popup.place.latitude !== 0 || popup.place.longitude !== 0;
  return (
    <>
      <View style={styles.endedHead}>
        <Ionicons name={resolved ? 'shield-checkmark' : 'close-circle'} size={28} color={resolved ? GREEN : colors.textTertiary} />
        <AppText variant="title3" style={styles.flex}>
          {t(resolved ? 'sos.resolvedPopupTitle' : 'sos.cancelledPopupTitle', { name: popup.name })}
        </AppText>
      </View>
      <AppText variant="body2" color={colors.textSecondary}>
        {t(resolved ? 'sos.resolvedPopupMessage' : 'sos.cancelledPopupMessage')}
      </AppText>
      {hasSpot ? <MapCircle center={popup.place} name={popup.name} /> : null}
      <AppText variant="label1" color={colors.textSecondary}>
        {lines.join('\n')}
      </AppText>
    </>
  );
}

function IllustratedContent({ name, title, image, message, info }: { name: string; title: string; image: number; message: string; info: string }) {
  const styles = useStyles();
  const colors = useColors();
  const avatarUrl = useFriendAvatar(name);
  return (
    <>
      <View style={styles.titleWithAvatar}>
        <Avatar name={name} imageUrl={avatarUrl} />
        <AppText variant="title3" style={styles.flex}>
          {title}
        </AppText>
      </View>
      <Image source={image} style={styles.illustration} />
      <AppText variant="body2" color={colors.textSecondary}>
        {message}
      </AppText>
      <AppText variant="body2" color={colors.textSecondary}>
        {info}
      </AppText>
    </>
  );
}

function MapCircle({ center, name }: { center: LatLng; name?: string }) {
  const styles = useStyles();
  const avatarUrl = useFriendAvatar(name);
  return (
    <View style={styles.map} pointerEvents="none">
      <AppMapView initialCenter={center} interactive={false} initialDelta={0.006} style={StyleSheet.absoluteFill} />
      <View style={styles.redCircle}>
        {name ? (
          <View style={styles.avatarRing}>
            <Avatar name={name} imageUrl={avatarUrl} size={40} />
          </View>
        ) : (
          <Ionicons name="warning" size={32} color={RED} />
        )}
      </View>
    </View>
  );
}

function PopupButtons({ popup, dismiss }: { popup: AlertPopupPayload; dismiss: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const call = (number = '') => Linking.openURL(`tel:${number}`);
  const shareLocation = () => {
    dismiss();
    router.push({ pathname: '/place-picker', params: { mode: 'share', roomId: 'room1' } });
  };

  const buttons: ReactNode[] = [];
  switch (popup.kind) {
    case 'sos':
      // 끝난 SOS 에는 구조대·전화 버튼을 두지 않습니다 (대표 리포트 4차)
      if (popup.status === 'resolved' || popup.status === 'cancelled') {
        buttons.push(<Button key="ok" label={t('common.confirm')} size="lg" onPress={dismiss} />);
        break;
      }
      buttons.push(
        <Button key="rescue" label={t('alerts.callRescue')} variant="dark" size="lg" onPress={() => call('119')} style={styles.black} />,
        // 보낸 사람 번호를 받았으면 바로 겁니다 (예전 서버는 번호가 없어 전화 앱만 엽니다)
        <Button key="call" label={t('alerts.call')} size="lg" onPress={() => call(popup.phone)} style={styles.red} />,
      );
      break;
    case 'dangerZone':
    case 'gpsLost':
      buttons.push(
        <Button key="ok" label={t('alerts.confirm')} variant="white" size="lg" onPress={dismiss} style={styles.outline} />,
        <Button key="share" label={t('alerts.shareMyLocation')} size="lg" onPress={shareLocation} style={styles.red} />,
      );
      break;
    case 'batteryLow':
      buttons.push(
        <Button key="call" label={t('alerts.callNow')} size="lg" onPress={() => call()} style={styles.green} />,
        <Button key="ok" label={t('common.confirm')} variant="brownLight" size="lg" onPress={dismiss} />,
      );
      break;
    case 'noMovement':
      buttons.push(
        <Button key="call" label={t('alerts.callNow')} size="lg" onPress={() => call()} style={styles.green} />,
        <Button key="help" label={t('alerts.askHelp')} size="lg" onPress={() => call('119')} style={styles.red} />,
      );
      break;
    case 'speeding':
      // TODO(6단계): 과속 알림 끄기 → 설정 저장 (WBS 8.1 알림금지 설정)
      buttons.push(<Button key="mute" label={t('alerts.muteAlert')} size="lg" onPress={dismiss} style={styles.red} />);
      break;
  }

  return (
    <>
      {buttons}
      {(popup.kind === 'sos' && popup.status !== 'resolved' && popup.status !== 'cancelled') || popup.kind === 'noMovement' ? (
        <Pressable accessibilityRole="button" onPress={dismiss} style={styles.closeLink}>
          <AppText variant="label1" color={colors.textTertiary}>
            {t('common.close')}
          </AppText>
        </Pressable>
      ) : null}
    </>
  );
}

/**
 * SOS 녹음 듣기. 누르면 서버에서 잠깐 쓸 수 있는 주소를 받아 재생하고, 다시 누르면 멈춥니다.
 * 불러오는 중·진행 막대·실패 안내는 useSosVoice (대표 리포트 4차: 눌러도 변화가 없었습니다)
 */
function VoiceTile({ sosId, hasVoice }: { sosId?: string; hasVoice: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const voice = useSosVoice(sosId);

  const enabled = hasVoice && !!sosId;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!enabled || voice.state === 'loading'}
      onPress={() => void voice.toggle()}
      style={[styles.tile, !enabled && styles.dim]}
    >
      <AppText variant="headlineMedium">{t('alerts.voice')}</AppText>
      <AppText variant="label2" color={colors.textSecondary}>
        {voice.state === 'loading' ? t('sos.voiceLoading') : t('alerts.voiceDesc')}
      </AppText>
      <View style={styles.play}>
        {voice.state === 'loading' ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Ionicons name={voice.state === 'playing' ? 'pause' : 'play'} size={30} color={colors.white} />
        )}
      </View>
      {voice.state !== 'idle' && voice.state !== 'loading' ? (
        <View style={styles.voiceTrack}>
          <View style={[styles.voiceFill, { width: `${voice.progress * 100}%` }]} />
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  // 팝업 안 글자는 전부 테마 색이라, 카드도 테마를 따라가야 합니다.
  // 흰색(#FDF9F8)으로 박혀 있어 다크에서 흰 카드에 흰 글자가 됐습니다
  card: { maxHeight: '92%', borderRadius: 16, backgroundColor: colors.popup, overflow: 'hidden' },
  body: { padding: 16, gap: 16 },
  footer: { borderTopWidth: 1, borderTopColor: colors.surfaceStrong, padding: 16, gap: 10 },
  flex: { flex: 1 },
  section: { gap: 4 },
  divider: { height: 1, backgroundColor: colors.surfaceStrong },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, borderRadius: radius.md, backgroundColor: colors.surfaceStrong, padding: 12, gap: 4 },
  voiceTrack: { height: 4, marginTop: 8, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  voiceFill: { height: 4, backgroundColor: '#FF1E3C' },
  endedHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dim: { opacity: 0.5 },
  play: { alignSelf: 'center', marginTop: 16, width: 50, height: 50, borderRadius: 25, backgroundColor: '#FF1E3C', alignItems: 'center', justifyContent: 'center' },
  map: { height: 200, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  redCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
    borderColor: 'rgba(255,30,0,0.6)',
    backgroundColor: 'rgba(255,30,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: { padding: 4, borderRadius: 30, backgroundColor: colors.white },
  titleWithAvatar: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  illustration: { alignSelf: 'center', width: 150, height: 150 },
  black: { backgroundColor: '#1A1A1A' },
  red: { backgroundColor: RED },
  green: { backgroundColor: GREEN },
  outline: { borderWidth: 1, borderColor: colors.border },
  closeLink: { alignSelf: 'center', paddingVertical: 4 },
}));
