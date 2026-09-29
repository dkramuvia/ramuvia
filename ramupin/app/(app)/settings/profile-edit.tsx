import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, View } from 'react-native';

import { profileApi } from '@/api/endpoints/settings';
import { AppText, Button, Screen, SegmentButtons, TextField } from '@/components/ui';
import { CharacterPicker } from '@/features/settings/CharacterPicker';
import { ProfileCard } from '@/features/settings/ProfileCard';
import { useUpdateProfile } from '@/features/settings/queries';
import { useAuthStore } from '@/stores/authStore';
import { makeStyles, useColors } from '@/theme';
import type { Gender } from '@/types/models';
import { showToast } from '@/utils/toast';

// TODO(정책): 사용자명 규칙은 서버 정책과 맞추기 (WBS 3.9, 피그마: 2~8글자, 한글·영문·숫자)
const NICKNAME_RULE = /^[가-힣a-zA-Z0-9]{2,8}$/;

/**
 * 피그마: 프로필 편집 (283:25613)
 * 기획: 성별 선택 → 캐릭터 좌우 선택 또는 갤러리 사진, 사용자명은 중복 확인 후 저장
 */
export default function ProfileEditScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const update = useUpdateProfile();

  const [gender, setGender] = useState<Gender>(me?.gender ?? 'male');
  const [avatarKey, setAvatarKey] = useState<string | undefined>(me?.avatarUrl);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [nickname, setNickname] = useState(me?.nickname ?? '');
  const [checkState, setCheckState] = useState<'unchecked' | 'available' | 'taken'>('available');

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
        <CharacterPicker gender={gender} value={avatarKey} onChange={setAvatarKey} />
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

const useStyles = makeStyles((colors) => ({
  content: { gap: 16 },
  section: { gap: 8 },
  photoWrap: { alignSelf: 'center' },
  // 캐릭터 카드와 같은 크기 (CharacterPicker)
  photo: { width: 164, height: 186, borderRadius: 16 },
  galleryButton: { marginTop: 8 },
}));
