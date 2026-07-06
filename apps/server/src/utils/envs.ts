import {
  DEFAULT_ENVS,
  DEFAULT_RUNTIMES,
  type DEFAULT_ENVS_VALUES,
  type DEFAULT_RUNTIMES_VALUES,
} from "@shamt/app-env";

const ISOLATE_RUNTIMES = [
  DEFAULT_RUNTIMES.CLOUDFLARE,
  DEFAULT_RUNTIMES.VERCEL_EDGE,
] as const;
const PROCESS_RUNTIMES = [DEFAULT_RUNTIMES.NODE] as const;

export function isDev(appEnv?: DEFAULT_ENVS_VALUES) {
  return appEnv === DEFAULT_ENVS.DEVELOPMENT;
}

export function isTest(appEnv?: DEFAULT_ENVS_VALUES) {
  return appEnv === DEFAULT_ENVS.TEST;
}

export function isProd(appEnv?: DEFAULT_ENVS_VALUES) {
  return appEnv === DEFAULT_ENVS.PRODUCTION;
}

export function isProcessRuntime(appRuntime?: DEFAULT_RUNTIMES_VALUES) {
  return PROCESS_RUNTIMES.includes(
    appRuntime as (typeof PROCESS_RUNTIMES)[number],
  );
}

export function isIsolateRuntime(appRuntime?: DEFAULT_RUNTIMES_VALUES) {
  return ISOLATE_RUNTIMES.includes(
    appRuntime as (typeof ISOLATE_RUNTIMES)[number],
  );
}
