import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Screen, type TabName } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

const FIGMA_FILE_URL = 'https://www.figma.com/design/B7PL60U8Z0122RaYWOjLWw';

interface ScreenPlaceholderProps {
  titleKey: string;
  /** 피그마 프레임 node id (예: "283:17631") */
  figmaNodeId: string;
  links?: { href: string; labelKey: string }[];
  /** 하단 탭바를 함께 보여줄 때 선택된 탭 */
  tab?: TabName;
  /** 임시 동작 버튼 등 */
  children?: ReactNode;
}

/**
 * 화면 퍼블리싱 전까지 쓰는 임시 화면.
 * 화면 이동 흐름을 확인하고, 피그마의 해당 프레임으로 바로 이동할 수 있습니다.
 */
export function ScreenPlaceholder({ titleKey, figmaNodeId, links = [], tab, children }: ScreenPlaceholderProps) {
  const { t } = useTranslation();
  const title = t(titleKey);
  const figmaUrl = `${FIGMA_FILE_URL}?node-id=${figmaNodeId.replace(':', '-')}`;

  return (
    <Screen title={title} tab={tab} contentStyle={styles.content}>
      <AppText variant="label1" color={colors.textTertiary}>
        {t('placeholder.todo')}
      </AppText>

      <Pressable onPress={() => Linking.openURL(figmaUrl)}>
        <AppText variant="label1" color={colors.primary}>
          {t('placeholder.openFigma')} ({figmaNodeId})
        </AppText>
      </Pressable>

      {children}

      {links.length > 0 && (
        <View style={styles.links}>
          <AppText variant="label2" color={colors.textTertiary}>
            {t('placeholder.goTo')}
          </AppText>
          {links.map((link) => (
            <Link key={link.href} href={link.href as Href} asChild>
              <Pressable style={styles.linkItem}>
                <AppText variant="body2">{t(link.labelKey)}</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {link.href}
                </AppText>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  links: { marginTop: spacing.lg, gap: spacing.sm },
  linkItem: { padding: spacing.lg, borderRadius: radius.sm, backgroundColor: colors.surface, gap: 2 },
});
