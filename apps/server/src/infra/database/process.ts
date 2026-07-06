import { DEFAULT_APP_DATABASE_PROVIDERS } from "@shamt/app-env";
import * as postgresDatabaseSchema from "@shamt/database/models/postgres";
import {
  getDatabaseCheckErrorMessage,
  getDatabaseCheckLatencyMs,
  getDatabaseEnvConfig,
  getDatabaseUrl,
  type DatabaseHealthCheckResult,
} from "./shared";
import type { RuntimeConfig } from "@/infra/env";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

export type ProcessPostgresDatabase = {
  check: () => Promise<DatabaseHealthCheckResult>;
  db: NodePgDatabase<typeof postgresDatabaseSchema>;
  dialect: "postgres";
  dispose: () => Promise<void>;
  provider: typeof DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES;
  runtime: RuntimeConfig["APP_RUNTIME"];
};
export type ProcessDatabase = ProcessPostgresDatabase;

let processDatabase: Promise<ProcessDatabase> | undefined;
let processDatabaseCacheKey: string | undefined;

/**
 * Reuses the selected process database client across Node requests.
 * The cached Postgres pool is released by disposeProcessDatabase().
 */
export function getProcessDatabase(
  config: RuntimeConfig,
): Promise<ProcessDatabase> {
  const cacheKey = getProcessDatabaseCacheKey(config);

  if (!processDatabase || processDatabaseCacheKey !== cacheKey) {
    processDatabase = createProcessDatabase(config);
    processDatabaseCacheKey = cacheKey;
  }

  return processDatabase;
}

/**
 * Creates the Node process database strategy.
 * Node supports Postgres through pg.Pool.
 */
export async function createProcessDatabase(
  config: RuntimeConfig,
): Promise<ProcessDatabase> {
  getDatabaseEnvConfig(config);

  const [{ drizzle }, { Pool }] = await Promise.all([
    import("drizzle-orm/node-postgres"),
    import("pg"),
  ]);
  const pool = new Pool({ connectionString: getDatabaseUrl(config) });

  return {
    check: () => checkProcessDatabase(pool, config),
    db: drizzle({ client: pool, schema: postgresDatabaseSchema }),
    dialect: "postgres",
    dispose: () => pool.end(),
    provider: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
    runtime: config.APP_RUNTIME,
  };
}

/**
 * Runs the process database health check through the same pg pool used by app
 * repositories.
 */
async function checkProcessDatabase(
  pool: Pool,
  config: RuntimeConfig,
): Promise<DatabaseHealthCheckResult> {
  const start = performance.now();

  try {
    await pool.query("select 1");

    return {
      dialect: "postgres",
      latencyMs: getDatabaseCheckLatencyMs(start),
      provider: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
      runtime: config.APP_RUNTIME,
      status: "ok",
    };
  } catch (error) {
    return {
      dialect: "postgres",
      latencyMs: getDatabaseCheckLatencyMs(start),
      message: getDatabaseCheckErrorMessage(error),
      provider: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
      runtime: config.APP_RUNTIME,
      status: "error",
    };
  }
}

/**
 * Closes the cached process database client and clears its runtime cache.
 */
export async function disposeProcessDatabase(): Promise<void> {
  const database = await processDatabase;
  processDatabase = undefined;
  processDatabaseCacheKey = undefined;

  await database?.dispose();
}

/**
 * Builds the process database cache key from fields that change adapters.
 */
function getProcessDatabaseCacheKey(config: RuntimeConfig): string {
  const strategy = getDatabaseEnvConfig(config);

  return [getDatabaseUrl(config), strategy.provider, strategy.runtime].join(
    ":",
  );
}
