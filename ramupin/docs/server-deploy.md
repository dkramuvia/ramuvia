# AWS 서버 구성 — 1단계 (EC2 1대)

**기준 문서**: `010.위치추적앱_서버구축_외주작업지시서` (대표님 제공, 2026-10-01 반영)
스택은 지시서대로 **React Native + NestJS(Node.js) + PostgreSQL**, 리전은 **서울 `ap-northeast-2`**.

> 지시서는 두 단계로 나눕니다.
> **1단계** EC2 1대 + Docker 논리적 망분리 — 지금 하는 것
> **2단계** ALB + WAS 다중 + RDS 역할별 분리 + S3 — LIVE 전환 시
>
> 1단계에서 나눠 둔 것을 2단계에 그대로 떼어낼 수 있게 만들어져 있습니다 →
> `docs/backend-db-plan.md`

---

## 0. 실제 구성 (2026-10-01 완료)

실제로 올린 서버입니다. 아래 §1~§2 는 **다시 만들 때의 순서**이고, 이 절은 **지금 돌고 있는 것**입니다.

| 항목 | 값 |
|---|---|
| 리전 | `ap-northeast-2` (서울) |
| 인스턴스 | `i-00599e3dbc06e4ce9` |
| 탄력적 IP | `13.125.8.115` |
| OS | **Ubuntu 26.04 LTS** (코드네임 `resolute`) · 커널 7.0.0-aws |
| CPU · 메모리 · 디스크 | 2코어 · 3.7GB · 58GB (스왑 4GB 추가) |
| Docker | 29.8.2 · Compose v5.5.1 |
| 접속 계정 | `ubuntu@13.125.8.115` (키 `ramupin-prod-key.pem`) |
| 코드 위치 | `~/ramuvia/ramupin-server` (GitHub 배포 키로 clone) |
| 인증서 | `api.ramuviamanager.com` 한 장에 `@`·`www` 포함 · 2026-12-30 만료 · certbot 자동갱신 |

### 도메인

| 주소 | 가는 곳 |
|---|---|
| `api.ramuviamanager.com` | **앱이 붙는 API** |
| `ramuviamanager.com` | 관리자 웹 (`/admin` 으로 proxy) |
| `www.ramuviamanager.com` | 301 → `ramuviamanager.com` |
| `media.ramuviamanager.com` | 사진·동영상 — **A 레코드 아직 없음**, §2-5-b |

### 확인 명령

```bash
curl -s https://api.ramuviamanager.com/health
#  {"status":"ok","mainDb":"ok","locationDb":"ok","redis":"ok"}
curl -sI https://ramuviamanager.com/            # 200
curl -s -o /dev/null -w '%{http_code}\n' https://api.ramuviamanager.com/admin   # 404 (API 주소로는 차단)
```

바깥에 열린 포트는 **22·80·443 뿐**입니다. 5432·6379·9000·9001·3000 은 모두 닫혀 있습니다
(`docker-compose.prod.yml` 이 `ports: !override []` 로 막고, 보안 그룹이 한 번 더 막습니다).

### 아직 안 된 것

- **`media` A 레코드** — 없으면 폰에서 사진·동영상을 못 받습니다 (§2-5-b)
- **알리고 발송 IP 에 `13.125.8.115` 등록** — 없으면 서버에서 문자 인증이 안 나갑니다
- **`PHONE_ENC_KEY`·`PHONE_HASH_KEY` 백업** — 서버에만 있습니다. 잃으면 가입자 전화번호를 영영 못 읽습니다
- **S3 전환** — §3 참고. MinIO 이미지를 공개 경로에서 못 받는 문제까지 겹쳐 있습니다 (§2-7-a)
- VPC/Subnet 재설계, CloudTrail·VPC Flow Logs, 관리자 웹 IP 화이트리스트

---

## 1. 인스턴스 설정값

| 항목 | 값 | 비고 |
|---|---|---|
| **리전** | **서울 `ap-northeast-2`** | 지시서 지정. **나중에 못 바꿉니다** |
| AMI | Ubuntu LTS 또는 Amazon Linux 2023 | **실제는 26.04 LTS** 로 올렸습니다. §2 에 둘 다 적었습니다 |
| 인스턴스 유형 | **`t3.medium`** (2 vCPU · 4GiB) | §1-1 |
| 스토리지 | **gp3 60GiB · 암호화 활성화** | **지시서 필수 항목** (2-2) |
| 키 페어 | `.pem` 내려받아 보관 | 다시 받을 수 없습니다 |
| 종료 방지 | 활성화 | 실수로 지우면 DB 가 통째로 사라집니다 |
| 탄력적 IP | 만든 뒤 붙이기 | 없으면 재부팅 때 주소가 바뀝니다 |

### 1-1. 왜 t3.micro 로는 안 되는가

한 대에 컨테이너 다섯이 올라갑니다 — nginx · api · postgres · redis · storage.

| | 대략 메모리 |
|---|---|
| PostgreSQL + PostGIS | 0.5 ~ 1GB |
| Redis | 0.1GB |
| 저장소(MinIO) | 0.3GB |
| API (NestJS) | 0.3 ~ 0.5GB |
| nginx | 0.02GB |
| OS + 도커 | 0.4GB |
| **합계** | **약 2.5GB** |

t3.micro 는 1GiB 입니다. 서버에서 이미지를 빌드할 때(`npm ci` + `nest build`)
그것만으로 1GB 를 넘겨 **빌드 도중에 죽습니다.**

### 1-2. 보안 그룹 (지시서 2-1)

> ●보안그룹 인바운드는 **22번(SSH, 관리자 고정 IP만 허용)과 443번(HTTPS)만** 개방합니다.

| 포트 | 소스 | 용도 |
|---|---|---|
| 22 | **관리자 고정 IP 만** | SSH |
| 443 | 0.0.0.0/0 | HTTPS |
| 80 | 0.0.0.0/0 | **인증서 발급·갱신에만 필요** — 아래 참고 |

**80 번에 대하여**: Let's Encrypt 는 도메인 소유를 확인하러 **80 번으로 찾아옵니다.**
그래서 지시서의 "22·443 만" 과 부딪힙니다. 셋 중 하나를 고릅니다.

1. **80 을 열어 둔다** — nginx 가 80 으로 온 요청을 전부 HTTPS 로 되돌려 보내고,
   인증서 확인 경로만 응답합니다. 가장 간단하고 실무에서 흔한 방식입니다
2. **발급·갱신할 때만 연다** — 90일마다 사람이 열고 닫아야 합니다. 잊으면 인증서가 만료됩니다
3. **DNS 인증(DNS-01)** — 80 없이 발급됩니다. 도메인 DNS 업체의 API 키가 필요합니다

> **2026-10-01 결정: 1번.** 80 은 HTTPS 로 되돌려 보내는 일과 인증서 갱신만 합니다.
> 앱 데이터는 443 으로만 흐릅니다. 지시서와 다른 점이라 기록해 둡니다.

### 1-3. VPC — 지시서는 설계를 요구합니다

> ●VPC 1개 생성, Public Subnet과 **향후 확장을 고려한 서브넷 구조를 미리 설계**합니다.

기본 VPC 로 만들었다면 1단계 동작에는 문제가 없지만, 2단계에서 Private Subnet
(App / DB)으로 나눌 때 **CIDR 이 겹치거나 모자랄 수 있습니다.**

- 서버에 아직 아무것도 없다면 **지금 다시 만드는 쪽이 쌉니다**
- 예: VPC `10.0.0.0/16` · Public `10.0.0.0/24` · App(예약) `10.0.10.0/24` · DB(예약) `10.0.20.0/24`

---

## 2. 서버에 올리는 순서

접속 계정은 **Ubuntu 면 `ubuntu@`**, **Amazon Linux 면 `ec2-user@`** 입니다.

### 2-1. 도커 — Ubuntu

공식 저장소를 씁니다 (`get.docker.com` 스크립트보다 버전을 다루기 쉽습니다).

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
sudo systemctl enable --now docker
```

**한 번 로그아웃했다 다시 접속**합니다 (그래야 `sudo` 없이 `docker` 가 됩니다).

> **아주 새 우분투를 골랐다면** 먼저 저장소에 그 코드네임이 있는지 봅니다.
> 26.04(`resolute`) 는 있었습니다. 없으면 바로 앞 LTS 코드네임을 적으면 대개 동작합니다.
> ```bash
> curl -s -o /dev/null -w '%{http_code}\n' https://download.docker.com/linux/ubuntu/dists/$VERSION_CODENAME/Release
> ```

> `apt upgrade` 가 커널을 올리면 `/var/run/reboot-required` 가 생깁니다. **그때 재부팅하세요** —
> 나중에 서비스가 돌 때 재부팅하는 것보다 지금이 쌉니다.

### 2-1-a. 도커 — Amazon Linux 2023

```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
```

로그아웃했다 다시 접속한 뒤 **Compose v2 를 따로 넣습니다** (AL2023 저장소에 없습니다):

```bash
mkdir -p ~/.docker/cli-plugins
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose
docker compose version
```

### 2-2. SSH 잠그기 (지시서 2-2: 비밀번호 로그인 비활성화)

```bash
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh      # Amazon Linux 는 sshd
```

> **지금 접속한 창을 닫지 마세요.** 새 창으로 접속이 되는지 확인한 뒤에 닫습니다.
> 잘못 막으면 들어갈 길이 없어집니다.

### 2-3. 스왑 — **권장이 아니라 필요합니다**

t3.medium 의 실제 가용 메모리는 **3.7GB** 입니다. 컨테이너 다섯이 2.5GB 를 쓰는데,
거기서 `npm ci` + `nest build` 를 돌리면 모자라서 **빌드가 죽습니다.** 4GB 를 줍니다.

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# 꼭 필요할 때만 쓰게 (기본값 60 은 멀쩡한 메모리도 디스크로 밀어냅니다)
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-ramupin.conf
sudo sysctl --system
free -h
```

> **Ubuntu 26.04 에는 `/etc/sysctl.conf` 가 없습니다.** `/etc/sysctl.d/` 아래에 파일을
> 만들어야 합니다 (`>> /etc/sysctl.conf` 로 적으면 조용히 실패합니다).

### 2-4. 소스 올리기 — GitHub 배포 키

**저장소가 비공개**라 서버에 읽기 권한을 줘야 합니다. 서버에서 키를 만들고
**공개키만** GitHub 에 등록합니다 (개인키는 서버를 떠나지 않습니다).

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N '' -C 'ramupin-prod-deploy'
cat > ~/.ssh/config <<'CFG'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
CFG
chmod 600 ~/.ssh/config
cat ~/.ssh/github_deploy.pub      # 이 한 줄을 GitHub 에 등록
```

GitHub → `저장소 → Settings → Deploy keys → Add deploy key` 에 붙여넣습니다.

> ⚠️ **`Allow write access` 는 체크하지 않습니다.** 서버는 받아오기만 합니다.
> 쓰기를 허용하면 서버가 뚫릴 때 저장소까지 넘어갑니다.

```bash
ssh -T git@github.com        # "Hi dkramuvia/ramuvia!" 가 나오면 됩니다
git clone git@github.com:dkramuvia/ramuvia.git
cd ramuvia/ramupin-server
```

이후 배포는 두 줄입니다.

```bash
cd ~/ramuvia && git fetch origin && git reset --hard origin/main
cd ramupin-server && docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app up -d --build
```

### 2-5. `.env` 만들기

**저장소에 없습니다** (비밀값이라 일부러 뺐습니다). 서버에서 직접 만듭니다.

```bash
cd ~/ramupin-server
cp .env.example .env
nano .env
```

반드시 채울 것:

| 값 | 설명 |
|---|---|
| `SERVER_NAME` | **앱이 붙는 주소** — `api.ramuviamanager.com` |
| `ADMIN_SERVER_NAME` | **관리자 웹 주소** — `ramuviamanager.com` |
| `POSTGRES_PASSWORD` · `APP_MAIN_PASSWORD` · `APP_LOCATION_PASSWORD` · `REDIS_PASSWORD` | **새로 만드세요.** 개발 PC 것을 쓰지 마세요 |
| `JWT_SECRET` | 32자 이상 |
| `PHONE_ENC_KEY` · `PHONE_HASH_KEY` | base64 32바이트 |
| `KAKAO_APP_ID` | 카카오 로그인 |
| `STORAGE_ACCESS_KEY` · `STORAGE_SECRET_KEY` | 저장소 키 |
| `NODE_ENV` | `production` |
| 문자 설정 | `docs/sms-aligo.md`. **운영에서 `SMS_PROVIDER=dev` 면 서버가 뜨지 않습니다** |

```bash
openssl rand -base64 32      # JWT_SECRET, PHONE_ENC_KEY, PHONE_HASH_KEY 각각
openssl rand -base64 24      # 비밀번호들
```

> **`PHONE_ENC_KEY` 를 잃어버리면 저장된 전화번호를 영영 못 읽습니다.**
> `PHONE_HASH_KEY` 가 바뀌면 중복 가입 확인이 전부 어긋납니다. 따로 보관하세요.

**알리고를 쓰려면 서버의 공인 IP 를 알리고 발송 가능 IP 에 등록**해야 합니다 (PC IP 와 다릅니다).

### 2-5-a. 도메인 (가비아)

`ramuviamanager.com` 은 **가비아**에서 관리합니다 (네임서버 `ns.gabia.co.kr`).

`https://dns.gabia.com` → 도메인 선택 → **`레코드 수정`** → `레코드 추가`:

| 호스트 | 타입 | 값 | TTL | 용도 |
|---|---|---|---|---|
| `@` (또는 비움) | A | `13.125.8.115` | 3600 | 관리자 웹 |
| `api` | A | `13.125.8.115` | 3600 | 앱이 붙는 API |
| `www` | A | `13.125.8.115` | 3600 | 301 → `@` |
| `media` | A | `13.125.8.115` | 3600 | 사진·동영상 (§2-5-b) |

- 호스트 칸에 **`api` 만** 씁니다. `api.ramuviamanager.com` 을 쓰면 가비아가 도메인을 또 붙입니다
- **`확인` 다음에 `저장` 을 따로 눌러야** 적용됩니다
- 우선순위 칸은 비워 둡니다 (MX 전용)

**확인할 때는 가비아 네임서버에 직접 물어보세요.** 공개 리졸버(8.8.8.8)는 답을
캐시해 두기 때문에 없는 이름을 있다고 착각하기 쉽습니다 — 2026-10-01 에 이것 때문에
`media` 가 등록된 줄 알고 인증서 발급을 실패했습니다.

```bash
nslookup -type=A api.ramuviamanager.com ns.gabia.co.kr
```

### 2-5-b. `media` 서브도메인 — 왜 필요한가

사진·동영상은 **사전 서명 주소(presigned URL)** 로 주고받습니다. 서명에는 **주소가
그대로 박힙니다.** 운영에서 저장소는 도커 네트워크 안에만 있어 주소가
`http://storage:9000` 인데, 그 주소는 폰에서 닿지 않습니다.

그래서 `.env` 에 폰이 닿을 주소를 따로 적습니다.

```
STORAGE_ENDPOINT=http://storage:9000              # 서버가 쓰는 주소
STORAGE_PUBLIC_URL=https://media.ramuviamanager.com   # 폰이 쓰는 주소 (서명에 박히는 쪽)
```

**경로로는 안 됩니다** (`https://api.ramuviamanager.com/s3` 같은 것). 서명에 경로까지
들어가서, nginx 가 경로를 떼면 저장소가 `SignatureDoesNotMatch` 로 거절합니다.
서브도메인이어야 하고, nginx 가 `Host` 헤더를 그대로 넘겨야 합니다.

> S3 로 옮기면 이 서브도메인은 필요 없어집니다 (§3).

### 2-5-c. Firebase 푸시 키 올리기

서비스 계정 키는 `.gitignore` 대상이라 **이미지에 들어 있지 않습니다.** 넣어 주지 않으면
푸시가 `FIREBASE_SERVICE_ACCOUNT_FILE 이 없어 건너뜁니다` 경고만 남기고 **조용히 꺼진 채**
돌아갑니다. PC 에서:

```bash
scp -i <키>.pem ramupin-server/ramupin-3e75c-firebase-adminsdk-*.json ubuntu@13.125.8.115:~/firebase.json
```

서버에서:

```bash
mkdir -p ~/ramupin-secrets && mv ~/firebase.json ~/ramupin-secrets/firebase.json
chmod 700 ~/ramupin-secrets && chmod 600 ~/ramupin-secrets/firebase.json
```

`docker-compose.prod.yml` 이 이 파일을 `/run/secrets/firebase.json` 으로 읽기 전용
마운트합니다. 경로를 바꾸려면 `.env` 의 `FIREBASE_SECRET_PATH` 를 고칩니다.
제대로 들어갔으면 API 로그에 **`[PushService] 푸시 발송 준비 완료`** 가 찍힙니다.

### 2-6. 인증서 먼저 받기

nginx 는 인증서 파일이 없으면 뜨지 않습니다. 도메인 A 레코드를 탄력적 IP 로 맞춘 뒤:

```bash
docker volume create ramupin-server_certbot-conf
docker volume create ramupin-server_certbot-www
sudo docker run --rm -p 80:80 \
  -v ramupin-server_certbot-conf:/etc/letsencrypt \
  -v ramupin-server_certbot-www:/var/www/certbot \
  certbot/certbot certonly --standalone \
  --cert-name api.ramuviamanager.com \
  -d api.ramuviamanager.com -d ramuviamanager.com -d www.ramuviamanager.com \
  --agree-tos -m devdk@ramuvia.com --no-eff-email -n
```

- **`--cert-name` 을 꼭 주세요.** nginx 설정이 `/etc/letsencrypt/live/${SERVER_NAME}/` 을
  보도록 돼 있어서, 이름이 달라지면 nginx 가 뜨지 않습니다
- 볼륨 이름은 폴더명을 따릅니다 (`docker volume ls` 로 확인)
- 한 주소라도 DNS 가 안 맞으면 **전체가 실패**합니다. 발급 전에 §2-5-a 의 `nslookup` 으로 확인하세요
- 받고 나면 **certbot 컨테이너가 12시간마다 갱신을 확인**합니다

**나중에 주소를 추가**할 때는 `--expand` 로 같은 인증서에 붙입니다 (nginx 를 잠시 내려야 80 이 비워집니다):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app stop nginx
sudo docker run --rm -p 80:80 \
  -v ramupin-server_certbot-conf:/etc/letsencrypt \
  -v ramupin-server_certbot-www:/var/www/certbot \
  certbot/certbot certonly --standalone --expand \
  --cert-name api.ramuviamanager.com \
  -d api.ramuviamanager.com -d ramuviamanager.com -d www.ramuviamanager.com -d media.ramuviamanager.com \
  --agree-tos -m devdk@ramuvia.com --no-eff-email -n
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app up -d nginx
```

### 2-7. 띄우기

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app up -d --build
```

처음에는 빌드에 몇 분 걸립니다. 마이그레이션은 API 가 뜰 때 자동으로 적용됩니다.

```bash
docker compose ps                      # nginx·api·db·redis·storage·certbot
curl -s https://api.ramuviamanager.com/health    # 앱이 붙는 주소
curl -sI https://ramuviamanager.com/            # 관리자 웹
docker compose logs -f api
```

### 2-7-a. MinIO 이미지를 못 받습니다 — 걸려 넘어지는 자리

```
quay.io/minio/minio@sha256:... : 401 UNAUTHORIZED
```

MinIO 는 **2025년부터 컨테이너 이미지에 로그인을 요구**합니다. `quay.io` 와 Docker Hub
모두 막혀 있고, 태그를 바꿔도 안 됩니다. 개발 PC 에서는 이미 받아둔 사본이 있어서
이 문제가 안 보입니다 — **새 서버에서만 터집니다.**

지금은 PC 의 사본을 옮겨서 넘겼습니다.

```bash
# PC 에서 (Git Bash)
docker save quay.io/minio/minio:latest | gzip -1 \
  | ssh -i <키>.pem ubuntu@13.125.8.115 'gunzip | docker load'
```

> ⚠️ **이건 임시 방편입니다.** PC 에서 그 이미지를 지우면 다시 만들 길이 없습니다.
> **근본 해결은 S3 로 가는 것**이고, 그게 지시서가 요구하는 구성입니다 (§3).
> S3 로 가면 MinIO 컨테이너 자체가 없어집니다.

---

## 3. 지시서 1단계 체크리스트

`010.위치추적앱_서버구축_외주작업지시서` 2-2 항목 기준입니다.

| 지시서 항목 | 상태 | 어디 |
|---|---|---|
| VPC / Subnet 설계 (2단계 확장 고려 CIDR) | **해야 함** | §1-3 — 기본 VPC 로 올렸습니다 |
| 보안그룹 — DB 포트 비개방 | **됨** | 22·80·443 만 열림. 5432·6379·9000·3000 닫힘 확인 |
| 보안그룹 — 22·443 만 | **다름** | 80 을 열었습니다 (인증서 자동갱신). §1-2 에 결정 기록 |
| EC2 + SSH 키 인증, 비밀번호 로그인 비활성화 | **됨** | `sshd -T` 로 확인: `passwordauthentication no` · `permitrootlogin no` |
| Docker Compose 로 nginx·nestjs·postgres 분리 | **됨** | `docker-compose.prod.yml` |
| postgres 포트 미노출 (도커 네트워크만) | **됨** | 같은 파일 |
| 회원 / 위치·지오펜스 / 채팅 / 설정값 스키마 분리 | **됨** | `member` · `location`(별도 DB) · `chat` · `config` |
| S3 버킷(비공개) + Presigned URL + VPC Endpoint | **다름** | 아래 — Presigned URL 은 됨, 저장소가 MinIO |
| EBS 볼륨 암호화 | **확인 필요** | AWS 콘솔 → 인스턴스 → 스토리지 → 암호화됨 |
| TLS 인증서 (Let's Encrypt 또는 ACM) | **됨** | §2-6, certbot 이 12시간마다 갱신 확인 |
| CloudTrail, VPC Flow Logs 활성화 | **해야 함** | AWS 콘솔 |
| 관리자 웹 IP 화이트리스트 | 자리 있음 | `docker/nginx/nginx.conf` 의 `/admin` — 고정 IP 정해지면 주석 해제 |

### 사진 저장소 — 지시서와 다른 점

지시서는 **1단계부터 S3** 를 요구합니다. 지금 구성은 **MinIO 컨테이너**입니다.

MinIO 는 **S3 와 같은 규격**이라 코드는 그대로 두고 `.env` 만 바꾸면 S3 로 갑니다:

```
STORAGE_ENDPOINT=https://s3.ap-northeast-2.amazonaws.com
STORAGE_BUCKET=ramupin-media
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
```

S3 로 가면 세 가지가 함께 해결됩니다.

1. **EC2 디스크를 사진이 채우지 않습니다** (58GB 뿐입니다)
2. **MinIO 이미지를 못 받는 문제가 사라집니다** (§2-7-a — 새 서버에서 배포가 막힙니다)
3. `media` 서브도메인과 `STORAGE_PUBLIC_URL` 이 필요 없어집니다 (§2-5-b)

VPC Endpoint 도 쓸 수 있어 지시서에 맞습니다.
**대표님께 S3 버킷 생성을 요청해야 합니다.** 그 전까지는 MinIO 로 동작합니다.

> EC2 에 IAM 역할을 붙이면 `STORAGE_ACCESS_KEY`·`STORAGE_SECRET_KEY` 를 `.env` 에
> 두지 않아도 됩니다. 버킷을 만들 때 함께 요청하는 편이 좋습니다.

---

## 4. 2단계(LIVE) 로 넘어갈 때

`.env` 주소만 바꿉니다. 코드는 그대로입니다.

| 나눌 것 | 1단계 | 2단계 |
|---|---|---|
| 위치 DB | 같은 서버의 **별도 데이터베이스** `ramupin_location` | `LOCATION_DATABASE_URL` → 위치 RDS |
| 회원 DB | 같은 서버 | `MAIN_DATABASE_URL` → 회원 RDS |
| 채팅·설정값 | 같은 서버의 `chat`·`config` 스키마 | 각 RDS 로 |
| 사진 | MinIO | `STORAGE_ENDPOINT` → S3 |
| Redis | 같은 서버 | `REDIS_URL` → ElastiCache |
| 앱서버 | 컨테이너 1개 | Private Subnet + Auto Scaling, 앞에 ALB |

위치는 **데이터베이스 자체가 분리**돼 있어 JOIN 이 애초에 불가능합니다.
그래서 떼어낼 때 코드가 깨지지 않습니다.

---

## 5. 해 두면 좋은 것

- **`PHONE_ENC_KEY`·`PHONE_HASH_KEY` 백업** — **지금 당장 해야 하는 일입니다.**
  서버의 `.env` 에만 있습니다. 서버가 날아가면 **가입자 전화번호를 영영 못 읽고**,
  해시 키가 바뀌면 중복 가입 확인이 전부 어긋납니다. 비밀번호 관리자에 넣으세요
  (엑셀은 권하지 않습니다 — 지금도 `개발사이트ID정리.xlsx` 에 비밀값이 섞여 있습니다)
- **백업**: EBS 스냅샷 하루 1회 (AWS Backup). DB 볼륨이 날아가면 전부 잃습니다
- **비용 알림**: Billing 예산 알림. t3.medium + 60GB 면 월 $40 안팎
- **자동 시작**: 컨테이너에 `restart: unless-stopped` 가 있어 재부팅해도 다시 뜹니다
- **디스크 감시**: `df -h`. 사진이 쌓이면 늘어납니다 (S3 로 옮기면 해결)
