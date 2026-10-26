import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { usersApi } from '@/api/endpoints/users';
import { AppText, Avatar, Button, QueryState, Screen, ShareLevelIcon, ToggleRow } from '@/components/ui';
import { useFriendRequest, useRespondFriendRequest } from '@/features/friends/queries';
import { ReportSheet, type ReportTarget } from '@/features/safety/ReportSheet';
import { isToggleLocked } from '@/features/sharing/shareRules';
import type { LocationShareLevel } from '@/types/models';
import { useAuthStore } from '@/stores/authStore';
import { makeStyles, radius, useColors, withAlpha } from '@/theme';
import { formatRelativeTime } from '@/utils/time';
import { showToast } from '@/utils/toast';

const LEVELS: LocationShareLevel[] = ['exact', 'blurred', 'hidden'];

/**
 * 피그마: 친구 요청 상세 (283:23927) → 등록 완료 (283:24012) → 1인 가구 모드 해제 (283:24079)
 * 기획: 처음 친구가 등록되면 1인 가구 모드가 해제됨 (WBS 4: 75세 이상은 해제하지 않음 → 서버가 판단)
 *
 * 보완 화면 설계 4.3 (피그마 v2.4 1015:49022): 위치 공유는 양쪽 동의가 있어야 하므로, 받은 사람이
 * 수락하면서 내 공개 수준을 처음 정합니다. 기본은 "정확"(수정 반영본 C5), 이동 경로 끔, 배터리 켬.
 * 거절해도 상대에게 알리지 않습니다. 모르는 사람이면 [차단하고 신고하기].
 */
export default function FriendRequestDetailScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const me = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { data: request, isLoading, isError, refetch } = useFriendRequest(requestId);
  const respond = useRespondFriendRequest();

  const [accepted, setAccepted] = useState(false);
  const [level, setLevel] = useState<LocationShareLevel>('exact');
  const [shareRoute, setShareRoute] = useState(false);
  const [shareBattery, setShareBattery] = useState(true);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const [showSingleOff, setShowSingleOff] = useState(false);

  const onRespond = (accept: boolean) =>
    respond.mutate(
      {
        requestId,
        accept,
        myShare: {
          locationLevel: level,
          shareRoute: !isToggleLocked(level, 'shareRoute') && shareRoute,
          shareBattery: !isToggleLocked(level, 'shareBattery') && shareBattery,
        },
      },
      {
        onSuccess: ({ singleHouseholdReleasable }) => {
          if (!accept) {
            router.back();
            return;
          }
          setAccepted(true);
          if (me?.singleHouseholdMode && singleHouseholdReleasable) setShowSingleOff(true);
        },
      },
    );

  const person = request?.from;

  return (
    <Screen title={t('screens.friendRequestDetail')} tab="people" background={colors.surface} contentStyle={styles.content}>
      {isLoading || isError || !person ? (
        <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} />
      ) : accepted ? (
        <View style={styles.card}>
          <View style={styles.doneTitles}>
            <AppText variant="title3">{t('friendRequestDetail.doneTitle')}</AppText>
            <AppText variant="body2Bold">{t('friendRequestDetail.doneMessage')}</AppText>
          </View>
          <View style={styles.doneBanner}>
            <Avatar name={person.nickname} imageUrl={person.avatarUrl} size={40} />
            <AppText variant="label1">{t('friendRequestDetail.becameFriends', { name: person.nickname })}</AppText>
          </View>
          <Image source={require('../../../../assets/images/friend-added.png')} style={styles.doneImage} />
          <Button label={t('friendRequestDetail.viewFriends')} variant="neutral" size="lg" onPress={() => router.dismissTo('/people')} />
        </View>
      ) : (
        <View style={styles.card}>
          <AppText variant="label1" color={colors.textSecondary}>
            {t('friendRequestDetail.profile')}
          </AppText>
          <View style={styles.profile}>
            <Avatar name={person.nickname} imageUrl={person.avatarUrl} />
            <View>
              <AppText variant="listTitle">{person.nickname}</AppText>
              <AppText variant="caption" color={colors.textTertiary}>
                ID:{person.publicId ?? person.id}
              </AppText>
            </View>
          </View>

          <AppText variant="label1" color={colors.textSecondary} style={styles.sectionGap}>
            {t('friendRequestDetail.location')}
          </AppText>
          <AppText variant="title1" color={colors.textStrong}>
            {person.areaName ?? t('friendRequestDetail.locationHidden')}
          </AppText>

          <View style={styles.meta}>
            <MetaRow label={t('friendRequestDetail.requestedAt')} value={formatRelativeTime(request.createdAt)} />
            {person.lastActiveAt ? <MetaRow label={t('friendRequestDetail.lastActive')} value={formatRelativeTime(person.lastActiveAt)} /> : null}
          </View>

          {/* 경고 안내 (4.3) */}
          <View style={styles.warning}>
            <AppText variant="label2" color={colors.textSecondary}>
              {t('friendRequestDetail.warning')}
            </AppText>
          </View>

          <AppText variant="label1" color={colors.textSecondary} style={styles.sectionGap}>
            {t('friendRequestDetail.myLevel', { name: person.nickname })}
          </AppText>
          <View style={styles.levels}>
            {LEVELS.map((l) => {
              const selected = level === l;
              return (
                <Pressable key={l} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setLevel(l)} style={[styles.level, selected && styles.levelOn]}>
                  <ShareLevelIcon level={l} />
                  <AppText variant="label1Bold" color={selected ? colors.white : colors.text}>
                    {t(`friendShare.${l}`)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText variant="caption" color={colors.textTertiary}>
            {t('friendRequestDetail.levelNote')}
          </AppText>
          <ToggleRow
            title={t('friendShare.shareRoute')}
            value={!isToggleLocked(level, 'shareRoute') && shareRoute}
            disabled={isToggleLocked(level, 'shareRoute')}
            onValueChange={setShareRoute}
          />
          <ToggleRow
            title={t('friendShare.shareBattery')}
            value={!isToggleLocked(level, 'shareBattery') && shareBattery}
            disabled={isToggleLocked(level, 'shareBattery')}
            onValueChange={setShareBattery}
          />

          <View style={styles.buttons}>
            <Button label={t('friendRequestDetail.reject')} variant="neutral" size="lg" disabled={respond.isPending} onPress={() => onRespond(false)} style={styles.flex} />
            <Button label={t('friendRequestDetail.accept')} variant="dark" size="lg" disabled={respond.isPending} onPress={() => onRespond(true)} style={styles.flex} />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReporting({ userId: person.id, nickname: person.nickname, kind: 'profile' })}
            style={styles.reportLink}
            hitSlop={8}
          >
            <AppText variant="label2" color={colors.danger} style={styles.underline}>
              {t('friendRequestDetail.blockAndReport')}
            </AppText>
          </Pressable>
        </View>
      )}

      <ReportSheet target={reporting} onClose={() => setReporting(null)} onDone={(blocked) => blocked && router.back()} />

      <Modal visible={showSingleOff} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowSingleOff(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <AppText variant="title2">{t('friendRequestDetail.singleOffTitle')}</AppText>
            <AppText variant="body2">{t('friendRequestDetail.singleOffSubtitle')}</AppText>
            <AppText variant="body2" color={colors.textSecondary}>
              {t('friendRequestDetail.singleOffMessage')}
            </AppText>
            <Image source={require('../../../../assets/images/single-household-off.png')} style={styles.singleImage} resizeMode="contain" />
            <Button
              label={t('friendRequestDetail.singleOffConfirm')}
              variant="dark"
              size="lg"
              onPress={async () => {
                try {
                  await usersApi.setSingleHousehold(false);
                  updateUser({ singleHouseholdMode: false });
                } catch {
                  showToast(t('friendAdd.requestFailed'));
                } finally {
                  setShowSingleOff(false);
                }
              }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.metaRow}>
      <AppText variant="label1Bold">{label}</AppText>
      <AppText variant="label1" color={colors.textTertiary}>
        {value}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { flexGrow: 1, justifyContent: 'center' },
  flex: { flex: 1 },
  card: { borderRadius: radius.lg, backgroundColor: colors.backgroundWarm, padding: 16, gap: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.md, backgroundColor: colors.surfaceStrong },
  sectionGap: { marginTop: 8 },
  meta: { gap: 4, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 4 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 16 },
  warning: { marginTop: 8, padding: 12, borderRadius: radius.md, backgroundColor: withAlpha('#FFC700', 0.18) },
  levels: { flexDirection: 'row', gap: 8 },
  level: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.surfaceStrong },
  levelOn: { backgroundColor: colors.brownMedium },
  reportLink: { alignSelf: 'center', marginTop: 8 },
  underline: { textDecorationLine: 'underline' },
  doneTitles: { gap: 4 },
  // 안쪽 글자가 테마 색이라 바탕도 테마를 따라갑니다 (연파랑으로 박으면 다크에서 안 보입니다)
  doneBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.md, backgroundColor: colors.surfaceStrong },
  doneImage: { alignSelf: 'center', width: 176, height: 180, marginVertical: 24 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 8,
  },
  grabber: { alignSelf: 'center', width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9', marginVertical: 12 },
  singleImage: { alignSelf: 'center', width: 232, height: 232, marginVertical: 16 },
}));
