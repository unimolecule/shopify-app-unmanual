import { DEFAULT_APP_BUCKET_PROVIDERS } from "@shamt/app-env";
import { internalServerError, payloadTooLargeError } from "@/shared/exceptions";
import { S3CompatibleBucket } from "./process.s3-compatible";
import {
  getBucketEnvConfig,
  getR2BucketConfig,
  type Bucket,
  type BucketDeleteInput,
  type BucketOpenInput,
  type BucketPutInput,
  type BucketReadableObject,
  type BucketStoredObject,
} from "./shared";
import type { RuntimeConfig } from "@/infra/env";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

let processBucket: Promise<Bucket> | undefined;
let processBucketCacheKey: string | undefined;

/**
 * Reuses the selected process bucket client across Node requests.
 */
export function getProcessBucket(config: RuntimeConfig): Promise<Bucket> {
  const cacheKey = getProcessBucketCacheKey(config);

  if (!processBucket || processBucketCacheKey !== cacheKey) {
    processBucket = createProcessBucket(config);
    processBucketCacheKey = cacheKey;
  }

  return processBucket;
}

/**
 * Creates the process bucket implementation for the configured provider.
 */
export async function createProcessBucket(
  config: RuntimeConfig,
): Promise<Bucket> {
  const strategy = getBucketEnvConfig(config);

  if (strategy.provider === DEFAULT_APP_BUCKET_PROVIDERS.R2) {
    return new S3CompatibleBucket(await getR2BucketConfig(config));
  }

  return new ProcessMemoryBucket(
    `${process.cwd()}/public/${config.APP_FILE_DIR}`,
  );
}

/**
 * Clears the cached process bucket adapter.
 */
export function disposeProcessBucket(): void {
  processBucket = undefined;
  processBucketCacheKey = undefined;
}

/**
 * Stores bucket objects on the Node filesystem for the memory provider.
 * The public provider name remains "memory" even though the development
 * implementation persists bytes under public/{APP_FILE_DIR}.
 */
export class ProcessMemoryBucket implements Bucket {
  readonly rootDir: string;
  private resolvedRootDir: string | undefined;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async put(input: BucketPutInput): Promise<BucketStoredObject> {
    const [
      { createWriteStream },
      { mkdir, rm },
      { dirname },
      { Readable },
      { pipeline },
    ] = await Promise.all([
      import("node:fs"),
      import("node:fs/promises"),
      import("node:path"),
      import("node:stream"),
      import("node:stream/promises"),
    ]);
    const path = await this.getPath(input.key);
    let byteSize = 0;

    await mkdir(dirname(path), { recursive: true });

    try {
      await pipeline(
        Readable.fromWeb(
          input.body as unknown as NodeReadableStream<Uint8Array>,
        ),
        async function* limitBytes(source) {
          for await (const chunk of source) {
            byteSize += chunk.byteLength;
            if (byteSize > input.maxBytes) {
              throw payloadTooLargeError(
                "Upload request body overflow maxsize",
                {
                  details: {
                    maxSize: input.maxBytes,
                  },
                },
              );
            }

            yield chunk;
          }
        },
        createWriteStream(path, { flags: "wx" }),
      );
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }

    return {
      byteSize,
      key: input.key,
      provider: DEFAULT_APP_BUCKET_PROVIDERS.MEMORY,
    };
  }

  async open(input: BucketOpenInput): Promise<BucketReadableObject> {
    const [{ createReadStream }, { stat }, { Readable }] = await Promise.all([
      import("node:fs"),
      import("node:fs/promises"),
      import("node:stream"),
    ]);
    const path = await this.getPath(input.key);

    try {
      const metadata = await stat(path);
      return {
        body: Readable.toWeb(
          createReadStream(path),
        ) as unknown as ReadableStream<Uint8Array>,
        byteSize: metadata.size,
      };
    } catch (error) {
      throw internalServerError("Failed to open bucket object", {
        details: {
          cause: error,
          key: input.key,
        },
      });
    }
  }

  async delete(input: BucketDeleteInput): Promise<void> {
    const { rm } = await import("node:fs/promises");
    await rm(await this.getPath(input.key), { force: true });
  }

  /**
   * Resolves a bucket key under the configured root and rejects path traversal.
   */
  private async getPath(key: string): Promise<string> {
    const { join, normalize, resolve, sep } = await import("node:path");
    const rootDir = this.resolvedRootDir ?? resolve(this.rootDir);
    this.resolvedRootDir = rootDir;
    const normalizedKey = normalize(key);
    const path = resolve(join(rootDir, normalizedKey));

    if (path !== rootDir && !path.startsWith(`${rootDir}${sep}`)) {
      throw internalServerError("Invalid bucket object key", {
        details: {
          key,
        },
      });
    }

    return path;
  }
}

/**
 * Builds the process bucket cache key from the fields that change adapters.
 */
function getProcessBucketCacheKey(config: RuntimeConfig): string {
  const strategy = getBucketEnvConfig(config);

  if (strategy.provider === DEFAULT_APP_BUCKET_PROVIDERS.R2) {
    return [
      strategy.provider,
      config.APP_BUCKET_R2_URL,
      config.APP_CLOUDFLARE_USER_TOKEN,
    ].join(":");
  }

  return [strategy.provider, config.APP_FILE_DIR].join(":");
}
