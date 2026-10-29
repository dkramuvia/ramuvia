import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, BatteryBadge, Card, CheckCircle, ShareLevelIcon } from '@/components/ui';
import { useColors } from '@/theme';
import type { LocationShareLevel } from '@/types/models';
import { formatRelativeTime } from '@/utils/time';

export interface PersonSummary {
  id: string;
  nickname: string;
  avatarUrl?: string;
  isOnline?: boolean;
  batteryLevel?: number;
  myShareLevel?: LocationShareLevel;
  /** 마지막으로 위치를 받은 때. 연결이 끊긴 친구를 구분하는 데 씁니다 */
  location?: { updatedAt: string };
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
  /** 오른쪽 끝에 넣을 버튼 (예: 1:1 대화) */
  action?: ReactNode;
}

/**
 * 친구 리스트 한 줄 (피그마 사람들 / 지도 친구 리스트 / 그룹 멤버 / 그룹 초대).
 * 기획: 공유 아이콘은 "그 친구에 대한 나의 공유 상태", 배터리는 "친구의 현재 배터리".
 */
export function FriendRow({ friend, onPress, tag, selected, checkColor, action }: FriendRowProps) {
  const colors = useColors();
  const selectable = selected !== undefined;
  // 5분 넘게 소식이 없는 친구는 배터리가 지금 값이 아닙니다. 마지막으로 받은 때를 보여 주고 흐리게 (대표 리포트 80)
  const stale = !selectable && friend.isOnline === false && !!friend.location?.updatedAt;
  return (
    <Card onPress={onPress} style={[styles.card, selectable && styles.cardSelectable]}>
      <View style={styles.left}>
        <Avatar name={friend.nickname} imageUrl={friend.avatarUrl} online={selectable ? undefined : friend.isOnline} />
        <View style={styles.name}>
          <AppText variant="listTitle" numberOfLines={1}>
            {friend.nickname}
          </AppText>
          {stale ? (
            <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
              {formatRelativeTime(friend.location!.updatedAt)}
            </AppText>
          ) : null}
        </View>
        {tag}
      </View>
      {selectable ? (
        <CheckCircle checked={selected} color={checkColor} />
      ) : (
        <View style={[styles.right, stale && styles.stale]}>
          {friend.myShareLevel ? <ShareLevelIcon level={friend.myShareLevel} /> : null}
          {friend.batteryLevel != null ? <BatteryBadge level={friend.batteryLevel} /> : null}
          {action}
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
  stale: { opacity: 0.45 },
});
