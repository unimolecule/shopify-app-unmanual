# Shopify Hono App

<p><strong>English</strong> | <a href="./README.zh-CN.md">Chinese</a></p>

Shopify Hono App is a pnpm monorepo for a Shopify app that can run as either a
Cloudflare Worker or a Node process. The server is built with Hono and
TypeScript, the admin UI is a Vite React SPA, and shared workspace packages own
environment contracts and database shapes.

## Getting Started

Install dependencies, generate local Shopify/Wrangler files, then start Shopify
CLI from the repository root:

```bash
pnpm install
pnpm dev:prepare
pnpm dev
```

Use the fixed Cloudflare Tunnel flow only when the app needs the configured
development hostname:

```bash
pnpm dev:tunnel
```

## Workspaces

### Apps

| Workspace                                                              | Type | Description                                                                                          |
| ---------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------- |
| [`@unimolecule/shopify-app-unmanual-server`](./apps/server#readme)     | app  | Hono server for Shopify auth, app shell rendering, Admin API routes, webhooks, and runtime adapters. |
| [`@unimolecule/shopify-app-unmanual-web`](./apps/web#readme)           | app  | Vite React frontend for the Shopify admin UI.                                                        |
| [`@unimolecule/shopify-app-unmanual-document`](./apps/document#readme) | app  | VitePress documentation workspace.                                                                   |

### Shared Packages

| Workspace                                                                  | Type    | Description                                                                   |
| -------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| [`@unimolecule/shopify-app-unmanual-envs`](./packages/envs#readme)         | package | Runtime-neutral environment constants and Zod schemas.                        |
| [`@unimolecule/shopify-app-unmanual-app-env`](./packages/app-env#readme)   | package | Shopify app environment schema composed from the base env package.            |
| [`@unimolecule/shopify-app-unmanual-database`](./packages/database#readme) | package | Drizzle schemas, models, constants, and inferred database types for app data. |

## Architecture

Dependency direction stays one-way:

```text
@unimolecule/shopify-app-unmanual-envs
  -> @unimolecule/shopify-app-unmanual-app-env
  -> apps/server / apps/web

@unimolecule/shopify-app-unmanual-database
  -> apps/server / apps/web

external runtime-neutral libraries
  -> packages/*
  -> apps/*
```

`apps/server` selects the runtime and infrastructure providers from env-driven
capability boundaries. App code should use package-owned env and database
exports instead of redefining schemas, enums, or status values locally.

`apps/web` is a dedicated Vite React SPA for the Shopify admin UI. It consumes
the Hono API through shared client utilities and relies on Shopify App Bridge
and Polaris web components where the app shell requires them.

## Requirements

- Node.js `26.2.0`, declared in [`pnpm-workspace.yaml`](./pnpm-workspace.yaml).
- pnpm `>=11.0.0`.
- Shopify CLI and Wrangler from the root dev dependencies.
- A Shopify Partner account and development store.
- Runtime env files such as `.env.development` and `.env.production`.

Do not commit secrets from env files, Shopify credentials, Cloudflare tokens,
database URLs, Redis URLs, or private keys.

## Commands

| Command               | Description                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `pnpm dev:prepare`    | Generate local Shopify and Wrangler config from `.env.development`.              |
| `pnpm dev`            | Prepare local config, then start Shopify CLI with its default tunnel.            |
| `pnpm dev:tunnel`     | Prepare local config, start the named Cloudflare Tunnel, then run Shopify CLI.   |
| `pnpm deploy:prepare` | Generate production Shopify and Wrangler config from `.env.production`.          |
| `pnpm deploy`         | Prepare, deploy the selected runtime, then deploy Shopify app config.            |
| `pnpm format`         | Run workspace formatting scripts.                                                |
| `pnpm lint`           | Run workspace lint scripts.                                                      |
| `pnpm test`           | Run workspace test scripts where they exist.                                     |
| `pnpm clean`          | Remove generated outputs and dependency/cache folders through workspace scripts. |

Focused commands are preferred during feature work:

```bash
pnpm -F @unimolecule/shopify-app-unmanual-server test
pnpm -F @unimolecule/shopify-app-unmanual-web test
pnpm -F @unimolecule/shopify-app-unmanual-web build
pnpm -F @unimolecule/shopify-app-unmanual-envs build
```

## Testing And Type Checking

Each workspace owns its focused verification commands. For tests stored in a
workspace-local `tests/` directory, keep a nearby `tests/tsconfig.json` that
extends the owning workspace config, includes test runner/runtime types, and
uses `noEmit`.

Examples:

```bash
pnpm -F @unimolecule/shopify-app-unmanual-server exec tsc -p tests/tsconfig.json --noEmit
pnpm -F @unimolecule/shopify-app-unmanual-web exec tsc -p tests/tsconfig.json --noEmit
```

## Documentation

- Root README files stay navigational and architectural.
- App-specific operating details live in app README files, such as
  [`apps/server/README.md`](./apps/server/README.md) and
  [`apps/web/README.md`](./apps/web/README.md).
- Server guides live under [`apps/server/docs/guides`](./apps/server/docs/guides).
- Server reference material lives under
  [`apps/server/docs/references`](./apps/server/docs/references).
- Durable project rules live in [`AGENTS.md`](./AGENTS.md).

## Generated Files

Root prepare scripts own generated Shopify and Wrangler files. Do not hand-edit
generated `shopify.web.toml` files or `apps/server/wrangler.json` unless the
task is specifically debugging generated output.

Generated deployment files and local Cloudflare data are intentionally treated
as runtime artifacts. `.wrangler/` may contain local D1 state and should not be
deleted unless that is the explicit task.

## Deployment

Production deployment starts from `.env.production`:

```bash
pnpm deploy:prepare
pnpm deploy
```

`deploy` runs `deploy:prepare`, dispatches to the server deploy path selected by
`APP_RUNTIME`, then runs Shopify app deployment. The Cloudflare runtime uses
Wrangler; the Node runtime uses the server-owned Docker/Nginx deployment
generators.
