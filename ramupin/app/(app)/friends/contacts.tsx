import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Linking, StyleSheet, View } from 'react-native';

import { friendsApi } from '@/api';
import { AppText, Button, Screen, ToggleRow } from '@/components/ui';
import { RequestSentPopup } from '@/features/friends/RequestSentPopup';
import { SuggestionCard } from '@/features/friends/SuggestionCard';
import { useContactDiscoverable, useSendFriendRequest, useSetContactDiscoverable } from '@/features/friends/queries';
import { useColors } from '@/theme';
import type { FriendSuggestion } from '@/types/models';

type Step = 'intro' | 'syncing' | 'denied' | 'failed' | 'done';

/** 피그마: 연락처 친구 - 동기화 안내 (363:18457) / 동기화 완료 (363:19516) */
export default function ContactFriendsScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('intro');
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const send = useSendFriendRequest();
  const { data: discoverable = true } = useContactDiscoverable();
  const setDiscoverable = useSetContactDiscoverable();

  const sync = async () => {
    const { granted } = await requestPermissionsAsync();
    if (!granted) {
      setStep('denied');
      return;
    }
    setStep('syncing');
    try {
      const contacts = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES]);
      const phoneNumbers = contacts
        .flatMap((c) => c.phones ?? [])
        .map((p) => (p.number ?? '').replace(/[^0-9+]/g, ''))
        .filter(Boolean);
      setSuggestions(await friendsApi.matchContacts(phoneNumbers));
      setStep('done');
    } catch (error) {
      // 실패했는데 'syncing' 에 머물면 화면이 영원히 돕니다 (09-21)
      console.warn('[friends] 연락처 동기화 실패', String(error));
      setStep('failed');
    }
  };

  const request = (s: FriendSuggestion) =>
    send.mutate({ userId: s.user.id }, {
      onSuccess: () => {
        setSuggestions((list) => list.map((x) => (x.user.id === s.user.id ? { ...x, requested: true } : x)));
        setSentTo(s.user.nickname);
      },
    });

  return (
    <Screen title={t('screens.contactFriends')} contentStyle={styles.content}>
      {step === 'done' ? (
        <View style={styles.list}>
          <AppText variant="label1" color={colors.textTertiary}>
            {t('friendAdd.peopleYouMayKnow')}
          </AppText>
          {suggestions.length === 0 ? (
            <AppText variant="label1" color={colors.textMuted}>
              {t('friendAdd.contactsEmpty')}
            </AppText>
          ) : null}
          {suggestions.map((s) => (
            <SuggestionCard key={s.user.id} suggestion={s} pending={send.isPending} onRequest={() => request(s)} />
          ))}

          {/* 나도 남의 주소록에 뜨는 쪽이라, 끌 수 있어야 합니다 */}
          <ToggleRow
            title={t('friendAdd.contactDiscoverable')}
            description={t('friendAdd.contactDiscoverableDesc')}
            value={discoverable}
            onValueChange={(on) => setDiscoverable.mutate(on)}
          />
        </View>
      ) : (
        <View style={styles.intro}>
          <Image source={require('../../../assets/images/contacts-sync.png')} style={styles.image} />
          <AppText variant="headline">{t('friendAdd.contactSync')}</AppText>
          <AppText variant="label2" color={colors.textSecondary} align="center">
            {step === 'denied'
              ? t('friendAdd.contactsDenied')
              : step === 'failed'
                ? t('common.loadFailed')
                : t('friendAdd.contactSyncQuestion')}
          </AppText>
          {step === 'syncing' ? (
            <ActivityIndicator color={colors.brown} style={styles.button} />
          ) : step === 'denied' ? (
            <Button label={t('map.openSettings')} variant="brown" onPress={() => Linking.openSettings()} style={styles.button} />
          ) : (
            <Button label={t('friendAdd.sync')} variant="brown" onPress={sync} style={styles.button} />
          )}
        </View>
      )}

      <RequestSentPopup nickname={sentTo} onClose={() => setSentTo(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8 },
  list: { gap: 12 },
  intro: { alignItems: 'center', gap: 12, paddingTop: 36 },
  image: { width: 150, height: 150, marginBottom: 32 },
  button: { alignSelf: 'stretch', marginHorizontal: 16, marginTop: 36 },
});
