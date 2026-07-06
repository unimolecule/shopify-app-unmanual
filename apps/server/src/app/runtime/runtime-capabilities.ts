import { internalServerError } from "@/shared/exceptions";
import type { FilesRepository } from "@/app/modules/file/repositories/database";
import type { FileDownloadResolver } from "@/app/modules/file/types";
import type { ProductExportRepository } from "@/app/modules/product-export/repositories/database";
import type { ReferenceRepository } from "@/app/modules/reference/repositories/database";
import type { ShopifySessionStorage } from "@/app/modules/shopify/session-storage/types";
import type { Bucket } from "@/infra/bucket";
import type { Database } from "@/infra/database";
import type { QueueProducer } from "@/infra/queue";
import type { AppEnv } from "@/typings";
import type { RuntimeUnsupportedResult } from "@/utils/runtime";
import type {
  ProcessDiskUsageCheckResult,
  ProcessMemoryUsageCheckResult,
} from "@unimolecule/utils/node";
import type { Context } from "hono";

export type RuntimeCapabilityLazy<T> = () => T | Promise<T>;
export type RuntimeCapabilityDatabaseRepositories = {
  files: () => FilesRepository;
  productExports: () => ProductExportRepository;
  references: () => ReferenceRepository;
};
export type RuntimeCapabilityDatabase = RuntimeCapabilityLazy<Database> & {
  repositories: RuntimeCapabilityDatabaseRepositories;
};
export type RuntimeCapabilityHealthRuntimeResult = {
  runtime: string;
};
export type RuntimeCapabilityDiskCheckResult =
  | (ProcessDiskUsageCheckResult & RuntimeCapabilityHealthRuntimeResult)
  | RuntimeUnsupportedResult;
export type RuntimeCapabilityMemoryCheckResult =
  | (ProcessMemoryUsageCheckResult & RuntimeCapabilityHealthRuntimeResult)
  | RuntimeUnsupportedResult;
export type RuntimeCapabilityDiskChecker = (
  context: Context<AppEnv>,
) =>
  Promise<RuntimeCapabilityDiskCheckResult> | RuntimeCapabilityDiskCheckResult;
export type RuntimeCapabilityMemoryChecker = (
  context: Context<AppEnv>,
) =>
  | Promise<RuntimeCapabilityMemoryCheckResult>
  | RuntimeCapabilityMemoryCheckResult;

export type RuntimeCapabilities = {
  database: RuntimeCapabilityDatabase;
  bucket: RuntimeCapabilityLazy<Bucket>;
  queue: {
    producer: RuntimeCapabilityLazy<QueueProducer>;
  };
  shopifySessionStorage: RuntimeCapabilityLazy<ShopifySessionStorage>;
  health: {
    disk: RuntimeCapabilityDiskChecker;
    memory: RuntimeCapabilityMemoryChecker;
  };
  file: {
    downloadResolver: RuntimeCapabilityLazy<FileDownloadResolver>;
  };
};

export function runtimeCapabilityLazy<T>(
  create: () => T | Promise<T>,
): RuntimeCapabilityLazy<T> {
  let value: T | Promise<T> | undefined;

  return () => {
    value ??= create();
    return value;
  };
}

export function runtimeCapabilityDatabase(
  create: RuntimeCapabilityLazy<Database>,
  repositories: RuntimeCapabilityDatabaseRepositories,
): RuntimeCapabilityDatabase {
  return Object.assign(create, { repositories });
}

export function runtimeCapabilities(c: Context<AppEnv>): RuntimeCapabilities {
  const capabilities = c.get("runtimeCapabilities");

  if (!capabilities) {
    throw internalServerError("Runtime capabilities are not available", {
      expose: true,
    });
  }

  return capabilities;
}
