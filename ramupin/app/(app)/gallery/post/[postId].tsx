import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { PostPager } from '@/features/gallery/PostPager';
import { useGalleryFeed, useUserPosts } from '@/features/gallery/queries';
import { colors } from '@/theme';

/** 게시물 전체화면 보기. scope = "group:<id>" 또는 "user:<id>" 안에서 좌우로 넘깁니다 */
export default function GalleryPostScreen() {
  const { postId, scope = '' } = useLocalSearchParams<{ postId: string; scope?: string }>();
  const insets = useSafeAreaInsets();
  const [kind, scopeId] = scope.split(':');

  const groupFeed = useGalleryFeed(kind === 'group' ? scopeId : undefined);
  const userFeed = useUserPosts(kind === 'user' ? scopeId : '');
  const { data: posts = [], isLoading } = kind === 'user' ? userFeed : groupFeed;
  const index = Math.max(0, posts.findIndex((p) => p.id === postId));

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {isLoading ? (
        <ActivityIndicator style={styles.center} color={colors.white} />
      ) : (
        <PostPager
          posts={posts}
          initialIndex={index}
          subtitle={(post) => (
            <AppText variant="body1Bold" color={colors.white}>
              {post.groupName}
            </AppText>
          )}
        />
      )}
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={[styles.back, { top: insets.top + 80 }]} hitSlop={8}>
        <Ionicons name="chevron-back" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  center: { flex: 1 },
  back: { position: 'absolute', left: 8 },
});
