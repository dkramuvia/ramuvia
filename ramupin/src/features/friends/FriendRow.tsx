import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, BatteryBadge, Card, CheckCircle, ShareLevelIcon } from '@/components/ui';
import type { LocationShareLevel } from '@/types/models';

export interface PersonSummary {
  id: string;
  nickname: string;
  avatarUrl?: string;
  isOnline?: boolean;
  batteryLevel?: number;
  myShareLevel?: LocationShareLevel;
}

interface FriendRowProps {
  friend: PersonSummary;
  onPress?: () => void;
  /** 이름 옆 라벨 (예: 방장) */
  tag?: ReactNode;
  /** 지정하면 오른쪽에 공유/배터리 대신 선택 체크 표시 (그룹 초대) */
  selected?: boolean;
  /** 선택 체크 색 (SOS 수신인 지정은 빨강) */
  checkColor?: string;
}

/**
 * 친구 리스트 한 줄 (피그마 사람들 / 지도 친구 리스트 / 그룹 멤버 / 그룹 초대).
 * 기획: 공유 아이콘은 "그 친구에 대한 나의 공유 상태", 배터리는 "친구의 현재 배터리".
 */
export function FriendRow({ friend, onPress, tag, selected, checkColor }: FriendRowProps) {
  const selectable = selected !== undefined;
  return (
    <Card onPress={onPress} style={[styles.card, selectable && styles.cardSelectable]}>
      <View style={styles.left}>
        <Avatar name={friend.nickname} imageUrl={friend.avatarUrl} online={selectable ? undefined : friend.isOnline} />
        <AppText variant="listTitle" numberOfLines={1} style={styles.name}>
          {friend.nickname}
        </AppText>
        {tag}
      </View>
      {selectable ? (
        <CheckCircle checked={selected} color={checkColor} />
      ) : (
        <View style={styles.right}>
          {friend.myShareLevel ? <ShareLevelIcon level={friend.myShareLevel} /> : null}
          {friend.batteryLevel != null ? <BatteryBadge level={friend.batteryLevel} /> : null}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 16,
  },
  cardSelectable: { height: 52, paddingVertical: 6, paddingRight: 12 },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
