import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button, Popup, Screen, SearchField } from '@/components/ui';
import { FriendRow } from '@/features/friends/FriendRow';
import { useFriends } from '@/features/friends/queries';
import { usePlan } from '@/features/policy/usePlan';
import { ScheduleEditor } from '@/features/settings/ScheduleEditor';
import { useRemoveScheduledMessage, useSaveScheduledMessage, useScheduledMessages } from '@/features/settings/queries';
import { colors, radius } from '@/theme';
import type { ScheduledMessage } from '@/types/models';
import { showToast } from '@/utils/toast';

type Draft = Omit<ScheduledMessage, 'id'> & { id?: string };

/**
 * 피그마: 예약 메시지 설정 (283:29456 / 친구 선택 283:29827 / 추가 팝업 283:29640)
 * 기획: 목록의 칸을 누르면 메시지 내용이 펼쳐짐, 메시지 추가 → 친구 선택 → 제목·내용·날짜·시간 설정
 * TODO(6단계): 예약 시각에 서버가 푸시 발송 + 받는 기기에서 TTS 재생
 */
export default function ScheduledMessagesScreen() {
  const { t } = useTranslation();
  const { data: messages = [] } = useScheduledMessages();
  const { data: friends = [] } = useFriends();
  const save = useSaveScheduledMessage();
  const remove = useRemoveScheduledMessage();
  const { limit } = usePlan();

  const [picking, setPicking] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<ScheduledMessage | null>(null);

  const targets = friends.filter((f) => messages.some((m) => m.targetUserId === f.id));
  const picked = friends.find((f) => f.id === pickedId);

  const startNew = (targetUserId: string) => {
    const at = new Date(Date.now() + 60 * 60_000);
    at.setMinutes(0, 0, 0);
    setDraft({ targetUserId, title: '', body: '', scheduledAt: at.toISOString(), tts: true });
  };

  const onPickConfirm = () => {
    if (!pickedId) return;
    const recipientLimit = limit('scheduledMessageRecipientLimit');
    const isNewTarget = !targets.some((f) => f.id === pickedId);
    if (isNewTarget && recipientLimit && targets.length >= recipientLimit) {
      showToast(t('scheduled.limit', { limit: recipientLimit }));
      return;
    }
    setPicking(false);
    setExpandedId(pickedId);
    startNew(pickedId);
  };

  if (picking) {
    return (
      <Screen title={t('screens.scheduledMessages')} tab="map" contentStyle={styles.content}>
        <Button
          label={picked ? t('scheduled.registerFor', { name: picked.nickname }) : t('scheduled.pickFriend')}
          variant="primaryLight"
          shape="rounded"
          disabled={!picked}
          onPress={onPickConfirm}
        />
        <SearchField placeholder={t('groups.searchFriend')} value={query} onChangeText={setQuery} />
        <View style={styles.list}>
          <AppText variant="label1" color={colors.textTertiary}>
            {t('groups.friendName')}
          </AppText>
          {friends
            .filter((f) => f.nickname.toLowerCase().includes(query.trim().toLowerCase()))
            .map((f) => (
              <FriendRow key={f.id} friend={f} selected={f.id === pickedId} onPress={() => setPickedId(f.id)} />
            ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={t('screens.scheduledMessages')} tab="map" contentStyle={styles.content}>
      <Button label={t('scheduled.add')} onPress={() => setPicking(true)} style={styles.addButton} />

      {targets.length === 0 ? (
        <AppText variant="label1" color={colors.textMuted} align="center">
          {t('scheduled.empty')}
        </AppText>
      ) : null}

      {targets.map((friend) => {
        const list = messages.filter((m) => m.targetUserId === friend.id).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
        const expanded = expandedId === friend.id;
        return (
          <View key={friend.id} style={styles.group}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedId(expanded ? null : friend.id)} style={styles.groupHeader}>
              <Avatar name={friend.nickname} imageUrl={friend.avatarUrl} online={friend.isOnline} />
              <AppText variant="listTitle" style={styles.flex}>
                {friend.nickname}
              </AppText>
              <AppText variant="label1Bold" color={colors.primary}>
                {t('scheduled.count', { count: list.length })}
              </AppText>
            </Pressable>
            {expanded ? (
              <View style={styles.groupBody}>
                <View style={styles.bodyHeader}>
                  <AppText variant="body1Bold" style={styles.flex}>
                    {t('scheduled.content')}
                  </AppText>
                  <Pressable accessibilityRole="button" onPress={() => startNew(friend.id)} hitSlop={8}>
                    <Ionicons name="add-circle" size={24} color={colors.primary} />
                  </Pressable>
                </View>
                {list.map((m) => {
                  const at = new Date(m.scheduledAt);
                  return (
                    <View key={m.id} style={styles.message}>
                      <View style={styles.messageTitle}>
                        <AppText variant="body2Bold" style={styles.flex}>
                          {m.title}
                        </AppText>
                        <Pressable accessibilityRole="button" accessibilityLabel={t('common.edit')} onPress={() => setDraft(m)} hitSlop={8}>
                          <Ionicons name="pencil" size={18} color={colors.primaryLight} />
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} onPress={() => setDeleting(m)} hitSlop={8}>
                          <Ionicons name="close-circle-outline" size={20} color={colors.primaryLight} />
                        </Pressable>
                      </View>
                      <View style={styles.messageTime}>
                        <AppText variant="label1" color={colors.textTertiary} style={styles.flex}>
                          {at.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
                        </AppText>
                        <AppText variant="label1" color={colors.textTertiary}>
                          {at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}
                        </AppText>
                        {m.tts ? <Ionicons name="volume-medium" size={16} color={colors.textTertiary} /> : null}
                      </View>
                      <View style={styles.messageBody}>
                        <AppText variant="label1">{m.body}</AppText>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}

      <ScheduleEditor
        visible={!!draft}
        initial={draft}
        onCancel={() => setDraft(null)}
        onSave={(value) => save.mutate(value, { onSuccess: () => setDraft(null) })}
      />
      <Popup
        visible={!!deleting}
        title={t('scheduled.deleteTitle')}
        message={deleting?.title}
        cancelLabel={t('common.cancel')}
        onCancel={() => setDeleting(null)}
        confirmLabel={t('common.delete')}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  flex: { flex: 1 },
  addButton: { marginHorizontal: 5, marginVertical: 12 },
  list: { gap: 12 },
  group: { borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  groupBody: { borderTopWidth: 1, borderTopColor: colors.surfaceStrong, padding: 16, gap: 16 },
  bodyHeader: { flexDirection: 'row', alignItems: 'center' },
  message: { gap: 6 },
  messageTitle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  messageTime: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageBody: { borderRadius: radius.xs, backgroundColor: colors.white, padding: 12, borderWidth: 1, borderColor: colors.surfaceStrong },
});
