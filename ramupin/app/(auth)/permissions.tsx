import { requestPermissionsAsync as requestContacts } from 'expo-contacts';
import { requestMediaLibraryPermissionsAsync } from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, PermissionsAndroid, Platform } from 'react-native';

import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { PermissionCard } from '@/features/onboarding/PermissionCard';

type Step = {
  key: string;
  screenTitle?: string;
  title: string;
  description: string;
  hint?: string;
  hintStrong?: string;
  primary: string;
  /** "나중에 하기" 허용 여부 */
  optional?: boolean;
  request: () => Promise<unknown>;
};

async function requestAndroid(permission: string) {
  if (Platform.OS !== 'android') return;
  // 권한이 manifest 에 없으면 바로 거부로 끝납니다 (다음 네이티브 빌드에서 추가 필요)
  await PermissionsAndroid.request(permission as never).catch(() => undefined);
}

/**
 * 피그마: 권한 안내 7종 (348:15289 ~ 348:15473)
 * 순서: 위치(사용 중) → 위치(항상) → 신체 활동 → 알림 → 사진 → 주소록 → 배터리 최적화
 * Play 정책: 백그라운드 위치는 앱 사용 중 권한을 먼저 받은 뒤 별도로 요청해야 합니다.
 * TODO(6단계): 백그라운드 위치는 isAndroidBackgroundLocationEnabled 켠 빌드에서만 동작, 블루투스(BLE)는 2차
 */
export default function PermissionsScreen() {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const steps: Step[] = [
    {
      key: 'location',
      title: t('onboarding.permLocationTitle'),
      description: t('onboarding.permLocationDesc'),
      hint: t('onboarding.permChooseNext'),
      hintStrong: t('onboarding.permWhileUsing'),
      primary: t('onboarding.continue'),
      request: () => Location.requestForegroundPermissionsAsync(),
    },
    {
      key: 'locationAlways',
      title: t('onboarding.permAlwaysTitle'),
      description: t('onboarding.permAlwaysDesc'),
      hint: t('onboarding.permChooseNext'),
      hintStrong: t('onboarding.permAlways'),
      primary: t('onboarding.continue'),
      optional: true,
      request: () => Location.requestBackgroundPermissionsAsync().catch(() => undefined),
    },
    {
      key: 'activity',
      screenTitle: t('onboarding.permActivityScreen'),
      title: t('onboarding.permActivityTitle'),
      description: t('onboarding.permActivityDesc'),
      primary: t('onboarding.allow'),
      optional: true,
      request: () => requestAndroid('android.permission.ACTIVITY_RECOGNITION'),
    },
    {
      key: 'notifications',
      screenTitle: t('onboarding.permNotiScreen'),
      title: t('onboarding.permNotiTitle'),
      description: t('onboarding.permNotiDesc'),
      primary: t('onboarding.allowNoti'),
      optional: true,
      request: () => requestAndroid('android.permission.POST_NOTIFICATIONS'),
    },
    {
      key: 'photos',
      title: t('onboarding.permPhotoTitle'),
      description: t('onboarding.permPhotoDesc'),
      primary: t('onboarding.allowPhoto'),
      optional: true,
      request: () => requestMediaLibraryPermissionsAsync(),
    },
    {
      key: 'contacts',
      title: t('onboarding.permContactsTitle'),
      description: t('onboarding.permContactsDesc'),
      primary: t('common.allow'),
      optional: true,
      request: () => requestContacts(),
    },
    {
      key: 'battery',
      screenTitle: t('onboarding.permTitle'),
      title: t('onboarding.permBatteryTitle'),
      description: t('onboarding.permBatteryDesc'),
      primary: t('onboarding.openSettings'),
      optional: true,
      request: async () => {
        if (Platform.OS !== 'android') return;
        // Play 정책상 예외 요청 대신 설정 화면으로 안내
        await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(() => Linking.openSettings());
      },
    },
  ];

  const step = steps[index];
  const next = () => {
    if (index + 1 < steps.length) setIndex(index + 1);
    else router.push('/single-household');
  };

  const onPrimary = async () => {
    setBusy(true);
    try {
      await step.request();
    } finally {
      setBusy(false);
      next();
    }
  };

  return (
    <OnboardingLayout title={step.screenTitle ?? t('onboarding.permTitle')}>
      <PermissionCard
        key={step.key}
        title={step.title}
        description={step.description}
        hint={step.hint}
        hintStrong={step.hintStrong}
        primaryLabel={step.primary}
        onPrimary={onPrimary}
        secondaryLabel={step.optional ? t('onboarding.later') : undefined}
        onSecondary={next}
        busy={busy}
      />
    </OnboardingLayout>
  );
}
