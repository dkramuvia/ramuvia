import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { CreateBucketCommand, DeleteObjectCommand, HeadBucketCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

import { env } from '../config/env.js';

/**
 * 사진·동영상 저장소 (WBS 5.6, 5.7).
 *
 * 개발은 Docker MinIO, 운영은 AWS S3. 둘이 같은 규격이라 주소·키만 바꾸면 이 파일은 그대로입니다.
 *
 * 파일이 API 서버를 거치지 않습니다. 서버는 "여기에 올려라/여기서 받아라" 하는 **사전 서명 주소**만
 * 만들어 주고, 실제 전송은 앱과 저장소가 직접 합니다. 동영상이 서버 메모리를 지나가면
 * 몇 명만 동시에 올려도 API 가 막힙니다.
 */

/** 업로드 주소 유효 시간. 짧게 둬서 주소가 새어도 오래 못 쓰게 합니다 */
const UPLOAD_URL_TTL_SEC = 10 * 60;
/** 조회 주소 유효 시간. 그룹에서 나가면 다음 갱신부터 안 보입니다 (WBS 6) */
const VIEW_URL_TTL_SEC = 60 * 60;

/** 허용하는 형식. 이 밖의 파일은 올릴 주소 자체를 안 줍니다 */
const ALLOWED: Record<string, { kind: 'image' | 'video'; ext: string }> = {
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/png': { kind: 'image', ext: 'png' },
  'image/webp': { kind: 'image', ext: 'webp' },
  'image/heic': { kind: 'image', ext: 'heic' },
  'video/mp4': { kind: 'video', ext: 'mp4' },
  'video/quicktime': { kind: 'video', ext: 'mov' },
};

export interface UploadTarget {
  objectKey: string;
  uploadUrl: string;
  kind: 'image' | 'video';
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  /** 서버가 저장소와 직접 이야기할 때 (버킷 만들기, 파일 확인·삭제) */
  private readonly client: S3Client | null;
  /**
   * 앱에게 줄 주소를 만들 때.
   *
   * 서명에는 **호스트 이름도 들어갑니다.** 그래서 서버 주소로 서명한 뒤 주소만 바꿔치기하면
   * 저장소가 403 을 돌려줍니다 (09-21 에 실제로 겪었습니다).
   * 앱이 접속할 주소로 처음부터 서명해야 합니다.
   */
  private readonly signer: S3Client | null;

  constructor() {
    const credentials = { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY };
    const common = {
      region: 'ap-northeast-2',
      forcePathStyle: true,
      credentials,
      /**
       * 최신 AWS SDK 는 요청마다 체크섬을 붙이는데, 사전 서명 주소를 만들 때는 본문이 없어
       * **빈 내용 기준 체크섬**이 서명에 박힙니다. 앱이 실제 파일을 올리면 값이 달라져
       * 저장소가 SignatureDoesNotMatch 로 거절합니다 (09-21 확인).
       * 꼭 필요할 때만 붙이게 합니다.
       */
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    } as const;
    // MinIO 는 버킷을 주소 앞이 아니라 경로에 둡니다 (S3 로 옮겨도 그대로 동작합니다)
    this.client = env.STORAGE_ENDPOINT ? new S3Client({ ...common, endpoint: env.STORAGE_ENDPOINT }) : null;
    this.signer = env.STORAGE_ENDPOINT
      ? new S3Client({ ...common, endpoint: env.STORAGE_PUBLIC_URL || env.STORAGE_ENDPOINT })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async onModuleInit() {
    if (!this.client) {
      this.logger.warn('저장소 설정이 없어 사진·동영상 공유가 꺼집니다 (STORAGE_ENDPOINT)');
      return;
    }
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: env.STORAGE_BUCKET }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: env.STORAGE_BUCKET }));
      this.logger.log(`저장소 버킷 생성: ${env.STORAGE_BUCKET}`);
    }
    this.logger.log('저장소 준비 완료');
  }

  /**
   * 올릴 주소를 만들어 줍니다. 아직 파일은 없습니다.
   * 형식이 허용 목록에 없으면 null — 올릴 방법 자체를 주지 않습니다.
   */
  async createUploadTarget(userId: string, contentType: string): Promise<UploadTarget | null> {
    const allowed = ALLOWED[contentType];
    if (!allowed || !this.client) return null;

    const now = new Date();
    const yyyymm = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const objectKey = `u/${userId}/${yyyymm}/${randomUUID()}.${allowed.ext}`;
    const uploadUrl = await getSignedUrl(
      this.signer!,
      new PutObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: objectKey, ContentType: contentType }),
      { expiresIn: UPLOAD_URL_TTL_SEC },
    );
    return { objectKey, uploadUrl, kind: allowed.kind };
  }

  /** 실제로 올라왔는지, 크기가 신고한 것과 같은지 확인합니다 (앱 말만 믿지 않습니다) */
  async verifyUpload(objectKey: string): Promise<{ bytes: number; contentType: string } | null> {
    if (!this.client) return null;
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: objectKey }));
      if (!head.ContentLength) return null;
      return { bytes: head.ContentLength, contentType: head.ContentType ?? 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  /** 볼 수 있는 주소. 시간이 지나면 만료되므로 링크를 퍼 날라도 계속 열리지 않습니다 */
  async viewUrl(objectKey: string): Promise<string | null> {
    if (!this.client) return null;
    return getSignedUrl(this.signer!, new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: objectKey }), {
      expiresIn: VIEW_URL_TTL_SEC,
    });
  }

  async remove(objectKey: string): Promise<void> {
    if (!this.client) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: objectKey }));
  }

}
