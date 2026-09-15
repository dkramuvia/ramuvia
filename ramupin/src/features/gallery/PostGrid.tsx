import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { colors } from '@/theme';
import type { GalleryPost } from '@/types/models';

interface PostGridProps {
  posts: GalleryPost[];
  header?: ReactNode;
  /** 썸네일 왼쪽 아래에 올린 사람 표시 (그룹 모아보기) */
  showAuthor?: boolean;
  /** 게시물을 눌렀을 때 전체화면으로 넘길 범위 */
  scope: string;
  emptyText?: string;
}

const COLUMNS = 3;
const GAP = 2;

/** 피그마: 그룹 게시물 모아보기 (283:20215) / 사용자 게시물 (119:42163) — 3열, 세로형 썸네일 */
export function PostGrid({ posts, header, showAuthor, scope, emptyText }: PostGridProps) {
  const { width } = useWindowDimensions();
  const size = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <FlatList
      data={posts}
      numColumns={COLUMNS}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <>
          {header}
          <View style={styles.tabRow}>
            <View style={styles.gridTab}>
              <Ionicons name="grid-outline" size={20} color={colors.textStrong} />
            </View>
          </View>
        </>
      }
      ListEmptyComponent={
        emptyText ? (
          <AppText variant="label1" color={colors.textMuted} align="center" style={styles.empty}>
            {emptyText}
          </AppText>
        ) : null
      }
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="imagebutton"
          onPress={() => router.push({ pathname: '/gallery/post/[postId]', params: { postId: item.id, scope } })}
          style={{ width: size, height: size * 1.33 }}
        >
          <Image source={{ uri: item.media[0]?.uri }} style={StyleSheet.absoluteFill} />
          {showAuthor ? (
            <View style={styles.author}>
              <Avatar name={item.author.nickname} imageUrl={item.author.avatarUrl} size={22} />
            </View>
          ) : null}
          {item.media.some((m) => m.type === 'video') ? (
            <Ionicons name="play" size={18} color={colors.white} style={styles.video} />
          ) : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 120 },
  row: { gap: GAP, marginBottom: GAP },
  tabRow: { paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.surfaceStrong, marginBottom: 4 },
  gridTab: { width: 52, height: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: colors.surfaceStrong },
  author: { position: 'absolute', left: 10, bottom: 10 },
  video: { position: 'absolute', right: 8, top: 8 },
  empty: { paddingVertical: 48 },
});
