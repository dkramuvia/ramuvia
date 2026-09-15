import type { ReactNode } from 'react';
import { Image, Modal, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { colors } from '@/theme';

interface PopupProps {
  visible: boolean;
  title: string;
  message?: string;
  /** 상단 어두운 영역에 들어가는 3D 이미지 (없으면 글자만) */
  image?: ImageSourcePropType;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
  /** 배경을 눌렀을 때 닫기 */
  onDismiss?: () => void;
  children?: ReactNode;
}

/** 피그마 완료 팝업 (예: "hyunjin001님에게 친구 요청을 보냈어요!"): 폭 362, 모서리 10, 갈색 확인 버튼 */
export function Popup({
  visible,
  title,
  message,
  image,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
  onDismiss,
  children,
}: PopupProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss ?? onCancel ?? onConfirm}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={() => undefined}>
          {image ? (
            <View style={styles.imageArea}>
              <Image source={image} style={styles.image} resizeMode="contain" />
            </View>
          ) : null}
          <View style={styles.body}>
            <View style={styles.texts}>
              <AppText variant="title3">{title}</AppText>
              {message ? <AppText variant="headline">{message}</AppText> : null}
            </View>
            {children}
            <View style={styles.buttons}>
              {cancelLabel ? (
                <Button label={cancelLabel} variant="neutral" size="md" onPress={onCancel} style={styles.button} />
              ) : null}
              <Button label={confirmLabel} variant="dark" size="md" onPress={onConfirm} style={styles.button} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 362,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.popup,
  },
  imageArea: { height: 207, backgroundColor: '#1D1816', alignItems: 'center', justifyContent: 'center' },
  image: { width: 176, height: 180 },
  body: { paddingTop: 16, paddingHorizontal: 24, paddingBottom: 24, gap: 10 },
  texts: { gap: 4 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  button: { flex: 1 },
});
