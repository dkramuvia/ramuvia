import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { profileApi } from '@/api/endpoints/settings';
import { AppText, Button, Screen, SegmentButtons, TextField } from '@/components/ui';
import { ProfileCard } from '@/features/settings/ProfileCard';
import { characterAvatars } from '@/features/settings/avatars';
import { useUpdateProfile } from '@/features/settings/queries';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme';
import type { Gender } from '@/types/models';
import { showToast } from '@/utils/toast';

// TODO(정책): 사용자명 규칙은 서버 정책과 맞추기 (WBS 3.9, 피그마: 2~8글자, 한글·영문·숫자)
const NICKNAME_RULE = /^[가-힣a-zA-Z0-9]{2,8}$/;
const CARD_WIDTH = 164;
const CARD_GAP = 14;

/**
 * 피그마: 프로필 편집 (283:25613)
 * 기획: 성별 선택 → 캐릭터 좌우 선택 또는 갤러리 사진, 사용자명은 중복 확인 후 저장
 */
export default function ProfileEditScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const me = useAuthStore((s) => s.user);
  const update = useUpdateProfile();

  const [gender, setGender] = useState<Gender>(me?.gender ?? 'male');
  const [avatarKey, setAvatarKey] = useState<string | undefined>(me?.avatarUrl);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [nickname, setNickname] = useState(me?.nickname ?? '');
  const [checkState, setCheckState] = useState<'unchecked' | 'available' | 'taken'>('available');
  const listRef = useRef<FlatList>(null);

  const avatars = useMemo(() => characterAvatars(gender), [gender]);
  const nicknameChanged = nickname !== me?.nickname;
  const nicknameValid = NICKNAME_RULE.test(nickname);

  const checkNickname = async () => {
    const available = await profileApi.isNicknameAvailable(nickname);
    setCheckState(available ? 'available' : 'taken');
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
      setAvatarKey(undefined);
    }
  };

  const save = () => {
    // TODO(5단계): 갤러리 사진은 S3 업로드 후 URL 저장
    update.mutate(
      { gender, nickname, avatarUrl: photoUri ?? avatarKey },
      {
        onSuccess: () => {
          showToast(t('profileEdit.saved'));
          router.back();
        },
      },
    );
  };

  const helper = !nicknameValid
    ? undefined
    : checkState === 'available' && nicknameChanged
      ? t('profileEdit.available')
      : undefined;

  return (
    <Screen title={t('screens.profileEdit')} tab="map" contentStyle={styles.content}>
      <ProfileCard />

      <View style={styles.section}>
        <AppText variant="label1" color={colors.textSecondary}>
          {t('profileEdit.avatar')}
        </AppText>
        <SegmentButtons
          value={gender}
          onChange={(g) => {
            setGender(g);
            setAvatarKey(undefined);
          }}
          options={[
            { value: 'male', label: t('profileEdit.male') },
            { value: 'female', label: t('profileEdit.female') },
          ]}
        />
      </View>

      {photoUri ? (
        <Pressable onPress={pickPhoto} style={styles.photoWrap}>
          <Image source={{ uri: photoUri }} style={styles.photo} />
        </Pressable>
      ) : (
        <FlatList
          ref={listRef}
          data={avatars}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + CARD_GAP}
          decelerationRate="fast"
          keyExtractor={(a) => a.key}
          style={styles.carousel}
          contentContainerStyle={{ paddingHorizontal: (width - CARD_WIDTH) / 2 - 20, gap: CARD_GAP }}
          renderItem={({ item }) => {
            const selected = item.key === avatarKey;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setAvatarKey(item.key)}
                style={[styles.avatarCard, selected && styles.avatarSelected]}
              >
                <Image source={item.source} style={styles.avatarImage} />
                {selected ? <Ionicons name="checkmark-circle" size={28} color={colors.primary} style={styles.avatarCheck} /> : null}
              </Pressable>
            );
          }}
        />
      )}

      <Button label={t('profileEdit.fromGallery')} variant="neutral" size="lg" onPress={pickPhoto} style={styles.galleryButton} />

      <TextField
        label={t('profileEdit.username')}
        value={nickname}
        onChangeText={(v) => {
          setNickname(v);
          setCheckState(v === me?.nickname ? 'available' : 'unchecked');
        }}
        maxLength={8}
        showCount
        helperText={helper ?? t('profileEdit.usernameHelp')}
        errorText={
          nickname && !nicknameValid ? t('profileEdit.usernameInvalid') : checkState === 'taken' ? t('profileEdit.taken') : undefined
        }
        right={
          <Button
            label={t('profileEdit.checkDuplicate')}
            variant={nicknameChanged && nicknameValid && checkState === 'unchecked' ? 'soft' : 'neutral'}
            size="xs"
            shape="square"
            disabled={!nicknameChanged || !nicknameValid || checkState !== 'unchecked'}
            onPress={checkNickname}
          />
        }
      />

      <Button
        label={t('profileEdit.save')}
        size="lg"
        disabled={!nicknameValid || checkState !== 'available' || update.isPending}
        onPress={save}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  section: { gap: 8 },
  carousel: { marginHorizontal: -20 },
  avatarCard: { width: CARD_WIDTH, height: 192, borderRadius: 16, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent' },
  avatarSelected: { borderColor: colors.primary },
  avatarImage: { width: '100%', height: '100%' },
  avatarCheck: { position: 'absolute', right: 8, top: 8 },
  photoWrap: { alignSelf: 'center' },
  photo: { width: CARD_WIDTH, height: 192, borderRadius: 16 },
  galleryButton: { marginTop: 8 },
});
