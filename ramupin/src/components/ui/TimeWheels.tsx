import { useEffect, useRef } from 'react';
import { FlatList, View } from 'react-native';

import { AppText } from './AppText';
import { makeStyles, useColors } from '@/theme';

/**
 * 피그마 "시간 설정" 휠: 시 / 분(5분 단위) / 오전·오후.
 *
 * 네이티브 시간 선택기를 쓰지 않는 이유: 모듈을 더하면 네이티브 재빌드가 필요하고,
 * 기기마다 생김새가 달라 피그마와 어긋납니다.
 *
 * 예약 메시지와 방해 금지 시간이 같은 휠을 씁니다. 한쪽만 고치면 어긋나므로 한곳에 둡니다.
 */

const ROW = 40;
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
/** 분은 5분 단위입니다. 1분 단위는 휠이 60칸이라 고르기 어렵습니다 */
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

interface TimeWheelsProps {
  hours24: number;
  minutes: number;
  onChange: (hours24: number, minutes: number) => void;
}

export function TimeWheels({ hours24, minutes, onChange }: TimeWheelsProps) {
  const styles = useStyles();
  const pm = hours24 >= 12;
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const to24 = (h12: number, isPm: boolean) => (h12 % 12) + (isPm ? 12 : 0);
  const rounded = Math.round(minutes / 5) * 5;
  const minuteRounded = rounded === 60 ? 55 : rounded;

  return (
    <View style={styles.wheels}>
      <View style={styles.wheelHighlight} pointerEvents="none" />
      <Wheel values={HOURS} value={hour12} format={(v) => String(v).padStart(2, '0')} onChange={(h) => onChange(to24(h, pm), minuteRounded)} />
      <AppText variant="title4">:</AppText>
      <Wheel values={MINUTES} value={minuteRounded} format={(v) => String(v).padStart(2, '0')} onChange={(m) => onChange(hours24, m)} />
      <Wheel values={[0, 1]} value={pm ? 1 : 0} format={(v) => (v ? 'PM' : 'AM')} onChange={(v) => onChange(to24(hour12, v === 1), minuteRounded)} />
    </View>
  );
}

function Wheel({ values, value, format, onChange }: { values: number[]; value: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const styles = useStyles();
  const colors = useColors();
  const ref = useRef<FlatList<number>>(null);
  const index = Math.max(0, values.indexOf(value));

  useEffect(() => {
    ref.current?.scrollToOffset({ offset: index * ROW, animated: false });
    // 처음 한 번만 위치 맞춤 (이후는 사용자가 스크롤)
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <FlatList
      ref={ref}
      data={values}
      keyExtractor={(v) => String(v)}
      style={styles.wheel}
      showsVerticalScrollIndicator={false}
      snapToInterval={ROW}
      decelerationRate="fast"
      nestedScrollEnabled
      contentContainerStyle={{ paddingVertical: ROW }}
      getItemLayout={(_, i) => ({ length: ROW, offset: ROW * i, index: i })}
      onMomentumScrollEnd={(e) => {
        const i = Math.min(values.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ROW)));
        if (values[i] !== value) onChange(values[i]);
      }}
      renderItem={({ item }) => (
        <View style={styles.wheelItem}>
          <AppText variant={item === value ? 'title4' : 'body1'} color={item === value ? colors.textStrong : colors.textMuted}>
            {format(item)}
          </AppText>
        </View>
      )}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  wheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, height: ROW * 3 },
  // 가운데 칸을 위아래 선으로 표시해 지금 고른 값이 어디인지 보이게 합니다
  wheelHighlight: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: ROW,
    height: ROW,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.surfaceStrong,
  },
  wheel: { height: ROW * 3, flexGrow: 0, width: 56 },
  wheelItem: { height: ROW, alignItems: 'center', justifyContent: 'center' },
}));
