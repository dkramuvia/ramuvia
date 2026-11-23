import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { sosApi } from '@/api/endpoints/sos';
import { showToast } from '@/utils/toast';

/** 이 시간 안에 소리가 불러와지지 않으면 실패로 봅니다 (주소 만료·네트워크) */
const LOAD_TIMEOUT_MS = 12_000;

export type SosVoiceState = 'idle' | 'loading' | 'playing' | 'paused';

/**
 * SOS 녹음 듣기 (받은 사람 팝업 · SOS 기록이 같이 씁니다).
 *
 * 대표 리포트 4차: "녹음 듣기"를 눌러도 화면이 그대로였습니다. 재생 명령만 내리고 실제로 소리가 불러와졌는지,
 * 실패했는지를 보지 않았습니다 → 불러오는 중 / 재생 중(진행 막대) / 실패·녹음 없음 안내를 모두 보여 줍니다.
 * 무음 모드여도 들리게 합니다 — 긴급 상황에 소리가 안 나면 안 됩니다.
 * 주소는 잠깐 뒤 만료되므로 누를 때 받습니다.
 */
export function useSosVoice(sosId: string | undefined) {
  const { t } = useTranslation();
  const player = useRef<AudioPlayer | null>(null);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<SosVoiceState>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const clearLoadTimer = () => {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = null;
  };

  const release = () => {
    clearLoadTimer();
    player.current?.remove();
    player.current = null;
  };

  useEffect(
    () => () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
      player.current?.remove();
      player.current = null;
    },
    [],
  );

  const fail = (message: string) => {
    release();
    setState('idle');
    setPosition(0);
    showToast(message);
  };

  const toggle = async () => {
    if (!sosId) return;
    if (state === 'playing' && player.current) {
      player.current.pause();
      setState('paused');
      return;
    }
    if (state === 'paused' && player.current) {
      player.current.play();
      setState('playing');
      return;
    }
    if (state === 'loading') return;
    setState('loading');
    try {
      const url = await sosApi.audioUrl(sosId);
      if (!url) {
        fail(t('alerts.voiceMissing'));
        return;
      }
      // SOS 녹음 뒤라 녹음 모드가 켜져 있으면 수화기(작은 스피커)로 나올 수 있어 끕니다
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const created = createAudioPlayer(url, { updateInterval: 250 });
      player.current = created;
      created.addListener('playbackStatusUpdate', (status) => {
        if (status.isLoaded) clearLoadTimer();
        if (status.duration) setDuration(status.duration);
        setPosition(status.currentTime ?? 0);
        if (status.didJustFinish) {
          setState('idle');
          setPosition(0);
          void created.seekTo(0);
        } else if (status.playing) {
          setState('playing');
        }
      });
      loadTimer.current = setTimeout(() => {
        if (player.current === created && !created.isLoaded) fail(t('alerts.voiceFailed'));
      }, LOAD_TIMEOUT_MS);
      created.play();
    } catch {
      fail(t('alerts.voiceFailed'));
    }
  };

  return { state, position, duration, progress: duration > 0 ? Math.min(1, position / duration) : 0, toggle };
}

/** 0:07 같은 짧은 시간 */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
