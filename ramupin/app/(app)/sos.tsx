import { Ionicons } from '@expo/vector-icons';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sosApi } from '@/api/endpoints/sos';
import { AppText, Button } from '@/components/ui';
import { describePlace } from '@/features/location/address';
import { useSafetySetting } from '@/features/settings/queries';
import { SlideToCancel } from '@/features/sos/SlideToCancel';
import { colors } from '@/theme';

// TODO(정책): 카운트다운·녹음 시간은 서버 정책값 (WBS 7.9: 10초)
const COUNTDOWN_SECONDS = 10;
const RECORD_SECONDS = 10;

type Phase = 'idle' | 'countdown' | 'recording' | 'sending' | 'sent';

/**
 * 피그마: SOS (99:35983 대기 / 99:36017 취소됨 / 99:36053 카운트다운 / 99:36579 녹음)
 * 흐름: 탭(또는 길게 누름) → 10초 카운트다운(밀어서 취소) → 10초 녹음 → 위치·녹음 전송
 * WBS 7.9: 취소하면 경보 해제, 녹음 파일 삭제
 * TODO(6단계): 지도에서 두 손가락 탭으로 SOS 진입, 앱이 백그라운드여도 전송 유지
 */
export default function SosScreen() {
  const { t } = useTranslation();
  const { data: safety } = useSafetySetting();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [phase, setPhase] = useState<Phase>('idle');
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const [cancelledBanner, setCancelledBanner] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  const [micDenied, setMicDenied] = useState(false);

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
        startRecording();
      }
    }, 1000);
  };

  const startRecording = async () => {
    setPhase('recording');
    setRemaining(RECORD_SECONDS);
    const granted = micGranted.current;
    if (granted) {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    }
    let left = RECORD_SECONDS;
    timer.current = setInterval(async () => {
      left -= 1;
      setRemaining(left);
      if (left <= 0) {
        clearTimer();
        await finish(granted);
      }
    }, 1000);
  };

  const finish = async (recorded: boolean) => {
    setPhase('sending');
    if (recorded) await recorder.stop();
    const position = await locationPromise.current;
    const place = position ? await describePlace({ latitude: position.coords.latitude, longitude: position.coords.longitude }) : null;
    const result = await sosApi.send({
      place,
      altitude: position?.coords.altitude ?? null,
      audioUri: recorded ? recorder.uri : null,
      startedAt: startedAt.current,
    });
    setRecipientCount(result.recipientCount);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase('sent');
  };

  const cancel = async () => {
    clearTimer();
    if (phase === 'recording' && recorder.isRecording) {
      // 취소하면 녹음을 멈추고 전송하지 않음 (WBS 7.9)
      // TODO(다음 네이티브 빌드): expo-file-system 추가 후 recorder.uri 파일 즉시 삭제. 지금은 앱 캐시에 남음
      await recorder.stop();
    }
    setPhase('idle');
    setCancelledBanner(true);
  };

  if (phase === 'idle') {
    return (
      <SafeAreaView style={styles.light}>
        <StatusBar style="dark" />
        <View style={styles.lightHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => router.back()} hitSlop={8} style={styles.close}>
            <Ionicons name="close" size={24} color="#2206C6" />
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sos.tapToSend')}
              onPress={start}
              onLongPress={start}
              style={({ pressed }) => [styles.halo, pressed && styles.pressed]}
            >
              <View style={styles.sosButton}>
                <AppText variant="title2" color={colors.white} align="center">
                  {t('sos.tapToSend')}
                </AppText>
                <AppText variant="caption" color={colors.white}>
                  {t('sos.orLongPress')}
                </AppText>
              </View>
            </Pressable>
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
        <View style={styles.darkBody}>
          <Ionicons name="checkmark-circle" size={96} color={colors.check} />
          <AppText variant="title1" color={colors.white} align="center">
            {t('sos.sentTitle')}
          </AppText>
          <AppText variant="body2" color="#D0D0D0" align="center">
            {recipientCount > 0 ? t('sos.sentDesc', { count: recipientCount }) : t('sos.sentNoRecipients')}
          </AppText>
          <View style={styles.callRow}>
            <Button label={t('sos.call112')} variant="danger" onPress={() => Linking.openURL('tel:112')} style={styles.flex} />
            <Button label={t('sos.call119')} variant="danger" onPress={() => Linking.openURL('tel:119')} style={styles.flex} />
          </View>
          <Button label={t('sos.done')} variant="white" onPress={() => router.back()} style={styles.doneButton} />
        </View>
      ) : (
        <>
          <View style={styles.darkTexts}>
            <AppText variant="title2" color={colors.white} align="center">
              {t(phase === 'countdown' ? 'sos.requestTitle' : 'sos.recordingTitle')}
            </AppText>
            <AppText variant="body2" color="#D0D0D0" align="center">
              {phase === 'countdown' ? t('sos.requestDesc', { seconds: COUNTDOWN_SECONDS }) : t('sos.recordingDesc', { seconds: RECORD_SECONDS })}
            </AppText>
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

const styles = StyleSheet.create({
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
  callRow: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  doneButton: { alignSelf: 'stretch' },
});
