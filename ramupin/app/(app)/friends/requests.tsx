import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button, Screen, UnderlineTabs } from '@/components/ui';
import { useCancelFriendRequest, useFriendRequests, useRespondFriendRequest } from '@/features/friends/queries';
import { colors, radius } from '@/theme';
import type { FriendRequest } from '@/types/models';
import { formatRelativeTime } from '@/utils/time';

type Tab = 'received' | 'sent';

/** 피그마: 친구 요청 - 받은 요청 (283:22783) / 보낸 요청 (283:22897) */
export default function FriendRequestsScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('received');
  const { data, isLoading } = useFriendRequests();
  const respond = useRespondFriendRequest();
  const cancel = useCancelFriendRequest();

  // 처리한 요청은 서버 응답을 기다리지 않고 목록에서 바로 뺍니다 (목업 단계)
  const [handledIds, setHandledIds] = useState<string[]>([]);
  const received = (data?.received ?? []).filter((r) => !handledIds.includes(r.id));
  const sent = (data?.sent ?? []).filter((r) => !handledIds.includes(r.id));
  const list = tab === 'received' ? received : sent;

  const handle = (id: string, action: () => void) => {
    setHandledIds((ids) => [...ids, id]);
    action();
  };

  return (
    <Screen title={t('screens.friendRequests')} tab="people" contentStyle={styles.content}>
      <View style={styles.tabs}>
        <UnderlineTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'received', label: t('friendRequests.received'), count: received.length },
            { value: 'sent', label: t('friendRequests.sent'), count: sent.length },
          ]}
        />
      </View>

      <View style={styles.body}>
        <AppText variant="title3">{t(`friendRequests.${tab}`)}</AppText>

        {isLoading ? <ActivityIndicator color={colors.brown} /> : null}
        {!isLoading && list.length === 0 ? (
          <AppText variant="label1" color={colors.textMuted}>
            {t(tab === 'received' ? 'friendRequests.emptyReceived' : 'friendRequests.emptySent')}
          </AppText>
        ) : null}

        {list.map((request) =>
          tab === 'received' ? (
            <RequestCard
              key={request.id}
              request={request}
              person={request.from}
              onPress={() => router.push(`/friends/request/${request.id}`)}
              actions={
                <>
                  <Button
                    label={t('friendRequests.accept')}
                    variant="primaryLight"
                    size="sm"
                    rightIcon={<Ionicons name="checkmark" size={20} color={colors.textOnDark} />}
                    onPress={() => handle(request.id, () => respond.mutate({ requestId: request.id, accept: true }))}
                    style={styles.actionButton}
                  />
                  <Button
                    label={t('friendRequests.reject')}
                    variant="white"
                    size="sm"
                    onPress={() => handle(request.id, () => respond.mutate({ requestId: request.id, accept: false }))}
                    style={styles.actionButton}
                  />
                </>
              }
            />
          ) : (
            <RequestCard
              key={request.id}
              request={request}
              person={request.to}
              subtitle={t('friendRequests.sentMessage')}
              actions={
                <>
                  <Button label={t('friendRequests.pending')} variant="neutral" size="sm" disabled style={styles.actionButton} />
                  <Button
                    label={t('friendRequests.cancel')}
                    variant="white"
                    size="sm"
                    onPress={() => handle(request.id, () => cancel.mutate(request.id))}
                    style={styles.actionButton}
                  />
                </>
              }
            />
          ),
        )}

        <Button
          label={t('friendRequests.requestFriend')}
          size="lg"
          leftIcon={<Ionicons name="person-add-outline" size={22} color={colors.white} />}
          onPress={() => router.push('/friends/add')}
        />
      </View>
    </Screen>
  );
}

interface RequestCardProps {
  request: FriendRequest;
  person: FriendRequest['from'];
  subtitle?: string;
  actions: ReactNode;
  onPress?: () => void;
}

function RequestCard({ request, person, subtitle, actions, onPress }: RequestCardProps) {
  return (
    <View style={styles.card}>
      <Pressable style={styles.person} onPress={onPress} disabled={!onPress}>
        <Avatar name={person.nickname} imageUrl={person.avatarUrl} />
        <View style={styles.personTexts}>
          <AppText variant="listTitle" numberOfLines={1}>
            {person.nickname}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" color={colors.textTertiary}>
              {subtitle}
            </AppText>
          ) : null}
          <AppText variant="caption" color={colors.textTertiary}>
            {formatRelativeTime(request.createdAt)}
          </AppText>
        </View>
      </Pressable>
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 0, paddingTop: 0 },
  tabs: { paddingTop: 4 },
  body: { paddingHorizontal: 20, paddingTop: 24, gap: 16 },
  card: {
    minHeight: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  personTexts: { flex: 1, gap: 2 },
  actions: { width: 119, gap: 8 },
  actionButton: { height: 36 },
});
