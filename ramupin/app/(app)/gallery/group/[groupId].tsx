import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Avatar, Fab, Header } from '@/components/ui';
import { PostGrid } from '@/features/gallery/PostGrid';
import { useGalleryFeed } from '@/features/gallery/queries';
import { useGroup } from '@/features/groups/queries';
import { colors, layout } from '@/theme';

const MAX_AVATARS = 4;

/** 피그마: 그룹 게시물 모아보기 (283:20215) */
export default function GalleryGroupScreen() {
  const { t } = useTranslation();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { data: group } = useGroup(groupId);
  const { data: posts = [] } = useGalleryFeed(groupId);
  const members = group?.members ?? [];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <Header />
      <PostGrid
        posts={posts}
        scope={`group:${groupId}`}
        showAuthor
        emptyText={t('gallery.empty')}
        header={
          <View style={styles.header}>
            <AppText variant="title1" numberOfLines={1}>
              {group?.name}
            </AppText>
            <View style={styles.avatars}>
              {members.slice(0, MAX_AVATARS).map((m, i) => (
                <View key={m.id} style={[styles.avatarWrap, { marginLeft: i === 0 ? 0 : -12 }]}>
                  <Avatar name={m.nickname} imageUrl={m.avatarUrl} size={32} />
                </View>
              ))}
              {members.length > MAX_AVATARS ? (
                <View style={[styles.avatarWrap, styles.more]}>
                  <AppText variant="micro" color={colors.textTertiary}>
                    +{members.length - MAX_AVATARS}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        }
      />
      <Fab
        accessibilityLabel={t('gallery.write')}
        onPress={() => router.push('/gallery/upload')}
        icon={<Ionicons name="pencil" size={26} color={colors.white} />}
        bottom={24}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: layout.screenPadding, gap: 12, paddingBottom: 12 },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { borderRadius: 20, borderWidth: 2, borderColor: colors.surface },
  more: { width: 34, height: 34, marginLeft: -12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
