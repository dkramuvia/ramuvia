import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button } from '@/components/ui';
import { AppMapView } from '@/features/map/AppMapView';
import { colors, radius } from '@/theme';
import type { ChatMessage } from '@/types/models';
import { formatRelativeTime } from '@/utils/time';

interface MessageItemProps {
  message: ChatMessage;
  isMine: boolean;
  sender?: { nickname: string; avatarUrl?: string };
  /** 같은 사람이 연달아 보낸 첫 메시지면 아바타·이름 표시 */
  showSender: boolean;
  /** 연달아 보낸 마지막 메시지면 시간 표시 */
  showTime: boolean;
}

/** 피그마: 채팅방 말풍선 (283:34973), 위치 공유 카드 (283:35894) */
export function MessageItem({ message, isMine, sender, showSender, showTime }: MessageItemProps) {
  if (message.type === 'system') {
    return (
      <View style={styles.systemRow}>
        <View style={styles.systemLine} />
        <AppText variant="body2" color="#8593A8">
          {message.text}
        </AppText>
        <View style={styles.systemLine} />
      </View>
    );
  }

  const body = message.type === 'location' && message.place ? <LocationCard message={message} /> : <TextBubble message={message} isMine={isMine} />;

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowOther, message.pending && styles.pending]}>
      {!isMine ? (
        <View style={styles.senderCol}>
          {showSender ? (
            <>
              <Avatar name={sender?.nickname ?? ''} imageUrl={sender?.avatarUrl} size={32} />
              <AppText variant="micro" numberOfLines={1}>
                {sender?.nickname}
              </AppText>
            </>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.content, isMine && styles.contentMine]}>
        {body}
        {showTime ? (
          <AppText variant="caption" color="#8593A8">
            {formatRelativeTime(message.createdAt)}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function TextBubble({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  return (
    <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
      <AppText variant="label1" color={isMine ? colors.white : '#171717'}>
        {message.text}
      </AppText>
    </View>
  );
}

function LocationCard({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const place = message.place!;
  return (
    <View style={styles.locationCard}>
      <View style={styles.mapPreview} pointerEvents="none">
        <AppMapView initialCenter={place} interactive={false} initialDelta={0.004} style={StyleSheet.absoluteFill} />
        <View style={styles.pinHalo}>
          <View style={styles.pinCircle}>
            <Ionicons name="location" size={30} color={colors.brown} />
          </View>
        </View>
      </View>
      <View style={styles.locationBody}>
        <View style={styles.locationTexts}>
          <AppText variant="title3">{t('chat.locationShared')}</AppText>
          <AppText variant="label1">
            {place.placeName ? `${place.placeName}\n` : ''}
            {place.address}
          </AppText>
        </View>
        <Button
          label={t('chat.viewOnMap')}
          size="sm"
          onPress={() =>
            router.push({
              pathname: '/place-picker',
              params: { mode: 'view', lat: String(place.latitude), lng: String(place.longitude) },
            })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 20 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  pending: { opacity: 0.6 },
  senderCol: { width: 58, alignItems: 'center', gap: 4 },
  content: { maxWidth: '72%', gap: 8 },
  contentMine: { alignItems: 'flex-end' },
  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md },
  bubbleMine: { backgroundColor: '#171717' },
  bubbleOther: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderLight },
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  systemLine: { flex: 1, height: 1, backgroundColor: 'rgba(133,147,168,0.25)' },
  locationCard: { width: 286, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.popup },
  mapPreview: { height: 140, alignItems: 'center', justifyContent: 'center' },
  pinHalo: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(171,160,156,0.5)', alignItems: 'center', justifyContent: 'center' },
  pinCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: 'rgba(124,109,103,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationBody: { paddingTop: 12, paddingHorizontal: 20, paddingBottom: 20, gap: 20 },
  locationTexts: { gap: 8 },
});
