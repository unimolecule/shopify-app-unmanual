import { BucketFileDownloadResolver } from "@/app/modules/file/download";
import { createSqliteFilesRepository } from "@/app/modules/file/repositories/database/sqlite";
import { createSqliteProductExportsRepository } from "@/app/modules/product-export/repositories/database/sqlite";
import { createSqliteReferenceRepository } from "@/app/modules/reference/repositories/database/sqlite";
import { createSqliteShopifySessionStorage } from "@/app/modules/shopify/session-storage/sqlite";
import { createBucketDownloadSigner } from "@/infra/bucket";
import { createIsolateBucket } from "@/infra/bucket/isolate";
import { createIsolateDatabase } from "@/infra/database/isolate";
import {
  createIsolateQueueConsumer,
  createIsolateQueueProducer,
} from "@/infra/queue/isolate";
import { createIsolateScheduler } from "@/infra/scheduler/isolate";
import { runtimeNotSupported } from "@/utils/runtime";
import {
  runtimeCapabilityDatabase,
  runtimeCapabilityLazy,
  type RuntimeCapabilities,
} from "../../runtime-capabilities";
import {
  isCloudflareD1Database,
  isCloudflareQueue,
  isCloudflareR2Bucket,
  requireCloudflareBinding,
} from "./bindings";
import type { RuntimeConfig } from "@/infra/env";

type CloudflareRuntimeCapabilityOptions = {
  env: Record<string, unknown>;
  runtimeEnv: RuntimeConfig;
};

export type CloudflareRuntimeCapabilities = RuntimeCapabilities;

export function runtimeCapabilityCloudflare(
  options: CloudflareRuntimeCapabilityOptions,
): CloudflareRuntimeCapabilities {
  const { env, runtimeEnv } = options;
  const databaseLazy = runtimeCapabilityLazy(() =>
    createIsolateDatabase(runtimeEnv, {
      d1: requireConfiguredCloudflareBinding(
        env,
        runtimeEnv.APP_DATABASE_D1_BINDING,
        "APP_DATABASE_D1_BINDING",
        isCloudflareD1Database,
      ),
    }),
  );
  const database = runtimeCapabilityDatabase(databaseLazy, {
    files: () => createSqliteFilesRepository(databaseLazy()),
    productExports: () => createSqliteProductExportsRepository(databaseLazy()),
    references: () => createSqliteReferenceRepository(databaseLazy()),
  });
  const bucket = runtimeCapabilityLazy(() =>
    createIsolateBucket(runtimeEnv, {
      r2: requireConfiguredCloudflareBinding(
        env,
        runtimeEnv.APP_BUCKET_R2_BINDING,
        "APP_BUCKET_R2_BINDING",
        isCloudflareR2Bucket,
      ),
    }),
  );

  return {
    database,
    bucket,
    queue: {
      producer: runtimeCapabilityLazy(() =>
        createIsolateQueueProducer(runtimeEnv, {
          queue: requireConfiguredCloudflareBinding(
            env,
            runtimeEnv.APP_QUEUE_BINDING,
            "APP_QUEUE_BINDING",
            isCloudflareQueue,
          ),
        }),
      ),
    },
    shopifySessionStorage: runtimeCapabilityLazy(async () =>
      createSqliteShopifySessionStorage(await databaseLazy()),
    ),
    health: {
      disk: () => runtimeNotSupported({ runtime: runtimeEnv.APP_RUNTIME }),
      memory: () => runtimeNotSupported({ runtime: runtimeEnv.APP_RUNTIME }),
    },
    file: {
      downloadResolver: runtimeCapabilityLazy(async () => {
        return new BucketFileDownloadResolver(
          await bucket(),
          await createBucketDownloadSigner(runtimeEnv),
        );
      }),
    },
  };
}

export function runtimeCapabilityCloudflareQueue(
  options: CloudflareRuntimeCapabilityOptions,
) {
  return {
    consumer: runtimeCapabilityLazy(() =>
      createIsolateQueueConsumer(options.runtimeEnv),
    ),
  };
}

export function runtimeCapabilityCloudflareScheduled(
  options: CloudflareRuntimeCapabilityOptions & { cron: string },
) {
  return {
    cron: options.cron,
    scheduler: runtimeCapabilityLazy(() =>
      createIsolateScheduler(options.runtimeEnv),
    ),
  };
}

function requireConfiguredCloudflareBinding<T>(
  env: Record<string, unknown>,
  binding: string | undefined,
  bindingConfigKey: string,
  validate: (value: unknown) => value is T,
): T {
  if (!binding) {
    return requireCloudflareBinding(undefined, bindingConfigKey, validate);
  }

  return requireCloudflareBinding(env[binding], binding, validate);
}
