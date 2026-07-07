import type { ConfigSchema } from "@unimolecule/shopify-app-unmanual-app-env";

interface CreateViteAllowedHostsOptions {
  env: ConfigSchema;
  processEnv: NodeJS.ProcessEnv;
}

/**
 * Builds the Vite host allowlist from app URLs and Shopify CLI tunnel env.
 */
export function createViteAllowedHosts({
  env,
  processEnv,
}: CreateViteAllowedHostsOptions) {
  return uniqueHosts([
    env.SHOPIFY_APP_URL,
    processEnv.SHOPIFY_APP_URL,
    processEnv.APP_URL,
    processEnv.HOST,
    ...(processEnv.VITE_ALLOWED_HOSTS?.split(",") ?? []),
  ]);
}

/**
 * Normalizes host candidates and removes duplicates while preserving order.
 */
function uniqueHosts(values: Array<string | undefined>) {
  return [...new Set(values.map(toHostname).filter(isString))];
}

/**
 * Extracts a hostname from either a full URL or a bare host value.
 */
function toHostname(value: string | undefined) {
  const input = value?.trim();

  if (!input) {
    return;
  }

  try {
    return new URL(input.includes("://") ? input : `https://${input}`).hostname;
  } catch {
    return;
  }
}

/**
 * Narrows filtered host values after URL parsing.
 */
function isString(value: unknown): value is string {
  return typeof value === "string";
}
