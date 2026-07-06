import { DEFAULT_APP_BUCKET_PROVIDERS } from "@shamt/app-env";
import {
  getBucketEnvConfig,
  getR2BucketConfig,
  type BucketDownloadSigner,
} from "./shared";
import type { RuntimeConfig } from "@/infra/env";

export {
  getBucketEnvConfig,
  getR2BucketConfig,
  type Bucket,
  type BucketDownloadSigner,
  type BucketProvider,
  type BucketReadableObject,
  type BucketStoredObject,
} from "./shared";

/**
 * Creates the configured bucket download signer when the provider supports
 * signed download URLs.
 */
export async function createBucketDownloadSigner(
  config: RuntimeConfig,
): Promise<BucketDownloadSigner | undefined> {
  const strategy = getBucketEnvConfig(config);

  if (strategy.provider !== DEFAULT_APP_BUCKET_PROVIDERS.R2) {
    return undefined;
  }

  const { R2SignedUrlDownloadSigner } = await import("./r2-signed-url");

  return new R2SignedUrlDownloadSigner(await getR2BucketConfig(config));
}
