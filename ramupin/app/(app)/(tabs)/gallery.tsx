import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { AppText, Button, Fab, QueryState, SheetScrollView, SnapSheet, type SnapSheetHandle } from '@/components/ui';
import { PostPager } from '@/features/gallery/PostPager';
import { useGalleryFeed, useGalleryGroupCounts } from '@/features/gallery/queries';
import { useMyGroups } from '@/features/groups/queries';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { makeStyles, useColors } from '@/theme';

const SHEET_COLLAPSED = 64;
/** 펼친 시트에서 그룹방 한 줄 높이 */
const ROW_HEIGHT = 40;

/**
 * 피그마: 갤러리 (283:19892 / 그룹 선택 시트 283:20120, 10-08판 577·579)
 * 기획: 가장 최근 게시물 전체화면, 그룹명 또는 바텀시트로 다른 그룹 선택 → 그 그룹의 게시물만, 수정 아이콘은 항상 떠 있음
 * 시트는 **끌어서** 올리고 내립니다. 연필 버튼은 시트 윗변에 붙어 같이 움직입니다 (579)
 */
export default function GalleryScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const focused = useIsFocused();
  // 고른 그룹방은 앱을 다시 켜도 그대로 (대표 리포트 98)
  const groupId = usePreferencesStore((s) => s.galleryGroupId);
  const setPreferences = usePreferencesStore((s) => s.set);
  const sheet = useRef<SnapSheetHandle>(null);
  const sheetIndex = useRef(0);
  const { height } = useWindowDimensions();
  const { data: posts = [], isLoading, isError, refetch } = useGalleryFeed(groupId);
  const { data: allGroups, isSuccess: groupsLoaded } = useMyGroups();
  // 1:1 대화방은 그룹방 목록에서 뺍니다 (대표 리포트 45)
  const groups = (allGroups ?? []).filter((g) => !g.isDirect);
  const { data: counts = {} } = useGalleryGroupCounts();
  // 펼친 높이: '전체 그룹방' 줄 + 그룹 수만큼, 화면 절반까지
  const sheetExpanded = Math.min(height * 0.5, SHEET_COLLAPSED + 16 + (groups.length + 1) * ROW_HEIGHT);
  const selectedGroup = groups.find((g) => g.id === groupId);

  // 나간 그룹방(또는 지워진 방)을 고른 채로 남아 있으면 전체로 돌립니다 (대표 리포트 14)
  useEffect(() => {
    if (groupsLoaded && groupId && !(allGroups ?? []).some((g) => g.id === groupId && !g.isDirect)) {
      setPreferences({ galleryGroupId: undefined });
    }
  }, [groupsLoaded, allGroups, groupId, setPreferences]);

  /** 피그마 579: 고른 그룹방의 사진만 봅니다. '전체그룹방' 을 누르면 전부 */
  const selectGroup = (id: string | undefined) => {
    setPreferences({ galleryGroupId: id });
    sheet.current?.snapToIndex(0);
  };

  /** 시트 머리를 누르면 펼치기·접기. 예전에는 '전체 선택' 이라 접힌 채로는 눌러도 변화가 없었습니다 (대표 리포트 72) */
  const toggleSheet = () => sheet.current?.snapToIndex(sheetIndex.current === 0 ? 1 : 0);

  /** 새 사진은 지금 보고 있는 그룹방에 미리 골라 둡니다 (대표 리포트 12 ①) */
  const openUpload = () => router.push({ pathname: '/gallery/upload', params: groupId ? { groupId } : {} });

  return (
    <View style={styles.container}>
      {focused ? <StatusBar style="light" /> : null}

      {isLoading || isError ? (
        <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} tone="dark" style={styles.center} />
      ) : posts.length === 0 ? (
        <View style={[styles.center, styles.empty]}>
          <AppText variant="body1" color={colors.textMuted}>
            {t('gallery.empty')}
          </AppText>
          <Button label={t('gallery.emptyAction')} variant="dark" size="sm" onPress={openUpload} />
        </View>
      ) : (
        <PostPager
          posts={posts}
          bottomInset={SHEET_COLLAPSED}
          subtitle={(post) => (
            <Pressable accessibilityRole="button" onPress={() => sheet.current?.snapToIndex(1)} style={styles.groupButton}>
              <Ionicons name="chevron-down" size={22} color={colors.white} />
              <AppText variant="body1Bold" color={colors.white} numberOfLines={1}>
                {post.groupName}
              </AppText>
            </Pressable>
          )}
        />
      )}

      <SnapSheet
        ref={sheet}
        snapPoints={[SHEET_COLLAPSED, Math.max(sheetExpanded, SHEET_COLLAPSED + 1)]}
        initialIndex={0}
        onIndexChange={(i) => {
          sheetIndex.current = i;
        }}
        above={
          <View pointerEvents="box-none" style={styles.fabRow}>
            <Fab
              accessibilityLabel={t('gallery.write')}
              bottom={20}
              onPress={openUpload}
              icon={<Ionicons name="pencil" size={26} color={colors.white} />}
            />
          </View>
        }
        header={
          <Pressable accessibilityRole="button" onPress={toggleSheet} style={styles.sheetHeader}>
            <Ionicons name="people-outline" size={20} color={colors.text} />
            <AppText variant="body2Bold" numberOfLines={1} style={styles.flexShrink}>
              {selectedGroup ? selectedGroup.name : t('gallery.allGroups', { count: groups.length })}
            </AppText>
            <Ionicons name="chevron-expand" size={16} color={colors.textTertiary} />
          </Pressable>
        }
      >
        <SheetScrollView contentContainerStyle={styles.groupList}>
          {/* 첫 줄은 '전체 그룹방' (대표 리포트 72) */}
          <Pressable accessibilityRole="button" onPress={() => selectGroup(undefined)} style={styles.sheetRow}>
            <Ionicons name="checkmark" size={20} color={colors.text} style={{ opacity: groupId ? 0 : 1 }} />
            <AppText variant={groupId ? 'body2' : 'body2Bold'} style={styles.flexShrink} numberOfLines={1}>
              {t('gallery.allGroups', { count: groups.length })}
              {!groupId ? ` ${t('gallery.currentSelected')}` : ''}
            </AppText>
          </Pressable>
          {groups.map((g) => (
            <Pressable key={g.id} accessibilityRole="button" onPress={() => selectGroup(g.id)} style={styles.sheetRow}>
              {/* 색을 투명으로 주면 검게 그려지는 기기가 있어 보이기/숨기기로 합니다 */}
              <Ionicons name="checkmark" size={20} color={colors.text} style={{ opacity: g.id === groupId ? 1 : 0 }} />
              <AppText variant={g.id === groupId ? 'body2Bold' : 'body2'} style={styles.flexShrink} numberOfLines={1}>
                {g.name}
                {g.id === groupId ? ` ${t('gallery.currentSelected')}` : ''}
              </AppText>
              {/* 인원 · 사진 수 (대표 리포트 12 ④, 45: 이름이 같은 방 구분) */}
              <AppText variant="label2" color={colors.textTertiary}>
                {t('gallery.groupMeta', { members: g.memberCount, posts: counts[g.id] ?? 0 })}
              </AppText>
            </Pressable>
          ))}
        </SheetScrollView>
      </SnapSheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: '#1E1E1E' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { gap: 16, paddingBottom: SHEET_COLLAPSED },
  groupButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  fabRow: { height: 94 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingBottom: 8, minHeight: 28 },
  flexShrink: { flexShrink: 1 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: ROW_HEIGHT },
  groupList: { paddingHorizontal: 18, paddingBottom: 8 },
}));
