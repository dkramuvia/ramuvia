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

## 1. 인스턴스 설정값

| 항목 | 값 | 비고 |
|---|---|---|
| **리전** | **서울 `ap-northeast-2`** | 지시서 지정. **나중에 못 바꿉니다** |
| AMI | Ubuntu LTS (24.04 권장) 또는 Amazon Linux 2023 | §2 에 둘 다 적었습니다 |
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

> **대표님 확인이 필요합니다.** 지시서를 엄격히 지키려면 3번, 운영이 편한 것은 1번입니다.

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

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
```

**한 번 로그아웃했다 다시 접속**합니다 (그래야 `sudo` 없이 `docker` 가 됩니다).
`docker compose version` 이 v2.x 를 찍으면 됩니다.

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

### 2-3. 스왑 (권장)

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 2-4. 소스 올리기

**(가) GitHub 에서** — 이후 업데이트가 `git pull` 한 줄입니다.
지금 로컬에 푸시 안 된 커밋이 많아 **먼저 푸시 승인이 필요합니다.**

**(나) PC 에서 직접 복사** — 푸시 없이 지금 바로 됩니다. PC 의 Git Bash 에서:

```bash
cd /e/ramuvia
rsync -avz --exclude node_modules --exclude dist --exclude .git -e "ssh -i <키파일>.pem" ramupin-server ubuntu@<탄력적IP>:~/
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
| `SERVER_NAME` | **도메인** (예: `api.ramuvia.co.kr`). nginx·인증서가 씁니다 |
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

### 2-6. 인증서 먼저 받기

nginx 는 인증서 파일이 없으면 뜨지 않습니다. 도메인 A 레코드를 탄력적 IP 로 맞춘 뒤:

```bash
docker volume create ramupin-server_certbot-conf
docker volume create ramupin-server_certbot-www
docker run --rm -p 80:80 -v ramupin-server_certbot-conf:/etc/letsencrypt -v ramupin-server_certbot-www:/var/www/certbot certbot/certbot certonly --standalone -d <도메인> --agree-tos -m <메일> --no-eff-email
```

볼륨 이름은 폴더명을 따릅니다. `docker volume ls` 로 확인하세요.
받고 나면 **certbot 컨테이너가 12시간마다 갱신을 확인**합니다.

### 2-7. 띄우기

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app up -d --build
```

처음에는 빌드에 몇 분 걸립니다. 마이그레이션은 API 가 뜰 때 자동으로 적용됩니다.

```bash
docker compose ps                      # nginx·api·db·redis·storage
curl -s https://<도메인>/health         # 응답 확인
docker compose logs -f api
```

---

## 3. 지시서 1단계 체크리스트

`010.위치추적앱_서버구축_외주작업지시서` 2-2 항목 기준입니다.

| 지시서 항목 | 상태 | 어디 |
|---|---|---|
| VPC / Subnet 설계 (2단계 확장 고려 CIDR) | **해야 함** | §1-3 |
| 보안그룹 — 22·443 만, DB 포트 비개방 | **해야 함** | §1-2 |
| EC2 + SSH 키 인증, 비밀번호 로그인 비활성화 | 일부 | §2-2 |
| Docker Compose 로 nginx·nestjs·postgres 분리 | **됨** | `docker-compose.prod.yml` |
| postgres 포트 미노출 (도커 네트워크만) | **됨** | 같은 파일 |
| 회원 / 위치·지오펜스 / 채팅 / 설정값 스키마 분리 | **됨** | `member` · `location`(별도 DB) · `chat` · `config` |
| S3 버킷(비공개) + Presigned URL + VPC Endpoint | **다름** | 아래 |
| EBS 볼륨 암호화 | 인스턴스 만들 때 | §1 |
| TLS 인증서 (Let's Encrypt 또는 ACM) | **됨** | §2-6, certbot 이 자동 갱신 |
| CloudTrail, VPC Flow Logs 활성화 | **해야 함** | AWS 콘솔 |
| 관리자 웹 IP 화이트리스트 | 자리 있음 | `docker/nginx/nginx.conf` 의 `/admin` |

### 사진 저장소 — 지시서와 다른 점

지시서는 **1단계부터 S3** 를 요구합니다. 지금 구성은 **MinIO 컨테이너**입니다.

MinIO 는 **S3 와 같은 규격**이라 코드는 그대로 두고 `.env` 만 바꾸면 S3 로 갑니다:

```
STORAGE_ENDPOINT=https://s3.ap-northeast-2.amazonaws.com
STORAGE_BUCKET=ramupin-media
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
```

S3 로 가면 **EC2 디스크를 사진이 채우지 않고**, VPC Endpoint 도 쓸 수 있어 지시서에 맞습니다.
**대표님께 S3 버킷 생성을 요청해 주세요.** 그 전까지는 MinIO 로 동작합니다.

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

- **백업**: EBS 스냅샷 하루 1회 (AWS Backup). DB 볼륨이 날아가면 전부 잃습니다
- **비용 알림**: Billing 예산 알림. t3.medium + 60GB 면 월 $40 안팎
- **자동 시작**: 컨테이너에 `restart: unless-stopped` 가 있어 재부팅해도 다시 뜹니다
- **디스크 감시**: `df -h`. 사진이 쌓이면 늘어납니다 (S3 로 옮기면 해결)
