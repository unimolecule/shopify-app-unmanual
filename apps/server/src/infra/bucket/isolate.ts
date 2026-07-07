import { DEFAULT_APP_BUCKET_PROVIDERS } from "@unimolecule/shopify-app-unmanual-app-env";
import { internalServerError } from "@/shared/exceptions";
import {
  getBucketEnvConfig,
  normalizeMultipartUploadPartSize,
  readMultipartUploadParts,
  type Bucket,
  type BucketDeleteInput,
  type BucketOpenInput,
  type BucketPutInput,
  type BucketReadableObject,
  type BucketStoredObject,
} from "./shared";
import type { RuntimeConfig } from "@/infra/env";

export type IsolateBucketOptions = {
  partSizeBytes?: number;
  r2?: R2Bucket;
};

/**
 * Creates the isolate bucket implementation for the configured provider.
 *
 * Example: Cloudflare + r2 uses the request-bound R2 binding instead of the
 * S3-compatible API to avoid an extra network hop inside Workers.
 */
export function createIsolateBucket(
  config: RuntimeConfig,
  options: IsolateBucketOptions = {},
): Bucket {
  const strategy = getBucketEnvConfig(config);

  if (strategy.provider === DEFAULT_APP_BUCKET_PROVIDERS.R2) {
    return new CloudflareR2Bucket(requireR2Bucket(options.r2), {
      partSizeBytes: options.partSizeBytes,
    });
  }

  throw internalServerError("Isolate runtime does not support memory bucket", {
    details: strategy,
    expose: true,
  });
}

/**
 * Reserved disposer for isolate bucket resources.
 * Current Cloudflare R2 adapters are request-bound.
 */
export function disposeIsolateBucket() {
  return Promise.resolve();
}

/**
 * Stores bucket objects through a Cloudflare R2 binding in isolate runtimes.
 */
export class CloudflareR2Bucket implements Bucket {
  private readonly partSizeBytes: number;

  constructor(
    private readonly bucket: R2Bucket,
    options: Pick<IsolateBucketOptions, "partSizeBytes"> = {},
  ) {
    this.partSizeBytes = normalizeMultipartUploadPartSize(
      options.partSizeBytes,
    );
  }

  async put(input: BucketPutInput): Promise<BucketStoredObject> {
    const upload = await this.bucket.createMultipartUpload(input.key, {
      customMetadata: {
        expiresAt: input.expiresAt.toISOString(),
        originalName: input.originalName,
        safeName: input.safeName,
        shopDomain: input.shopDomain,
      },
      httpMetadata: {
        contentType: input.contentType,
      },
    });
    const parts: R2UploadedPart[] = [];
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
        parts.push(await upload.uploadPart(part.partNumber, part.bytes));
      }

      await upload.complete(parts);
    } catch (error) {
      await upload.abort().catch(() => undefined);
      throw error;
    }

    return {
      byteSize,
      key: input.key,
      provider: DEFAULT_APP_BUCKET_PROVIDERS.R2,
    };
  }

  async open(input: BucketOpenInput): Promise<BucketReadableObject> {
    const object = await this.bucket.get(input.key);

    if (!object) {
      throw internalServerError("Failed to open R2 bucket object", {
        details: {
          key: input.key,
        },
      });
    }

    return {
      body: object.body,
      byteSize: object.size,
    };
  }

  async delete(input: BucketDeleteInput): Promise<void> {
    await this.bucket.delete(input.key);
  }
}

/**
 * Requires the request-bound R2 binding before creating the isolate adapter.
 */
function requireR2Bucket(bucket: R2Bucket | undefined): R2Bucket {
  if (!bucket) {
    throw internalServerError("Cloudflare R2 bucket binding is required", {
      expose: true,
    });
  }

  return bucket;
}
