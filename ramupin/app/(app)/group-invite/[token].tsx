import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { groupsApi } from '@/api/endpoints/groups';
import { AppText, Avatar, Button, QueryState, Screen } from '@/components/ui';
import { makeStyles, radius, useColors } from '@/theme';
import { formatRelativeTime } from '@/utils/time';
import { showToast } from '@/utils/toast';

/**
 * 그룹방 초대 (피그마 친구 요청 플로우 738, 2026-10-08).
 *
 * 채팅방의 '초대 링크'로 받은 주소를 열면 여기로 옵니다 (`ramupin://group-invite/<토큰>`,
 * 웹 주소는 서버의 `/g/<토큰>` 페이지가 이 주소로 넘겨 줍니다).
 * 수락하면 그 그룹 채팅방으로 갑니다.
 */
export default function GroupInviteScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const queryClient = useQueryClient();

  const { data: invite, isLoading, isError, refetch } = useQuery({
    queryKey: ['group-invite', token],
    queryFn: () => groupsApi.invitePreview(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => groupsApi.acceptInvite(token),
    onSuccess: ({ groupId }) => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      void queryClient.invalidateQueries({ queryKey: ['chat'] });
      router.replace(`/chat/${groupId}`);
    },
    onError: () => showToast(t('groupInvite.failed')),
  });

  const goToRoom = () => invite && router.replace(`/chat/${invite.group.id}`);

  return (
    <Screen title={t('groupInvite.title')} tab="map" background={colors.surface} contentStyle={styles.content}>
      {isLoading ? (
        <QueryState loading />
      ) : isError || !invite ? (
        // 만료·작성자가 나감·잘못된 주소 — 이유를 구분하지 않고 한 문장으로
        <View style={styles.card}>
          <AppText variant="title4">{t('groupInvite.invalidTitle')}</AppText>
          <AppText variant="body2" color={colors.textSecondary}>
            {t('groupInvite.invalidMessage')}
          </AppText>
          <Button label={t('common.confirm')} variant="neutral" size="lg" onPress={() => router.back()} />
          {isError ? null : <Button label={t('common.retry')} variant="dark" size="lg" onPress={() => void refetch()} />}
        </View>
      ) : (
        <View style={styles.card}>
          <AppText variant="label1" color={colors.textSecondary}>
            {t('groupInvite.label')}
          </AppText>
          <View style={styles.group}>
            <Avatar name={invite.group.name} size={40} />
            <View style={styles.flex}>
              <AppText variant="listTitle" numberOfLines={1}>
                {invite.group.name}
              </AppText>
              <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
                {invite.group.memberNames.join(', ')}
                {invite.group.memberCount > invite.group.memberNames.length ? ` ${t('groupInvite.andMore', { count: invite.group.memberCount - invite.group.memberNames.length })}` : ''}
              </AppText>
            </View>
          </View>

          <View style={styles.meta}>
            <View style={styles.metaRow}>
              <AppText variant="label1Bold">{t('groupInvite.invitedBy')}</AppText>
              <AppText variant="label1" color={colors.textTertiary}>
                {invite.inviter.nickname}
              </AppText>
            </View>
            <View style={styles.metaRow}>
              <AppText variant="label1Bold">{t('friendRequestDetail.requestedAt')}</AppText>
              <AppText variant="label1" color={colors.textTertiary}>
                {formatRelativeTime(invite.createdAt)}
              </AppText>
            </View>
          </View>

          {invite.alreadyMember ? (
            <Button label={t('groupInvite.enter')} variant="dark" size="lg" onPress={goToRoom} style={styles.single} />
          ) : (
            <View style={styles.buttons}>
              <Button label={t('friendRequestDetail.reject')} variant="neutral" size="lg" disabled={accept.isPending} onPress={() => router.back()} style={styles.flex} />
              <Button label={t('groupInvite.accept')} variant="dark" size="lg" disabled={accept.isPending} onPress={() => accept.mutate()} style={styles.flex} />
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { flexGrow: 1, justifyContent: 'center' },
  flex: { flex: 1 },
  card: { borderRadius: radius.lg, backgroundColor: colors.backgroundWarm, padding: 16, gap: 12 },
  group: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.md, backgroundColor: colors.surfaceStrong },
  meta: { gap: 4, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 4 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 24 },
  single: { marginTop: 24 },
}));
