import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Avatar, Card, Fab, Header, QueryState, SegmentedTabs } from '@/components/ui';
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
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <AppText variant="label1" color={colors.textMuted} align="center">
          {t('people.emptyRooms')}
        </AppText>
      }
      renderItem={({ item }) => (
        <Card onPress={() => router.push(`/chat/${item.id}`)} style={styles.roomCard}>
          <Avatar name={item.name} />
          <View style={styles.roomTexts}>
            <View style={styles.roomTitleRow}>
              <AppText variant="listTitle" numberOfLines={1} style={styles.flex}>
                {item.name}
              </AppText>
              {/* 1:1 이 아닌 방은 인원을 보여 줘야 같은 이름의 1:1 방과 구분됩니다 (대표 리포트 31) */}
              {!item.archived && (item.isDirect === false || item.memberCount > 2) ? (
                <AppText variant="caption" color={colors.textTertiary}>
                  {t('people.roomMembers', { count: item.memberCount })}
                </AppText>
              ) : null}
            </View>
            <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
              {item.archived ? `${t('people.archived')} · ` : ''}
              {item.lastMessage} · {formatRelativeTime(item.updatedAt)}
            </AppText>
          </View>
          {item.unreadCount ? (
            <View style={styles.unread} accessibilityLabel={t('people.unread', { count: item.unreadCount })}>
              <AppText variant="microBold" color={colors.white}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </AppText>
            </View>
          ) : null}
        </Card>
      )}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: layout.screenPadding, paddingTop: 20 },
  list: { paddingHorizontal: layout.screenPadding, paddingTop: 20, paddingBottom: 96, gap: 12 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  caption: { marginBottom: 8 },
  loading: { marginTop: 40 },
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, paddingRight: 16 },
  roomTexts: { flex: 1 },
  roomTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unread: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
}));
