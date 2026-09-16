import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Modal, StyleSheet, View } from 'react-native';

import { usersApi } from '@/api/endpoints/users';
import { AppText, Avatar, Button, Screen } from '@/components/ui';
import { useFriendRequest, useRespondFriendRequest } from '@/features/friends/queries';
import { useAuthStore } from '@/stores/authStore';
import { colors, radius } from '@/theme';
import { formatRelativeTime } from '@/utils/time';
import { showToast } from '@/utils/toast';

/**
 * 피그마: 친구 요청 상세 (283:23927) → 등록 완료 (283:24012) → 1인 가구 모드 해제 (283:24079)
 * 기획: 처음 친구가 등록되면 1인 가구 모드가 해제됨 (WBS 4: 75세 이상은 해제하지 않음 → 서버가 판단)
 */
export default function FriendRequestDetailScreen() {
  const { t } = useTranslation();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const me = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { data: request, isLoading } = useFriendRequest(requestId);
  const respond = useRespondFriendRequest();

  const [accepted, setAccepted] = useState(false);
  const [showSingleOff, setShowSingleOff] = useState(false);

  const onRespond = (accept: boolean) =>
    respond.mutate(
      { requestId, accept },
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
      {isLoading || !person ? (
        <ActivityIndicator color={colors.brown} />
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

          <View style={styles.buttons}>
            <Button label={t('friendRequestDetail.reject')} variant="neutral" size="lg" disabled={respond.isPending} onPress={() => onRespond(false)} style={styles.flex} />
            <Button label={t('friendRequestDetail.accept')} variant="dark" size="lg" disabled={respond.isPending} onPress={() => onRespond(true)} style={styles.flex} />
          </View>
        </View>
      )}

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
  return (
    <View style={styles.metaRow}>
      <AppText variant="label1Bold">{label}</AppText>
      <AppText variant="label1" color={colors.textTertiary}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center' },
  flex: { flex: 1 },
  card: { borderRadius: radius.lg, backgroundColor: colors.backgroundWarm, padding: 16, gap: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.md, backgroundColor: colors.surfaceStrong },
  sectionGap: { marginTop: 8 },
  meta: { gap: 4, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 4 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 24 },
  doneTitles: { gap: 4 },
  doneBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.md, backgroundColor: '#CDE9FF' },
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
});
