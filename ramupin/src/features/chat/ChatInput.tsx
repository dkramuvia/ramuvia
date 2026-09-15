import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, typography } from '@/theme';

interface ChatInputProps {
  onSend: (text: string) => void;
  onSharePlace: () => void;
  onShareCurrentLocation: () => void;
}

/** 피그마: 채팅 입력창 + 왼쪽 + 버튼의 공유 메뉴 (283:35631) */
export function ChatInput({ onSend, onSharePlace, onShareCurrentLocation }: ChatInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const pick = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <View style={styles.wrap}>
      {menuOpen ? (
        <View style={styles.menu}>
          <MenuAction icon="location" label={t('chat.sharePlace')} onPress={() => pick(onSharePlace)} />
          <MenuAction icon="locate" label={t('chat.shareCurrent')} onPress={() => pick(onShareCurrentLocation)} />
        </View>
      ) : null}
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.attach')}
          onPress={() => setMenuOpen((v) => !v)}
          style={styles.iconButton}
        >
          <Ionicons name={menuOpen ? 'close' : 'add'} size={28} color={colors.textStrong} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('chat.placeholder')}
          placeholderTextColor="#8593A8"
          multiline
          style={styles.input}
          onFocus={() => setMenuOpen(false)}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={t('chat.send')} onPress={send} disabled={!text.trim()} style={styles.iconButton}>
          <Ionicons name="send" size={26} color={text.trim() ? colors.brownLight : '#C9C2BF'} />
        </Pressable>
      </View>
    </View>
  );
}

function MenuAction({ icon, label, onPress }: { icon: 'location' | 'locate'; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuAction}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={24} color={colors.white} />
      </View>
      <AppText variant="label2">{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8 },
  menu: {
    position: 'absolute',
    left: 20,
    bottom: 78,
    flexDirection: 'row',
    gap: 24,
    paddingVertical: 20,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    elevation: 4,
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  menuAction: { alignItems: 'center', gap: 10 },
  menuIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  bar: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: colors.surfaceStrong,
    backgroundColor: '#F6FBFF',
  },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, ...typography.body1, maxHeight: 120, color: colors.text, paddingVertical: 8 },
});
