import { configSchema } from "@unimolecule/shopify-app-unmanual-app-env";
import { getSafeProcessEnv } from "@/app/runtime/process/node/utils/process";
import { getRuntimeConfig, type RuntimeConfig } from "@/infra/env";
import { createSchemaSignature } from "./signature";

type EnvProviderSlot = {
  signature: string;
  value: RuntimeConfig;
};

let envProviderSlot: EnvProviderSlot | undefined;

/**
 * Get the validated runtime env provider.
 * If rawEnv is omitted, process.env is used. Runtime middleware passes request
 * bindings explicitly so isolate environments can refresh per request.
 */
export function getEnvProvider(rawEnv?: unknown): RuntimeConfig {
  const nextRawEnv = (rawEnv ?? {}) as Record<string, unknown>;
  const effectiveRawEnv = { ...getSafeProcessEnv(), ...nextRawEnv };

  const signature = getEnvProviderSignature(effectiveRawEnv);

  if (envProviderSlot?.signature === signature) {
    return envProviderSlot.value;
  }

  const config = getRuntimeConfig(effectiveRawEnv);
  setEnvProvider(config, signature);

  return config;
}

/**
 * Remove the env provider and its signature from the registry.
 * Use this when disposing providers or resetting tests.
 */
export function resetEnvProvider() {
  envProviderSlot = undefined;
}

/**
 * Store a validated runtime env and register its disposer.
 * The disposer removes both the provider map entry and the disposer entry.
 */
function setEnvProvider(config: RuntimeConfig, signature: string) {
  envProviderSlot = { signature, value: config };
}

/**
 * Builds a stable cache signature from env fields that change runtime behavior.
 */
function getEnvProviderSignature(config: Record<string, unknown>): string {
  return createSchemaSignature(configSchema, config);
}
