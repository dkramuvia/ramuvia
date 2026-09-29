import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, View } from 'react-native';

import { characterAvatars } from './avatars';
import { layout, makeStyles, useColors } from '@/theme';
import type { Gender } from '@/types/models';

/** 피그마 값 (402 폭 기준): 카드 164x186, 사이 간격 14 */
const CARD_WIDTH = 164;
const CARD_HEIGHT = 186;
const CARD_GAP = 14;
const STRIDE = CARD_WIDTH + CARD_GAP;

interface CharacterPickerProps {
  gender: Gender;
  /** 지금 고른 캐릭터 키 (`avatar:boy-01`) */
  value?: string;
  onChange: (key: string) => void;
}

/**
 * 성별에 따른 캐릭터를 좌우로 넘겨 고릅니다 (피그마 가입 839:41835 / 프로필 편집 840:66394).
 *
 * **가운데 있는 것이 고른 것입니다.** 체크 표시나 테두리가 따로 없어서, 스크롤이 멈추면
 * 가운데 카드를 고른 것으로 봅니다. 옆 카드를 눌러도 그 카드가 가운데로 옵니다.
 *
 * 두 화면이 똑같이 생겨서 한 컴포넌트로 둡니다. 한쪽만 고치면 어긋납니다.
 */
export function CharacterPicker({ gender, value, onChange }: CharacterPickerProps) {
  const styles = useStyles();
  const colors = useColors();
  /**
   * 목록의 실제 폭. 화면 폭을 그냥 쓰면 안 됩니다 — 이 컴포넌트는 좌우 여백이 있는
   * 화면 안에 들어가서, 화면 폭으로 계산하면 카드가 여백만큼 오른쪽으로 밀립니다
   * (폰에서 확인).
   */
  const [listWidth, setListWidth] = useState(0);
  const listRef = useRef<FlatList>(null);

  const avatars = useMemo(() => characterAvatars(gender), [gender]);
  const selectedIndex = Math.max(0, avatars.findIndex((a) => a.key === value));
  const [index, setIndex] = useState(selectedIndex);

  // 화면을 열었을 때 이미 고른 캐릭터가 가운데 오도록
  useEffect(() => {
    if (!listWidth || selectedIndex <= 0) return;
    listRef.current?.scrollToOffset({ offset: selectedIndex * STRIDE, animated: false });
    setIndex(selectedIndex);
    // 폭을 처음 재고 난 뒤 한 번만 하면 됩니다
  }, [listWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  // 성별을 바꾸면 캐릭터 목록이 통째로 바뀌므로 첫 번째로 돌아갑니다
  useEffect(() => {
    setIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    onChange(avatars[0].key);
    // 성별이 바뀔 때만 돕니다. onChange 는 화면이 그려질 때마다 새로 만들어지는 함수라
    // 여기 넣으면 성별이 그대로인데도 계속 첫 번째로 되돌아갑니다
  }, [gender]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), avatars.length - 1);
    setIndex(clamped);
    onChange(avatars[clamped].key);
    listRef.current?.scrollToOffset({ offset: clamped * STRIDE, animated: true });
  };

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={avatars}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={STRIDE}
        decelerationRate="fast"
        keyExtractor={(a) => a.key}
        // 가운데 카드가 화면 한가운데 오도록 양옆에 여백을 줍니다
        onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
        contentContainerStyle={{ paddingHorizontal: Math.max(0, (listWidth - CARD_WIDTH) / 2), gap: CARD_GAP }}
        getItemLayout={(_, i) => ({ length: STRIDE, offset: i * STRIDE, index: i })}
        onMomentumScrollEnd={(e) => {
          const next = Math.round(e.nativeEvent.contentOffset.x / STRIDE);
          if (next === index) return;
          setIndex(next);
          onChange(avatars[next]?.key ?? avatars[0].key);
        }}
        renderItem={({ item, index: i }) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: i === index }}
            accessibilityLabel={item.key}
            onPress={() => moveTo(i)}
          >
            <Image source={item.source} style={styles.card} />
          </Pressable>
        )}
      />

      {/* 가운데 카드 위에 겹쳐 놓는 좌우 화살표 (피그마). 카드를 가리지 않게 반투명 */}
      <View style={styles.arrows} pointerEvents="box-none">
        <Pressable accessibilityRole="button" accessibilityLabel="이전 캐릭터" hitSlop={12} onPress={() => moveTo(index - 1)} style={styles.arrow}>
          <Ionicons name="chevron-back" size={16} color={colors.white} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 캐릭터" hitSlop={12} onPress={() => moveTo(index + 1)} style={styles.arrow}>
          <Ionicons name="chevron-forward" size={16} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  // 피그마는 옆 카드가 화면 끝까지 보입니다. 화면의 좌우 여백을 상쇄합니다
  wrap: { height: CARD_HEIGHT, justifyContent: 'center', marginHorizontal: -layout.screenPadding },
  card: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 16 },
  arrows: {
    position: 'absolute',
    alignSelf: 'center',
    width: CARD_WIDTH - 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  arrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
