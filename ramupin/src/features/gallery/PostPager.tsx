import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { galleryApi } from '@/api/endpoints/gallery';
import { AppText, Avatar } from '@/components/ui';
import { colors, layout } from '@/theme';
import type { GalleryPost } from '@/types/models';

interface PostPagerProps {
  posts: GalleryPost[];
  initialIndex?: number;
  /** 제목 아래 그룹명 줄 (갤러리 탭에서는 그룹 선택 버튼) */
  subtitle?: (post: GalleryPost) => ReactNode;
  /** 하단 여백 (탭바·바텀시트 높이) */
  bottomInset?: number;
}

/**
 * 피그마: 게시물 전체화면 (283:19892)
 * 기획: 옆으로 넘기면 다음 게시물, 올린 사람 프로필 → 그 사람 게시물 모아보기, 우측 상단 URL 공유
 */
export function PostPager({ posts, initialIndex = 0, subtitle, bottomInset = 0 }: PostPagerProps) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);

  return (
    <FlatList
      data={posts}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={initialIndex}
      getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      keyExtractor={(p) => p.id}
      onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      renderItem={({ item, index: i }) => (
        <PostPage post={item} width={width} active={i === index} subtitle={subtitle?.(item)} bottomInset={bottomInset} />
      )}
    />
  );
}

function PostPage({
  post,
  width,
  subtitle,
  bottomInset,
}: {
  post: GalleryPost;
  width: number;
  active: boolean;
  subtitle?: ReactNode;
  bottomInset: number;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const title = post.place?.areaName ?? post.place?.placeName ?? post.groupName;

  return (
    <View style={[styles.page, { width }]}>
      {post.emergencyNotice ? (
        // WBS 5.9: 긴급 공지는 사진 자리에 큰 글씨로
        <View style={[styles.emergency, { paddingBottom: bottomInset + 40 }]}>
          <Ionicons name="warning" size={56} color={colors.white} />
          <AppText variant="display" color={colors.white} align="center">
            {post.emergencyNotice.title}
          </AppText>
          <AppText variant="title3" color={colors.white} align="center">
            {post.emergencyNotice.message}
          </AppText>
        </View>
      ) : (
        <Image source={{ uri: post.media[0]?.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']} style={styles.topShade} pointerEvents="none" />

      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        <View style={styles.titleBlock}>
          <AppText variant="display" color={colors.white} numberOfLines={1} style={styles.shadow}>
            {post.emergencyNotice ? t('gallery.emergency') : title}
          </AppText>
          {subtitle}
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => Share.share({ message: galleryApi.shareUrl(post.id) })} style={styles.action}>
            <Ionicons name="link" size={24} color={colors.white} />
            <AppText variant="caption" color={colors.white} style={styles.shadow}>
              {t('gallery.urlShare')}
            </AppText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push(`/gallery/user/${post.author.id}`)} style={styles.action}>
            <Avatar name={post.author.nickname} imageUrl={post.author.avatarUrl} size={24} online={post.author.isOnline} />
            <AppText variant="caption" color={colors.white} numberOfLines={1} style={styles.shadow}>
              {post.author.nickname}
            </AppText>
          </Pressable>
        </View>
      </View>
      {post.media.length > 1 ? (
        <View style={[styles.count, { bottom: bottomInset + 16 }]}>
          <AppText variant="microBold" color={colors.white}>
            +{post.media.length - 1}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.black },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 260 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', paddingHorizontal: layout.screenPadding, gap: 12 },
  titleBlock: { flex: 1, gap: 8 },
  actions: { alignItems: 'center', gap: 16, paddingTop: 8, maxWidth: 72 },
  action: { alignItems: 'center', gap: 4 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  emergency: { flex: 1, backgroundColor: '#D93025', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  count: { position: 'absolute', left: 20, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
});
