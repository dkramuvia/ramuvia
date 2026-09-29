import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Switch, TimeWheels } from '@/components/ui';
import { makeStyles, radius, typography, useColors } from '@/theme';
import type { ScheduledMessage } from '@/types/models';

type Draft = Omit<ScheduledMessage, 'id'> & { id?: string };

interface ScheduleEditorProps {
  visible: boolean;
  initial: Draft | null;
  onCancel: () => void;
  onSave: (draft: Draft) => void;
}

/**
 * 피그마: 예약 메시지 추가/수정 팝업 (283:29640)
 * 날짜·시간 선택기는 네이티브 모듈 없이 JS 로 구성 (재빌드 불필요)
 * WBS 4.2·8.2: TTS 로 읽어주기, 미리 듣기
 */
export function ScheduleEditor({ visible, initial, onCancel, onSave }: ScheduleEditorProps) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(new Date());
  const [tts, setTts] = useState(true);

  useEffect(() => {
    if (!initial) return;
    setTitle(initial.title);
    setBody(initial.body);
    setDate(new Date(initial.scheduledAt));
    setTts(initial.tts);
  }, [initial]);

  const setTime = (hours24: number, minutes: number) => {
    const next = new Date(date);
    next.setHours(hours24, minutes, 0, 0);
    setDate(next);
  };

  const canSave = title.trim() && body.trim() && date.getTime() > Date.now();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Field label={t('scheduled.title')}>
              <TextInput value={title} onChangeText={setTitle} maxLength={20} style={styles.input} placeholderTextColor={colors.textPlaceholder} />
            </Field>
            <Field label={t('scheduled.body')}>
              <TextInput
                value={body}
                onChangeText={setBody}
                maxLength={200}
                multiline
                textAlignVertical="top"
                style={[styles.input, styles.multiline]}
                placeholderTextColor={colors.textPlaceholder}
              />
            </Field>

            <Calendar value={date} onChange={(d) => {
              const next = new Date(d);
              next.setHours(date.getHours(), date.getMinutes(), 0, 0);
              setDate(next);
            }} />

            <AppText variant="label1Bold">{t('scheduled.time')}</AppText>
            <TimeWheels hours24={date.getHours()} minutes={date.getMinutes()} onChange={setTime} />

            <View style={styles.ttsRow}>
              <AppText variant="body2Bold" style={styles.flex}>
                {t('scheduled.tts')}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('scheduled.preview')}
                disabled={!body.trim()}
                onPress={() => Speech.speak(`${title}. ${body}`, { language: 'ko-KR' })}
                style={styles.preview}
              >
                <Ionicons name="volume-high" size={18} color={colors.primary} />
                <AppText variant="label2" color={colors.primary}>
                  {t('scheduled.preview')}
                </AppText>
              </Pressable>
              <Switch value={tts} onValueChange={setTts} accessibilityLabel={t('scheduled.tts')} />
            </View>
          </ScrollView>

          <View style={styles.buttons}>
            <Button label={t('scheduled.cancel')} variant="white" onPress={onCancel} style={[styles.flex, styles.cancel]} />
            <Button
              label={t('scheduled.save')}
              disabled={!canSave}
              onPress={() =>
                initial && onSave({ ...initial, title: title.trim(), body: body.trim(), scheduledAt: date.toISOString(), tts })
              }
              style={styles.flex}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <AppText variant="label1Bold">{label}</AppText>
      {children}
    </View>
  );
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function Calendar({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  const styles = useStyles();
  const colors = useColors();
  const [month, setMonth] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells = useMemo(() => {
    const first = new Date(month);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const shift = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <View style={styles.calendar}>
      <View style={styles.calendarHeader}>
        <Pressable accessibilityRole="button" onPress={() => shift(-1)} style={styles.monthButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={18} color={colors.text} />
        </Pressable>
        <AppText variant="body1Bold">{month.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</AppText>
        <Pressable accessibilityRole="button" onPress={() => shift(1)} style={styles.monthButton} hitSlop={8}>
          <Ionicons name="arrow-forward" size={18} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEK.map((w) => (
          <AppText key={w} variant="label2" color={colors.textTertiary} align="center" style={styles.cell}>
            {w}
          </AppText>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const past = d < today;
          const selected = d.toDateString() === value.toDateString();
          return (
            <Pressable
              key={d.toISOString()}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: past }}
              disabled={past}
              onPress={() => onChange(d)}
              style={[styles.cell, styles.day, selected && styles.daySelected]}
            >
              <AppText variant="label1" color={selected ? colors.white : past || !inMonth ? colors.textMuted : colors.textStrong}>
                {d.getDate()}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.popup },
  body: { padding: 20, gap: 16 },
  flex: { flex: 1 },
  field: { gap: 8 },
  input: {
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...typography.body2,
    color: colors.text,
  },
  multiline: { height: 96, paddingTop: 12 },
  calendar: { gap: 8 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%` },
  day: { height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.xs },
  daySelected: { backgroundColor: colors.primaryLight },
  ttsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  buttons: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 },
  cancel: { borderWidth: 1, borderColor: colors.border },
}));
