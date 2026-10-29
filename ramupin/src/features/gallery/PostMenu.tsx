import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';

import { AppText, Popup } from '@/components/ui';
import { ReportSheet, type ReportTarget } from '@/features/safety/ReportSheet';
import { useIsMe } from '@/stores/authStore';
import { makeStyles, useColors } from '@/theme';
import type { GalleryPost } from '@/types/models';
import { showToast } from '@/utils/toast';

import { useRemovePost } from './queries';
import { saveMediaToDevice } from './saveMedia';

/**
 * 게시물 더보기 (대표 리포트 43). 저장은 누구나, 내 게시물은 삭제, 남의 게시물은 신고 (보완 4.11).
 * 갤러리 탭과 게시물 보기 화면이 같이 씁니다
 */
export function PostMenu({ post, onClose, onRemoved }: { post: GalleryPost | null; onClose: () => void; onRemoved?: (blocked?: boolean) => void }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const isMe = useIsMe();
  const remove = useRemovePost();
  const [confirming, setConfirming] = useState<GalleryPost | null>(null);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const [saving, setSaving] = useState(false);

  const mine = post ? isMe(post.author.id) : false;

  const save = async (target: GalleryPost) => {
    onClose();
    setSaving(true);
    try {
      const ok = await saveMediaToDevice(target.media);
      showToast(ok ? t('gallery.saved') : t('gallery.saveDenied'));
    } catch (error) {
      console.warn('[gallery] 저장 실패', String(error));
      showToast(t('gallery.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const rows: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; onPress: () => void }[] = post
    ? [
        { key: 'save', icon: 'download-outline', label: t('common.save'), onPress: () => void save(post) },
        mine
          ? {
              key: 'delete',
              icon: 'trash-outline',
              label: t('common.delete'),
              danger: true,
              onPress: () => {
                onClose();
                setConfirming(post);
              },
            }
          : {
              key: 'report',
              icon: 'alert-circle-outline',
              label: t('report.submit'),
              danger: true,
              onPress: () => {
                onClose();
                setReporting({ userId: post.author.id, nickname: post.author.nickname, kind: 'photo', targetId: post.id });
              },
            },
      ]
    : [];

  return (
    <>
      <Modal visible={!!post} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            {rows.map((row) => (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                disabled={row.key === 'save' && saving}
                onPress={row.onPress}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Ionicons name={row.icon} size={22} color={row.danger ? colors.danger : colors.text} />
                <AppText variant="body1" color={row.danger ? colors.danger : colors.text}>
                  {row.label}
                </AppText>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.row, styles.cancel, pressed && styles.pressed]}>
              <AppText variant="body1" color={colors.textSecondary}>
                {t('common.cancel')}
              </AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Popup
        visible={!!confirming}
        title={t('gallery.deleteTitle')}
        message={t('gallery.deleteMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const target = confirming;
          setConfirming(null);
          if (!target) return;
          remove.mutate(target.id, {
            onSuccess: () => {
              showToast(t('gallery.deleted'));
              onRemoved?.();
            },
            onError: () => showToast(t('common.requestFailed')),
          });
        }}
      />

      <ReportSheet target={reporting} onClose={() => setReporting(null)} onDone={(blocked) => blocked && onRemoved?.(true)} />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.background,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 12, borderRadius: 10 },
  cancel: { justifyContent: 'center', marginTop: 4 },
  pressed: { backgroundColor: colors.surfaceStrong },
}));
