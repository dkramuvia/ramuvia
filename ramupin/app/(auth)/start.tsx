import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { fontFamily } from '@/theme';

/** 피그마: 시작하기 (348:14923) */
export default function StartScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Image source={require('../../assets/images/start-city.jpg')} style={styles.city} resizeMode="cover" />
      <LinearGradient colors={['#DCEFFA', 'rgba(220,239,250,0)']} style={styles.skyTop} />
      <Image source={require('../../assets/images/start-photo1.jpg')} style={[styles.photo, styles.photo1]} />
      <Image source={require('../../assets/images/start-photo2.jpg')} style={[styles.photo, styles.photo2]} />
      <Image source={require('../../assets/images/start-photo3.jpg')} style={[styles.photo, styles.photo3]} />
      <Image source={require('../../assets/images/qr-deco-cloud.png')} style={styles.cloud1} />
      <Image source={require('../../assets/images/qr-deco-me.png')} style={styles.me} />
      <Image source={require('../../assets/images/qr-deco-r.png')} style={styles.r} />
      <Image source={require('../../assets/images/qr-deco-cloud.png')} style={styles.cloud2} />
      <LinearGradient colors={['rgba(247,247,248,0)', '#F7F7F8']} style={styles.fade} />

      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <View>
          <AppText style={styles.headline} color="#7B6A62">
            {t('onboarding.startHeadline1')}
          </AppText>
          <AppText style={styles.headline} color="#4FB9D0">
            {t('onboarding.startHeadline2')}
          </AppText>
        </View>
        <Button label={t('onboarding.start')} variant="dark" size="lg" shape="rounded" onPress={() => router.push('/welcome')} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#DCEFFA' },
  city: { position: 'absolute', top: '20%', left: 0, right: 0, height: '55%', opacity: 0.55 },
  skyTop: { position: 'absolute', top: 0, left: 0, right: 0, height: '35%' },
  photo: { position: 'absolute', borderRadius: 12 },
  photo1: { top: '12%', left: '18%', width: 93, height: 124 },
  photo2: { top: '38%', left: 0, width: 99, height: 99 },
  photo3: { top: '52%', right: 0, width: 127, height: 82 },
  cloud1: { position: 'absolute', top: '17%', left: '38%', width: 220, height: 148 },
  me: { position: 'absolute', top: '27%', left: '35%', width: 90, height: 90 },
  r: { position: 'absolute', top: '46%', left: '6%', width: 150, height: 150 },
  cloud2: { position: 'absolute', top: '56%', right: '16%', width: 120, height: 80 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%' },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 0, gap: 40, paddingBottom: 16 },
  headline: { fontFamily: fontFamily.semibold, fontSize: 32, lineHeight: 42, letterSpacing: -0.5, paddingHorizontal: 16 },
});
