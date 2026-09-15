import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAlertStore, type AlertPopupPayload } from './alertStore';
import { AppText, Avatar, Button } from '@/components/ui';
import { formatDuration, minutesSince } from '@/features/journey/routeLayers';
import { AppMapView } from '@/features/map/AppMapView';
import { colors, radius } from '@/theme';
import type { LatLng } from '@/types/models';
import { showToast } from '@/utils/toast';

const RED = '#FF1E00';
const GREEN = '#34C759';

/** 피그마: SOS 수신 (363:19884) / 위험 지역 (363:20071) / GPS 끊김 (363:20093) / 배터리 (363:20119) / 무움직임 (363:20136) / 과속 (363:20153) */
export function AlertPopupHost() {
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
  const { t } = useTranslation();
  switch (popup.kind) {
    case 'sos': {
      const sent = new Date(popup.sentAt);
      return (
        <>
          <AppText variant="title2">{t('alerts.sosTitle', { name: popup.name })}</AppText>
          <AppText variant="headlineMedium">{t('alerts.sosMessage', { name: popup.name })}</AppText>
          <MapCircle center={popup.place} name={popup.name} />
          <View style={styles.section}>
            <AppText variant="headline">{t('alerts.currentAddress')}</AppText>
            <AppText variant="label1" color={colors.textSecondary}>
              {popup.place.placeName ? `${popup.place.placeName}, ` : ''}
              {popup.place.address}
            </AppText>
          </View>
          <View style={styles.divider} />
          <View style={styles.tiles}>
            <View style={styles.tile}>
              <AppText variant="headlineMedium">{t('alerts.sentAt')}</AppText>
              <AppText variant="label2" color={colors.textSecondary}>
                {sent.toLocaleString('ko-KR')} ({formatDuration(minutesSince(popup.sentAt))} 전)
              </AppText>
              <AppText variant="headlineMedium" style={styles.tileGap}>
                {t('alerts.coordinates')}
              </AppText>
              <AppText variant="label2" color={colors.textSecondary}>
                {t('alerts.latLng', { lat: popup.place.latitude.toFixed(4), lng: popup.place.longitude.toFixed(4) })}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={!popup.hasVoice}
              // TODO(5단계): 서버의 SOS 녹음 파일 재생 (expo-audio useAudioPlayer)
              onPress={() => showToast(t('alerts.voiceDesc').replace('\n', ' '))}
              style={[styles.tile, !popup.hasVoice && styles.dim]}
            >
              <AppText variant="headlineMedium">{t('alerts.voice')}</AppText>
              <AppText variant="label2" color={colors.textSecondary}>
                {t('alerts.voiceDesc')}
              </AppText>
              <View style={styles.play}>
                <Ionicons name="play" size={30} color={colors.white} />
              </View>
            </Pressable>
          </View>
        </>
      );
    }
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
          <MapCircle center={popup.place} name={popup.name} />
          <AppText variant="body2" color={colors.textSecondary}>
            {t('alerts.lastInfo', {
              place: popup.place.placeName ?? popup.place.address,
              time: `${formatDuration(minutesSince(popup.lastSeenAt))} 전 (${new Date(popup.lastSeenAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`,
            })}
          </AppText>
        </>
      );
    case 'batteryLow':
      return (
        <IllustratedContent
          name={popup.name}
          title={t('alerts.batteryTitle', { name: popup.name, level: popup.level })}
          image={require('../../../assets/icons/alert-battery.png')}
          message={t('alerts.batteryMessage', { name: popup.name })}
          info={t('alerts.batteryInfo', { level: popup.level, minutes: popup.minutesLeft })}
        />
      );
    case 'noMovement':
      return (
        <IllustratedContent
          name={popup.name}
          title={t('alerts.noMovementTitle', { name: popup.name, hours: popup.hours })}
          image={require('../../../assets/icons/alert-no-movement.png')}
          message={t('alerts.noMovementMessage')}
          info={t('alerts.noMovementInfo', { hours: popup.hours })}
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

function IllustratedContent({ name, title, image, message, info }: { name: string; title: string; image: number; message: string; info: string }) {
  return (
    <>
      <View style={styles.titleWithAvatar}>
        <Avatar name={name} />
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
  return (
    <View style={styles.map} pointerEvents="none">
      <AppMapView initialCenter={center} interactive={false} initialDelta={0.006} style={StyleSheet.absoluteFill} />
      <View style={styles.redCircle}>
        {name ? (
          <View style={styles.avatarRing}>
            <Avatar name={name} size={40} />
          </View>
        ) : (
          <Ionicons name="warning" size={32} color={RED} />
        )}
      </View>
    </View>
  );
}

function PopupButtons({ popup, dismiss }: { popup: AlertPopupPayload; dismiss: () => void }) {
  const { t } = useTranslation();
  const call = (number = '') => Linking.openURL(`tel:${number}`);
  const shareLocation = () => {
    dismiss();
    router.push({ pathname: '/place-picker', params: { mode: 'share', roomId: 'room1' } });
  };

  const buttons: ReactNode[] = [];
  switch (popup.kind) {
    case 'sos':
      buttons.push(
        <Button key="rescue" label={t('alerts.callRescue')} variant="dark" size="lg" onPress={() => call('119')} style={styles.black} />,
        <Button key="call" label={t('alerts.call')} size="lg" onPress={() => call()} style={styles.red} />,
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
      {popup.kind === 'sos' || popup.kind === 'noMovement' ? (
        <Pressable accessibilityRole="button" onPress={dismiss} style={styles.closeLink}>
          <AppText variant="label1" color={colors.textTertiary}>
            {t('common.close')}
          </AppText>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  card: { maxHeight: '92%', borderRadius: 16, backgroundColor: '#FDF9F8', overflow: 'hidden' },
  body: { padding: 16, gap: 16 },
  footer: { borderTopWidth: 1, borderTopColor: colors.surfaceStrong, padding: 16, gap: 10 },
  flex: { flex: 1 },
  section: { gap: 4 },
  divider: { height: 1, backgroundColor: colors.surfaceStrong },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, borderRadius: radius.md, backgroundColor: colors.surfaceStrong, padding: 12, gap: 4 },
  tileGap: { marginTop: 12 },
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
});
