import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { MediaView, VideoPlaceholder } from '@/features/gallery/MediaView';
import { findCachedPost } from '@/features/gallery/queries';
import { saveMediaToDevice } from '@/features/gallery/saveMedia';
import { layout, makeStyles, useColors } from '@/theme';
import { formatDateTime } from '@/utils/time';
import { showToast } from '@/utils/toast';

const COLUMNS = 3;
const GAP = 2;

/**
 * 게시물 사진 크게 보기 (대표 리포트 12 ②·24·43).
 * 여러 장이면 좌우로 넘기고 위에 '1/N', 오른쪽 위 타일 버튼으로 모아 보기 ↔ 한 장씩 보기를 바꿉니다.
 * 게시물은 이미 받아 둔 목록에서 찾습니다 (그룹·사람 목록을 지나서만 들어옵니다)
 */
export default function GalleryMediaScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { postId, tiles: startInTiles } = useLocalSearchParams<{ postId: string; tiles?: string }>();
  const queryClient = useQueryClient();
  const [post] = useState(() => findCachedPost(queryClient, postId));
  const media = post?.media ?? [];
  const [index, setIndex] = useState(0);
  const [tiles, setTiles] = useState(startInTiles === '1' && media.length > 1);
  const [saving, setSaving] = useState(false);
  const pager = useRef<FlatList>(null);
  const size = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  const saveCurrent = async () => {
    const item = media[index];
    if (!item) return;
    setSaving(true);
    try {
      const ok = await saveMediaToDevice([item]);
      showToast(ok ? t('gallery.saved') : t('gallery.saveDenied'));
    } catch (error) {
      console.warn('[gallery] 저장 실패', String(error));
      showToast(t('gallery.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openAt = (i: number) => {
    setIndex(i);
    setTiles(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {tiles ? (
        <FlatList
          data={media}
          numColumns={COLUMNS}
          keyExtractor={(m, i) => `${m.uri}-${i}`}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={{ paddingTop: insets.top + layout.headerHeight, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item, index: i }) => (
            <Pressable accessibilityRole="imagebutton" onPress={() => openAt(i)} style={{ width: size, height: size }}>
              {item.type === 'video' ? <VideoPlaceholder /> : <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} />}
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          ref={pager}
          data={media}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(m, i) => `${m.uri}-${i}`}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: i }) => (
            <View style={{ width }}>
              <MediaView media={item} active={i === index} fit="contain" controls />
            </View>
          )}
        />
      )}

      <View style={[styles.top, { paddingTop: insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => router.back()} hitSlop={8} style={styles.side}>
          <Ionicons name="close" size={26} color={colors.white} />
        </Pressable>
        <View style={styles.titleBlock}>
          {media.length > 1 && !tiles ? (
            <AppText variant="body1Bold" color={colors.white}>
              {index + 1}/{media.length}
            </AppText>
          ) : null}
          {post ? (
            <AppText variant="caption" color={colors.white} numberOfLines={1}>
              {post.author.nickname} · {formatDateTime(post.createdAt)}
            </AppText>
          ) : null}
        </View>
        <View style={styles.actions}>
          {!tiles && media.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.save')}
              disabled={saving}
              onPress={() => void saveCurrent()}
              hitSlop={8}
              style={styles.side}
            >
              <Ionicons name="download-outline" size={24} color={colors.white} />
            </Pressable>
          ) : null}
          {media.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('gallery.tileView')}
              accessibilityState={{ selected: tiles }}
              onPress={() => setTiles((v) => !v)}
              hitSlop={8}
              style={styles.side}
            >
              <Ionicons name={tiles ? 'square-outline' : 'grid-outline'} size={22} color={colors.white} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!post ? (
        <View style={styles.missing}>
          <AppText variant="body1" color={colors.textMuted}>
            {t('common.loadFailed')}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.black },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  side: { width: 48, height: layout.headerHeight, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { flex: 1, alignItems: 'center', gap: 2 },
  actions: { flexDirection: 'row', minWidth: 48, justifyContent: 'flex-end' },
  gridRow: { gap: GAP, marginBottom: GAP },
  missing: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
}));
