import { DEFAULT_APP_BUCKET_PROVIDERS } from "@shamt/app-env";
import { internalServerError } from "@/shared/exceptions";
import {
  normalizeMultipartUploadPartSize,
  readMultipartUploadParts,
  type Bucket,
  type BucketDeleteInput,
  type BucketOpenInput,
  type BucketPutInput,
  type BucketReadableObject,
  type BucketStoredObject,
} from "./shared";

export type S3CompatibleBucketConfig = {
  accessKeyId: string;
  bucketName: string;
  endpoint: string;
  secretAccessKey: string;
};

export type S3CompatibleBucketOptions = {
  /**
   * Multipart upload part size. S3-compatible APIs require every non-final
   * part to be at least 5 MiB, so smaller configured values are raised to 5 MiB.
   */
  partSizeBytes?: number;
};

/**
 * Stores bucket objects through the S3-compatible API used by Cloudflare R2.
 */
export class S3CompatibleBucket implements Bucket {
  private clientPromise:
    Promise<import("@aws-sdk/client-s3").S3Client> | undefined;
  private readonly partSizeBytes: number;

  constructor(
    private readonly config: S3CompatibleBucketConfig,
    options: S3CompatibleBucketOptions = {},
  ) {
    this.partSizeBytes = normalizeMultipartUploadPartSize(
      options.partSizeBytes,
    );
  }

  async put(input: BucketPutInput): Promise<BucketStoredObject> {
    return await this.multipartPut(input);
  }

  async open(input: BucketOpenInput): Promise<BucketReadableObject> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    const object = await client.send(
      new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: input.key,
      }),
    );

    if (!object.Body) {
      throw internalServerError("Failed to open R2 bucket object", {
        details: {
          key: input.key,
        },
      });
    }

    return {
      body: toWebReadableStream(object.Body),
      byteSize: Number(object.ContentLength ?? 0),
    };
  }

  async delete(input: BucketDeleteInput): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    await client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: input.key,
      }),
    );
  }

  private getClient() {
    this.clientPromise ??= createS3CompatibleClient(this.config);
    return this.clientPromise;
  }

  private async multipartPut(
    input: BucketPutInput,
  ): Promise<BucketStoredObject> {
    const {
      AbortMultipartUploadCommand,
      CompleteMultipartUploadCommand,
      CreateMultipartUploadCommand,
      UploadPartCommand,
    } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    const createResult = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.config.bucketName,
        ContentType: input.contentType,
        Key: input.key,
      }),
    );
    const uploadId = createResult.UploadId;

    if (!uploadId) {
      throw internalServerError("Failed to start R2 multipart upload", {
        details: {
          key: input.key,
        },
      });
    }

    const parts: Array<{ ETag: string; PartNumber: number }> = [];
    let byteSize = 0;

    try {
      for await (const part of readMultipartUploadParts(
        input.body,
        this.partSizeBytes,
        {
          maxBytes: input.maxBytes,
          maxParts: input.maxParts,
        },
      )) {
        byteSize += part.bytes.byteLength;

        const result = await client.send(
          new UploadPartCommand({
            Body: part.bytes as never,
            Bucket: this.config.bucketName,
            ContentLength: part.bytes.byteLength,
            Key: input.key,
            PartNumber: part.partNumber,
            UploadId: uploadId,
          }),
        );

        parts.push({
          ETag: result.ETag ?? "",
          PartNumber: part.partNumber,
        });
      }

      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.config.bucketName,
          Key: input.key,
          MultipartUpload: {
            Parts: parts,
          },
          UploadId: uploadId,
        }),
      );

      return {
        byteSize,
        key: input.key,
        provider: DEFAULT_APP_BUCKET_PROVIDERS.R2,
      };
    } catch (error) {
      await client
        .send(
          new AbortMultipartUploadCommand({
            Bucket: this.config.bucketName,
            Key: input.key,
            UploadId: uploadId,
          }),
        )
        .catch(() => undefined);

      throw error;
    }
  }
}

/**
 * Creates an AWS SDK S3 client configured for Cloudflare R2 compatibility.
 */
async function createS3CompatibleClient(config: S3CompatibleBucketConfig) {
  const { S3Client } = await import("@aws-sdk/client-s3");

  return new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    region: "auto",
  });
}

/**
 * Normalizes AWS SDK response bodies into Web streams for Hono responses.
 */
function toWebReadableStream(body: unknown): ReadableStream<Uint8Array> {
  if (body instanceof ReadableStream) return body;

  if (
    body &&
    typeof body === "object" &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  ) {
    return body.transformToWebStream() as ReadableStream<Uint8Array>;
  }

  throw internalServerError("Unsupported R2 response body type");
}
