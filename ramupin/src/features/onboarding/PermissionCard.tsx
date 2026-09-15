import { Image, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { colors, radius } from '@/theme';

interface PermissionCardProps {
  title: string;
  description: string;
  /** "다음 화면에서 선택하세요. / 항상 허용" 같은 안내 */
  hint?: string;
  hintStrong?: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  busy?: boolean;
}

/** 피그마 권한 안내 카드 (348:15289 ~ 348:15473): R 말풍선 + 구름 일러스트 위에 흰 카드 */
export function PermissionCard({ title, description, hint, hintStrong, primaryLabel, onPrimary, secondaryLabel, onSecondary, busy }: PermissionCardProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.art}>
        <Image source={require('../../../assets/images/qr-deco-cloud.png')} style={styles.cloud} />
        <Image source={require('../../../assets/images/qr-deco-r.png')} style={styles.r} />
      </View>
      <View style={styles.card}>
        <View style={styles.body}>
          <AppText variant="headline">{title}</AppText>
          <AppText variant="label1" color={colors.textTertiary}>
            {description}
          </AppText>
          {hint ? <AppText variant="body1">{hint}</AppText> : null}
          {hintStrong ? <AppText variant="title4">{hintStrong}</AppText> : null}
        </View>
        <View style={styles.buttons}>
          {secondaryLabel ? <Button label={secondaryLabel} variant="neutral" size="lg" shape="rounded" onPress={onSecondary} style={styles.flex} /> : null}
          <Button label={primaryLabel} variant="dark" size="lg" shape="rounded" disabled={busy} onPress={onPrimary} style={styles.flex} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  flex: { flex: 1 },
  art: { width: 260, height: 190, marginBottom: -40 },
  cloud: { position: 'absolute', left: 10, bottom: 0, width: 200, height: 134 },
  r: { position: 'absolute', right: 20, top: 0, width: 130, height: 130 },
  card: {
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.surfaceStrong,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  body: { padding: 16, gap: 12 },
  buttons: { flexDirection: 'row', gap: 8, padding: 16, backgroundColor: colors.background },
});
