import { DEFAULT_APP_DATABASE_PROVIDERS } from "@unimolecule/shopify-app-unmanual-app-env";
import * as sqliteDatabaseSchema from "@unimolecule/shopify-app-unmanual-database/models/sqlite";
import { internalServerError } from "@/shared/exceptions";
import {
  getDatabaseCheckErrorMessage,
  getDatabaseCheckLatencyMs,
  getDatabaseEnvConfig,
  type DatabaseHealthCheckResult,
} from "./shared";
import type { RuntimeConfig } from "@/infra/env";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export type IsolateD1Database = {
  check: () => Promise<DatabaseHealthCheckResult>;
  db: DrizzleD1Database<typeof sqliteDatabaseSchema>;
  dialect: "sqlite";
  provider: typeof DEFAULT_APP_DATABASE_PROVIDERS.D1;
  runtime: RuntimeConfig["APP_RUNTIME"];
};
export type IsolateDatabase = IsolateD1Database;
export type IsolateDatabaseOptions = {
  d1?: D1Database;
};

/**
 * Creates an isolate-safe Drizzle database client from request-bound bindings.
 */
export async function createIsolateDatabase(
  config: RuntimeConfig,
  options: IsolateDatabaseOptions = {},
): Promise<IsolateDatabase> {
  getDatabaseEnvConfig(config);

  const { drizzle } = await import("drizzle-orm/d1");
  const d1 = requireD1(options.d1);

  return {
    check: () => checkIsolateDatabase(d1, config),
    db: drizzle(d1, { schema: sqliteDatabaseSchema }),
    dialect: "sqlite",
    provider: DEFAULT_APP_DATABASE_PROVIDERS.D1,
    runtime: config.APP_RUNTIME,
  };
}

/**
 * Runs the isolate database health check through the same D1 binding used by
 * app repositories.
 */
async function checkIsolateDatabase(
  d1: D1Database,
  config: RuntimeConfig,
): Promise<DatabaseHealthCheckResult> {
  const start = performance.now();

  try {
    await d1.prepare("select 1").first();

    return {
      dialect: "sqlite",
      latencyMs: getDatabaseCheckLatencyMs(start),
      provider: DEFAULT_APP_DATABASE_PROVIDERS.D1,
      runtime: config.APP_RUNTIME,
      status: "ok",
    };
  } catch (error) {
    return {
      dialect: "sqlite",
      latencyMs: getDatabaseCheckLatencyMs(start),
      message: getDatabaseCheckErrorMessage(error),
      provider: DEFAULT_APP_DATABASE_PROVIDERS.D1,
      runtime: config.APP_RUNTIME,
      status: "error",
    };
  }
}

/**
 * Reserved disposer for isolate database resources.
 * Current Cloudflare D1 clients are request-bound.
 */
export function disposeIsolateDatabase() {
  return Promise.resolve();
}

/**
 * Requires the D1 binding at the database capability boundary.
 */
function requireD1(value: D1Database | undefined): D1Database {
  if (!value) {
    throw internalServerError("Cloudflare D1 binding is required", {
      expose: true,
    });
  }

  return value;
}
