# @shamt/envs

<p><strong>English</strong> | <a href="./README.zh-CN.md">中文</a></p>

## Table of Contents

- [Overview](#overview)
- [Design and Architecture](#design-and-architecture)
- [Static Env and Runtime Settings](#static-env-and-runtime-settings)
- [Relation to @shamt/app-env](#relation-to-shamtapp-env)
- [Inputs and Outputs](#inputs-and-outputs)
- [Build Output](#build-output)
- [Usage](#usage)
- [Unit Conventions](#unit-conventions)

## Overview

`@shamt/envs` is the workspace package for base environment constants and Zod configuration schemas. It centralizes reusable defaults, environment names, runtime names, HTTP status codes, response defaults, logger configuration, cache configuration, database URL configuration, Redis configuration, file upload limits, request limits, and related types.

This package does not read `process.env`, does not decide the current deployment platform, and does not contain Shopify-specific app schema. It only provides reusable constants, types, and schemas. Applications should parse actual raw env values in their own bootstrap flow, runtime env provider, or middleware.

## Design and Architecture

`@shamt/envs` keeps environment configuration boundaries explicit:

- `constants`: stable defaults and enum-like const objects, such as `DEFAULT_ENVS`, `DEFAULT_RUNTIMES`, `HTTP_STATUS_CODES`, and `RESPONSE_SUCCESS_CODE`.
- `configs`: Zod schemas for parseable environment variables, such as `appConfigSchema`, `envConfigSchema`, and `logConfigSchema`.
- `utils`: schema composition helpers, such as `extendConfigSchema`.

Schemas are responsible only for validation and defaults. They are not bound to Node, Cloudflare Workers, Vercel, or Bun. Each runtime can pass its own raw env object into a schema and receive a unified typed config.

The package intentionally uses const objects instead of TypeScript `enum`, so runtime values and TypeScript literal types stay aligned.

## Static Env and Runtime Settings

`@shamt/envs` treats env as deployment-time configuration. Values such as `APP_ENV`, `APP_RUNTIME`, secrets, Shopify credentials, service endpoints, and platform bindings should be parsed at application startup or request bootstrap, then passed through the app as typed config.

Do not use env as a full dynamic configuration system. Even when a platform lets you change variables from a dashboard, application code should assume env changes are operational changes that may require a new deployment, a new isolate, or a process restart before every request observes the same value.

For values that must change without redeploying, create a separate runtime settings layer:

- Store runtime settings in KV, D1, a database table, or a dedicated remote config service.
- Validate the settings with an app-owned Zod schema before use.
- Keep typed defaults in code, and use last-known-good values when the remote source is temporarily unavailable.
- Cache runtime settings with a short TTL to avoid reading storage on every request.
- Use feature flags or rollout systems for gradual release and emergency switches.

Example: if `APP_LOG_INVOKER` needs to be changed immediately in production without redeploying, model it as a runtime setting such as `logInvoker`, not as a new env field. Env can still provide the storage binding or namespace name, while the setting value itself lives in the runtime settings source.

## Relation to @shamt/app-env

Use `@shamt/envs` for runtime-neutral building blocks. Use
`@shamt/app-env` when an app needs the composed project schema that includes
Shopify fields such as `SHOPIFY_APP_MODE`,
`SHOPIFY_APP_FRONTEND_TARGET`, `SHOPIFY_APP_KEY`, and `SCOPES`.

```ts
import { configSchema } from "@shamt/app-env";

const config = configSchema.parse(process.env);
```

This split keeps shared constants reusable while allowing app-specific env
contracts to evolve without making the base package depend on Shopify.

## Inputs and Outputs

Inputs:

- Environment-like objects, such as `process.env`, Cloudflare Worker bindings, or application-merged runtime config objects.
- Zod object schemas that need to be composed with shared schemas.

Outputs:

- Zod schemas for app, cache, database URL, env, file, logger, and Redis configuration.
- TypeScript inferred types such as `AppConfigSchema`, `EnvConfigSchema`, and `LogConfigSchema`.
- Shared constants for HTTP status codes, response defaults, content types, runtime names, env names, request limits, timeouts, and size limits.

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

The root entry no longer re-exports `./constants`; import constants through
`@shamt/envs/constants` when a consumer needs only stable values. Source
workspace exports point at `src/*`, while `publishConfig.exports` points at the
built `dist/*` files.

## Usage

Parse standard runtime env fields:

```ts
import { envConfigSchema } from "@shamt/envs";

const config = envConfigSchema.parse({
  APP_ENV: "development",
  APP_RUNTIME: "cloudflare",
});

config.APP_ENV; // "development"
config.APP_RUNTIME; // "cloudflare"
```

Compose a generic config schema:

```ts
import {
  appConfigSchema,
  envConfigSchema,
  extendConfigSchema,
} from "@shamt/envs";
import { z } from "zod";

const serverSchema = extendConfigSchema(
  extendConfigSchema(envConfigSchema, appConfigSchema),
  z.object({
    SERVICE_NAME: z.string().min(1),
  }),
);

const serverConfig = serverSchema.parse(process.env);
```

Use shared HTTP status and response defaults:

```ts
import {
  HTTP_STATUS_CODES,
  RESPONSE_SUCCESS_CODE,
  RESPONSE_SUCCESS_MESSAGE,
  RESPONSE_SUCCESS_OK,
} from "@shamt/envs";

const response = {
  code: RESPONSE_SUCCESS_CODE,
  message: RESPONSE_SUCCESS_MESSAGE,
  success: RESPONSE_SUCCESS_OK,
  data: { status: HTTP_STATUS_CODES.OK.phrase },
};
```

Use runtime constants instead of scattered string literals:

```ts
import { DEFAULT_RUNTIMES, type DEFAULT_RUNTIMES_VALUES } from "@shamt/envs";

function isCloudflare(runtime: DEFAULT_RUNTIMES_VALUES) {
  return runtime === DEFAULT_RUNTIMES.CLOUDFLARE;
}
```

Use file upload defaults:

```ts
import { fileConfigSchema } from "@shamt/envs";

const fileConfig = fileConfigSchema.parse({});

fileConfig.APP_FILE_DIR; // "files"
fileConfig.APP_FILE_MAX_SIZE; // 10485760
fileConfig.APP_FILE_UPLOAD_MULTIPLE_SIZE; // 10
```

## Unit Conventions

1. Time values are expressed in milliseconds by default.
2. File size and memory size values are expressed in bytes by default.
