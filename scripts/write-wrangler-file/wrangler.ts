import {
  DEFAULT_APP_BUCKET_PROVIDERS,
  DEFAULT_APP_DATABASE_PROVIDERS,
  DEFAULT_APP_QUEUE_PROVIDERS,
  DEFAULT_APP_SCHEDULER_PROVIDERS,
  DEFAULT_ENVS,
  DEFAULT_RUNTIMES,
} from "@unimolecule/shopify-app-unmanual-app-env";
import { throwError } from "../utils";
import {
  DEVELOPMENT_ENTRY_PATH,
  PRODUCTION_ENTRY_PATH,
  type WranglerFileConfig,
} from "./constants";

interface WranglerConfig {
  compatibility_date: string;
  compatibility_flags: string[];
  observability: {
    enabled: boolean;
  };
  upload_source_maps: boolean;
  env: Record<string, WranglerEnvironmentConfig>;
}

interface WranglerEnvironmentConfig {
  name?: string;
  main?: string;
  r2_buckets?: R2BucketBinding[];
  d1_databases?: D1DatabaseBinding[];
  queues?: QueueConfig;
  triggers?: TriggerConfig;
}

interface R2BucketBinding {
  binding: string;
  bucket_name: string;
  remote?: boolean;
}

interface D1DatabaseBinding {
  binding: string;
  database_name: string;
  database_id: string;
  migrations_dir: string;
  remote?: boolean;
}

interface QueueConfig {
  producers: QueueProducerBinding[];
  consumers: QueueConsumerBinding[];
}

interface QueueProducerBinding {
  binding: string;
  queue: string;
}

interface QueueConsumerBinding {
  dead_letter_queue: string;
  max_batch_size: number;
  max_retries: number;
  queue: string;
}

interface TriggerConfig {
  crons: string[];
}

/**
 * Render a Wrangler config for the active APP_ENV only.
 */
export function renderWranglerConfig(
  config: WranglerFileConfig,
): WranglerConfig {
  const envName = config.APP_ENV;
  const environment = renderWranglerEnvironment(config);

  return {
    compatibility_date: "2026-07-01",
    compatibility_flags: ["nodejs_compat"],
    observability: {
      enabled: true,
    },
    upload_source_maps: true,
    env: {
      [envName]: environment,
    },
  };
}

function renderWranglerEnvironment(
  config: WranglerFileConfig,
): WranglerEnvironmentConfig {
  const bucketProvider = getBucketProvider(config);
  const databaseProvider = getDatabaseProvider(config);
  const queueProvider = getQueueProvider(config);
  const schedulerProvider = getSchedulerProvider(config);
  const environment: WranglerEnvironmentConfig = {};

  environment.name = config.APP_CLOUDFLARE_WORKER_NAME;

  if (config.APP_ENV === DEFAULT_ENVS.DEVELOPMENT) {
    environment.main = DEVELOPMENT_ENTRY_PATH;
  }

  if (config.APP_ENV === DEFAULT_ENVS.PRODUCTION) {
    environment.main = PRODUCTION_ENTRY_PATH;
  }

  if (bucketProvider === DEFAULT_APP_BUCKET_PROVIDERS.R2) {
    environment.r2_buckets = [getR2BucketBinding(config)];
  }

  if (
    config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE &&
    databaseProvider === DEFAULT_APP_DATABASE_PROVIDERS.D1
  ) {
    environment.d1_databases = [getD1DatabaseBinding(config)];
  }

  if (config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE) {
    if (queueProvider === DEFAULT_APP_QUEUE_PROVIDERS.QUEUES) {
      environment.queues = getQueueConfig(config);
    }

    if (schedulerProvider === DEFAULT_APP_SCHEDULER_PROVIDERS.CRONTRIGGERS) {
      environment.triggers = getTriggerConfig(config);
    }
  }

  validateQueueProvider(config, queueProvider);
  validateSchedulerProvider(config, schedulerProvider);
  validateDatabaseProvider(config, databaseProvider);

  return environment;
}

function getBucketProvider(config: WranglerFileConfig) {
  if (config.APP_BUCKET_PROVIDER) return config.APP_BUCKET_PROVIDER;

  return config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE
    ? DEFAULT_APP_BUCKET_PROVIDERS.R2
    : DEFAULT_APP_BUCKET_PROVIDERS.MEMORY;
}

function getDatabaseProvider(config: WranglerFileConfig) {
  if (config.APP_DATABASE_PROVIDER) return config.APP_DATABASE_PROVIDER;

  return config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE
    ? DEFAULT_APP_DATABASE_PROVIDERS.D1
    : DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES;
}

function getQueueProvider(config: WranglerFileConfig) {
  if (config.APP_QUEUE_PROVIDER) return config.APP_QUEUE_PROVIDER;

  return config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE
    ? DEFAULT_APP_QUEUE_PROVIDERS.QUEUES
    : DEFAULT_APP_QUEUE_PROVIDERS.PGBOSS;
}

function getSchedulerProvider(config: WranglerFileConfig) {
  if (config.APP_SCHEDULER_PROVIDER) return config.APP_SCHEDULER_PROVIDER;

  return config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE
    ? DEFAULT_APP_SCHEDULER_PROVIDERS.CRONTRIGGERS
    : DEFAULT_APP_SCHEDULER_PROVIDERS.PGBOSS;
}

function getR2BucketBinding(config: WranglerFileConfig): R2BucketBinding {
  const binding: R2BucketBinding = {
    binding: requireConfigValue(
      config.APP_BUCKET_R2_BINDING,
      "APP_BUCKET_R2_BINDING",
    ),
    bucket_name: requireConfigValue(
      config.APP_BUCKET_R2_NAME,
      "APP_BUCKET_R2_NAME",
    ),
  };

  if (config.APP_ENV !== DEFAULT_ENVS.PRODUCTION) {
    binding.remote = true;
  }

  return binding;
}

function getD1DatabaseBinding(config: WranglerFileConfig): D1DatabaseBinding {
  const binding: D1DatabaseBinding = {
    binding: requireConfigValue(
      config.APP_DATABASE_D1_BINDING,
      "APP_DATABASE_D1_BINDING",
    ),
    database_name: requireConfigValue(
      config.APP_DATABASE_D1_NAME,
      "APP_DATABASE_D1_NAME",
    ),
    database_id: requireConfigValue(
      config.APP_DATABASE_D1_ID,
      "APP_DATABASE_D1_ID",
    ),
    migrations_dir: "drizzle.d1",
  };

  if (config.APP_ENV !== DEFAULT_ENVS.PRODUCTION) {
    binding.remote = true;
  }

  return binding;
}

function getQueueConfig(config: WranglerFileConfig): QueueConfig {
  const queue = requireConfigValue(config.APP_QUEUE_NAME, "APP_QUEUE_NAME");

  return {
    producers: [
      {
        binding: requireConfigValue(
          config.APP_QUEUE_BINDING,
          "APP_QUEUE_BINDING",
        ),
        queue,
      },
    ],
    consumers: [
      {
        dead_letter_queue: `${queue}-dlq`,
        max_batch_size: config.APP_QUEUE_CONSUMER_MAX_BATCH_SIZE,
        max_retries: config.APP_QUEUE_CONSUMER_MAX_RETRIES,
        queue,
      },
    ],
  };
}

function getTriggerConfig(config: WranglerFileConfig): TriggerConfig {
  return {
    crons: [
      requireConfigValue(
        config.APP_SCHEDULER_CRON_VALUE,
        "APP_SCHEDULER_CRON_VALUE",
      ),
    ],
  };
}

function validateDatabaseProvider(
  config: WranglerFileConfig,
  databaseProvider: WranglerFileConfig["APP_DATABASE_PROVIDER"],
) {
  if (
    config.APP_RUNTIME === DEFAULT_RUNTIMES.NODE &&
    databaseProvider !== DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES
  ) {
    throwError(
      "write-wrangler-file",
      "Node runtime only supports postgres database",
    );
  }

  if (
    config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE &&
    databaseProvider !== DEFAULT_APP_DATABASE_PROVIDERS.D1
  ) {
    throwError(
      "write-wrangler-file",
      "Cloudflare runtime only supports d1 database",
    );
  }
}

function validateQueueProvider(
  config: WranglerFileConfig,
  queueProvider: WranglerFileConfig["APP_QUEUE_PROVIDER"],
) {
  if (
    config.APP_RUNTIME === DEFAULT_RUNTIMES.NODE &&
    queueProvider !== DEFAULT_APP_QUEUE_PROVIDERS.PGBOSS
  ) {
    throwError(
      "write-wrangler-file",
      "Node runtime only supports pg-boss queue",
    );
  }

  if (
    config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE &&
    queueProvider !== DEFAULT_APP_QUEUE_PROVIDERS.QUEUES
  ) {
    throwError(
      "write-wrangler-file",
      "Cloudflare runtime only supports queues queue",
    );
  }
}

function validateSchedulerProvider(
  config: WranglerFileConfig,
  schedulerProvider: WranglerFileConfig["APP_SCHEDULER_PROVIDER"],
) {
  if (
    config.APP_RUNTIME === DEFAULT_RUNTIMES.NODE &&
    schedulerProvider !== DEFAULT_APP_SCHEDULER_PROVIDERS.PGBOSS
  ) {
    throwError(
      "write-wrangler-file",
      "Node runtime only supports pg-boss scheduler",
    );
  }

  if (
    config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE &&
    schedulerProvider !== DEFAULT_APP_SCHEDULER_PROVIDERS.CRONTRIGGERS
  ) {
    throwError(
      "write-wrangler-file",
      "Cloudflare runtime only supports cron-triggers scheduler",
    );
  }
}

function requireConfigValue(value: string | undefined, key: string) {
  if (value) return value;

  throwError("write-wrangler-file", `${key} is required`);
}
