import {
  DEFAULT_APP_BUCKET_PROVIDERS,
  DEFAULT_RUNTIMES,
} from "@unimolecule/shopify-app-unmanual-app-env";
import { sha256Hex } from "@unimolecule/utils";
import { internalServerError, payloadTooLargeError } from "@/shared/exceptions";
import { getCloudflareTokenId } from "@/utils/cloudflare";
import type { RuntimeConfig } from "@/infra/env";

export type BucketProvider = NonNullable<RuntimeConfig["APP_BUCKET_PROVIDER"]>;
export type BucketRuntimeStrategy = {
  provider: BucketProvider;
  runtime: RuntimeConfig["APP_RUNTIME"];
};

export type BucketPutInput = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  expiresAt: Date;
  key: string;
  maxBytes: number;
  maxParts?: number;
  originalName: string;
  safeName: string;
  shopDomain: string;
};

export type BucketStoredObject = {
  byteSize: number;
  key: string;
  provider: BucketProvider;
};

export type BucketOpenInput = {
  key: string;
};

export type BucketReadableObject = {
  body: ReadableStream<Uint8Array>;
  byteSize: number;
};

export type BucketDeleteInput = {
  key: string;
};

export type BucketDownloadSignInput = {
  contentType: string;
  expiresInMilliseconds: number;
  key: string;
  originalName: string;
};

export interface Bucket {
  put: (input: BucketPutInput) => Promise<BucketStoredObject>;
  open: (input: BucketOpenInput) => Promise<BucketReadableObject>;
  delete: (input: BucketDeleteInput) => Promise<void>;
}

export interface BucketDownloadSigner {
  signDownloadUrl: (input: BucketDownloadSignInput) => Promise<string>;
}

export const MULTIPART_UPLOAD_MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_MULTIPART_UPLOAD_PART_SIZE_BYTES = 10 * 1024 * 1024;

export type MultipartUploadPart = {
  bytes: Uint8Array;
  partNumber: number;
};

export type MultipartUploadReadOptions = {
  maxBytes: number;
  maxParts?: number;
};

/**
 * Normalizes multipart upload part size.
 *
 * S3-compatible and Cloudflare R2 multipart uploads require every non-final
 * part to respect a 5 MiB minimum, so smaller configured values are raised.
 */
export function normalizeMultipartUploadPartSize(
  partSizeBytes = DEFAULT_MULTIPART_UPLOAD_PART_SIZE_BYTES,
): number {
  return Math.max(partSizeBytes, MULTIPART_UPLOAD_MIN_PART_SIZE_BYTES);
}

/**
 * Splits a Web stream into fixed-size multipart upload parts while enforcing
 * the caller's object-size limit.
 */
export async function* readMultipartUploadParts(
  stream: ReadableStream<Uint8Array>,
  partSizeBytes: number,
  options: MultipartUploadReadOptions,
): AsyncGenerator<MultipartUploadPart> {
  const reader = stream.getReader();
  let buffered = new Uint8Array(partSizeBytes);
  let bufferedLength = 0;
  let byteSize = 0;
  let partNumber = 1;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      byteSize += value.byteLength;
      if (byteSize > options.maxBytes) {
        throw createMultipartUploadTooLargeError(options.maxBytes);
      }

      let offset = 0;
      while (offset < value.byteLength) {
        const writableBytes = Math.min(
          partSizeBytes - bufferedLength,
          value.byteLength - offset,
        );
        buffered.set(
          value.subarray(offset, offset + writableBytes),
          bufferedLength,
        );
        bufferedLength += writableBytes;
        offset += writableBytes;

        if (bufferedLength === partSizeBytes) {
          assertMultipartUploadPartWithinLimit(partNumber, options.maxParts);
          yield {
            bytes: buffered,
            partNumber,
          };
          partNumber += 1;
          buffered = new Uint8Array(partSizeBytes);
          bufferedLength = 0;
        }
      }
    }

    if (bufferedLength > 0 || partNumber === 1) {
      assertMultipartUploadPartWithinLimit(partNumber, options.maxParts);
      yield {
        bytes: buffered.subarray(0, bufferedLength),
        partNumber,
      };
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

function assertMultipartUploadPartWithinLimit(
  partNumber: number,
  maxParts: number | undefined,
) {
  if (maxParts === undefined || partNumber <= maxParts) return;

  throw createMultipartUploadTooManyPartsError(maxParts);
}

export function createMultipartUploadTooLargeError(maxBytes: number) {
  return payloadTooLargeError("Upload request body overflow maxsize", {
    details: {
      maxSize: maxBytes,
    },
  });
}

export function createMultipartUploadTooManyPartsError(maxParts: number) {
  return payloadTooLargeError("Upload request body overflow max parts", {
    details: {
      maxParts,
    },
  });
}

/**
 * Returns the configured bucket strategy and rejects runtime/provider pairs
 * that cannot be executed by the current infrastructure.
 *
 * Example:
 * - node defaults to memory and may opt into r2.
 * - cloudflare defaults to r2 and rejects memory.
 */
export function getBucketEnvConfig(
  config: RuntimeConfig,
): BucketRuntimeStrategy {
  const strategy: BucketRuntimeStrategy = {
    provider: getBucketProvider(config),
    runtime: config.APP_RUNTIME,
  };

  if (
    strategy.runtime === DEFAULT_RUNTIMES.CLOUDFLARE &&
    strategy.provider !== DEFAULT_APP_BUCKET_PROVIDERS.R2
  ) {
    throw internalServerError(
      "Cloudflare runtime only supports the r2 bucket provider",
      {
        details: strategy,
        expose: true,
      },
    );
  }

  if (
    strategy.runtime === DEFAULT_RUNTIMES.NODE &&
    ![
      DEFAULT_APP_BUCKET_PROVIDERS.MEMORY,
      DEFAULT_APP_BUCKET_PROVIDERS.R2,
    ].includes(strategy.provider)
  ) {
    throw internalServerError("Node runtime does not support bucket provider", {
      details: strategy,
      expose: true,
    });
  }

  return strategy;
}

/**
 * Reads the required R2 S3-compatible config for runtimes that access R2
 * through the S3 API.
 *
 * Example: Node + r2 needs these credentials; Cloudflare + r2 uses a binding.
 */
export async function getR2BucketConfig(config: RuntimeConfig) {
  const missing = [
    ["APP_BUCKET_R2_URL", config.APP_BUCKET_R2_URL],
    ["APP_CLOUDFLARE_USER_TOKEN", config.APP_CLOUDFLARE_USER_TOKEN],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw internalServerError("R2 bucket config is incomplete", {
      details: {
        missing,
      },
      expose: true,
    });
  }
  const url = parseR2BucketUrl(config.APP_BUCKET_R2_URL!);
  const token = config.APP_CLOUDFLARE_USER_TOKEN!;
  const [accessKeyId, secretAccessKey] = await Promise.all([
    getCloudflareTokenId(config, token),
    sha256Hex(token),
  ]);

  return {
    region: "auto", // Required by AWS SDK, not used by R2
    // Provide your R2 endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
    endpoint: url.endpoint,
    bucketName: url.bucketName,
    accessKeyId,
    secretAccessKey,
  };
}

/**
 * Parses APP_BUCKET_R2_URL as an S3 endpoint URL with the bucket in the path.
 *
 * Example: https://account-id.r2.cloudflarestorage.com/my-bucket
 */
function parseR2BucketUrl(value: string): {
  bucketName: string;
  endpoint: string;
} {
  let url: URL;

  try {
    url = new URL(value);
  } catch (error) {
    throw internalServerError(
      "APP_BUCKET_R2_URL must be a valid R2 S3 endpoint URL with bucket path",
      {
        details: {
          cause: error,
        },
        expose: true,
      },
    );
  }

  const bucketName = url.pathname.split("/").find(Boolean);

  if (!bucketName) {
    throw internalServerError(
      "APP_BUCKET_R2_URL must be a valid R2 S3 endpoint URL with bucket path",
      {
        details: {
          reason: "missing bucket path",
        },
        expose: true,
      },
    );
  }

  url.pathname = "";
  url.search = "";
  url.hash = "";

  return {
    bucketName,
    endpoint: url.toString().replace(/\/$/, ""),
  };
}

/**
 * Reads APP_BUCKET_PROVIDER with runtime-aware defaults for older env files.
 */
function getBucketProvider(config: RuntimeConfig): BucketProvider {
  if (config.APP_BUCKET_PROVIDER) return config.APP_BUCKET_PROVIDER;

  return config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE
    ? DEFAULT_APP_BUCKET_PROVIDERS.R2
    : DEFAULT_APP_BUCKET_PROVIDERS.MEMORY;
}
