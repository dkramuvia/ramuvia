import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { groupsApi } from '@/api/endpoints/groups';
import { AppText, Header, Popup } from '@/components/ui';
import { ChatInput } from '@/features/chat/ChatInput';
import { MessageItem } from '@/features/chat/MessageItem';
import { retryInput, useChatMessages, useChatRooms, useReadState, useSendMessage } from '@/features/chat/queries';
import { useGroup } from '@/features/groups/queries';
import { describePlace } from '@/features/location/address';
import { ReportSheet, type ReportTarget } from '@/features/safety/ReportSheet';
import { useIsMe } from '@/stores/authStore';
import { makeStyles, useColors } from '@/theme';
import { useKeyboardPadding } from '@/utils/useKeyboardPadding';
import { showToast } from '@/utils/toast';

/** 피그마: 채팅방 1:1 (283:34973) / 그룹 생성 직후 (283:39171) / 위치 공유 (283:35894) */
/** 이만큼 안에 잡힌 위치면 새로 잡지 않고 씁니다 */
const RECENT_LOCATION_MS = 2 * 60 * 1000;

export default function ChatRoomScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const isMe = useIsMe();
  // 상대 메시지를 길게 누르면 신고 (보완 4.11)
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const keyboardPadding = useKeyboardPadding();
  const { data: group } = useGroup(roomId);
  const { data: messages = [] } = useChatMessages(roomId);
  const { data: rooms = [] } = useChatRooms();
  const send = useSendMessage(roomId);
  const { data: readState = [] } = useReadState(roomId);
  /** 보낼 사진과 "위치 포함" 선택 (보완 4.18: 기본은 포함 안 함) */
  const [photoDraft, setPhotoDraft] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [withLocation, setWithLocation] = useState(false);

  // 그룹을 나가면 서버에는 방이 없고 기기에만 대화가 남습니다. 읽기만 가능 (WBS 7.6)
  const room = rooms.find((r) => r.id === roomId);
  const archived = room?.archived ?? false;
  // 나간 방은 서버에서 그룹 정보를 못 받으므로 기기에 저장해 둔 방 이름을 씁니다
  const title = group?.name ?? room?.name;

  const members = useMemo(() => new Map(group?.members.map((m) => [m.id, m])), [group]);
  // 인버티드 리스트: 최신 메시지가 0번
  const reversed = useMemo(() => [...messages].reverse(), [messages]);
  const isGroupRoom = (group?.memberCount ?? 0) > 2;
  // 1:1 읽음 표시: 상대가 이 방을 연 시각보다 먼저 보낸 내 메시지는 읽은 것 (보완 4.18)
  const otherReadAt = !isGroupRoom ? readState[0]?.lastReadAt ?? null : null;

  const pickPhoto = async (source: 'library' | 'camera') => {
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setWithLocation(false);
    setPhotoDraft({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  const sendPhoto = async () => {
    const draft = photoDraft;
    setPhotoDraft(null);
    if (!draft) return;
    let place;
    if (withLocation) {
      const position = await Location.getLastKnownPositionAsync({ maxAge: RECENT_LOCATION_MS }).catch(() => null);
      if (position) place = await describePlace({ latitude: position.coords.latitude, longitude: position.coords.longitude }).catch(() => undefined);
    }
    send.mutate({ type: 'photo', localUri: draft.uri, width: draft.width, height: draft.height, place });
  };

  const shareCurrentLocation = async () => {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) {
      showToast(t('map.locationDenied'));
      return;
    }
    // 실내에서 정확한 위치를 새로 잡으면 5초 넘게 걸립니다. 그동안 아무 표시가 없으면 또 누르게 됩니다 (10-08 폰에서 확인).
    // 2분 안에 잡힌 위치가 있으면 그것을 바로 씁니다
    try {
      const recent = await Location.getLastKnownPositionAsync({ maxAge: RECENT_LOCATION_MS });
      if (!recent) showToast(t('chat.locatingNow'));
      const position = recent ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      const place = await describePlace({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      send.mutate({ type: 'location', place });
    } catch {
      showToast(t('chat.locateFailed'));
    }
  };

  /** 초대 링크 (서버 발급, 7일 · 피그마 605). 받은 사람은 '그룹방 초대' 화면에서 수락합니다 (group-invite) */
  const inviteLink = async () => {
    if (!group) return;
    try {
      const { url } = await groupsApi.inviteLink(group.id);
      await Share.share({ message: t('chat.inviteMessage', { name: group.name, link: url }) });
    } catch {
      showToast(t('groupInvite.linkFailed'));
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <Header
        title={title}
        right={
          archived ? undefined : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('screens.groupSettings')}
              hitSlop={8}
              onPress={() => router.push(`/groups/${roomId}/settings`)}
            >
              <Ionicons name="settings-outline" size={24} color={colors.text} />
            </Pressable>
          )
        }
      />

      {/* 키보드가 올라오면 그만큼 올려서 입력창과 마지막 메시지가 가려지지 않게 */}
      <View style={[styles.flex, { paddingBottom: keyboardPadding }]}>
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
            const isMine = isMe(item.senderId);
            const member = members.get(item.senderId);
            // 날짜가 바뀌는 곳에 구분선 (보완 4.18). 인버티드라 위(더 과거)와 날짜를 비교합니다
            const day = new Date(item.createdAt).toDateString();
            const newDay = !older || new Date(older.createdAt).toDateString() !== day;
            return (
              <View>
                {newDay ? (
                  <View style={styles.dateDivider}>
                    <View style={styles.dateLine} />
                    <AppText variant="caption" color="#8593A8">
                      {new Date(item.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                    </AppText>
                    <View style={styles.dateLine} />
                  </View>
                ) : null}
              <MessageItem
                message={item}
                isMine={isMine}
                sender={member}
                showSender={!sameAsOlder}
                showTime={!sameAsNewer && !isMine}
                onLongPress={
                  !isMine && item.type !== 'system'
                    ? () =>
                        setReporting({
                          userId: item.senderId,
                          nickname: member?.nickname ?? '',
                          kind: 'message',
                          targetId: item.id,
                          preview: item.type === 'text' ? item.text : undefined,
                        })
                    : undefined
                }
                read={isMine && !item.pending && !item.failed && !!otherReadAt && otherReadAt >= item.createdAt}
                onRetry={
                  item.failed
                    ? () => {
                        const input = retryInput(item.id);
                        if (input) send.mutate(input);
                      }
                    : undefined
                }
              />
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />

        {archived ? (
          <View style={styles.archivedNotice}>
            <AppText variant="label2" color={colors.textMuted} align="center">
              {t('chat.archivedNotice')}
            </AppText>
          </View>
        ) : (
          <ChatInput
            onSend={(text) => send.mutate({ type: 'text', text })}
            onSharePlace={() => router.push({ pathname: '/place-picker', params: { mode: 'share', roomId } })}
            onShareCurrentLocation={shareCurrentLocation}
            onPickPhoto={(source) => void pickPhoto(source)}
          />
        )}
      </View>
      {/* 사진 보내기 전에 위치를 함께 보낼지 고릅니다 (기본: 포함 안 함) */}
      <Popup
        visible={!!photoDraft}
        title={t('chat.photoSendTitle')}
        confirmLabel={t('chat.send')}
        onConfirm={() => void sendPhoto()}
        cancelLabel={t('common.cancel')}
        onCancel={() => setPhotoDraft(null)}
        onDismiss={() => setPhotoDraft(null)}
      >
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: withLocation }} onPress={() => setWithLocation(!withLocation)} style={styles.locationToggle}>
          <Ionicons name={withLocation ? 'checkbox' : 'square-outline'} size={22} color={withLocation ? colors.brown : colors.textMuted} />
          <AppText variant="body2">{t('chat.includeLocation')}</AppText>
        </Pressable>
      </Popup>
      <ReportSheet target={reporting} onClose={() => setReporting(null)} onDone={(blocked) => blocked && room?.memberCount === 2 && router.back()} />
    </SafeAreaView>
  );
}

function IntroAction({ icon, label, onPress }: { icon: 'link' | 'person-add-outline' | 'paper-plane-outline'; label: string; onPress: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.introAction}>
      <View style={styles.introIcon}>
        <Ionicons name={icon} size={20} color={colors.textStrong} />
      </View>
      <AppText variant="label2">{label}</AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  archivedNotice: { paddingHorizontal: 20, paddingVertical: 18 },
  container: { flex: 1, backgroundColor: colors.chatBackground },
  flex: { flex: 1 },
  list: { paddingVertical: 16 },
  dateDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  dateLine: { flex: 1, height: 1, backgroundColor: 'rgba(133,147,168,0.25)' },
  locationToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
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
}));
