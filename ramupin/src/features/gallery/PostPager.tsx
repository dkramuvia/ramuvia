import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Share, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { galleryApi } from '@/api/endpoints/gallery';
import { AppText, Avatar } from '@/components/ui';
import { layout, makeStyles, useColors } from '@/theme';
import type { GalleryPost } from '@/types/models';
import { formatDateTime } from '@/utils/time';
import { showToast } from '@/utils/toast';

import { MediaView } from './MediaView';
import { PostMenu } from './PostMenu';

interface PostPagerProps {
  posts: GalleryPost[];
  initialIndex?: number;
  /** 제목 아래 그룹명 줄 (갤러리 탭에서는 그룹 선택 버튼) */
  subtitle?: (post: GalleryPost) => ReactNode;
  /** 하단 여백 (탭바·바텀시트 높이) */
  bottomInset?: number;
  /** 더보기에서 지웠거나 신고하며 차단했을 때 (게시물 보기 화면은 뒤로 갑니다) */
  onRemoved?: (blocked?: boolean) => void;
}

/**
 * 피그마: 게시물 전체화면 (283:19892)
 * 기획: 옆으로 넘기면 다음 게시물, 올린 사람 프로필 → 그 사람 게시물 모아보기, 우측 상단 URL 공유
 */
export function PostPager({ posts, initialIndex = 0, subtitle, bottomInset = 0, onRemoved }: PostPagerProps) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const [menuPost, setMenuPost] = useState<GalleryPost | null>(null);

  return (
    <>
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
          <PostPage
            post={item}
            width={width}
            active={i === index}
            subtitle={subtitle?.(item)}
            bottomInset={bottomInset}
            onMore={() => setMenuPost(item)}
          />
        )}
      />
      <PostMenu post={menuPost} onClose={() => setMenuPost(null)} onRemoved={onRemoved} />
    </>
  );
}

function PostPage({
  post,
  width,
  active,
  subtitle,
  bottomInset,
  onMore,
}: {
  post: GalleryPost;
  width: number;
  active: boolean;
  subtitle?: ReactNode;
  bottomInset: number;
  onMore: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const title = post.place?.areaName ?? post.place?.placeName ?? post.groupName;

  /**
   * 공유 링크를 받아 OS 공유 시트로 보냅니다.
   *
   * 주소는 서버가 발급합니다 (7일). 예전처럼 게시물 id 로 주소를 만들면,
   * 그룹에서 나간 뒤에도 남이 계속 볼 수 있습니다.
   */
  const shareLink = async (postId: string) => {
    try {
      await Share.share({ message: await galleryApi.shareUrl(postId) });
    } catch (error) {
      console.warn('[gallery] 공유 링크 발급 실패', String(error));
      showToast(t('common.loadFailed'));
    }
  };

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
      ) : post.media[0] ? (
        // 누르면 이 게시물의 사진을 모두 크게 봅니다 (여러 장이면 좌우로, 타일로) — 대표 리포트 12 ②·24·43.
        // 게시물 넘기기와 같은 방향이라 여기서 바로 사진을 넘기면 다음 게시물로 못 갑니다
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={t('gallery.viewAll')}
          onPress={() => router.push({ pathname: '/gallery/media/[postId]', params: { postId: post.id } })}
          style={styles.fill}
        >
          <MediaView media={post.media[0]} active={active} />
        </Pressable>
      ) : null}
      <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']} style={styles.topShade} pointerEvents="none" />

      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        <View style={styles.titleBlock}>
          <AppText variant="display" color={colors.white} numberOfLines={1} style={styles.shadow}>
            {post.emergencyNotice ? t('gallery.emergency') : title}
          </AppText>
          {subtitle}
          {/* 올린 시각 (대표 리포트 43) */}
          <AppText variant="label1" color={colors.white} style={styles.shadow}>
            {formatDateTime(post.createdAt)}
          </AppText>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => void shareLink(post.id)} style={styles.action}>
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
          {/* 더보기: 저장 / 삭제(내 게시물) / 신고(남의 게시물). 예전에는 눌러도 반응이 없었습니다 (대표 리포트 43) */}
          {!post.emergencyNotice ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('report.photoMenu')} onPress={onMore} hitSlop={10} style={styles.action}>
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.white} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {post.media.length > 1 ? (
        // '+2' 만으로는 여러 장인지 몰랐습니다. 장수와 타일 아이콘을 같이, 누르면 크게 보기
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/gallery/media/[postId]', params: { postId: post.id, tiles: '1' } })}
          style={[styles.count, { bottom: bottomInset + 16 }]}
          hitSlop={8}
        >
          <Ionicons name="copy-outline" size={14} color={colors.white} />
          <AppText variant="microBold" color={colors.white}>
            1/{post.media.length}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.black },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 260 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', paddingHorizontal: layout.screenPadding, gap: 12 },
  titleBlock: { flex: 1, gap: 8 },
  actions: { alignItems: 'center', gap: 16, paddingTop: 8, maxWidth: 72 },
  action: { alignItems: 'center', gap: 4 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  emergency: { flex: 1, backgroundColor: '#D93025', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  count: {
    position: 'absolute',
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
}));
