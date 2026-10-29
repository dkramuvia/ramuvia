import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, QueryState } from '@/components/ui';
import { PostPager } from '@/features/gallery/PostPager';
import { useGalleryFeed, useUserPosts } from '@/features/gallery/queries';
import { makeStyles, useColors } from '@/theme';

/** 게시물 전체화면 보기. scope = "group:<id>" 또는 "user:<id>" 안에서 좌우로 넘깁니다 */
export default function GalleryPostScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { postId, scope = '' } = useLocalSearchParams<{ postId: string; scope?: string }>();
  const insets = useSafeAreaInsets();
  const [kind, scopeId] = scope.split(':');

  const groupFeed = useGalleryFeed(kind === 'group' ? scopeId : undefined);
  const userFeed = useUserPosts(kind === 'user' ? scopeId : '');
  const { data: posts = [], isLoading, isError, refetch } = kind === 'user' ? userFeed : groupFeed;
  const index = Math.max(0, posts.findIndex((p) => p.id === postId));

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {isLoading || isError ? (
        <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} tone="dark" style={styles.center} />
      ) : (
        <PostPager
          posts={posts}
          initialIndex={index}
          // 더보기(저장·삭제·신고)는 PostPager 안에 있습니다 (갤러리 탭과 같이)
          subtitle={(post) => (
            <AppText variant="body1Bold" color={colors.white}>
              {post.groupName}
            </AppText>
          )}
          // 지운 게시물·차단한 사람의 게시물을 계속 보고 있지 않게 목록으로 돌아갑니다
          onRemoved={() => router.back()}
        />
      )}
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={[styles.back, { top: insets.top + 80 }]} hitSlop={8}>
        <Ionicons name="chevron-back" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.black },
  center: { flex: 1 },
  back: { position: 'absolute', left: 8 },
}));
