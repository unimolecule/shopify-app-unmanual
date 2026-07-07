import {
  DEFAULT_APP_DATABASE_PROVIDERS,
  DEFAULT_APP_QUEUE_PROVIDERS,
  DEFAULT_RUNTIMES,
} from "@unimolecule/shopify-app-unmanual-app-env";
import { internalServerError } from "@/shared/exceptions";
import type { QueueJobContext } from "./registry";
import type { RuntimeConfig } from "@/infra/env";

export type QueueProvider = NonNullable<RuntimeConfig["APP_QUEUE_PROVIDER"]>;

export type QueueRuntimeStrategy = {
  name: string;
  provider: QueueProvider;
  runtime: RuntimeConfig["APP_RUNTIME"];
};

export type QueueMessage<
  TName extends string = string,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = {
  name: TName;
  payload: TPayload;
  requestId?: string;
  version: number;
};

export type QueueEnqueueOptions = {
  delaySeconds?: number;
  idempotencyKey?: string;
  maxAttempts?: number;
};

export interface QueueProducer {
  enqueue: (
    message: QueueMessage,
    options?: QueueEnqueueOptions,
  ) => Promise<void>;
  enqueueBatch: (
    messages: QueueMessage[],
    options?: QueueEnqueueOptions,
  ) => Promise<void>;
}

export interface QueueConsumer<TBatch = unknown> {
  consume: (batch: TBatch, context: QueueJobContext) => Promise<void>;
  start: (context: QueueJobContext) => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Returns the configured queue strategy and rejects runtime/provider pairs that
 * cannot be executed by the current infrastructure.
 *
 * Supported matrix:
 * - node + pg-boss
 * - cloudflare + queues
 */
export function getQueueEnvConfig(config: RuntimeConfig): QueueRuntimeStrategy {
  const strategy: QueueRuntimeStrategy = {
    name: getQueueName(config),
    provider: getQueueProvider(config),
    runtime: config.APP_RUNTIME,
  };

  if (
    strategy.runtime === DEFAULT_RUNTIMES.NODE &&
    strategy.provider !== DEFAULT_APP_QUEUE_PROVIDERS.PGBOSS
  ) {
    throw internalServerError(
      "Node runtime only supports the pg-boss queue provider",
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
      "Node pg-boss queue requires the postgres database provider",
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
    strategy.provider !== DEFAULT_APP_QUEUE_PROVIDERS.QUEUES
  ) {
    throw internalServerError(
      "Cloudflare runtime only supports the queues queue provider",
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
    throw internalServerError("Runtime does not support queue providers", {
      details: strategy,
      expose: true,
    });
  }

  return strategy;
}

function getQueueProvider(config: RuntimeConfig): QueueProvider {
  if (config.APP_QUEUE_PROVIDER) return config.APP_QUEUE_PROVIDER;

  return config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE
    ? DEFAULT_APP_QUEUE_PROVIDERS.QUEUES
    : DEFAULT_APP_QUEUE_PROVIDERS.PGBOSS;
}

function getQueueName(config: RuntimeConfig): string {
  return config.APP_QUEUE_NAME ?? "default";
}

export function getQueueJobName(
  strategy: Pick<QueueRuntimeStrategy, "name">,
  jobName: string,
): string {
  return `${strategy.name}/${jobName}`;
}
