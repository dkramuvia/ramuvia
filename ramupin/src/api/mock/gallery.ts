import { Image } from 'react-native';

import { mockFriends, mockGroups, mockMe } from './data';
import type { GalleryPost, MediaAsset } from '@/types/models';

// 피그마 시안의 샘플 사진 (목업 전용). 개발 서버에서는 http 주소로 풀립니다
const photo = (source: number, width: number, height: number): MediaAsset => ({
  uri: Image.resolveAssetSource(source).uri,
  width,
  height,
  type: 'image',
});

const PHOTOS = [
  photo(require('../../../assets/mock/photo5.jpg'), 512, 512),
  photo(require('../../../assets/mock/photo1.jpg'), 512, 512),
  photo(require('../../../assets/mock/photo3.jpg'), 960, 1280),
  photo(require('../../../assets/mock/photo4.jpg'), 960, 1280),
  photo(require('../../../assets/mock/photo6.jpg'), 1080, 810),
  photo(require('../../../assets/mock/photo2.jpg'), 1080, 608),
];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const author = (i: number) => {
  const f = mockFriends[i];
  return { id: f.id, nickname: f.nickname, avatarUrl: f.avatarUrl, isOnline: f.isOnline };
};

const hiking = mockGroups.find((g) => g.id === 'room3')!;
const hongik = mockGroups.find((g) => g.id === 'room2')!;

export const mockPosts: GalleryPost[] = [
  {
    id: 'p1',
    groupId: hiking.id,
    groupName: hiking.name,
    author: author(1),
    media: [PHOTOS[0]],
    place: { latitude: 37.1757, longitude: 126.6231, address: '경기도 화성시 서신면 제부리', areaName: '화성시 제부도' },
    createdAt: hoursAgo(1),
  },
  { id: 'p2', groupId: hongik.id, groupName: hongik.name, author: author(0), media: [PHOTOS[1]], createdAt: hoursAgo(3) },
  { id: 'p3', groupId: hiking.id, groupName: hiking.name, author: author(0), media: [PHOTOS[2]], createdAt: hoursAgo(5) },
  {
    id: 'p4',
    groupId: hongik.id,
    groupName: hongik.name,
    author: { id: mockMe.id, nickname: mockMe.nickname, isOnline: true },
    media: [PHOTOS[3]],
    place: { latitude: 37.5116, longitude: 127.0595, address: '서울특별시 강남구 영동대로 513', placeName: '코엑스', areaName: '서울시 강남구' },
    createdAt: hoursAgo(8),
  },
  { id: 'p5', groupId: hiking.id, groupName: hiking.name, author: author(1), media: [PHOTOS[4]], createdAt: hoursAgo(26) },
  { id: 'p6', groupId: hongik.id, groupName: hongik.name, author: author(2), media: [PHOTOS[5]], createdAt: hoursAgo(30) },
];
