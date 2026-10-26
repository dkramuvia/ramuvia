import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, QueryState } from '@/components/ui';
import { PostPager } from '@/features/gallery/PostPager';
import { useGalleryFeed, useUserPosts } from '@/features/gallery/queries';
import { ReportSheet, type ReportTarget } from '@/features/safety/ReportSheet';
import { useIsMe } from '@/stores/authStore';
import { makeStyles, useColors } from '@/theme';

/** 게시물 전체화면 보기. scope = "group:<id>" 또는 "user:<id>" 안에서 좌우로 넘깁니다 */
export default function GalleryPostScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { postId, scope = '' } = useLocalSearchParams<{ postId: string; scope?: string }>();
  const insets = useSafeAreaInsets();
  const [kind, scopeId] = scope.split(':');

  const groupFeed = useGalleryFeed(kind === 'group' ? scopeId : undefined);
  const userFeed = useUserPosts(kind === 'user' ? scopeId : '');
  const { data: posts = [], isLoading, isError, refetch } = kind === 'user' ? userFeed : groupFeed;
  const index = Math.max(0, posts.findIndex((p) => p.id === postId));
  const isMe = useIsMe();
  // 남이 올린 사진은 더보기 › 신고 (보완 4.11)
  const [reporting, setReporting] = useState<ReportTarget | null>(null);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {isLoading || isError ? (
        <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} tone="dark" style={styles.center} />
      ) : (
        <PostPager
          posts={posts}
          initialIndex={index}
          subtitle={(post) => (
            <View style={styles.subtitle}>
              <AppText variant="body1Bold" color={colors.white} style={styles.flex}>
                {post.groupName}
              </AppText>
              {!isMe(post.author.id) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('report.photoMenu')}
                  hitSlop={10}
                  onPress={() => setReporting({ userId: post.author.id, nickname: post.author.nickname, kind: 'photo', targetId: post.id })}
                >
                  <Ionicons name="ellipsis-horizontal" size={22} color={colors.white} />
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={[styles.back, { top: insets.top + 80 }]} hitSlop={8}>
        <Ionicons name="chevron-back" size={28} color={colors.white} />
      </Pressable>
      <ReportSheet target={reporting} onClose={() => setReporting(null)} onDone={(blocked) => blocked && router.back()} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.black },
  center: { flex: 1 },
  flex: { flex: 1 },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { position: 'absolute', left: 8 },
}));
