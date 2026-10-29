import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Keyboard, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { placesApi } from '@/api/endpoints/places';
import { AppText, Button, Popup } from '@/components/ui';
import { useSendMessage } from '@/features/chat/queries';
import { coordinateText, describePlace, searchPlace } from '@/features/location/address';
import { distanceM, useAreaName } from '@/features/location/useAreaName';
import { useMyLocation } from '@/features/location/useMyLocation';
import { AppMapView, type AppMapViewHandle } from '@/features/map/AppMapView';
import { useUploadDraftStore } from '@/stores/uploadDraftStore';
import { layout, makeStyles, radius, typography, useColors, useMapIsDark, useMapOverlay, withAlpha } from '@/theme';
import type { LatLng, SharedPlace } from '@/types/models';
import { showToast } from '@/utils/toast';

const FALLBACK_CENTER: LatLng = { latitude: 37.4979, longitude: 127.0276 };
// 내 위치에서 이 거리(m) 안이면 "현재 위치"로 봅니다
const CURRENT_LOCATION_RADIUS_M = 30;
/** 검색어를 멈춘 뒤 이만큼 지나면 연관 검색어를 찾습니다 */
const SUGGEST_DELAY_MS = 300;
/** 고른 검색 결과에서 지도가 이만큼(m) 안에 있으면 그 장소 이름을 그대로 씁니다 (주소 다시 찾기 안 함) */
const PICKED_RADIUS_M = 25;
/** 지도를 멈추고 이만큼 지나면 주소를 찾습니다. 끄는 동안 매번 찾느라 결과가 늦게 왔습니다 (대표 리포트 46·71) */
const CENTER_SETTLE_MS = 400;
/** 네이버 지도 앱이 돌아올 때 쓰는 앱 이름 (패키지명) */
const APP_ID = Constants.expoConfig?.android?.package ?? Constants.expoConfig?.ios?.bundleIdentifier ?? 'com.ramuviamanager.ramupin';

/**
 * 네이버 지도 길찾기 (대중교통). 앱이 없으면 모바일 웹으로 (대표 리포트 97).
 * canOpenURL 은 안드로이드 11+ 에서 manifest queries 가 있어야 해서 쓰지 않고, 열기에 실패하면 웹으로 넘깁니다
 */
async function openNaverDirections(target: LatLng, name: string) {
  const dname = encodeURIComponent(name);
  const app = `nmap://route/public?dlat=${target.latitude}&dlng=${target.longitude}&dname=${dname}&appname=${APP_ID}`;
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(
      `https://m.map.naver.com/route.nhn?menu=route&pathType=1&ex=${target.longitude}&ey=${target.latitude}&ename=${dname}`,
    ).catch(() => undefined);
  }
}

/**
 * 피그마: 장소 지정 공유 (125:65169) / 현재 위치 공유 (125:65196) / 공유 완료 (283:35829)
 * 피그마(갤러리): 선택한 장소 추가하기 (363:8280) / 현재 위치 추가하기 (363:8307)
 * mode: share = 채팅방에 공유(roomId 필요), attach = 갤러리 업로드에 위치 추가, view = 공유된 위치 보기(lat, lng)
 * 기획: 처음엔 현재 위치에 핀, 이후 지도를 움직이거나 검색해서 장소 지정
 * 검색어를 치면 '연관 검색어' 목록이 뜹니다 (피그마 갤러리 586 · 사람들2 665, 10-08)
 */
export default function PlacePickerScreen() {
  const styles = useStyles();
  const colors = useColors();
  // 제목·뒤로가기가 지도 위에 바로 얹혀 있어, 앱 화면 색이 아니라 지도 밝기를 따라갑니다
  const overlay = useMapOverlay();
  const mapIsDark = useMapIsDark();
  const { t } = useTranslation();
  // view 모드: name·address 를 주면 그 글자를 그대로 씁니다 (공유한 사람이 본 주소 — 다시 찾으면 조금 다를 수 있어서)
  const params = useLocalSearchParams<{
    mode?: 'share' | 'attach' | 'view';
    roomId?: string;
    lat?: string;
    lng?: string;
    name?: string;
    address?: string;
  }>();
  const setDraftPlace = useUploadDraftStore((s) => s.setPlace);
  const mode = params.mode ?? 'share';
  const viewTarget = params.lat && params.lng ? { latitude: Number(params.lat), longitude: Number(params.lng) } : null;

  const mapRef = useRef<AppMapViewHandle>(null);
  const { location } = useMyLocation();
  // 위치를 기다리지 않고 바로 시작합니다. 첫 위치가 오면 그리로 옮깁니다 (대표 리포트 46·71)
  const [center, setCenter] = useState<LatLng | null>(viewTarget ?? location ?? FALLBACK_CENTER);
  const [place, setPlace] = useState<SharedPlace | null>(
    viewTarget && params.address ? { ...viewTarget, address: params.address, placeName: params.name || undefined } : null,
  );
  const [resolving, setResolving] = useState(false);
  const [query, setQuery] = useState('');
  const [shared, setShared] = useState<SharedPlace | null>(null);
  /** 연관 검색어 (서버 장소 검색). null = 목록 닫힘 */
  const [suggestions, setSuggestions] = useState<SharedPlace[] | null>(null);
  /** 목록에서 고른 장소. 지도를 크게 움직이기 전까지 이 이름을 씁니다 */
  const picked = useRef<SharedPlace | null>(null);
  const typing = useRef(false);
  const areaName = useAreaName(center);
  const send = useSendMessage(params.roomId ?? '');

  /** 지금 주소를 찾고 있는 좌표와 그 결과. 주소가 오기 전에 공유를 누르면 이것을 기다립니다 */
  const lookup = useRef<{ at: LatLng; promise: Promise<SharedPlace> } | null>(null);
  const [waiting, setWaiting] = useState(false);
  /** 사용자가 지도를 직접 움직였으면 위치가 늦게 와도 끌어가지 않습니다 */
  const userMoved = useRef(false);

  // 보기 모드가 아니면 처음 한 번 내 위치로 이동
  const movedToMe = useRef(!!viewTarget);
  useEffect(() => {
    if (!location || movedToMe.current) return;
    movedToMe.current = true;
    if (userMoved.current) return;
    mapRef.current?.moveTo(location, 0.004);
    setCenter(location);
  }, [location]);

  // 새 위치(GPS)가 잡히기 전에, 오래됐더라도 마지막으로 알던 위치에서 먼저 시작합니다.
  // useMyLocation 은 2분 넘은 위치를 버려서, 실내에서는 한참 강남(기본 위치)에 머물렀습니다
  useEffect(() => {
    if (viewTarget) return;
    let cancelled = false;
    Location.getLastKnownPositionAsync()
      .then((last) => {
        if (cancelled || !last || movedToMe.current || userMoved.current) return;
        const approx = { latitude: last.coords.latitude, longitude: last.coords.longitude };
        mapRef.current?.moveTo(approx, 0.004);
        setCenter(approx);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 지도 중앙(핀) 좌표가 바뀌면 (멈춘 뒤 잠깐 기다렸다가) 주소 다시 조회
  useEffect(() => {
    if (!center) return;
    // 보기 모드에서 공유한 주소를 받았으면 다시 찾지 않습니다
    if (mode === 'view' && params.address) return;
    // 검색 결과를 골라 옮겨 온 자리면 그 장소 이름을 그대로 씁니다 (주소 찾기는 '삼성 코엑스' 같은 이름을 못 줍니다)
    if (picked.current && distanceM(picked.current, center) < PICKED_RADIUS_M) {
      setPlace(picked.current);
      setResolving(false);
      return;
    }
    picked.current = null;
    let cancelled = false;
    setResolving(true);
    const timer = setTimeout(() => {
      const promise = describePlace(center)
        // 주소를 못 찾아도 멈추면 안 됩니다. 좌표만으로도 공유할 수 있습니다
        .catch((error: unknown): SharedPlace => {
          console.warn('[place] 주소 찾기 실패', String(error));
          return { ...center, address: coordinateText(center) };
        });
      lookup.current = { at: center, promise };
      void promise.then((p) => {
        if (cancelled) return;
        setPlace(p);
        setResolving(false);
      });
    }, CENTER_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  /**
   * 지금 핀 자리의 장소. 주소를 아직 찾는 중이면 그 결과를 기다립니다 (서버 3초 + 기기 3초 안에 끝남).
   * 버튼을 막아 두면 주소가 늦을 때 아무것도 못 했습니다 (대표 리포트 46·71)
   */
  const currentPlace = async (): Promise<SharedPlace | null> => {
    if (!center) return null;
    if (place && !resolving) return place;
    const pending = lookup.current && distanceM(lookup.current.at, center) < 1 ? lookup.current.promise : describePlace(center);
    setWaiting(true);
    try {
      return await pending.catch(() => ({ ...center, address: coordinateText(center) }));
    } finally {
      setWaiting(false);
    }
  };

  const isCurrentLocation = !!(location && center && distanceM(location, center) < CURRENT_LOCATION_RADIUS_M);

  // 검색어를 칠 때마다 (잠깐 멈추면) 연관 검색어를 찾습니다
  useEffect(() => {
    const keyword = query.trim();
    if (!keyword || !typing.current) {
      setSuggestions(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      placesApi
        .search(keyword, center ?? location)
        .then((found) => {
          if (!cancelled) setSuggestions(found ?? []);
        })
        // 서버 검색이 안 되면 목록 없이 둡니다. 검색 버튼을 누르면 기기 주소 검색으로 찾습니다
        .catch(() => !cancelled && setSuggestions([]));
    }, SUGGEST_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // 지도를 움직일 때마다 다시 찾지 않습니다 — 검색어가 바뀔 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  /** 연관 검색어 하나를 고름 → 그 자리로 이동, 이름 그대로 */
  const pick = (found: SharedPlace) => {
    Keyboard.dismiss();
    typing.current = false;
    setSuggestions(null);
    setQuery(found.placeName ?? found.address);
    picked.current = found;
    setPlace(found);
    mapRef.current?.moveTo(found, 0.004);
    setCenter(found);
  };

  const onSearch = async () => {
    Keyboard.dismiss();
    if (!query.trim()) return;
    // 연관 검색어가 있으면 첫 번째를 고른 것으로 봅니다
    if (suggestions?.length) {
      pick(suggestions[0]);
      return;
    }
    const found = await searchPlace(query.trim());
    if (!found) {
      showToast(t('placePicker.notFound'));
      return;
    }
    mapRef.current?.moveTo(found, 0.004);
    setCenter(found);
  };

  const onShare = async () => {
    if (!params.roomId) return;
    const target = await currentPlace();
    if (!target) return;
    send.mutate({ type: 'location', place: target });
    setShared(target);
  };

  const onAttach = async () => {
    const target = await currentPlace();
    if (!target) return;
    setDraftPlace(target);
    router.back();
  };

  return (
    <View style={styles.container}>
      <AppMapView
        ref={mapRef}
        initialCenter={viewTarget ?? location ?? FALLBACK_CENTER}
        initialDelta={0.004}
        interactive
        onCenterChange={mode === 'view' ? undefined : setCenter}
        onUserGesture={() => {
          userMoved.current = true;
        }}
        // 지도 여백(padding)을 주지 않습니다. 구글 지도는 여백이 있으면 알려 주는 중앙 좌표가 핀보다 100m 쯤 아래로
        // 어긋나 (여백 뺀 가운데가 아니라 화면 전체 가운데를 줌), 공유한 위치가 핀과 달랐습니다 (대표 리포트 41)
      />

      {/* 화면 정중앙 고정 핀. 지도가 알려 주는 중앙 좌표와 같은 자리입니다 */}
      <View style={styles.pinWrap} pointerEvents="none">
        <Ionicons name="location" size={48} color={colors.brown} style={styles.pin} />
      </View>

      <StatusBar style={mapIsDark ? 'light' : 'dark'} />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={overlay.text} />
          </Pressable>
          <AppText variant="title1" color={overlay.text} numberOfLines={1} style={styles.flex}>
            {areaName ?? ''}
          </AppText>
        </View>
        {mode !== 'view' ? (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={colors.textTertiary} />
            <TextInput
              value={query}
              onChangeText={(text) => {
                typing.current = true;
                setQuery(text);
              }}
              onSubmitEditing={onSearch}
              placeholder={t('placePicker.search')}
              placeholderTextColor={colors.textTertiary}
              returnKeyType="search"
              style={styles.searchInput}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  setSuggestions(null);
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {/* 피그마 586: 검색창 아래 흰 카드 '연관 검색어' */}
        {suggestions && suggestions.length > 0 ? (
          <View style={styles.suggestBox}>
            <AppText variant="caption" color={colors.textTertiary} style={styles.suggestLabel}>
              {t('placePicker.related')}
            </AppText>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.suggestList}>
              {suggestions.map((s, i) => (
                <Pressable
                  key={`${s.latitude},${s.longitude},${i}`}
                  accessibilityRole="button"
                  onPress={() => pick(s)}
                  style={({ pressed }) => [styles.suggestItem, pressed && styles.suggestPressed]}
                >
                  <AppText variant="label1" numberOfLines={1}>
                    {s.placeName ?? s.address}
                  </AppText>
                  {s.placeName ? (
                    <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
                      {s.address}
                    </AppText>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </SafeAreaView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('placePicker.myLocation')}
        disabled={!location}
        onPress={() => location && mapRef.current?.moveTo(location, 0.004)}
        style={styles.locate}
      >
        <Ionicons name="locate" size={22} color={colors.textStrong} />
      </Pressable>

      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.grabber} />
        {resolving || !place ? (
          <View style={styles.resolving}>
            <ActivityIndicator color={colors.brown} />
            <AppText variant="label1" color={colors.textTertiary}>
              {t('placePicker.finding')}
            </AppText>
          </View>
        ) : (
          <View style={styles.placeTexts}>
            {place.placeName ? <AppText variant="title4">{place.placeName}</AppText> : null}
            <AppText variant="label1">{place.address}</AppText>
          </View>
        )}
        {mode === 'share' ? (
          <Button
            label={t(isCurrentLocation ? 'placePicker.shareCurrent' : 'placePicker.shareSelected')}
            size="lg"
            disabled={!center || waiting || send.isPending}
            onPress={() => void onShare()}
          />
        ) : mode === 'attach' ? (
          <Button
            label={t(isCurrentLocation ? 'placePicker.addCurrent' : 'placePicker.addSelected')}
            size="lg"
            disabled={!center || waiting}
            onPress={() => void onAttach()}
          />
        ) : viewTarget ? (
          // 공유받은 위치로 길찾기 (대표 리포트 97)
          <Button
            label={t('placePicker.directions')}
            size="lg"
            onPress={() => void openNaverDirections(viewTarget, place?.placeName ?? place?.address ?? params.name ?? coordinateText(viewTarget))}
          />
        ) : null}
      </SafeAreaView>

      <Popup
        visible={!!shared}
        title={t('placePicker.sharedTitle')}
        message={shared ? `${shared.placeName ? `${shared.placeName}\n` : ''}${shared.address}` : undefined}
        confirmLabel={t('common.confirm')}
        onConfirm={() => {
          setShared(null);
          router.back();
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: '#ECEAE4' },
  flex: { flex: 1 },
  pinWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // 핀 끝이 좌표를 가리키도록 아이콘 높이의 절반만큼 위로
  pin: { marginBottom: 48 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: layout.screenPadding, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 12 },
  back: { marginLeft: -8 },
  searchBar: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.surfaceStrong,
    backgroundColor: withAlpha(colors.background, 0.92),
  },
  searchInput: { flex: 1, ...typography.label1, color: colors.text, paddingVertical: 0 },
  suggestBox: {
    marginTop: -8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  suggestLabel: { paddingHorizontal: 16, paddingVertical: 6 },
  suggestList: { maxHeight: 260 },
  suggestItem: { paddingHorizontal: 16, paddingVertical: 9, marginHorizontal: 6, borderRadius: 8, gap: 2 },
  suggestPressed: { backgroundColor: colors.surfaceStrong },
  locate: {
    position: 'absolute',
    right: 20,
    bottom: 240,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(colors.background, 0.95),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.surface,
    gap: 20,
  },
  grabber: { alignSelf: 'center', width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9', marginTop: 12 },
  resolving: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  placeTexts: { gap: 12, minHeight: 44 },
}));
