# @unimolecule/shopify-app-unmanual-app-env

`@unimolecule/shopify-app-unmanual-app-env` is the app-level env package for this workspace. It composes
the runtime-neutral schemas from `@unimolecule/shopify-app-unmanual-envs` with Shopify app fields, then
exports one validated `configSchema` for apps and build scripts.

Use this package when code needs the complete project env contract. Use
`@unimolecule/shopify-app-unmanual-envs` directly only for lower-level constants or generic schemas.

## Exports

| Entry                                                    | Purpose                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `@unimolecule/shopify-app-unmanual-app-env`              | `configSchema`, inferred types, app constants, envs exports |
| `@unimolecule/shopify-app-unmanual-app-env/constants`    | Shopify constants plus re-exported base env constants       |
| `@unimolecule/shopify-app-unmanual-app-env/package.json` | Package metadata                                            |

The root entry also re-exports `@unimolecule/shopify-app-unmanual-envs`, so app code can import the
composed schema and shared constants from one place when that keeps call sites
clean.

## Build Output

The package builds with `tsdown --config ./build.config.ts`.

| Published field / export | Output path                  |
| ------------------------ | ---------------------------- |
| `main`                   | `dist/index.cjs`             |
| `module`                 | `dist/index.mjs`             |
| `types`                  | `dist/index.d.mts`           |
| `.` import               | `dist/index.mjs`             |
| `.` require              | `dist/index.cjs`             |
| `./constants` import     | `dist/constants/index.mjs`   |
| `./constants` require    | `dist/constants/index.cjs`   |
| `./constants` types      | `dist/constants/index.d.mts` |

Source workspace exports continue to point at `src/*` for local TypeScript
development. `publishConfig.exports` points at the built `dist/*` files and
must stay aligned with tsdown's `.mjs`, `.cjs`, and `.d.mts` output.

## Schema

`configSchema` combines:

- base app defaults from `@unimolecule/shopify-app-unmanual-envs`
- cache, database URL, Redis, logger, env, runtime, and file schemas
- Shopify app fields defined in this package
- app-level database provider fields
- bucket provider fields
- queue provider fields
- scheduler provider fields
- Cloudflare account/token fields

Shopify fields:

| Field                         | Values / shape             |
| ----------------------------- | -------------------------- |
| `SHOPIFY_APP_MODE`            | `embedded` or `standalone` |
| `SHOPIFY_APP_FRONTEND_TARGET` | `frontend` or `backend`    |
| `SHOPIFY_APP_KEY`             | trimmed string             |
| `SHOPIFY_APP_SECRET`          | trimmed string             |
| `SHOPIFY_APP_URL`             | valid URL                  |
| `SHOPIFY_API_VERSION`         | trimmed string             |
| `SCOPES`                      | trimmed string             |
| `APP__SERVER_PORT`            | coerced number             |
| `APP__WEB_PORT`               | coerced number             |

App database fields:

| Field                     | Values / shape     |
| ------------------------- | ------------------ |
| `APP_DATABASE_PROVIDER`   | `postgres` or `d1` |
| `APP_DATABASE_D1_BINDING` | optional string    |
| `APP_DATABASE_D1_NAME`    | optional string    |
| `APP_DATABASE_D1_ID`      | optional string    |

`apps/server` supports PostgreSQL in the Node runtime and D1 in the Cloudflare
runtime. Cloudflare + D1 uses a request-bound Worker binding.

Bucket fields:

| Field                   | Values / shape   |
| ----------------------- | ---------------- |
| `APP_BUCKET_PROVIDER`   | `memory` or `r2` |
| `APP_BUCKET_R2_URL`     | optional URL     |
| `APP_BUCKET_R2_BINDING` | optional string  |
| `APP_BUCKET_R2_NAME`    | optional string  |

`memory` is the Node development bucket provider. `r2` uses the S3-compatible
API in Node and a Worker R2 binding in Cloudflare.

Queue fields:

| Field                               | Values / shape        |
| ----------------------------------- | --------------------- |
| `APP_QUEUE_PROVIDER`                | `pg-boss` or `queues` |
| `APP_QUEUE_NAME`                    | optional string       |
| `APP_QUEUE_BINDING`                 | optional string       |
| `APP_QUEUE_CONSUMER_MAX_BATCH_SIZE` | coerced number        |
| `APP_QUEUE_CONSUMER_MAX_RETRIES`    | coerced number        |

Node uses `pg-boss` and requires PostgreSQL. Cloudflare uses Queues and reads
the Worker binding named by `APP_QUEUE_BINDING`.

Scheduler fields:

| Field                      | Values / shape                  |
| -------------------------- | ------------------------------- |
| `APP_SCHEDULER_PROVIDER`   | `pg-boss` or `cron-triggers`    |
| `APP_SCHEDULER_CRON_VALUE` | optional cron expression string |

Node uses `pg-boss` schedule and requires PostgreSQL. Cloudflare uses Cron
Triggers; the Wrangler generator reads `APP_SCHEDULER_CRON_VALUE` when
`APP_RUNTIME=cloudflare` and `APP_SCHEDULER_PROVIDER=cron-triggers`.

Cloudflare fields:

| Field                              | Values / shape  |
| ---------------------------------- | --------------- |
| `APP_CLOUDFLARE_WORKER_ACCOUNT_ID` | optional string |
| `APP_CLOUDFLARE_USER_TOKEN`        | optional string |

These fields are used by Node-side Cloudflare HTTP integrations such as R2 S3
credential derivation.

## Runtime Matrix

`apps/server` consumes this schema with the following infrastructure matrix:

| Runtime      | Database provider | Bucket provider | Main infrastructure                         |
| ------------ | ----------------- | --------------- | ------------------------------------------- |
| `node`       | `postgres`        | `memory`        | `pg.Pool` + filesystem-backed memory bucket |
| `node`       | `postgres`        | `r2`            | `pg.Pool` + R2 S3-compatible API            |
| `cloudflare` | `d1`              | `r2`            | Worker D1 binding + Worker R2 binding       |

`scripts/write-wrangler-file` uses `APP_ENV`, `APP_RUNTIME`,
`APP_DATABASE_PROVIDER`, and `APP_BUCKET_PROVIDER` to generate the minimum
required Wrangler bindings for the active environment.

## Usage

Parse a complete app env object:

```ts
import { configSchema } from "@unimolecule/shopify-app-unmanual-app-env";

const config = configSchema.parse(process.env);
```

Use constants without scattering string literals:

```ts
import {
  DEFAULT_APP_BUCKET_PROVIDERS,
  DEFAULT_APP_DATABASE_PROVIDERS,
  DEFAULT_RUNTIMES,
  DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS,
  DEFAULT_SHOPIFY_APP_MODES,
} from "@unimolecule/shopify-app-unmanual-app-env/constants";

const isCloudflare = config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE;
const isEmbedded =
  config.SHOPIFY_APP_MODE === DEFAULT_SHOPIFY_APP_MODES.EMBEDDED;
const frontendTarget =
  config.SHOPIFY_APP_FRONTEND_TARGET ===
  DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS.FRONTEND;
const usesPostgres =
  config.APP_DATABASE_PROVIDER === DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES;
const usesR2 = config.APP_BUCKET_PROVIDER === DEFAULT_APP_BUCKET_PROVIDERS.R2;
```

## Boundaries

- This package defines and validates env shape; it does not read env files.
- Apps decide when to call `configSchema.parse(...)`.
- Browser code must not import full parsed env. `apps/web` filters public env
  through its Vite public env plugin before exposing values to `globalThis`.
