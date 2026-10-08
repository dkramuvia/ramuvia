import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { useUploadPost } from '@/features/gallery/queries';
import { useMyGroups } from '@/features/groups/queries';
import { useUploadDraftStore } from '@/stores/uploadDraftStore';
import { makeStyles, useColors } from '@/theme';
import { showToast } from '@/utils/toast';

/** 서버가 알려 준 이유를 그대로 보여 줍니다 (용량 초과·등급 제한 등) */
function uploadErrorMessage(error: unknown, t: (key: string, vars?: Record<string, unknown>) => string): string {
  const data = (error as { response?: { data?: { code?: string; usedMb?: number; limitMb?: number } } }).response?.data;
  if (data?.code === 'STORAGE_FULL') return t('gallery.storageFull', { usedMb: data.usedMb, limitMb: data.limitMb });
  if (data?.code === 'PLAN_NO_PHOTO') return t('gallery.planNoPhoto');
  return t('gallery.uploadFailed');
}

/** 피그마: 그룹방 지정·위치 추가 (283:20418 / 목록 363:8084 / 선택됨 363:8185 / 위치 363:8485) */
export default function GalleryUploadDetailScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const { media, groupId, place, setGroupId, reset } = useUploadDraftStore();
  const { data: groups = [] } = useMyGroups();
  const upload = useUploadPost();
  const [groupListOpen, setGroupListOpen] = useState(false);

  const selectedGroup = groups.find((g) => g.id === groupId);

  const onShare = () => {
    if (!groupId) {
      showToast(t('gallery.noGroup'));
      setGroupListOpen(true);
      return;
    }
    upload.mutate(
      { groupId, media, place: place ?? undefined },
      {
        onSuccess: () => {
          showToast(t('gallery.uploaded'));
          reset();
          router.dismissTo('/gallery');
        },
        // 실패하면 아무 반응이 없으면 안 됩니다. 왜 안 됐는지 알려 줍니다
        onError: (error) => showToast(uploadErrorMessage(error, t)),
      },
    );
  };

  return (
    <Screen
      title={t('gallery.newPhoto')}
      tab="gallery"
      contentStyle={styles.content}
      footer={<Button label={t('gallery.share')} size="lg" shape="rounded" disabled={media.length === 0 || upload.isPending} onPress={onShare} />}
    >
      {/*
        미리보기가 화면을 다 차지하면 그룹을 고른 뒤 '위치 추가'가 공유 버튼 아래로 밀려 안 보였습니다 (10-08 폰에서 확인).
        아래 칸(그룹방 지정·위치 추가)이 늘 보이도록 화면 높이의 45% 를 넘지 않게 합니다
      */}
      <View style={[styles.preview, { height: Math.min(width * 1.08, height * 0.45) }]}>
        {media[0] ? <Image source={{ uri: media[0].uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        {media.length > 1 ? (
          <View style={styles.count}>
            <AppText variant="microBold" color={colors.white}>
              1/{media.length}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.rows}>
        {/* 기획: 그룹방 지정 버튼 → 그룹방 목록이 세로로 펼쳐짐 */}
        <Pressable accessibilityRole="button" onPress={() => setGroupListOpen((v) => !v)} style={styles.row}>
          <AppText variant="title4" style={styles.flex}>
            {t('gallery.selectGroup')}
          </AppText>
          <Ionicons name={groupListOpen ? 'chevron-down' : 'chevron-forward'} size={22} color={colors.textTertiary} />
        </Pressable>
        {groupListOpen ? (
          <View style={styles.groupList}>
            {groups.map((g) => (
              <Pressable
                key={g.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: g.id === groupId }}
                onPress={() => {
                  setGroupId(g.id);
                  setGroupListOpen(false);
                }}
                style={styles.groupItem}
              >
                <AppText variant={g.id === groupId ? 'body1Bold' : 'body1'}>
                  {g.name}
                  {g.id === groupId ? ` ${t('gallery.currentSelected')}` : ''}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : selectedGroup ? (
          <AppText variant="label1">{selectedGroup.name}</AppText>
        ) : null}

        {/* 기획: 위치 추가 → 현재 위치에 핀, 드래그·검색으로 변경 */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/place-picker', params: { mode: 'attach' } })}
          style={[styles.row, styles.rowGap]}
        >
          <Ionicons name="location" size={24} color={colors.textStrong} />
          <AppText variant="title4" style={styles.flex}>
            {t('gallery.addPlace')}
          </AppText>
          <Ionicons name="chevron-forward" size={22} color={colors.textTertiary} />
        </Pressable>
        {place ? (
          <AppText variant="label1">
            {place.placeName ? `${place.placeName} - ` : ''}
            {place.address}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { paddingHorizontal: 0, paddingTop: 0 },
  flex: { flex: 1 },
  preview: { backgroundColor: colors.surfaceStrong },
  count: { position: 'absolute', right: 12, top: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  rows: { paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  rowGap: { gap: 8, marginTop: 8 },
  groupList: { gap: 4 },
  groupItem: { paddingVertical: 8 },
}));
