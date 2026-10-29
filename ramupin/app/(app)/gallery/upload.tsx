import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Asset, AssetField, MediaType, Query, requestPermissionsAsync, type AssetMetadata } from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Header } from '@/components/ui';
import { libraryAssetLocation, pickerAssetLocation } from '@/features/gallery/photoLocation';
import { describePlace } from '@/features/location/address';
import { useUploadDraftStore } from '@/stores/uploadDraftStore';
import { layout, makeStyles, useColors } from '@/theme';
import type { LatLng, MediaAsset } from '@/types/models';
import { showToast } from '@/utils/toast';

// TODO(정책): 한 번에 올릴 수 있는 개수·동영상 길이는 등급별 정책값 (WBS 5.6)
const SELECTION_LIMIT = 10;
const VIDEO_MAX_SECONDS = 60;
/** 기기 사진을 한 번에 불러오는 개수 (끝까지 내리면 더) */
const PAGE = 60;

/** 격자 한 칸. 기기 사진(id = 안드로이드 content:// 주소)이거나 방금 찍은 사진 */
interface Tile {
  key: string;
  /** 화면에 보여 줄 주소 */
  uri: string;
  type: 'image' | 'video';
  width: number;
  height: number;
  /** 동영상 길이(초) */
  duration?: number | null;
  /** 기기 사진이면 id. 올릴 때 실제 파일 주소로 바꿉니다 (Asset.getUri) */
  libraryId?: string;
  /** 사진 선택기에서 고른 사진의 찍은 위치 (EXIF) */
  location?: LatLng | null;
}

const fromMetadata = (m: AssetMetadata): Tile => ({
  key: m.id,
  uri: m.id,
  type: m.mediaType === MediaType.VIDEO ? 'video' : 'image',
  width: m.width ?? 0,
  height: m.height ?? 0,
  // 미디어 라이브러리는 동영상 길이를 **밀리초**로 줍니다 (안드로이드·iOS 모두). 초로 보고 비교해서
  // 1초 넘는 동영상이 모두 '60초 넘음' 으로 막혔습니다 (대표 리포트 11)
  duration: m.duration != null ? m.duration / 1000 : null,
  libraryId: m.id,
});

const fromPicker = (a: ImagePicker.ImagePickerAsset): Tile => ({
  key: a.uri,
  uri: a.uri,
  type: a.type === 'video' ? 'video' : 'image',
  width: a.width,
  height: a.height,
  duration: a.duration != null ? a.duration / 1000 : null,
  location: pickerAssetLocation(a),
});

/**
 * 피그마: 새로운 사진 (갤러리 581, 10-08)
 *
 * 기기 사진을 **앱 안 격자**로 보여 줍니다 (대표님 결정 10-08). 위에 고른 사진 미리보기,
 * 아래 '최근' 격자. 처음엔 한 장을 고르고, '선택'을 누르면 여러 장(최대 10)을 고릅니다.
 * 사진 권한을 거절하면 기기 사진 선택기로 대신 고릅니다.
 */
export default function GalleryUploadScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { setMedia, reset, toggleGroup } = useUploadDraftStore();
  /** 갤러리 탭에서 보고 있던 그룹방. 그 방을 미리 골라 둡니다 (대표 리포트 12 ①) */
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();

  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<Tile[]>([]);
  const [preview, setPreview] = useState<Tile | null>(null);
  const [multi, setMulti] = useState(false);
  /** null = 아직 모름, false = 권한 없음 (선택기로 대신) */
  const [canRead, setCanRead] = useState<boolean | null>(null);
  const [preparing, setPreparing] = useState(false);
  const loaded = useRef(0);
  const reachedEnd = useRef(false);
  const loading = useRef(false);

  const loadMore = useCallback(async () => {
    if (loading.current || reachedEnd.current) return;
    loading.current = true;
    try {
      const page = await new Query()
        .within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])
        // '찍은 시각' 이 아니라 '저장된 시각' 순서입니다. 카카오톡·다운로드 사진은 찍은 시각 정보가 없어
        // 맨 뒤로 밀려, 방금 받은 사진을 찾을 수 없었습니다 (10-12 실서버 시험). 카메라 사진은 두 시각이 거의 같습니다
        .orderBy({ key: AssetField.MODIFICATION_TIME, ascending: false })
        .offset(loaded.current)
        .limit(PAGE)
        .exeForMetadata();
      loaded.current += page.length;
      if (page.length < PAGE) reachedEnd.current = true;
      const next = page.map(fromMetadata);
      setTiles((prev) => [...prev, ...next]);
      // 처음 들어오면 가장 최근 사진을 골라 둡니다 (피그마: 위에 크게)
      setPreview((p) => p ?? next[0] ?? null);
      setSelected((s) => (s.length ? s : next[0] ? [next[0]] : []));
    } catch {
      reachedEnd.current = true;
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    reset();
    if (groupId) toggleGroup(groupId);
    requestPermissionsAsync(false, ['photo', 'video'])
      .then((p) => {
        // '일부만 허용'도 읽을 수 있습니다 (허용한 사진만 보입니다)
        const ok = p.granted || p.accessPrivileges === 'limited';
        setCanRead(ok);
        if (ok) void loadMore();
      })
      .catch(() => setCanRead(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 기기 사진 선택기 (앨범별로 찾기). 권한이 없을 때뿐 아니라 언제든 열 수 있습니다 —
   * '최근' 격자에서 오래된 사진·동영상을 찾기 어렵다는 요청 (대표 리포트 30)
   */
  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: SELECTION_LIMIT,
      videoMaxDuration: VIDEO_MAX_SECONDS,
      quality: 0.8,
      // 찍은 위치로 '위치 추가' 를 미리 채우려고 받습니다 (대표 리포트 12 ③)
      exif: true,
    });
    if (result.canceled) return;
    const picked = result.assets.map(fromPicker).filter((tile) => {
      // 선택기는 길이 제한을 안 지키는 기기가 있어 한 번 더 봅니다
      const tooLong = tile.type === 'video' && tile.duration != null && tile.duration > VIDEO_MAX_SECONDS;
      if (tooLong) showToast(t('gallery.videoTooLong', { seconds: VIDEO_MAX_SECONDS }));
      return !tooLong;
    });
    if (picked.length === 0) return;
    setTiles((prev) => [...picked, ...prev.filter((p) => !picked.some((x) => x.key === p.key))]);
    setSelected(picked);
    setPreview(picked[0] ?? null);
  };

  const takePhoto = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const shot = result.assets.map(fromPicker);
    setTiles((prev) => [...shot, ...prev]);
    setSelected((s) => (multi ? [...s, ...shot].slice(0, SELECTION_LIMIT) : shot));
    setPreview(shot[0] ?? null);
  };

  const onTile = (tile: Tile) => {
    if (tile.type === 'video' && tile.duration != null && tile.duration > VIDEO_MAX_SECONDS) {
      showToast(t('gallery.videoTooLong', { seconds: VIDEO_MAX_SECONDS }));
      return;
    }
    setPreview(tile);
    if (!multi) {
      setSelected([tile]);
      return;
    }
    setSelected((s) => {
      if (s.some((x) => x.key === tile.key)) return s.filter((x) => x.key !== tile.key);
      if (s.length >= SELECTION_LIMIT) {
        showToast(t('gallery.selectLimit', { count: SELECTION_LIMIT }));
        return s;
      }
      return [...s, tile];
    });
  };

  /** 다음: 기기 사진은 실제 파일 주소로 바꿔 넘깁니다 (content:// 는 그대로 올릴 수 없어서) */
  const onNext = async () => {
    if (selected.length === 0) return;
    setPreparing(true);
    try {
      const media: MediaAsset[] = await Promise.all(
        selected.map(async (tile) => ({
          uri: tile.libraryId ? await new Asset(tile.libraryId).getUri() : tile.uri,
          width: tile.width,
          height: tile.height,
          type: tile.type,
        })),
      );
      setMedia(media);
      router.push('/gallery/upload-detail');
      void prefillPlace(selected[0]);
    } catch {
      showToast(t('gallery.uploadFailed'));
    } finally {
      setPreparing(false);
    }
  };

  /**
   * 첫 사진의 찍은 위치로 '위치 추가' 를 미리 채웁니다 (대표 리포트 12 ③). 위치가 없으면 그대로 둡니다.
   * 주소 찾기는 몇 초 걸릴 수 있어 다음 화면으로 먼저 넘어가고 뒤에서 채웁니다
   */
  const prefillPlace = async (first: Tile | undefined) => {
    if (!first) return;
    const location = first.libraryId ? await libraryAssetLocation(first.libraryId) : (first.location ?? null);
    if (!location) return;
    const place = await describePlace(location).catch(() => null);
    const draft = useUploadDraftStore.getState();
    // 그사이 사용자가 직접 고른 위치가 있으면 덮어쓰지 않습니다
    if (place && !draft.place && draft.media.length) draft.setPlace(place);
  };

  const tile = (width - 6) / 4;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      {/* 닫기 버튼을 화면 위에 따로 띄웠더니 제목 줄과 겹쳐 안 보였습니다 (대표 리포트 44). 머리줄 왼쪽 X 로 */}
      <Header
        title={t('gallery.newPhoto')}
        showBack
        backIcon="close"
        right={
          <Pressable accessibilityRole="button" disabled={selected.length === 0 || preparing} onPress={onNext} hitSlop={8}>
            <AppText variant="body1Bold" color={selected.length && !preparing ? colors.primary : colors.textMuted}>
              {t('gallery.next')}
            </AppText>
          </Pressable>
        }
      />

      <View style={[styles.preview, { height: width * 0.95 }]}>
        {preview ? (
          <Image source={{ uri: preview.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="images-outline" size={48} color={colors.textMuted} />
        )}
        {preview?.type === 'video' ? <Ionicons name="play-circle" size={56} color={colors.white} /> : null}
      </View>

      <View style={styles.bar}>
        <AppText variant="body1Bold" style={styles.flex}>
          {t('gallery.recent')}
        </AppText>
        {canRead !== false ? (
          <Pressable accessibilityRole="button" onPress={pickFromLibrary} hitSlop={8} style={styles.albumButton}>
            <Ionicons name="albums-outline" size={18} color={colors.primary} />
            <AppText variant="body1Bold" color={colors.primary}>
              {t('gallery.fromAlbum')}
            </AppText>
          </Pressable>
        ) : null}
        {canRead === false ? (
          <Pressable accessibilityRole="button" onPress={pickFromLibrary} hitSlop={8}>
            <AppText variant="body1Bold" color={colors.primary}>
              {t('gallery.select')}
            </AppText>
          </Pressable>
        ) : (
          // 피그마 581 '선택': 여러 장 고르기 켜기/끄기
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: multi }}
            onPress={() => {
              setMulti((m) => !m);
              // 끌 때는 지금 보고 있는 한 장만 남깁니다
              if (multi && preview) setSelected([preview]);
            }}
            hitSlop={8}
          >
            <AppText variant="body1Bold" color={multi ? colors.textStrong : colors.primary}>
              {multi ? t('gallery.selectedCount', { count: selected.length }) : t('gallery.select')}
            </AppText>
          </Pressable>
        )}
      </View>

      {canRead === false && tiles.length === 0 ? (
        <View style={styles.denied}>
          <AppText variant="body2" color={colors.textSecondary} style={styles.deniedText}>
            {t('gallery.libraryDenied')}
          </AppText>
          <Button label={t('gallery.openPicker')} variant="neutral" size="sm" onPress={pickFromLibrary} />
        </View>
      ) : null}

      <FlatList
        data={[null, ...tiles]}
        numColumns={4}
        keyExtractor={(item, i) => item?.key ?? `camera-${i}`}
        columnWrapperStyle={styles.gridRow}
        onEndReachedThreshold={0.6}
        onEndReached={() => canRead && void loadMore()}
        renderItem={({ item }) => {
          if (item === null) {
            return (
              <Pressable accessibilityRole="button" accessibilityLabel={t('gallery.takePhoto')} onPress={takePhoto} style={[styles.camera, { width: tile, height: tile }]}>
                <Ionicons name="camera" size={26} color={colors.textTertiary} />
              </Pressable>
            );
          }
          const order = selected.findIndex((s) => s.key === item.key);
          return (
            <Pressable onPress={() => onTile(item)} style={{ width: tile, height: tile }}>
              <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} fadeDuration={0} />
              {item.type === 'video' ? <Ionicons name="videocam" size={16} color={colors.white} style={styles.videoMark} /> : null}
              {order >= 0 && !multi ? <View style={styles.selectedOverlay} /> : null}
              {multi ? (
                // 여러 장 고를 때는 고른 순서 번호
                <View style={[styles.badge, order >= 0 && styles.badgeOn]}>
                  {order >= 0 ? (
                    <AppText variant="microBold" color={colors.white}>
                      {order + 1}
                    </AppText>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  albumButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  preview: { backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: layout.screenPadding, paddingVertical: 14 },
  gridRow: { gap: 2, marginBottom: 2 },
  camera: { backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  selectedOverlay: { ...StyleSheet.absoluteFill, borderWidth: 3, borderColor: colors.primary },
  videoMark: { position: 'absolute', left: 6, bottom: 6 },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.white,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  denied: { paddingHorizontal: layout.screenPadding, paddingBottom: 12, gap: 10, alignItems: 'flex-start' },
  deniedText: { lineHeight: 20 },
}));
