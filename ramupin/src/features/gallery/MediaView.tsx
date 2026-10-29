import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import type { MediaAsset } from '@/types/models';

interface MediaViewProps {
  media: MediaAsset;
  /** 화면에 보이는 장일 때만 동영상을 재생합니다 */
  active: boolean;
  fit?: 'cover' | 'contain';
  /** 재생·멈춤 버튼 (크게 보기). 끄면 소리 없이 반복 재생 (게시물 넘겨 보기) */
  controls?: boolean;
}

/**
 * 사진 한 장 또는 동영상 하나.
 * 예전에는 동영상도 <Image> 로 그려 검은 화면만 보였습니다 (대표 리포트 11)
 */
export function MediaView({ media, active, fit = 'cover', controls = false }: MediaViewProps) {
  if (media.type === 'video') return <VideoItem uri={media.uri} active={active} fit={fit} controls={controls} />;
  return <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} resizeMode={fit} />;
}

function VideoItem({ uri, active, fit, controls }: { uri: string; active: boolean; fit: 'cover' | 'contain'; controls: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    // 넘겨 보다가 갑자기 소리가 나지 않게, 크게 볼 때만 소리를 켭니다
    p.muted = !controls;
  });

  // 다른 탭·화면으로 가면 멈춥니다 (탭 화면은 내려가지 않고 남아 있어서)
  const focused = useIsFocused();
  const playing = active && focused;
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.video]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={fit}
        nativeControls={controls}
        // 좌우로 넘기는 목록 안에서는 surfaceView 가 제자리에 남아 겹쳐 보입니다 (안드로이드)
        surfaceType="textureView"
      />
    </View>
  );
}

/** 격자 썸네일 자리의 동영상 표시. 원격 동영상은 <Image> 로 첫 장면을 그릴 수 없어 재생 아이콘으로 대신합니다 */
export function VideoPlaceholder({ size = 36 }: { size?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
      <Ionicons name="play-circle" size={size} color="rgba(255,255,255,0.9)" />
    </View>
  );
}

const styles = StyleSheet.create({
  video: { backgroundColor: '#000' },
  placeholder: { backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
});
