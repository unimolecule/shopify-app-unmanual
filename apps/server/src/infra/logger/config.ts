import type { RuntimeConfig } from "@/infra/env";

/**
 * Reads logger settings shared by all runtimes without importing runtime-specific code.
 */
export function getLoggerEnvConfig(config: RuntimeConfig) {
  return {
    APP_ENV: config.APP_ENV,
    APP_LOGGER_DIR: config.APP_LOGGER_DIR,
    APP_LOGGER_EXPIRE: config.APP_LOGGER_EXPIRE,
    APP_LOGGER_LEVEL: config.APP_LOGGER_LEVEL,
    APP_LOGGER_MAX_SIZE: config.APP_LOGGER_MAX_SIZE,
    APP_RUNTIME: config.APP_RUNTIME,
  };
}
