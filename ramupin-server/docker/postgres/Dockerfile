# PostGIS 이미지 + 라무핀 초기화 스크립트
# (Windows 에서 파일 하나만 bind mount 하면 폴더로 잡히는 문제가 있어 이미지에 넣습니다)
FROM postgis/postgis:17-3.5
COPY --chmod=755 20-ramupin.sh /docker-entrypoint-initdb.d/20-ramupin.sh
