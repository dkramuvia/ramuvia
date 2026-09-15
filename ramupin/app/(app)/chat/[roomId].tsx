import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Header } from '@/components/ui';
import { ChatInput } from '@/features/chat/ChatInput';
import { MessageItem } from '@/features/chat/MessageItem';
import { useChatMessages, useSendMessage } from '@/features/chat/queries';
import { buildFriendQr } from '@/features/friends/qr';
import { useGroup } from '@/features/groups/queries';
import { describePlace } from '@/features/location/address';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme';
import { showToast } from '@/utils/toast';

const CHAT_BACKGROUND = '#E5F4FF';

/** 피그마: 채팅방 1:1 (283:34973) / 그룹 생성 직후 (283:39171) / 위치 공유 (283:35894) */
export default function ChatRoomScreen() {
  const { t } = useTranslation();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const me = useAuthStore((s) => s.user);
  const { data: group } = useGroup(roomId);
  const { data: messages = [] } = useChatMessages(roomId);
  const send = useSendMessage(roomId);

  const members = useMemo(() => new Map(group?.members.map((m) => [m.id, m])), [group]);
  // 인버티드 리스트: 최신 메시지가 0번
  const reversed = useMemo(() => [...messages].reverse(), [messages]);
  const isGroupRoom = (group?.memberCount ?? 0) > 2;

  const shareCurrentLocation = async () => {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) {
      showToast(t('map.locationDenied'));
      return;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const place = await describePlace({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    send.mutate({ type: 'location', place });
  };

  const inviteLink = () => {
    if (!group) return;
    // TODO(5단계): 서버 발급 그룹 초대 링크
    Share.share({ message: t('chat.inviteMessage', { name: group.name, link: buildFriendQr(`group-${group.id}`) }) });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <Header
        title={group?.name}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('screens.groupSettings')}
            hitSlop={8}
            onPress={() => router.push(`/groups/${roomId}/settings`)}
          >
            <Ionicons name="settings-outline" size={24} color={colors.text} />
          </Pressable>
        }
      />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          inverted
          data={reversed}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            isGroupRoom && group ? (
              <View style={styles.intro}>
                <AppText variant="body1Bold">{group.name}</AppText>
                <AppText variant="body2" color="#8593A8">
                  {new Date(group.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                </AppText>
                <View style={styles.introActions}>
                  <IntroAction icon="link" label={t('chat.inviteLink')} onPress={inviteLink} />
                  <IntroAction
                    icon="person-add-outline"
                    label={t('chat.addPeople')}
                    onPress={() => router.push({ pathname: '/groups/create', params: { groupId: roomId } })}
                  />
                  <IntroAction icon="paper-plane-outline" label={t('chat.share')} onPress={inviteLink} />
                </View>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            // reversed 기준: index-1 이 더 최신(아래), index+1 이 더 과거(위)
            const older = reversed[index + 1];
            const newer = reversed[index - 1];
            const sameAsOlder = older && older.type !== 'system' && older.senderId === item.senderId;
            const sameAsNewer = newer && newer.type !== 'system' && newer.senderId === item.senderId;
            const isMine = item.senderId === me?.id;
            const member = members.get(item.senderId);
            return (
              <MessageItem
                message={item}
                isMine={isMine}
                sender={member}
                showSender={!sameAsOlder}
                showTime={!sameAsNewer && !isMine}
              />
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />

        <ChatInput
          onSend={(text) => send.mutate({ type: 'text', text })}
          onSharePlace={() => router.push({ pathname: '/place-picker', params: { mode: 'share', roomId } })}
          onShareCurrentLocation={shareCurrentLocation}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function IntroAction({ icon, label, onPress }: { icon: 'link' | 'person-add-outline' | 'paper-plane-outline'; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.introAction}>
      <View style={styles.introIcon}>
        <Ionicons name={icon} size={20} color={colors.textStrong} />
      </View>
      <AppText variant="label2">{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHAT_BACKGROUND },
  flex: { flex: 1 },
  list: { paddingVertical: 16 },
  separator: { height: 10 },
  intro: { alignItems: 'center', gap: 8, paddingTop: 48, paddingBottom: 24 },
  introActions: { flexDirection: 'row', gap: 40, marginTop: 20 },
  introAction: { alignItems: 'center', gap: 8 },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
