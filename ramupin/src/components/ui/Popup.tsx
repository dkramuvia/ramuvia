import type { ReactNode } from 'react';
import { Image, Modal, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { makeStyles } from '@/theme';

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
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss ?? onCancel ?? onConfirm}>
      <View style={styles.backdrop}>
        {/*
          바깥을 눌러 닫는 영역은 카드 **뒤에** 깝니다.
          예전에는 카드를 Pressable 로 감싸 "바깥 누름"을 막았는데, 그러면 카드가 터치를
          먼저 가져가서 **안에 있는 스크롤이 동작하지 않습니다** — 시간 선택 휠이 안 넘어갔습니다
          (2026-09-30 폰에서 확인).
        */}
        {onDismiss ? <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} /> : null}
        <View style={styles.card}>
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
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
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
}));
