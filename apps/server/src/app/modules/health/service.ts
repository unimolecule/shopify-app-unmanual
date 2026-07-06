import { runtimeCapabilities } from "@/app/runtime/runtime-capabilities";
import { getDatabaseEnvConfig } from "@/infra/database";
import { getClientProvider, getEnvProvider } from "@/infra/provider";
import type {
  DatabaseHealthDataSchema,
  DiskHealthDataSchema,
  HealthDataSchema,
  MemoryHealthDataSchema,
  NetworkHealthDataSchema,
  NetworkHealthErrorDataSchema,
  ReservedHealthDataSchema,
} from "./meta";
import type { RuntimeConfig } from "@/infra/env";
import type { AppEnv } from "@/typings";
import type { z } from "@hono/zod-openapi";
import type { Context } from "hono";

export type HealthData = z.infer<typeof HealthDataSchema>;
export type DiskHealthData = z.infer<typeof DiskHealthDataSchema>;
export type MemoryHealthData = z.infer<typeof MemoryHealthDataSchema>;
export type NetworkHealthData = z.infer<typeof NetworkHealthDataSchema>;
export type NetworkHealthErrorData = z.infer<
  typeof NetworkHealthErrorDataSchema
>;
export type DatabaseHealthData = z.infer<typeof DatabaseHealthDataSchema>;
export type ReservedHealthData = z.infer<typeof ReservedHealthDataSchema>;

type ReservedHealthTarget = ReservedHealthData["target"];

const NETWORK_HEALTH_URL = "https://example.com";

export async function getHealths(c: Context<AppEnv>): Promise<HealthData> {
  const runtimeConfig = getEnvProvider(c.get("runtimeEnv") ?? c.env);
  const [disk, memory, network, database] = await Promise.all([
    checkDiskHealthSafely(c),
    checkMemoryHealthSafely(c),
    checkNetworkHealthSafely(runtimeConfig),
    checkDatabaseHealth(c),
  ]);
  const checks = {
    database,
    disk,
    memory,
    network,
    redis: getReservedHealthStatus("redis"),
  };

  return {
    checks,
    status: hasHealthError(Object.values(checks)) ? "error" : "ok",
  };
}

/**
 * Runs the module health disk check through the active runtime capability.
 */
export async function checkDiskHealth(
  c: Context<AppEnv>,
): Promise<DiskHealthData> {
  const result = await runtimeCapabilities(c).health.disk(c);

  if (result.status === "unsupported") {
    return {
      status: result.status,
      target: "disk",
      runtime: result.runtime,
    };
  }

  return {
    availableBytes: result.availableBytes,
    checks: result.checks,
    freeBytes: result.freeBytes,
    path: result.path,
    status: result.status,
    target: "disk",
    totalBytes: result.totalBytes,
    usedBytes: result.usedBytes,
    usedPercent: result.usedPercent,
    runtime: result.runtime,
  };
}

export async function checkMemoryHealth(
  c: Context<AppEnv>,
): Promise<MemoryHealthData> {
  const result = await runtimeCapabilities(c).health.memory(c);

  if (result.status === "unsupported") {
    return {
      status: result.status,
      target: "memory",
      runtime: result.runtime,
    };
  }

  return {
    arrayBuffers: result.arrayBuffersBytes,
    checks: result.checks,
    external: result.externalBytes,
    heapTotal: result.heapTotalBytes,
    heapUsed: result.heapUsedBytes,
    message: result.message,
    rss: result.rssBytes,
    status: result.status,
    target: "memory",
    runtime: result.runtime,
  };
}

export async function checkNetworkHealth(
  runtimeConfig: RuntimeConfig,
): Promise<NetworkHealthData> {
  const start = performance.now();
  const httpClient = getClientProvider(runtimeConfig);
  const response = await httpClient.get<Response>(NETWORK_HEALTH_URL, {
    responseType: "response",
  });

  return {
    status: "ok",
    target: "network",
    reachable: true,
    statusCode: response.status,
    latencyMs: getLatencyMs(start),
  };
}

export async function checkDatabaseHealth(
  c: Context<AppEnv>,
): Promise<DatabaseHealthData> {
  const runtimeConfig = getEnvProvider(c.get("runtimeEnv") ?? c.env);

  try {
    const database = await runtimeCapabilities(c).database();
    const result = await database.check();

    return {
      ...result,
      target: "database",
    };
  } catch (error) {
    return createDatabaseHealthError(runtimeConfig, getErrorMessage(error));
  }
}

export function getReservedHealthStatus(
  target: ReservedHealthTarget,
): ReservedHealthData {
  return {
    status: "reserved",
    target,
  };
}

function getLatencyMs(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}

async function checkDiskHealthSafely(c: Context<AppEnv>) {
  try {
    return await checkDiskHealth(c);
  } catch (error) {
    return {
      message: getErrorMessage(error),
      runtime: getEnvProvider(c.get("runtimeEnv") ?? c.env).APP_RUNTIME,
      status: "error" as const,
      target: "disk" as const,
    };
  }
}

async function checkMemoryHealthSafely(c: Context<AppEnv>) {
  try {
    return await checkMemoryHealth(c);
  } catch (error) {
    return {
      message: getErrorMessage(error),
      runtime: getEnvProvider(c.get("runtimeEnv") ?? c.env).APP_RUNTIME,
      status: "error" as const,
      target: "memory" as const,
    };
  }
}

async function checkNetworkHealthSafely(
  runtimeConfig: RuntimeConfig,
): Promise<NetworkHealthData | NetworkHealthErrorData> {
  const start = performance.now();

  try {
    return await checkNetworkHealth(runtimeConfig);
  } catch (error) {
    return {
      latencyMs: getLatencyMs(start),
      message: getErrorMessage(error),
      reachable: false,
      status: "error",
      target: "network",
    };
  }
}

function hasHealthError(
  checks: Array<{ status: "error" | "ok" | "reserved" | "unsupported" }>,
): boolean {
  return checks.some((check) => check.status === "error");
}

function createDatabaseHealthError(
  runtimeConfig: RuntimeConfig,
  message: string,
): DatabaseHealthData {
  const strategy = getDatabaseStrategy(runtimeConfig);

  return {
    dialect: strategy.provider === "d1" ? "sqlite" : "postgres",
    message,
    provider: strategy.provider,
    runtime: runtimeConfig.APP_RUNTIME,
    status: "error",
    target: "database",
  };
}

function getDatabaseStrategy(runtimeConfig: RuntimeConfig) {
  try {
    return getDatabaseEnvConfig(runtimeConfig);
  } catch {
    return {
      provider: runtimeConfig.APP_DATABASE_PROVIDER,
      runtime: runtimeConfig.APP_RUNTIME,
    };
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Database health check failed";
}
