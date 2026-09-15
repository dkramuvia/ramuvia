import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Fab } from '@/components/ui';
import { PostPager } from '@/features/gallery/PostPager';
import { useGalleryFeed } from '@/features/gallery/queries';
import { useMyGroups } from '@/features/groups/queries';
import { colors } from '@/theme';

const SHEET_COLLAPSED = 64;

/**
 * 피그마: 갤러리 (283:19892 / 그룹 선택 시트 283:20120)
 * 기획: 가장 최근 게시물 전체화면, 그룹명 또는 바텀시트로 다른 그룹 선택 → 그 그룹의 게시글 모음, 수정 아이콘은 항상 떠 있음
 */
export default function GalleryScreen() {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const [groupId, setGroupId] = useState<string | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: posts = [], isLoading } = useGalleryFeed(groupId);
  const { data: groups = [] } = useMyGroups();

  const selectGroup = (id: string | undefined) => {
    setSheetOpen(false);
    if (id) router.push(`/gallery/group/${id}`);
    else setGroupId(undefined);
  };

  return (
    <View style={styles.container}>
      {focused ? <StatusBar style="light" /> : null}

      {isLoading ? (
        <ActivityIndicator style={styles.center} color={colors.white} />
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
            <Pressable accessibilityRole="button" onPress={() => setSheetOpen(true)} style={styles.groupButton}>
              <Ionicons name="chevron-down" size={22} color={colors.white} />
              <AppText variant="body1Bold" color={colors.white} numberOfLines={1}>
                {post.groupName}
              </AppText>
            </Pressable>
          )}
        />
      )}

      <Fab
        accessibilityLabel={t('gallery.write')}
        bottom={SHEET_COLLAPSED + 20}
        onPress={() => router.push('/gallery/upload')}
        icon={<Ionicons name="pencil" size={26} color={colors.white} />}
      />

      {/* TODO: 드래그 바텀시트로 교체 */}
      <View style={styles.sheet}>
        <Pressable accessibilityRole="button" onPress={() => setSheetOpen((v) => !v)} style={styles.sheetHandleArea}>
          <View style={styles.grabber} />
          <View style={styles.sheetRow}>
            <Ionicons name="people-outline" size={20} color={colors.text} />
            <AppText variant="body2Bold">{t('gallery.allGroups', { count: groups.length })}</AppText>
          </View>
        </Pressable>
        {sheetOpen ? (
          <View style={styles.groupList}>
            {groups.map((g) => (
              <Pressable key={g.id} accessibilityRole="button" onPress={() => selectGroup(g.id)} style={styles.sheetRow}>
                <Ionicons name="checkmark" size={20} color={g.id === groupId ? colors.text : 'transparent'} />
                <AppText variant={g.id === groupId ? 'body2Bold' : 'body2'}>
                  {g.name}
                  {g.id === groupId ? ` ${t('gallery.currentSelected')}` : ''}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E1E1E' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { gap: 16, paddingBottom: SHEET_COLLAPSED },
  groupButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.surface,
    paddingBottom: 8,
  },
  sheetHandleArea: { paddingHorizontal: 18, paddingBottom: 4 },
  grabber: { alignSelf: 'center', width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9', marginVertical: 12 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  groupList: { paddingHorizontal: 18, paddingBottom: 8 },
});
