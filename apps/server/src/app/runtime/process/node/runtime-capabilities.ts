import {
  checkProcessDiskUsage,
  checkProcessMemoryUsage,
} from "@unimolecule/utils/node";
import { BucketFileDownloadResolver } from "@/app/modules/file/download";
import { createPostgresFilesRepository } from "@/app/modules/file/repositories/database/postgres";
import { createPostgresProductExportsRepository } from "@/app/modules/product-export/repositories/database/postgres";
import { createPostgresReferenceRepository } from "@/app/modules/reference/repositories/database/postgres";
import { createPostgresShopifySessionStorage } from "@/app/modules/shopify/session-storage/postgres";
import { createBucketDownloadSigner } from "@/infra/bucket";
import { disposeProcessBucket, getProcessBucket } from "@/infra/bucket/process";
import {
  disposeProcessDatabase,
  getProcessDatabase,
} from "@/infra/database/process";
import {
  createProcessQueueConsumer,
  disposeProcessQueueProducer,
  getProcessQueueProducer,
  stopProcessQueueConsumer,
} from "@/infra/queue/process";
import {
  createProcessScheduler,
  disposeProcessScheduler,
} from "@/infra/scheduler/process";
import {
  runtimeCapabilityDatabase,
  runtimeCapabilityLazy,
  type RuntimeCapabilities,
} from "../../runtime-capabilities";
import type { RuntimeConfig } from "@/infra/env";
import type { QueueConsumer } from "@/infra/queue";
import type { Scheduler } from "@/infra/scheduler";

export type NodeRuntimeCapabilities = RuntimeCapabilities & {
  queue: RuntimeCapabilities["queue"] & {
    consumer: () => QueueConsumer<any> | Promise<QueueConsumer<any>>;
  };
  scheduler: () => Scheduler | Promise<Scheduler>;
};

export function runtimeCapabilityNode(options: {
  runtimeEnv: RuntimeConfig;
}): NodeRuntimeCapabilities {
  const { runtimeEnv } = options;
  const databaseLazy = runtimeCapabilityLazy(() =>
    getProcessDatabase(runtimeEnv),
  );
  const database = runtimeCapabilityDatabase(databaseLazy, {
    files: () => createPostgresFilesRepository(databaseLazy()),
    productExports: () =>
      createPostgresProductExportsRepository(databaseLazy()),
    references: () => createPostgresReferenceRepository(databaseLazy()),
  });
  const bucket = runtimeCapabilityLazy(() => getProcessBucket(runtimeEnv));

  return {
    database,
    bucket,
    queue: {
      producer: runtimeCapabilityLazy(() =>
        getProcessQueueProducer(runtimeEnv),
      ),
      consumer: runtimeCapabilityLazy(() =>
        createProcessQueueConsumer(runtimeEnv),
      ),
    },
    scheduler: runtimeCapabilityLazy(() => createProcessScheduler(runtimeEnv)),
    shopifySessionStorage: runtimeCapabilityLazy(async () =>
      createPostgresShopifySessionStorage(await databaseLazy()),
    ),
    health: {
      disk: async () => ({
        ...(await checkProcessDiskUsage()),
        runtime: runtimeEnv.APP_RUNTIME,
      }),
      memory: () => ({
        ...checkProcessMemoryUsage(),
        runtime: runtimeEnv.APP_RUNTIME,
      }),
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

export async function runtimeCapabilityNodeDispose(): Promise<void> {
  await stopProcessQueueConsumer();
  await disposeProcessScheduler();
  await disposeProcessQueueProducer();
  disposeProcessBucket();
  await disposeProcessDatabase();
}
