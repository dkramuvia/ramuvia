import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { friendsApi } from '@/api';
import { AppText, Avatar, Button } from '@/components/ui';
import { RequestSentPopup } from '@/features/friends/RequestSentPopup';
import { parseFriendQr } from '@/features/friends/qr';
import { useSendFriendRequest } from '@/features/friends/queries';
import { colors, layout, radius } from '@/theme';
import type { UserSummary } from '@/types/models';
import { formatRelativeTime } from '@/utils/time';
import { showToast } from '@/utils/toast';

const FRAME_SIZE = 288;

/** 피그마: QR스캔 친구추가 (283:23362 / 손전등 283:23421 / 인식 결과 283:23476) */
export default function QrScanScreen() {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [found, setFound] = useState<UserSummary | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // 같은 코드를 연속으로 여러 번 읽지 않도록 잠금
  const scanning = useRef(true);
  const send = useSendFriendRequest();

  const onScanned = async ({ data }: BarcodeScanningResult) => {
    if (!scanning.current) return;
    scanning.current = false;
    const userId = parseFriendQr(data);
    if (!userId) {
      showToast(t('friendAdd.invalidQr'));
      setTimeout(() => (scanning.current = true), 1500);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const user = await friendsApi.findUser(userId).catch(() => null);
    if (!user) {
      showToast(t('friendAdd.userNotFound'));
      setTimeout(() => (scanning.current = true), 1500);
      return;
    }
    setFound(user);
  };

  const rescan = () => {
    setFound(null);
    scanning.current = true;
  };

  return (
    <View style={styles.container}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={found ? undefined : onScanned}
        />
      ) : null}
      <View style={styles.dim} pointerEvents="none" />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <HeaderOnDark title={t('friendAdd.scanTitle')} />

        <View style={styles.center}>
          <AppText variant="body1" color={colors.white} align="center">
            {t('friendAdd.scanGuide')}
          </AppText>
          <View style={styles.frame}>
            {!permission?.granted ? (
              <View style={styles.permission}>
                <AppText variant="label1" color={colors.text}>
                  {t('friendAdd.cameraDenied')}
                </AppText>
                <Button label={t('friendAdd.allowCamera')} variant="dark" size="sm" onPress={requestPermission} />
              </View>
            ) : null}
          </View>
          {/* 기획: 손전등 버튼 → 휴대폰 후면 플래시 */}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: torch }}
            accessibilityLabel={t('friendAdd.flash')}
            onPress={() => setTorch((v) => !v)}
            style={[styles.torch, torch && styles.torchOn]}
          >
            <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={24} color={torch ? colors.textStrong : colors.white} />
          </Pressable>
        </View>

        {!found ? (
          <View style={styles.bottom}>
            <Button label={t('friendAdd.showMyQr')} variant="white" size="lg" onPress={() => router.replace('/friends/my-qr')} />
          </View>
        ) : null}
      </SafeAreaView>

      {found ? (
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.resultRow}>
            <Avatar name={found.nickname} imageUrl={found.avatarUrl} />
            <AppText variant="title2" color={colors.textStrong}>
              {found.nickname}님
            </AppText>
          </View>
          <AppText variant="body2Bold" style={styles.resultText}>
            {found.areaName
              ? t('friendAdd.scanResultArea', { area: found.areaName })
              : found.lastActiveAt
                ? t('friendAdd.scanResultRecent', { time: formatRelativeTime(found.lastActiveAt) })
                : ''}
          </AppText>
          <View style={styles.sheetButtons}>
            <Button
              label={t('friendAdd.request')}
              variant="dark"
              size="lg"
              disabled={send.isPending}
              onPress={() => send.mutate(found.id, { onSuccess: () => setSentTo(found.nickname) })}
            />
            <Button label={t('friendAdd.rescan')} variant="neutral" size="lg" onPress={rescan} />
          </View>
        </View>
      ) : null}

      <RequestSentPopup
        nickname={sentTo}
        onClose={() => {
          setSentTo(null);
          router.back();
        }}
      />
    </View>
  );
}

/** 어두운 카메라 화면용 상단 바 (공통 Header 는 밝은 배경용) */
function HeaderOnDark({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back} hitSlop={4}>
        <Ionicons name="chevron-back" size={24} color={colors.white} />
      </Pressable>
      <AppText variant="body1Bold" color={colors.white} style={styles.headerTitle} align="center">
        {title}
      </AppText>
      <View style={styles.back} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E1E1E' },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)' },
  overlay: { flex: 1 },
  header: { height: layout.headerHeight, flexDirection: 'row', alignItems: 'center' },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permission: { alignItems: 'center', gap: 12, padding: 20, borderRadius: radius.sm, backgroundColor: colors.background },
  torch: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchOn: { backgroundColor: colors.white },
  bottom: { paddingHorizontal: 16, paddingBottom: 16 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.background,
  },
  grabber: { alignSelf: 'center', width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9', marginTop: 12, marginBottom: 16 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  resultText: { paddingHorizontal: 56, paddingTop: 4, paddingBottom: 24 },
  sheetButtons: { gap: 12 },
});
