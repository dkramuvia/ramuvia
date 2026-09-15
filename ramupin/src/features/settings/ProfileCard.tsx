import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, BatteryBadge, Card } from '@/components/ui';
import { avatarSource } from '@/features/settings/avatars';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme';

/** 피그마 설정 화면들 상단의 내 프로필 카드 (아바타·이름·ID·배터리 + QR 바로가기) */
export function ProfileCard({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  if (!me) return null;

  return (
    <Card onPress={onPress} style={styles.card}>
      <Avatar name={me.nickname} imageUrl={avatarSource(me.avatarUrl)} online />
      <View style={styles.texts}>
        <AppText variant="listTitle">{me.nickname}</AppText>
        <AppText variant="caption" color="#878787">
          {t('settingsMenu.id', { id: me.id })}
        </AppText>
        {me.batteryLevel != null ? (
          <BatteryBadge level={me.batteryLevel} iconSize={12} textVariant="caption" textColor={colors.textSecondary} />
        ) : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('friendAdd.myQr')} onPress={() => router.push('/friends/my-qr')} style={styles.qr}>
        <Ionicons name="qr-code" size={40} color={colors.textStrong} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, minHeight: 78 },
  texts: { flex: 1 },
  qr: {
    width: 57,
    height: 57,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.67)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
