# Server Workspace Instructions

## Scope

`apps/server` owns the Hono application, Shopify auth and webhooks, Admin API resource modules, app shell fallback, runtime adapters, OpenAPI registration, and infrastructure capabilities for database, bucket, queue, scheduler, logger, env, and file handling.

## Architecture Rules

- Preserve the runtime split between Node process and Cloudflare isolate.
- Keep runtime capability registration explicit. Do not make shared modules read process globals or Worker bindings directly.
- Keep infrastructure under `src/infra/*`, app modules under `src/app/modules/*`, runtime entries under `src/app/runtime/*`, shared middleware/models/errors under `src/shared/*`, and generic helpers under `src/utils/*`.
- Resource APIs should live as independent modules under `src/app/modules/*`; do not put new business resource routes inside the Shopify app-flow module unless they are truly part of auth/app flow.
- Normalize errors through the shared `AppError` pattern and existing Hono `onError` behavior.
- Preserve fail-fast startup behavior for duplicate registry entries and invalid runtime invariants.
- Business modules must support both Node process and Cloudflare isolate unless a capability boundary explicitly marks a runtime unsupported.
- Runtime-specific APIs such as `process`, Node built-ins, `R2Bucket`, D1 bindings, Cloudflare Queues, pg-boss, or AWS SDK clients must stay in entrypoints, runtime capabilities, or `src/infra/*` adapters.
- Shared app modules should depend on runtime capability contracts, app-owned stores, Web Fetch/Web Streams, and package-owned schemas/types instead of concrete runtime SDKs.

## Package Ownership Rules

- Database operations and database-backed schemas, types, enums, insert/select models, and status values must come from `@shamt/database` when that package provides them.
- Env schemas, env types, runtime/provider constants, defaults, and parsing contracts must come from `@shamt/app-env` when that package provides them.
- Before adding server-local schema, enum, or type definitions, check whether the concept belongs to `packages/database`, `packages/app-env`, or another semantic `packages/*` owner.
- Server-local definitions are acceptable for HTTP transport, OpenAPI presentation, serialized response types, runtime capability contracts, or module-specific behavior that is not owned by a package.

## API Pagination Rules

- List endpoints that expose pagination must use the shared pagination schemas and helpers from `src/shared/models/pagination.ts`.
- Support `limit + cursor` and `limit + page` for paginated list endpoints. `cursor` and `page` are mutually exclusive.
- Keep `limit` capped at `100`; requests above the cap must fail validation instead of being silently clamped.
- Only allow page pagination for shallow navigation. Deep pagination must fail with a 400 response and require cursor pagination.
- Cursor pagination responses must include `mode: "cursor"`, `limit`, `hasNext`, and optional `nextCursor`.
- Page pagination responses must include `mode: "page"`, `limit`, `page`, `hasNext`, and `total`.
- List response bodies must put the resource array in `data.result` and pagination metadata in `data.pagination`.
- Do not expose resource-specific list keys such as `files` or `productExports` in public list responses; normalize arrays to `result` at the HTTP boundary.
- Only page pagination should calculate `total`; cursor pagination should avoid count queries unless a future endpoint explicitly requires it.
- Cursor-backed stores should use stable ordering and opaque seek cursors instead of offset emulation.

## OpenAPI Schema Rules

- App modules under `src/app/modules/*` should build OpenAPI schemas from pure Zod definitions exported by `@shamt/database/entities/schemas` when describing database-backed entities.
- Do not import Drizzle-generated schemas, dialect models, PostgreSQL schemas, or SQLite/D1 schemas directly into module OpenAPI schema files.
- Keep OpenAPI metadata, examples, params, query schemas, and request body schemas in the app module that owns the route.

## Error Handling

- Route handlers and lifecycle hooks must use the shared error normalization pipeline instead of branching around individual SDK error classes.
- Normalize Shopify SDK errors through `normalizeShopifyError` and return the project `AppError`/JSON error model through the existing global error handler.
- Do not special-case `InvalidWebhookError`, `InvalidHmacError`, or other Shopify SDK errors in route handlers or `onAppError` unless the shared normalizer cannot represent the behavior.
- If extra SDK response data is needed, add it to `normalizeShopifyError` details instead of bypassing normalization.

## Shopify Rules

- Use the existing Shopify middleware and session-token/token-exchange flow for embedded Admin API routes.
- Keep embedded and standalone app modes explicit. Embedded mode uses App Bridge session tokens; standalone mode uses account-session cookies.
- Verify Shopify webhook HMAC behavior when changing webhook handlers.
- Use official Shopify Admin GraphQL patterns and the current app API version from env.
- Escape user-facing HTML injected into app shell responses.

## Runtime And Infrastructure Rules

- Database and bucket providers must remain selected by env and runtime capability boundaries.
- Code that needs runtime env must call `getEnvProvider(...)`; code that needs logger must call `getLoggerProvider(...)`.
- Hono middleware may synchronize env/logger onto context with `c.set("runtimeEnv", ...)` and `c.set("runtimeLogger", ...)`, and code can technically read them with `c.get(...)`, but this is strongly discouraged outside middleware or narrow compatibility boundaries. Prefer provider calls so env/logger caching, signature checks, and request-time refresh stay centralized.
- Node PostgreSQL and Cloudflare D1 binding behavior must stay separated behind the app database factory.
- Process runtime may cache long-lived clients and must dispose them on shutdown or test teardown.
- Cloudflare isolate runtime must treat request/event bindings as the resource boundary.
- Queue and scheduler changes must preserve both Node provider behavior and Cloudflare Queues/Cron Trigger behavior where applicable.

## File Organization

- Put shared exported types in `types.ts` close to their module or package boundary.
- Put stable module-local helpers in `utils.ts` when reused by multiple files.
- Keep route schemas, response models, and OpenAPI registration near the module that owns them.
- Add examples in README or docs when adding a new module, capability, or public route pattern.

## Documentation

- Update `apps/server/README.md` or `apps/server/docs/*` when runtime, env, deployment, Shopify, queue, scheduler, database, bucket, file, or error behavior changes.
- Put server-specific decisions and task-oriented guides under `apps/server/docs/guides/`.
- Put descriptive reference material, explanations, and usage manuals under `apps/server/docs/references/`.
- Put server-specific notes or backlog under `apps/server/docs/notes/`.
- Keep docs factual and current; remove obsolete design drafts instead of preserving stale alternatives.

## Verification

- For server code changes, prefer `pnpm -F @shamt/server test`.
- Run `pnpm -F @shamt/server lint` after broad TypeScript or Markdown edits.
- Run `pnpm -F @shamt/server build` when runtime entrypoints, bundling, or Cloudflare/Node build behavior changes.
- Run `pnpm -F @shamt/server cf:type` when Worker bindings change.
