import { createHttpClient } from "@unimolecule/oh-my-fetch/client";
import type { RuntimeConfig } from "@/infra/env";

export function getClientEnvConfig(config: RuntimeConfig) {
  return {
    prefix: config.APP_API_PREFIX,
    timeout: config.APP_REQUEST_TIMEOUT,
  };
}

/**
 * Creates the server HTTP client from validated runtime configuration.
 */
export function createClient(config: RuntimeConfig) {
  const clientEnvConfig = getClientEnvConfig(config);

  return createHttpClient({
    ...clientEnvConfig,
    retry: { limit: 0 },
  });
}
