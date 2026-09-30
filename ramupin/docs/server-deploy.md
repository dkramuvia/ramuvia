# AWS 서버 1대 구성 (2026-09-30)

시연(11-27)까지는 **EC2 한 대에 전부** 올립니다. 나중에 위치 DB·저장소를 떼어냅니다.
떼어낼 수 있게 이미 코딩돼 있습니다 → `docs/backend-db-plan.md`

---

## 1. 인스턴스 설정값

만들기 화면에서 아래대로 고릅니다.

| 항목 | 값 | 왜 |
|---|---|---|
| **리전** | **서울 `ap-northeast-2`** | 한국 사용자 위치를 받습니다. 스톡홀름은 왕복 250ms, 서울은 10~30ms. **리전은 나중에 못 바꿉니다** — 새로 만들어야 합니다 |
| **AMI** | **Ubuntu 24.04 LTS** (x86_64) — **Ubuntu Pro 아님** | 아래 §1-2. Pro 는 시간당 요금이 더 붙습니다 |
| **인스턴스 유형** | **`t3.medium`** (2 vCPU · **4GiB**) | 아래 §1-1 참고. 유형은 나중에 바꿀 수 있습니다(중지 → 변경 → 시작) |
| **스토리지** | **gp3 `60GiB`** | 기본 8GiB는 도커 이미지만으로 찹니다 |
| 키 페어 | 새로 만들어 `.pem` 내려받기 | **다시 받을 수 없습니다.** 안전한 곳에 두세요 |
| 퍼블릭 IP 자동 할당 | 켜기 | |
| **탄력적 IP** | 만든 뒤 붙이기 | 없으면 재부팅할 때 주소가 바뀌어 앱 설정을 매번 고쳐야 합니다 |

### 1-2. Ubuntu 인가 Amazon Linux 인가

**둘 다 문제없이 돌아갑니다.** 성능·안정성·보안 차이는 이 규모에서 못 느끼고,
지원 기한도 비슷합니다 (AL2023 은 2029-06, Ubuntu 24.04 LTS 는 2029-04).
요금도 같습니다 — 화면의 `Ubuntu Pro` 는 유료판이라 더 비싸고,
**그냥 Ubuntu 는 Amazon Linux 와 같은 단가**입니다.

**Ubuntu 를 권하는 이유는 우리가 쓸 두 가지가 덜 번거롭기 때문입니다.**

| | Amazon Linux 2023 | Ubuntu 24.04 |
|---|---|---|
| Docker Compose v2 | 저장소에 **없음.** 바이너리를 직접 받고 갱신도 손으로 | 공식 저장소에 있음, 갱신 자동 |
| Caddy (HTTPS 자동) | 공식 저장소 없음 (COPR 은 AL2023 미지원일 수 있음) | 공식 apt 저장소 있음 |
| 검색해서 나오는 문서 | 적음 | 대부분 Ubuntu 기준 |

Amazon Linux 의 장점(AWS 지원 계약 포함, AWS 도구 선탑재)은 **유료 지원 플랜이
있어야** 의미가 있고, SSM 에이전트는 Ubuntu AMI 에도 들어 있습니다.

> **이미 Amazon Linux 로 만들었다면 다시 만들 필요 없습니다.** §2 에 두 쪽 명령을
> 모두 적어 두었습니다.

### 1-1. 왜 t3.micro 로는 안 되는가

한 대에 넷이 올라갑니다.

| | 대략 메모리 |
|---|---|
| PostgreSQL + PostGIS | 0.5 ~ 1GB |
| Redis | 0.1GB |
| MinIO (사진·동영상) | 0.3GB |
| API (NestJS) | 0.3 ~ 0.5GB |
| OS + 도커 | 0.4GB |
| **합계** | **약 2.5GB** |

t3.micro 는 **1GiB** 입니다. 게다가 서버에서 도커 이미지를 빌드할 때
(`npm ci` + `nest build`) 그것만으로 1GB 넘게 씁니다 — **빌드 도중에 죽습니다.**

> 돈을 아끼려면 `t3.small`(2GiB) + 스왑 2GB 로도 뜨긴 합니다. 다만 사진 업로드와
> 위치 처리가 겹치면 느려집니다. **시연용이라면 `t3.medium` 을 권합니다.**

### 1-2. 보안 그룹 (방화벽)

| 포트 | 소스 | 용도 |
|---|---|---|
| 22 | **내 IP 만** | SSH |
| 80 | 0.0.0.0/0 | HTTP (인증서 발급·HTTPS 로 넘기기) |
| 443 | 0.0.0.0/0 | HTTPS |

**`5432`(DB) · `6379`(Redis) · `9000`(저장소) · `3000`(API) 은 절대 열지 마세요.**
열어 두면 인터넷에서 바로 DB 에 붙습니다. 비밀번호가 있어도 무차별 대입이
하루에 수천 번 들어옵니다. `docker-compose.prod.yml` 에서도 한 번 더 막아 두었습니다
(둘 중 하나가 잘못돼도 나머지가 막습니다).

---

## 2. 서버에 올리는 순서

SSH 로 붙은 뒤 차례대로 칩니다.
접속 계정은 **Ubuntu 면 `ubuntu@`**, **Amazon Linux 면 `ec2-user@`** 입니다.

### 2-1. 도커 — **Ubuntu**

Docker 공식 설치 스크립트가 **도커와 Compose v2 를 한 번에** 넣습니다.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
```

여기서 **한 번 로그아웃했다 다시 접속**합니다 (그래야 `sudo` 없이 `docker` 가 됩니다).
`docker compose version` 이 v2.x 를 찍으면 됩니다.

### 2-1-a. 도커 — **Amazon Linux 2023** (이쪽으로 만들었다면)

```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
```

로그아웃했다 다시 접속한 뒤, **Compose v2 를 따로 넣습니다.** AL2023 저장소에는 없습니다:

```bash
mkdir -p ~/.docker/cli-plugins
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose
docker compose version      # v2.x 가 나오면 됨
```

> 이 방식은 **자동으로 갱신되지 않습니다.** 새 버전이 필요하면 같은 명령을 다시 칩니다.

### 2-2. 스왑 (t3.small 이하면 **필수**, t3.medium 이면 권장)

메모리가 잠깐 모자랄 때 죽지 않게 해 줍니다.

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 2-3. 소스 올리기

**둘 중 하나**입니다.

**(가) GitHub 에서 받기** — 나중에 업데이트가 `git pull` 한 줄이라 권합니다.
다만 지금 로컬에 **푸시 안 된 커밋이 76개** 라, 먼저 푸시 승인이 필요합니다.

```bash
git clone <저장소 주소> ramupin
cd ramupin/ramupin-server
```

**(나) 내 PC 에서 직접 복사** — 푸시 없이 지금 바로 됩니다.
PC 의 Git Bash 에서:

```bash
cd /e/ramuvia
rsync -avz --exclude node_modules --exclude dist --exclude .git \
  -e "ssh -i <키파일>.pem" ramupin-server ubuntu@<탄력적IP>:~/   # AL2023 이면 ec2-user@
```

### 2-4. `.env` 만들기

**`.env` 는 저장소에 없습니다** (비밀값이라 일부러 뺐습니다). 서버에서 직접 만듭니다.

```bash
cp .env.example .env
nano .env
```

**반드시 채워야 하는 것** (없으면 서버가 시작을 거부합니다):

| 값 | 설명 |
|---|---|
| `POSTGRES_PASSWORD` · `APP_MAIN_PASSWORD` · `APP_LOCATION_PASSWORD` · `REDIS_PASSWORD` | **새로 만드세요.** 개발 PC 것을 그대로 쓰지 마세요 |
| `JWT_SECRET` | 32자 이상 |
| `PHONE_ENC_KEY` · `PHONE_HASH_KEY` | 전화번호 암호화·해시 키 (base64 32바이트) |
| `KAKAO_APP_ID` | 카카오 로그인 |
| `STORAGE_ACCESS_KEY` · `STORAGE_SECRET_KEY` | MinIO 접속 키 |

비밀값은 이렇게 만듭니다:

```bash
openssl rand -base64 32      # JWT_SECRET, PHONE_ENC_KEY, PHONE_HASH_KEY 각각
openssl rand -base64 24      # 비밀번호들
```

> **`PHONE_ENC_KEY` 를 잃어버리면 저장된 전화번호를 영영 못 읽습니다.**
> `PHONE_HASH_KEY` 가 바뀌면 중복 가입 확인이 전부 어긋납니다. 두 값은 따로 보관하세요.

컨테이너 안에서 쓰는 주소(`MAIN_DATABASE_URL` 등)는
`docker-compose.yml` 이 자동으로 넣어 주므로 `.env` 에 적은 값은 무시됩니다.

문자 발송은 개발 PC 와 같습니다 → `docs/sms-aligo.md`.
**운영에서는 `SMS_PROVIDER=dev` 면 서버가 뜨지 않습니다.**
알리고를 쓰려면 **서버의 공인 IP 를 알리고 발송 가능 IP 에 등록**해야 합니다 (PC IP 와 다릅니다).

### 2-5. 띄우기

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app up -d --build
```

처음에는 빌드에 몇 분 걸립니다. 확인:

```bash
docker compose ps                      # 넷 다 healthy 인지
curl -s localhost:3000/health          # API 응답
docker compose logs -f api             # 문제가 있으면 여기
```

마이그레이션(38개)은 **API 가 뜰 때 자동으로** 적용됩니다 (`Dockerfile` 의 `CMD`).

---

## 3. 바깥에서 붙기 — 둘 중 하나

API 는 `127.0.0.1:3000` 에만 열려 있어서, 앞에 웹서버를 둬야 합니다.

### (가) 도메인 있음 → HTTPS (권장)

**안드로이드는 평문 HTTP 를 기본으로 막습니다.** 시연에는 이쪽이 맞습니다.
도메인의 A 레코드를 탄력적 IP 로 맞춰 둔 뒤:

```bash
# --- Ubuntu: 공식 저장소 ---
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# --- Amazon Linux 2023: 공식 저장소가 없어 바이너리로 ---
#   (COPR 은 AL2023 을 지원하지 않을 수 있습니다)
# curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" -o caddy
# sudo install -m 755 caddy /usr/bin/caddy
# sudo useradd --system --home /var/lib/caddy --shell /usr/sbin/nologin caddy
# sudo mkdir -p /etc/caddy /var/lib/caddy && sudo chown caddy:caddy /var/lib/caddy
# sudo curl -fsSL https://raw.githubusercontent.com/caddyserver/dist/master/init/caddy.service -o /etc/systemd/system/caddy.service

# --- 둘 다 공통: 설정을 쓰고 켭니다 ---
echo 'api.example.com {
  reverse_proxy 127.0.0.1:3000
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now caddy
sudo systemctl status caddy
```

Caddy 가 **인증서를 알아서 받아 갱신합니다.** 앱의 `EXPO_PUBLIC_API_BASE_URL` 을
`https://api.example.com` 으로 바꾸면 끝입니다.

### (나) 도메인 없음 → IP 로 임시

급하면 보안 그룹에 `3000` 을 **내 IP 만** 열고 `http://<탄력적IP>:3000` 으로 붙습니다.
다만 앱에 평문 HTTP 허용을 따로 열어야 하고, **시연에는 권하지 않습니다.**

---

## 4. 나중에 나눌 때

`docs/backend-db-plan.md` 의 결정대로, **코드를 고치지 않고 `.env` 주소만** 바꿉니다.

| 나눌 것 | 지금 | 옮길 때 |
|---|---|---|
| 위치 DB | 같은 서버의 **별도 데이터베이스** `ramupin_location` | `LOCATION_DATABASE_URL` 변경 |
| 사진·동영상 | MinIO (S3 와 같은 규격) | `STORAGE_ENDPOINT`·키를 S3 로 |
| 메인 DB | 같은 서버 | `MAIN_DATABASE_URL` → RDS |
| Redis | 같은 서버 | `REDIS_URL` → ElastiCache |

위치는 **데이터베이스 자체가 분리**돼 있어 JOIN 이 애초에 불가능합니다.
그래서 떼어낼 때 코드가 깨지지 않습니다.

---

## 5. 해 두면 좋은 것

- **백업**: EBS 스냅샷을 하루 1회 (AWS Backup). DB 볼륨이 날아가면 전부 잃습니다
- **비용 알림**: Billing 에서 예산 알림. t3.medium + 60GB 면 **월 $40 안팎**입니다
- **자동 시작**: 컨테이너에 `restart: unless-stopped` 가 있어 재부팅해도 다시 뜹니다
- **디스크 감시**: `df -h` 로 가끔 확인. 사진이 쌓이면 늘어납니다
