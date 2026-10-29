import { isAxiosError } from 'axios';
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
/** 서버 AVATAR_MAX_BYTES 와 같습니다 */
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** 서버가 알려 준 이유 (예: '이 사진은 쓸 수 없어요'). 없으면 null */
function serverMessage(error: unknown): string | null {
  const message = isAxiosError<{ message?: unknown }>(error) ? error.response?.data?.message : undefined;
  return typeof message === 'string' ? message : null;
}

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
  const [uploading, setUploading] = useState(false);
  const [nickname, setNickname] = useState(me?.nickname ?? '');
  const [checkState, setCheckState] = useState<'unchecked' | 'available' | 'taken'>('available');

  const nicknameChanged = nickname !== me?.nickname;
  // 가입 때 받은 이름(소셜 로그인 등)이 규칙에 안 맞으면 사진만 바꾸려 해도 저장 버튼이 꺼져 있었습니다 (대표 리포트 15).
  // 규칙은 이름을 바꿀 때만 봅니다
  const nicknameValid = !nicknameChanged || NICKNAME_RULE.test(nickname);

  const checkNickname = async () => {
    const available = await profileApi.isNicknameAvailable(nickname);
    setCheckState(available ? 'available' : 'taken');
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      // 서버는 jpg·png 만 받습니다. 아이폰 HEIC 는 jpg 로 바꿔서 받습니다 (안드로이드는 자르기 결과가 jpg)
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.mimeType && !['image/jpeg', 'image/png'].includes(asset.mimeType)) {
      showToast(t('profileEdit.unsupportedType'));
      return;
    }
    if (asset.fileSize != null && asset.fileSize > AVATAR_MAX_BYTES) {
      showToast(t('profileEdit.tooLarge'));
      return;
    }
    setPhotoUri(asset.uri);
    setAvatarKey(undefined);
  };

  const save = async () => {
    // 갤러리에서 고른 사진은 먼저 서버에 올리고, 받은 주소를 저장합니다.
    // 폰 안 주소(file://)를 그대로 저장하면 친구 화면에서는 사진이 안 보였습니다 (10-12)
    let avatarUrl = avatarKey;
    if (photoUri) {
      setUploading(true);
      try {
        avatarUrl = await profileApi.uploadAvatar(photoUri);
      } catch (error) {
        showToast(serverMessage(error) ?? t('profileEdit.uploadFailed'));
        return;
      } finally {
        setUploading(false);
      }
    }
    update.mutate(
      // 이름을 안 바꿨으면 보내지 않습니다 (규칙에 안 맞는 예전 이름 때문에 서버가 거절하지 않게)
      { gender, avatarUrl, ...(nicknameChanged ? { nickname } : {}) },
      {
        // 저장된 프로필은 useUpdateProfile 이 로그인 정보(내 사진)에 바로 넣습니다
        onSuccess: () => {
          setPhotoUri(null);
          showToast(t('profileEdit.saved'));
          router.back();
        },
        // 예전에는 실패해도 아무 말이 없어 '사진이 안 바뀐다' 로 보였습니다 (대표 리포트 15)
        onError: (error) => showToast(serverMessage(error) ?? t('common.requestFailed')),
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
        disabled={!nicknameValid || checkState !== 'available' || update.isPending || uploading}
        onPress={() => void save()}
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
