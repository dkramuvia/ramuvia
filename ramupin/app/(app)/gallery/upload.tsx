import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Header } from '@/components/ui';
import { useUploadDraftStore } from '@/stores/uploadDraftStore';
import { colors, layout } from '@/theme';
import type { MediaAsset } from '@/types/models';

// TODO(정책): 한 번에 올릴 수 있는 개수·동영상 길이는 등급별 정책값 (WBS 5.6)
const SELECTION_LIMIT = 10;
const VIDEO_MAX_SECONDS = 60;

const toAsset = (a: ImagePicker.ImagePickerAsset): MediaAsset => ({
  uri: a.uri,
  width: a.width,
  height: a.height,
  type: a.type === 'video' ? 'video' : 'image',
});

/**
 * 피그마: 새로운 사진 (283:20334)
 * 피그마는 앱 안에 기기 사진 목록을 보여주지만, 지금은 OS 사진 선택기로 고릅니다.
 * TODO: 앱 안 사진 목록은 expo-media-library 추가 후 구현 (디자인 확인 사항 참고)
 */
export default function GalleryUploadScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { media, setMedia, reset } = useUploadDraftStore();
  const [preview, setPreview] = useState(0);

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: SELECTION_LIMIT,
      videoMaxDuration: VIDEO_MAX_SECONDS,
      quality: 0.8,
    });
    if (!result.canceled) {
      setMedia(result.assets.map(toAsset));
      setPreview(0);
    }
  };

  const takePhoto = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) {
      setMedia([...media, ...result.assets.map(toAsset)].slice(0, SELECTION_LIMIT));
      setPreview(media.length);
    }
  };

  // 처음 들어오면 새 초안으로 시작하고 바로 사진 선택기를 엽니다
  useEffect(() => {
    reset();
    pickFromLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tile = (width - 6) / 4;
  const selected = media[preview];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <Header
        title={t('gallery.newPhoto')}
        showBack={false}
        right={
          <Pressable accessibilityRole="button" disabled={media.length === 0} onPress={() => router.push('/gallery/upload-detail')} hitSlop={8}>
            <AppText variant="body1Bold" color={media.length ? colors.primary : colors.textMuted}>
              {t('gallery.next')}
            </AppText>
          </Pressable>
        }
      />
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => router.back()} style={styles.close} hitSlop={8}>
        <Ionicons name="close" size={26} color={colors.text} />
      </Pressable>

      <View style={[styles.preview, { height: width * 0.95 }]}>
        {selected ? (
          <Image source={{ uri: selected.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="images-outline" size={48} color={colors.textMuted} />
        )}
        {selected?.type === 'video' ? <Ionicons name="play-circle" size={56} color={colors.white} /> : null}
      </View>

      <View style={styles.bar}>
        <AppText variant="body1Bold">{t('gallery.recent')}</AppText>
        <Pressable accessibilityRole="button" onPress={pickFromLibrary} hitSlop={8}>
          <AppText variant="body1Bold" color={colors.primary}>
            {t('gallery.select')}
          </AppText>
        </Pressable>
      </View>

      <FlatList
        data={[null, ...media]}
        numColumns={4}
        keyExtractor={(item, i) => item?.uri ?? `camera-${i}`}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item, index }) =>
          item === null ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('gallery.takePhoto')} onPress={takePhoto} style={[styles.camera, { width: tile, height: tile }]}>
              <Ionicons name="camera" size={26} color={colors.textTertiary} />
            </Pressable>
          ) : (
            <Pressable onPress={() => setPreview(index - 1)} style={{ width: tile, height: tile }}>
              <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} />
              {index - 1 === preview ? <View style={styles.selectedOverlay} /> : null}
            </Pressable>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  close: { position: 'absolute', top: 58, left: 16 },
  preview: { backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: layout.screenPadding, paddingVertical: 14 },
  gridRow: { gap: 2, marginBottom: 2 },
  camera: { backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  selectedOverlay: { ...StyleSheet.absoluteFill, borderWidth: 3, borderColor: colors.primary },
});
