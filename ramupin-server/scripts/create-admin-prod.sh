#!/usr/bin/env bash
# 운영 서버에서 관리자 계정 만들기 / 비밀번호 바꾸기.
#
#   ~/ramuvia/ramupin-server/scripts/create-admin-prod.sh
#
# **왜 bash 가 물어보는가** (2026-10-01)
#   1. `docker compose exec` 로 컨테이너 안에서 물어보면 터미널을 이중으로 잡아 멈춥니다
#   2. bash 프롬프트에 비밀번호를 치면 `!` 가 명령 기록으로 해석됩니다
#      (`!@: event not found`) — 게다가 ~/.bash_history 에 그대로 남습니다
#   3. node 쪽에서 물어보면 비밀번호가 화면에 그대로 보입니다
#
# 그래서 bash 의 `read -rs` 로 **화면에 안 보이게** 받고, 파이프로 한 번에 넘깁니다.
# `read` 는 명령 기록을 거치지 않으므로 `!` 가 들어간 비밀번호도 그대로 전달됩니다.
set -euo pipefail

CONTAINER=${CONTAINER:-ramupin-server-api-1}

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "컨테이너 '$CONTAINER' 가 돌고 있지 않습니다." >&2
  echo "돌고 있는 것: $(docker ps --format '{{.Names}}' | tr '\n' ' ')" >&2
  exit 1
fi

echo
echo "  라무핀 관리자 계정 만들기"
echo "  ────────────────────────────────────────"
echo "  ramuviamanager.com 에 로그인할 계정입니다."
echo "  비밀번호는 입력해도 화면에 보이지 않습니다 (정상입니다)."
echo

read -rp "아이디 (예: ramuvia-admin): " ID
read -rp "이름 (예: 대표): " NAME
read -rp "권한 viewer/editor/owner [owner]: " ROLE
ROLE=${ROLE:-owner}
read -rsp "비밀번호 (10자 이상): " PW; echo
read -rsp "비밀번호 확인: " PW2; echo
echo

if [ -z "$ID" ] || [ -z "$NAME" ]; then
  echo "아이디와 이름은 비울 수 없습니다" >&2; exit 1
fi
if [ "$PW" != "$PW2" ]; then
  echo "비밀번호가 서로 다릅니다" >&2; exit 1
fi
if [ ${#PW} -lt 10 ]; then
  echo "비밀번호는 10자 이상이어야 합니다 (지금 ${#PW}자)" >&2; exit 1
fi

# printf 는 bash 내장이라 `ps` 목록에 비밀번호가 보이지 않습니다
printf '%s\n%s\n%s\n%s\n%s\n' "$ID" "$NAME" "$ROLE" "$PW" "$PW2" \
  | docker exec -i "$CONTAINER" node scripts/create-admin.mjs

unset PW PW2
echo
echo "  https://ramuviamanager.com 에서 로그인해 보세요."
