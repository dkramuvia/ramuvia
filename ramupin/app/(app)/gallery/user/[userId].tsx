import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Avatar, Fab, Header } from '@/components/ui';
import { useFriends } from '@/features/friends/queries';
import { PostGrid } from '@/features/gallery/PostGrid';
import { useUserPosts } from '@/features/gallery/queries';
import { isMeId, useAuthStore } from '@/stores/authStore';
import { colors, layout } from '@/theme';

/** 피그마: 사용자 게시물 모아보기 (119:42163) */
export default function GalleryUserScreen() {
  const { t } = useTranslation();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const me = useAuthStore((s) => s.user);
  const { data: friends = [] } = useFriends();
  const { data: posts = [] } = useUserPosts(userId);

  const isMe = isMeId(userId, me);
  const person = isMe ? me : (friends.find((f) => f.id === userId) ?? posts[0]?.author);
  // TODO(5단계): 사용자 프로필 API (상태메시지 포함)
  const statusMessage = isMe ? me?.statusMessage : undefined;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <Header />
      <PostGrid
        posts={posts}
        scope={`user:${userId}`}
        emptyText={t('gallery.empty')}
        header={
          <View style={styles.header}>
            <AppText variant="title1" numberOfLines={1}>
              {person?.nickname}
            </AppText>
            <View style={styles.profile}>
              <Avatar name={person?.nickname ?? ''} imageUrl={person?.avatarUrl} size={70} />
              <View style={styles.profileTexts}>
                <AppText variant="body2Bold">{person?.nickname}</AppText>
                <AppText variant="label2">{t('gallery.statusMessage')}</AppText>
                {statusMessage ? (
                  <AppText variant="label2" color={colors.primary}>
                    {statusMessage}
                  </AppText>
                ) : null}
              </View>
            </View>
          </View>
        }
      />
      {isMe ? (
        <Fab
          accessibilityLabel={t('gallery.write')}
          onPress={() => router.push('/gallery/upload')}
          icon={<Ionicons name="pencil" size={26} color={colors.white} />}
          bottom={24}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: layout.screenPadding, gap: 16, paddingBottom: 16 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 32 },
  profileTexts: { flex: 1, gap: 4 },
});
