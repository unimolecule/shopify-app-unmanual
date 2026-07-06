import {
  DEFAULT_APP_DATABASE_PROVIDERS,
  DEFAULT_APP_SCHEDULER_PROVIDERS,
  DEFAULT_RUNTIMES,
} from "@shamt/app-env";
import { internalServerError } from "@/shared/exceptions";
import type { SchedulerTaskContext } from "./registry";
import type { RuntimeConfig } from "@/infra/env";

export type SchedulerProvider = NonNullable<
  RuntimeConfig["APP_SCHEDULER_PROVIDER"]
>;

export type Scheduler = {
  run: (cron: string, context: SchedulerTaskContext) => Promise<void>;
  start: (context: SchedulerTaskContext) => Promise<void>;
  stop: () => Promise<void>;
};

export type SchedulerRuntimeStrategy = {
  provider: SchedulerProvider;
  runtime: RuntimeConfig["APP_RUNTIME"];
};

/**
 * Returns the configured scheduler strategy and rejects runtime/provider pairs
 * that cannot be executed by the current infrastructure.
 *
 * Supported matrix:
 * - node + pg-boss
 * - cloudflare + cron-triggers
 */
export function getSchedulerEnvConfig(
  config: RuntimeConfig,
): SchedulerRuntimeStrategy {
  const strategy: SchedulerRuntimeStrategy = {
    provider: getSchedulerProvider(config),
    runtime: config.APP_RUNTIME,
  };

  if (
    strategy.runtime === DEFAULT_RUNTIMES.NODE &&
    strategy.provider !== DEFAULT_APP_SCHEDULER_PROVIDERS.PGBOSS
  ) {
    throw internalServerError(
      "Node runtime only supports the pg-boss scheduler provider",
      {
        details: strategy,
        expose: true,
      },
    );
  }

  if (
    strategy.runtime === DEFAULT_RUNTIMES.NODE &&
    config.APP_DATABASE_PROVIDER !== DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES
  ) {
    throw internalServerError(
      "Node pg-boss scheduler requires the postgres database provider",
      {
        details: {
          databaseProvider: config.APP_DATABASE_PROVIDER,
          ...strategy,
        },
        expose: true,
      },
    );
  }

  if (
    strategy.runtime === DEFAULT_RUNTIMES.CLOUDFLARE &&
    strategy.provider !== DEFAULT_APP_SCHEDULER_PROVIDERS.CRONTRIGGERS
  ) {
    throw internalServerError(
      "Cloudflare runtime only supports the cron-triggers scheduler provider",
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
    throw internalServerError("Runtime does not support scheduler providers", {
      details: strategy,
      expose: true,
    });
  }

  return strategy;
}

function getSchedulerProvider(config: RuntimeConfig): SchedulerProvider {
  if (config.APP_SCHEDULER_PROVIDER) return config.APP_SCHEDULER_PROVIDER;

  return config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE
    ? DEFAULT_APP_SCHEDULER_PROVIDERS.CRONTRIGGERS
    : DEFAULT_APP_SCHEDULER_PROVIDERS.PGBOSS;
}
