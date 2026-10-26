import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import { privacyApi, type PrivacySettings } from '@/api/endpoints/privacy';
import { AppText, ChipTabs, MenuItem, Popup, Screen, ToggleRow } from '@/components/ui';
import { LINKS } from '@/config/links';
import { makeStyles, radius, useColors } from '@/theme';
import { showToast } from '@/utils/toast';

type Range = 'today' | 'week' | 'all';

/**
 * 개인정보 센터 (보완 화면 설계 4.13, 피그마 v2.4 1015:55763, GDPR · CCPA).
 * 나의 프로필 › 설정 › 계정 관리 › [개인정보 센터].
 *
 * - 내 데이터 내려받기(파일), 위치 기록 지우기(기간 선택), 데이터 보관 지역 표시
 * - 동의 관리: 맞춤 광고 · 서비스 개선 분석(위치 제외) · 마케팅 알림 · 내 개인정보 판매·공유 거부(CCPA). 철회는 바로 반영
 * - 지금 내 위치를 보는 사람 (위치 공유 중 알림, 4.12) 을 여기서도 열 수 있습니다
 */
export default function PrivacyCenterScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['privacy'], queryFn: privacyApi.get });
  const update = useMutation({
    mutationFn: (patch: Partial<Omit<PrivacySettings, 'dataRegion'>>) => privacyApi.update(patch),
    onSuccess: (saved) => queryClient.setQueryData(['privacy'], saved),
    onError: () => showToast(t('common.requestFailed')),
  });
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [range, setRange] = useState<Range>('week');

  const exportData = async () => {
    setExporting(true);
    try {
      const path = await privacyApi.exportToFile();
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: t('privacy.exportTitle') });
      else showToast(t('privacy.exportSaved'));
    } catch {
      showToast(t('common.requestFailed'));
    } finally {
      setExporting(false);
    }
  };

  const deleteHistory = async () => {
    setDeleting(false);
    try {
      const deleted = await privacyApi.deleteHistory(range);
      void queryClient.invalidateQueries({ queryKey: ['journey'] });
      showToast(t('privacy.deleted', { count: deleted }));
    } catch {
      showToast(t('common.requestFailed'));
    }
  };

  return (
    <Screen title={t('screens.privacyCenter')} tab="map" contentStyle={styles.content}>
      <View style={styles.section}>
        <AppText variant="label1" color={colors.textLabel}>
          {t('privacy.myData')}
        </AppText>
        <MenuItem label={exporting ? t('privacy.exporting') : `${t('privacy.export')} · ${t('privacy.exportDesc')}`} onPress={() => !exporting && void exportData()} />
        <MenuItem label={`${t('privacy.deleteHistory')} · ${t('privacy.deleteHistoryDesc')}`} onPress={() => setDeleting(true)} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <AppText variant="label1">{t('privacy.region')}</AppText>
            <AppText variant="caption" color={colors.textTertiary}>
              {settings?.dataRegion.name ?? '-'}
            </AppText>
          </View>
          <AppText variant="label2" color={colors.textTertiary}>
            {t('privacy.auto')}
          </AppText>
        </View>
        <MenuItem label={t('privacy.whoSees')} onPress={() => router.push('/sharing-reminder')} />
      </View>

      <View style={styles.section}>
        <AppText variant="label1" color={colors.textLabel}>
          {t('privacy.consents')}
        </AppText>
        <ToggleRow title={t('privacy.ads')} description={t('privacy.adsDesc')} value={settings?.adsPersonalized ?? false} onValueChange={(v) => update.mutate({ adsPersonalized: v })} />
        <ToggleRow title={t('privacy.analytics')} description={t('privacy.analyticsDesc')} value={settings?.analytics ?? true} onValueChange={(v) => update.mutate({ analytics: v })} />
        <ToggleRow title={t('privacy.marketing')} description={t('privacy.marketingDesc')} value={settings?.marketing ?? false} onValueChange={(v) => update.mutate({ marketing: v })} />
        <ToggleRow title={t('privacy.doNotSell')} description={t('privacy.doNotSellDesc')} value={settings?.doNotSell ?? false} onValueChange={(v) => update.mutate({ doNotSell: v })} />
      </View>

      <AppText variant="caption" color={colors.textTertiary}>
        {t('privacy.contact', { email: LINKS.contactEmail })}{' '}
        <AppText variant="caption" color={colors.primary} style={styles.link} onPress={() => void Linking.openURL(LINKS.privacyPolicy)}>
          {t('bgLocation.privacyPolicy')}
        </AppText>
      </AppText>

      <Popup
        visible={deleting}
        title={t('privacy.deleteTitle')}
        message={t('privacy.deleteMessage')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setDeleting(false)}
        onDismiss={() => setDeleting(false)}
        confirmLabel={t('privacy.deleteConfirm')}
        onConfirm={() => void deleteHistory()}
      >
        <Pressable style={styles.rangeWrap}>
          <ChipTabs<Range>
            tone="dark"
            value={range}
            onChange={setRange}
            options={[
              { value: 'today', label: t('privacy.rangeToday') },
              { value: 'week', label: t('privacy.rangeWeek') },
              { value: 'all', label: t('privacy.rangeAll') },
            ]}
          />
        </Pressable>
      </Popup>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 20, paddingTop: 16 },
  flex: { flex: 1 },
  section: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface },
  link: { textDecorationLine: 'underline' },
  rangeWrap: { alignItems: 'center', paddingVertical: 8 },
}));
