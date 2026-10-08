import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { AppText, Button, Fab, QueryState, SheetScrollView, SnapSheet, type SnapSheetHandle } from '@/components/ui';
import { PostPager } from '@/features/gallery/PostPager';
import { useGalleryFeed } from '@/features/gallery/queries';
import { useMyGroups } from '@/features/groups/queries';
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
  const [groupId, setGroupId] = useState<string | undefined>(undefined);
  const sheet = useRef<SnapSheetHandle>(null);
  const { height } = useWindowDimensions();
  const { data: posts = [], isLoading, isError, refetch } = useGalleryFeed(groupId);
  const { data: groups = [] } = useMyGroups();
  // 펼친 높이: 그룹 수만큼, 화면 절반까지
  const sheetExpanded = Math.min(height * 0.5, SHEET_COLLAPSED + 16 + groups.length * ROW_HEIGHT);

  /** 피그마 579: 고른 그룹방의 사진만 봅니다. '전체그룹방' 을 누르면 전부 */
  const selectGroup = (id: string | undefined) => {
    setGroupId(id);
    sheet.current?.snapToIndex(0);
  };

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
          <Button label={t('gallery.emptyAction')} variant="dark" size="sm" onPress={() => router.push('/gallery/upload')} />
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
        above={
          <View pointerEvents="box-none" style={styles.fabRow}>
            <Fab
              accessibilityLabel={t('gallery.write')}
              bottom={20}
              onPress={() => router.push('/gallery/upload')}
              icon={<Ionicons name="pencil" size={26} color={colors.white} />}
            />
          </View>
        }
        header={
          <Pressable accessibilityRole="button" onPress={() => selectGroup(undefined)} style={styles.sheetHeader}>
            <Ionicons name="people-outline" size={20} color={colors.text} />
            <AppText variant={groupId ? 'body2' : 'body2Bold'}>{t('gallery.allGroups', { count: groups.length })}</AppText>
          </Pressable>
        }
      >
        <SheetScrollView contentContainerStyle={styles.groupList}>
          {groups.map((g) => (
            <Pressable key={g.id} accessibilityRole="button" onPress={() => selectGroup(g.id)} style={styles.sheetRow}>
              {/* 색을 투명으로 주면 검게 그려지는 기기가 있어 보이기/숨기기로 합니다 */}
              <Ionicons name="checkmark" size={20} color={colors.text} style={{ opacity: g.id === groupId ? 1 : 0 }} />
              <AppText variant={g.id === groupId ? 'body2Bold' : 'body2'}>
                {g.name}
                {g.id === groupId ? ` ${t('gallery.currentSelected')}` : ''}
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
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: ROW_HEIGHT },
  groupList: { paddingHorizontal: 18, paddingBottom: 8 },
}));
