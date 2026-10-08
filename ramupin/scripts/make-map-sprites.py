# 지도 위 **움직이는 그림**(자동차·자전거·운동화·발자국)을 프레임 PNG로 만듭니다.
#   python scripts/make-map-sprites.py        (Pillow 필요: pip install pillow)
#
# **왜 GIF 를 그대로 안 쓰는가** (2026-10-07)
# 안드로이드 지도는 마커를 뷰로 받으면 그림 한 장으로 굽고, 그때 그림이 통째로 빠집니다
# (markerAvatars.ts 참고). 그림 파일을 마커 아이콘으로 넘기면 나오지만 **멈춘 그림**입니다.
# 그래서 GIF 를 프레임으로 쪼개 두고, 앱이 마커 아이콘을 짧은 간격으로 바꿔 끼웁니다
# (src/features/map/spriteClock.ts).
#
# 원본은 피그마 `라무핀 v2.0` 의 GIF 채우기입니다 (다크 모드 지도 메인 548·550·551, SOS 구역).
# 저장소에 넣지 않고 처음 한 번 피그마에서 받아 scripts/.sprite-cache/ 에 둡니다.
#
# 결과: assets/sprites/<이름>/<크기>-<번호>.png + src/features/map/sprites.ts (require 목록)
import json
import os
import re
import urllib.request
from pathlib import Path

from PIL import Image, ImageSequence

뿌리 = Path(__file__).resolve().parent.parent
캐시 = 뿌리 / 'scripts' / '.sprite-cache'
결과 = 뿌리 / 'assets' / 'sprites'
목록파일 = 뿌리 / 'src' / 'features' / 'map' / 'sprites.ts'

FILE_KEY = 'B7PL60U8Z0122RaYWOjLWw'

# 앱이 그림을 바꿔 끼우는 간격 (spriteClock.ts 의 TICK_MS 와 같아야 합니다).
# 원본은 초당 10~25장인데, 지도 마커를 그만큼 자주 바꾸면 지도가 버벅입니다.
TICK_MS = 125

# 크기는 **픽셀**입니다. 마커 아이콘은 그림을 그대로 쓰므로 3배 화면 기준으로 계산해 둡니다
# (캐릭터 마커와 같은 규칙: 44dp × 3 = 132px).
배율 = 3

# gifRef = 피그마 GIF 채우기의 원본 번호. 높이(dp)는 피그마 배지 안 그림 칸 높이입니다
그림 = {
    # 지도 메인 548 '60km로 이동중' 배지
    'car': {'gifRef': 'cb31e8f94c5bac67a5885399a4f2de41880bacd3', '크기': {'lg': 32, 'sm': 20}},
    # 지도 메인 550·551 '18km로 이동중' 배지
    'bicycle': {'gifRef': '30b5362065e7c5cfbee38a61d2f6696db10edd42', '크기': {'lg': 32, 'sm': 20}},
    # SOS 구역에 따로 놓인 운동화 두 켤레 (분홍·파랑 / 보라). 걷기 배지에 사람마다 하나씩 (대표님 10-08: 랜덤)
    'walking': {'gifRef': 'f857228707d574455fb1c5b3909f2f83ad932093', '크기': {'lg': 32, 'sm': 20}},
    'walking2': {'gifRef': 'c9a5726da902187993d3c2736edda38e4261e1d4', '크기': {'lg': 32, 'sm': 20}},
    # 지도 메인 550·551 내 위치 옆 106×106 발자국
    'footprints': {'gifRef': '083655b0579404a490775ec1b09b336586d52a05', '크기': {'lg': 106}, '자르기': False},
}


def 토큰():
    env = (뿌리 / '.env').read_text(encoding='utf-8')
    m = re.search(r'^FIGMA_TOKEN=(.+)$', env, re.M)
    if not m:
        raise SystemExit('.env 에 FIGMA_TOKEN 이 없습니다')
    return m.group(1).strip()


def 원본받기():
    """피그마의 그림 채우기 주소 목록에서 GIF 를 받습니다. 받아 둔 것은 다시 받지 않습니다"""
    캐시.mkdir(exist_ok=True)
    없는것 = [k for k in 그림 if not (캐시 / f'{k}.gif').exists()]
    if not 없는것:
        return
    요청 = urllib.request.Request(
        f'https://api.figma.com/v1/files/{FILE_KEY}/images', headers={'X-Figma-Token': 토큰()}
    )
    주소들 = json.load(urllib.request.urlopen(요청))['meta']['images']
    for k in 없는것:
        urllib.request.urlretrieve(주소들[그림[k]['gifRef']], 캐시 / f'{k}.gif')
        print('받음', k)


def 프레임들(경로):
    gif = Image.open(경로)
    프레임, 시간 = [], []
    for f in ImageSequence.Iterator(gif):
        프레임.append(f.convert('RGBA'))
        시간.append(f.info.get('duration') or 100)
    return 프레임, 시간


def 고르기(프레임, 시간):
    """한 바퀴 길이는 그대로 두고 TICK_MS 간격으로 다시 뽑습니다"""
    전체 = sum(시간)
    장수 = max(6, round(전체 / TICK_MS))
    시작들, t = [], 0
    for d in 시간:
        시작들.append(t)
        t += d
    뽑은 = []
    for i in range(장수):
        at = i * 전체 / 장수
        idx = max(j for j, s in enumerate(시작들) if s <= at)
        뽑은.append(프레임[idx])
    return 뽑은


def 테두리상자(프레임):
    """모든 프레임을 합친 그림 영역. 프레임마다 자르면 그림이 흔들립니다"""
    상자 = None
    for f in 프레임:
        b = f.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if not b:
            continue
        상자 = b if 상자 is None else (min(상자[0], b[0]), min(상자[1], b[1]), max(상자[2], b[2]), max(상자[3], b[3]))
    return 상자


def 만들기():
    원본받기()
    if 결과.exists():
        for p in 결과.rglob('*.png'):
            p.unlink()
    목록 = {}
    for 이름, 설정 in 그림.items():
        프레임, 시간 = 프레임들(캐시 / f'{이름}.gif')
        뽑은 = 고르기(프레임, 시간)
        if 설정.get('자르기', True):
            상자 = 테두리상자(뽑은)
            뽑은 = [f.crop(상자) for f in 뽑은]
        폴더 = 결과 / 이름
        폴더.mkdir(parents=True, exist_ok=True)
        목록[이름] = {}
        for 크기이름, dp in 설정['크기'].items():
            h = dp * 배율
            w = round(뽑은[0].width * h / 뽑은[0].height)
            파일들 = []
            for i, f in enumerate(뽑은):
                작게 = f.resize((w, h), Image.LANCZOS)
                # 색 수를 줄여 용량을 1/3 쯤으로. 3D 그림이라 256색이면 차이가 안 보입니다
                작게 = 작게.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
                # @3x = 3배 화면용 그림. 없으면 배포용 앱에서 안드로이드가 3배로 또 키웁니다 (10-08)
                파일 = 폴더 / f'{크기이름}-{i:02d}@3x.png'
                작게.save(파일, optimize=True)
                파일들.append(파일)
            목록[이름][크기이름] = {'w': w, 'h': h, '파일': 파일들}
            kb = sum(p.stat().st_size for p in 파일들) // 1024
            print(f'{이름} {크기이름}: {len(파일들)}장 {w}x{h}px {kb}KB')
    목록['radar'] = 레이더()
    목록쓰기(목록)


def 레이더():
    """
    핀 아래 레이더 파동 (피그마 지도 메인 550: 지름 19·38·76·114dp 동심원, #7C6D67).
    피그마는 정지 그림이라, 원이 가운데서 퍼져 나가며 옅어지는 움직임을 여기서 만듭니다.
    링 두 개가 반 박자씩 어긋나 퍼집니다. 한 바퀴 2초.
    """
    from PIL import ImageDraw
    지름dp, 색 = 114, (0x7C, 0x6D, 0x67)
    큰 = 지름dp * 배율 * 2  # 2배로 그린 뒤 줄여 가장자리를 매끄럽게
    장수 = round(2000 / TICK_MS)
    폴더 = 결과 / 'radar'
    폴더.mkdir(parents=True, exist_ok=True)
    파일들 = []
    for i in range(장수):
        im = Image.new('RGBA', (큰, 큰), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        for 어긋남 in (0, 0.5):
            t = (i / 장수 + 어긋남) % 1  # 0 → 1 로 퍼짐
            r = 큰 / 2 * (0.17 + 0.83 * t)
            알파 = round(120 * (1 - t))
            d.ellipse([큰 / 2 - r, 큰 / 2 - r, 큰 / 2 + r, 큰 / 2 + r], fill=색 + (round(알파 * 0.35),), outline=색 + (알파,), width=round(1.5 * 배율 * 2))
        # 가운데 작은 원 (피그마 19dp) 은 늘 보입니다
        r0 = 큰 * 19 / 114 / 2
        d.ellipse([큰 / 2 - r0, 큰 / 2 - r0, 큰 / 2 + r0, 큰 / 2 + r0], fill=색 + (90,))
        작게 = im.resize((지름dp * 배율, 지름dp * 배율), Image.LANCZOS)
        파일 = 폴더 / f'lg-{i:02d}@3x.png'
        작게.save(파일, optimize=True)
        파일들.append(파일)
    kb = sum(p.stat().st_size for p in 파일들) // 1024
    print(f'radar lg: {len(파일들)}장 {지름dp * 배율}px {kb}KB')
    return {'lg': {'w': 지름dp * 배율, 'h': 지름dp * 배율, '파일': 파일들}}


def 목록쓰기(목록):
    줄 = [
        '/**',
        ' * 지도 위 움직이는 그림의 프레임 목록.',
        ' *',
        ' * **이 파일은 스크립트가 만든 목록입니다** — 손으로 고치지 말고',
        ' * `python scripts/make-map-sprites.py` 를 다시 돌리세요.',
        ' *',
        ' * 크기(w·h)는 픽셀입니다 (3배 화면 기준). 프레임 간격은 spriteClock.ts 의 TICK_MS.',
        ' */',
        "import type { SpriteSheet } from './spriteTypes';",
        '',
        'export const SPRITES = {',
    ]
    for 이름, 크기들 in 목록.items():
        줄.append(f'  {이름}: {{')
        for 크기이름, s in 크기들.items():
            줄.append(f"    {크기이름}: {{ w: {s['w']}, h: {s['h']}, frames: [")
            for p in s['파일']:
                # require 는 @3x 없이 씁니다 (번들러가 배율에 맞는 파일을 고릅니다)
                rel = os.path.relpath(p, 목록파일.parent).replace('\\', '/').replace('@3x.png', '.png')
                줄.append(f"      require('{rel}'),")
            줄.append('    ] },')
        줄.append('  },')
    줄.append('} satisfies Record<string, Record<string, SpriteSheet>>;')
    목록파일.write_text('\n'.join(줄) + '\n', encoding='utf-8')
    print('목록', 목록파일.relative_to(뿌리))


if __name__ == '__main__':
    만들기()
