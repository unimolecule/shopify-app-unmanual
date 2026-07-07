import {
  DEFAULT_APP_DATABASE_PROVIDERS,
  DEFAULT_RUNTIMES,
} from "@unimolecule/shopify-app-unmanual-app-env";
import { internalServerError } from "@/shared/exceptions";
import type { RuntimeConfig } from "@/infra/env";

export type DatabaseRuntimeStrategy = {
  provider: RuntimeConfig["APP_DATABASE_PROVIDER"];
  runtime: RuntimeConfig["APP_RUNTIME"];
};
export type DatabaseDialect = "postgres" | "sqlite";
export type DatabaseHealthCheckResult = DatabaseRuntimeStrategy & {
  dialect: DatabaseDialect;
  latencyMs: number;
  message?: string;
  status: "error" | "ok";
};

/**
 * Returns the configured database strategy and rejects runtime/provider pairs
 * that cannot be executed by the current infrastructure.
 *
 * Supported matrix:
 * - node + postgres
 * - cloudflare + d1
 */
export function getDatabaseEnvConfig(
  config: RuntimeConfig,
): DatabaseRuntimeStrategy {
  const strategy: DatabaseRuntimeStrategy = {
    provider: getDatabaseProvider(config),
    runtime: config.APP_RUNTIME,
  };

  if (
    strategy.runtime === DEFAULT_RUNTIMES.NODE &&
    strategy.provider !== DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES
  ) {
    throw internalServerError(
      "Node runtime only supports the postgres database provider",
      {
        details: strategy,
        expose: true,
      },
    );
  }

  if (
    strategy.runtime === DEFAULT_RUNTIMES.CLOUDFLARE &&
    strategy.provider !== DEFAULT_APP_DATABASE_PROVIDERS.D1
  ) {
    throw internalServerError(
      "Cloudflare runtime only supports the d1 database provider",
      {
        details: strategy,
        expose: true,
      },
    );
  }

  if (
    strategy.runtime !== DEFAULT_RUNTIMES.NODE &&
    strategy.runtime !== DEFAULT_RUNTIMES.CLOUDFLARE
  ) {
    throw internalServerError("Runtime does not support database providers", {
      details: strategy,
      expose: true,
    });
  }

  return strategy;
}

function getDatabaseProvider(
  config: RuntimeConfig,
): NonNullable<RuntimeConfig["APP_DATABASE_PROVIDER"]> {
  if (config.APP_DATABASE_PROVIDER) return config.APP_DATABASE_PROVIDER;

  return config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE
    ? DEFAULT_APP_DATABASE_PROVIDERS.D1
    : DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES;
}

/**
 * Reads the database URL from validated runtime env with DATABASE_URL fallback
 * for local Node tooling.
 */
export function getDatabaseUrl(config: RuntimeConfig): string {
  const url =
    config.APP_DATABASE_URL ??
    (typeof process === "undefined" ? undefined : process.env.DATABASE_URL);

  if (!url) {
    throw internalServerError("APP_DATABASE_URL is required", {
      expose: true,
    });
  }

  return url;
}

/**
 * Converts an unknown database health check failure into a public message.
 */
export function getDatabaseCheckErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Database check failed";
}

/**
 * Returns a stable millisecond duration with two decimal places.
 */
export function getDatabaseCheckLatencyMs(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}
