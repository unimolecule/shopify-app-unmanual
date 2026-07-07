import { DEFAULT_ENVS } from "@unimolecule/shopify-app-unmanual-app-env";
import { env } from "@/app/runtime/process/node/env";
import { throwAppServerError as throwError } from "../../internal";

export function requirePostgresUrl() {
  if (!env.APP_DATABASE_URL) {
    throwError("APP_DATABASE_URL is required for PostgreSQL database tooling");
  }

  return {
    url: env.APP_DATABASE_URL,
  };
}

export function requireD1HttpCredentials() {
  if (
    !env.APP_CLOUDFLARE_WORKER_ACCOUNT_ID ||
    !env.APP_DATABASE_D1_ID ||
    !env.APP_CLOUDFLARE_USER_TOKEN
  ) {
    throwError(
      "D1 HTTP tooling requires APP_CLOUDFLARE_WORKER_ACCOUNT_ID, APP_DATABASE_D1_ID, and APP_CLOUDFLARE_USER_TOKEN",
    );
  }

  return {
    accountId: env.APP_CLOUDFLARE_WORKER_ACCOUNT_ID,
    databaseId: env.APP_DATABASE_D1_ID,
    token: env.APP_CLOUDFLARE_USER_TOKEN,
  };
}

export function requirePostgresSeedUrl() {
  requireSeedAllowed("PostgreSQL");

  return requirePostgresUrl().url;
}

export function requireD1SeedTarget() {
  requireSeedAllowed("D1");

  if (!env.APP_DATABASE_D1_BINDING) {
    throwError("APP_DATABASE_D1_BINDING is required for D1 seed");
  }

  return {
    binding: env.APP_DATABASE_D1_BINDING,
    remote: process.env.D1_SEED_LOCAL !== "true",
    wranglerEnv: process.env.D1_WRANGLER_ENV ?? env.APP_ENV,
  };
}

function requireSeedAllowed(target: string) {
  if (
    env.APP_ENV === DEFAULT_ENVS.PRODUCTION &&
    process.env.CONFIRM_PROD_SEED !== "true"
  ) {
    throwError(`Production ${target} seed requires CONFIRM_PROD_SEED=true`);
  }
}
