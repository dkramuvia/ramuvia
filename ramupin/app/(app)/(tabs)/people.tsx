import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { chatApi } from '@/api';
import { AppText, Avatar, Card, Fab, Header, SegmentedTabs } from '@/components/ui';
import { FriendRow } from '@/features/friends/FriendRow';
import { useFriends } from '@/features/friends/queries';
import { colors, layout } from '@/theme';
import { formatRelativeTime } from '@/utils/time';

type Segment = 'friends' | 'messages';

/** 피그마: 사람들 (283:38418) */
export default function PeopleScreen() {
  const { t } = useTranslation();
  const [segment, setSegment] = useState<Segment>('friends');

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Header title={t('screens.people')} showBack={false} />
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
  const { t } = useTranslation();
  const { data: friends = [], isLoading } = useFriends();
  const activeCount = friends.filter((f) => f.isOnline).length;

  if (isLoading) return <ActivityIndicator style={styles.loading} color={colors.brown} />;

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
      // 기획: 친구 아바타 클릭 → 친구별 상세 공유
      renderItem={({ item }) => <FriendRow friend={item} onPress={() => router.push(`/settings/share/${item.id}`)} />}
    />
  );
}

// 피그마에 채팅방 목록 디자인이 없어 친구 리스트 카드 형태로 임시 구성
function ChatRoomList() {
  const { t } = useTranslation();
  const { data: rooms = [], isLoading } = useQuery({ queryKey: ['chat', 'rooms'], queryFn: chatApi.rooms });

  if (isLoading) return <ActivityIndicator style={styles.loading} color={colors.brown} />;

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
              {item.memberCount > 2 ? (
                <AppText variant="caption" color={colors.textTertiary}>
                  {t('people.roomMembers', { count: item.memberCount })}
                </AppText>
              ) : null}
            </View>
            <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
              {item.lastMessage} · {formatRelativeTime(item.updatedAt)}
            </AppText>
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: layout.screenPadding, paddingTop: 20 },
  list: { paddingHorizontal: layout.screenPadding, paddingTop: 20, paddingBottom: 96, gap: 12 },
  caption: { marginBottom: 8 },
  loading: { marginTop: 40 },
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, paddingRight: 16 },
  roomTexts: { flex: 1 },
  roomTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
