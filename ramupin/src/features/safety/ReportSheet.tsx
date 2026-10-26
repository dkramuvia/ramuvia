import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';

import { reportsApi, type ReportReason, type ReportTargetKind } from '@/api/endpoints/reports';
import { AppText, Button, Popup } from '@/components/ui';
import { makeStyles, radius, useColors, withAlpha } from '@/theme';
import { showToast } from '@/utils/toast';

const REASONS: ReportReason[] = ['spam', 'harassment', 'tracking', 'inappropriate', 'other'];

export interface ReportTarget {
  userId: string;
  nickname: string;
  kind: ReportTargetKind;
  /** 메시지·사진 id */
  targetId?: string;
  /** 신고 대상 미리보기 (메시지 글) */
  preview?: string;
}

/**
 * 신고 · 차단 하단 시트 (보완 화면 설계 4.11, 피그마 v2.4 1015:51505).
 * 채팅 메시지 길게 누르기 · 갤러리 사진 더보기 · 친구 프로필 · 친구 요청의 [차단하고 신고하기] 에서 엽니다.
 *
 * - 위치 공유 앱이라 "원치 않는 위치 추적" 사유를 따로 둡니다. 고르면 신고 뒤 안전 안내를 보여 줍니다
 * - "○○ 차단하기" 는 기본 체크. 차단하면 바로 위치 공유와 대화가 끊기고 상대에게 알리지 않습니다
 */
export function ReportSheet({ target, onClose, onDone }: { target: ReportTarget | null; onClose: () => void; onDone?: (blocked: boolean) => void }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [block, setBlock] = useState(true);
  const [sending, setSending] = useState(false);
  const [guide, setGuide] = useState(false);

  const close = () => {
    setReason('spam');
    setBlock(true);
    onClose();
  };

  const submit = async () => {
    if (!target) return;
    setSending(true);
    try {
      await reportsApi.report({ targetUserId: target.userId, targetKind: target.kind, targetId: target.targetId ?? null, reason, block });
      // 차단했으면 친구·대화 목록에서 바로 사라져야 합니다
      if (block) void queryClient.invalidateQueries();
      showToast(t('report.done'));
      onDone?.(block);
      if (reason === 'tracking') setGuide(true);
      close();
    } catch {
      showToast(t('common.requestFailed'));
    } finally {
      setSending(false);
    }
  };

  const title = target?.kind === 'message' ? t('report.titleMessage') : target?.kind === 'photo' ? t('report.titlePhoto') : t('report.titleProfile', { name: target?.nickname });

  return (
    <>
      <Modal visible={!!target} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <AppText variant="title4">{title}</AppText>
            {target?.preview ? (
              <View style={styles.preview}>
                <AppText variant="label1" color={colors.textSecondary} numberOfLines={3}>
                  &quot;{target.preview}&quot;
                </AppText>
              </View>
            ) : null}

            <View>
              {REASONS.map((r) => (
                <Pressable key={r} accessibilityRole="radio" accessibilityState={{ checked: reason === r }} onPress={() => setReason(r)} style={styles.reason}>
                  <Ionicons name={reason === r ? 'radio-button-on' : 'radio-button-off'} size={22} color={reason === r ? colors.danger : colors.textMuted} />
                  <AppText variant="body2">{t(`report.reason.${r}`)}</AppText>
                </Pressable>
              ))}
            </View>

            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: block }} onPress={() => setBlock(!block)} style={styles.blockBox}>
              <Ionicons name={block ? 'checkbox' : 'square-outline'} size={22} color={block ? colors.danger : colors.textMuted} />
              <View style={styles.flex}>
                <AppText variant="body2Bold">{t('report.block', { name: target?.nickname })}</AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  {t('report.blockDesc')}
                </AppText>
              </View>
            </Pressable>

            <AppText variant="caption" color={colors.textTertiary}>
              {t('report.note')}
            </AppText>

            <View style={styles.buttons}>
              <Button label={t('common.cancel')} variant="neutral" onPress={close} style={styles.flex} />
              <Button label={t('report.submit')} variant="danger" disabled={sending} onPress={() => void submit()} style={styles.flex} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* "원치 않는 위치 추적" 신고 뒤 안전 가이드 (4.11 업무 규칙) */}
      <Popup visible={guide} title={t('report.guideTitle')} message={t('report.guideMessage')} confirmLabel={t('common.confirm')} onConfirm={() => setGuide(false)} />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { gap: 12, padding: 20, paddingBottom: 32, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.background },
  preview: { padding: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  blockBox: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: withAlpha(colors.danger, 0.08) },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
}));
