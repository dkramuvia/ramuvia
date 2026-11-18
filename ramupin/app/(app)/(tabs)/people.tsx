import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Fab, Header, QueryState, SegmentedTabs } from '@/components/ui';
import { useChatRooms } from '@/features/chat/queries';
import { FriendRow } from '@/features/friends/FriendRow';
import { useFriends } from '@/features/friends/queries';
import { useDirectRoom } from '@/features/groups/queries';
import { layout, makeStyles, useColors } from '@/theme';
import { formatRelativeTime } from '@/utils/time';

type Segment = 'friends' | 'messages';

/** 피그마: 사람들 (283:38418) */
export default function PeopleScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const [segment, setSegment] = useState<Segment>('friends');

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Header
        title={t('screens.people')}
        showBack={false}
        // 친구 추가는 사람들 화면에서 (대표 리포트 16·25)
        right={
          <Pressable accessibilityRole="button" accessibilityLabel={t('people.addFriend')} hitSlop={8} onPress={() => router.push('/friends/add')}>
            <Ionicons name="person-add-outline" size={24} color={colors.text} />
          </Pressable>
        }
      />
      <View style={styles.top}>
        <SegmentedTabs
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'friends', label: t('people.tabFriends') },
            { value: 'messages', label: t('people.tabMessages') },
          ]}
        />
      </View>
      {segment === 'friends' ? <FriendsList /> : <ChatRoomList />}
      <Fab
        accessibilityLabel={t('people.newGroup')}
        onPress={() => router.push('/groups/create')}
        icon={<Ionicons name="chatbox-ellipses" size={26} color={colors.textOnDark} />}
      />
    </SafeAreaView>
  );
}

function FriendsList() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { data: friends = [], isLoading, isError, refetch } = useFriends();
  const directRoom = useDirectRoom();
  const activeCount = friends.filter((f) => f.isOnline).length;

  if (isLoading || isError) return <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} />;

  return (
    <FlatList
      data={friends}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <AppText variant="label1" color={colors.textMuted} style={styles.caption}>
          {t('people.activeCount', { count: activeCount })}
        </AppText>
      }
      // 10-30 대표님 확정 (리포트 81): 친구를 누르면 지도에서 그 친구 위치. 공유 설정은 톱니, 말풍선은 1:1 대화
      renderItem={({ item }) => (
        <FriendRow
          friend={item}
          onPress={() => router.navigate({ pathname: '/map', params: { focus: item.id } })}
          action={
            <View style={styles.rowActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('people.shareSettings')}
                hitSlop={8}
                onPress={() => router.push(`/settings/share/${item.id}?from=people`)}
              >
                <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('people.openChat')}
                hitSlop={8}
                disabled={directRoom.isPending}
                onPress={() => directRoom.mutate(item.id, { onSuccess: (group) => router.push(`/chat/${group.id}`) })}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
          }
        />
      )}
    />
  );
}

// 피그마에 채팅방 목록 디자인이 없어 친구 리스트 카드 형태로 임시 구성
function ChatRoomList() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { data: allRooms = [], isLoading, isError, refetch } = useChatRooms();
  // 나간 대화는 지금 쓰는 방 아래로 (대표 리포트 40). 방 안에서 지울 수 있습니다
  const rooms = [...allRooms.filter((r) => !r.archived), ...allRooms.filter((r) => r.archived)];

  if (isLoading || isError) return <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} />;

  return (
    <FlatList
      data={rooms}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.roomList}
      ListEmptyComponent={
        <AppText variant="label1" color={colors.textMuted} align="center">
          {t('people.emptyRooms')}
        </AppText>
      }
      // 피그마 v3.1 사람들 › 메시지 (7091:72727): 한 줄 카드에 방 이름 · 안 읽은 수(파랑) · N명참여 · 지난 시간
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/chat/${item.id}`)}
          style={({ pressed }) => [styles.roomCard, pressed && styles.pressed]}
        >
          <AppText variant="body2Bold" numberOfLines={1} style={styles.flex} color={item.archived ? colors.textTertiary : colors.textStrong}>
            {item.archived ? `${t('people.archived')} · ` : ''}
            {item.name}
          </AppText>
          <View style={styles.unreadSlot}>
            {item.unreadCount ? (
              <View style={styles.unread} accessibilityLabel={t('people.unread', { count: item.unreadCount })}>
                <AppText variant="caption" color={colors.white}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="body2Bold" color={colors.textStrong} style={styles.roomMembers}>
            {t('people.roomJoined', { count: item.memberCount })}
          </AppText>
          <AppText variant="body2Bold" color={colors.textStrong} numberOfLines={1} style={styles.roomTime}>
            {formatRelativeTime(item.updatedAt)}
          </AppText>
        </Pressable>
      )}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: layout.screenPadding, paddingTop: 20 },
  list: { paddingHorizontal: layout.screenPadding, paddingTop: 20, paddingBottom: 96, gap: 12 },
  roomList: { paddingHorizontal: layout.screenPadding, paddingTop: 20, paddingBottom: 96, gap: 24 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  caption: { marginBottom: 8 },
  loading: { marginTop: 40 },
  // 피그마: 362×50, 둥글기 14, #EFF0F2
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 50, paddingHorizontal: 8, borderRadius: 14, backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
  unreadSlot: { width: 30 },
  roomMembers: { width: 65 },
  roomTime: { width: 72 },
  unread: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: '#33AAFF', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  flex: { flex: 1 },
}));
