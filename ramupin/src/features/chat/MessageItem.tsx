import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button } from '@/components/ui';
import { AppMapView } from '@/features/map/AppMapView';
import { makeStyles, radius, useColors } from '@/theme';
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
  /** 길게 누르기 (상대 메시지 신고, 보완 4.11) */
  onLongPress?: () => void;
  /** 1:1 에서 상대가 읽은 내 메시지 (보완 4.18) */
  read?: boolean;
  /** 전송 실패한 내 메시지 다시 보내기 */
  onRetry?: () => void;
}

/** 피그마: 채팅방 말풍선 (283:34973), 위치 공유 카드 (283:35894) */
export function MessageItem({ message, isMine, sender, showSender, showTime, onLongPress, read, onRetry }: MessageItemProps) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
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

  const body =
    message.type === 'location' && message.place ? (
      <LocationCard message={message} />
    ) : message.type === 'photo' ? (
      <PhotoBubble message={message} />
    ) : (
      <TextBubble message={message} isMine={isMine} />
    );

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
        {onLongPress ? (
          <Pressable onLongPress={onLongPress} delayLongPress={500}>
            {body}
          </Pressable>
        ) : (
          body
        )}
        {message.failed ? (
          // 전송 실패: 빨간 ! 와 다시 보내기 (보완 4.18)
          <Pressable accessibilityRole="button" onPress={onRetry} disabled={!onRetry} style={styles.failedRow} hitSlop={8}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <AppText variant="caption" color={colors.danger}>
              {t(onRetry ? 'chat.failedRetry' : 'chat.failed')}
            </AppText>
          </Pressable>
        ) : isMine && (read || showTime) ? (
          <AppText variant="caption" color="#8593A8">
            {read ? `${t('chat.read')} · ` : ''}
            {formatRelativeTime(message.createdAt)}
          </AppText>
        ) : showTime ? (
          <AppText variant="caption" color="#8593A8">
            {formatRelativeTime(message.createdAt)}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/** 사진 메시지 (보완 4.18). 위치를 포함해 보냈으면 "장소 · 위치 포함" 라벨 */
function PhotoBubble({ message }: { message: ChatMessage }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const photo = message.photo;
  const ratio = photo?.width && photo?.height ? photo.width / photo.height : 4 / 3;
  const width = 200;
  return (
    <View style={styles.photoWrap}>
      {photo?.uri && !broken ? (
        <Image source={{ uri: photo.uri }} style={{ width, height: Math.min(320, width / ratio), borderRadius: radius.md }} onError={() => setBroken(true)} />
      ) : (
        <View style={[styles.photoMissing, { width, height: width * 0.75 }]}>
          <AppText variant="caption" color={colors.textMuted}>
            {t('chat.photoUnavailable')}
          </AppText>
        </View>
      )}
      {message.place ? (
        <View style={styles.photoLabel}>
          <AppText variant="micro" color={colors.white}>
            {message.place.placeName ?? message.place.address} · {t('chat.withLocation')}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function TextBubble({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
      <AppText variant="label1" color={isMine ? colors.white : colors.text}>
        {message.text}
      </AppText>
    </View>
  );
}

function LocationCard({ message }: { message: ChatMessage }) {
  const styles = useStyles();
  const colors = useColors();
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

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 20 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  pending: { opacity: 0.6 },
  senderCol: { width: 58, alignItems: 'center', gap: 4 },
  content: { maxWidth: '72%', gap: 8 },
  contentMine: { alignItems: 'flex-end' },
  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md },
  bubbleMine: { backgroundColor: colors.chatBubbleMine },
  bubbleOther: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderLight },
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
  failedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  photoWrap: { borderRadius: radius.md, overflow: 'hidden' },
  photoMissing: { borderRadius: radius.md, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  photoLabel: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: 'rgba(0,0,0,0.55)' },
  locationTexts: { gap: 8 },
}));
