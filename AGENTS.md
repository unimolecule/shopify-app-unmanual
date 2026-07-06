# Project Instructions

## Stack

- Runtime: Cloudflare Workers and Node process runtime, selected by env.
- Framework: Hono with TypeScript.
- Platform: Shopify embedded or standalone app.
- Package manager: pnpm workspace.
- Session storage: Node PostgreSQL or Cloudflare D1 through app-owned runtime adapters.

## Workspace Map

- `apps/server`: Hono server, Shopify auth, webhooks, Admin API routes, runtime adapters, and infrastructure capabilities.
- `apps/web`: Vite/React frontend target for Shopify app UI.
- `apps/document`: VitePress documentation app.
- `packages/envs`: Runtime-neutral env constants, Zod config schemas, defaults, and shared schema helpers.
- `packages/app-env`: Shopify app env composition, runtime/provider constants, and app-level env contracts.
- `packages/database`: Shared Drizzle table definitions, Drizzle-Zod schemas, and inferred database types.
- `scripts/*`: Root tooling for generated Shopify, Wrangler, tunnel, and deployment files.
- `docs/*`: Optional repository-level plans, guides, references, notes, and cross-workspace documentation.

## Rule Placement

- Keep durable project rules in the closest relevant `AGENTS.md`.
- Keep root `AGENTS.md` limited to workspace-wide rules; app/package-specific detail belongs in that workspace's closer file.
- Closer `AGENTS.md` files override or refine this root file.
- Put reusable Codex workflows in `.agents/skills/*/SKILL.md`.
- Put project-scoped Codex settings in `.codex/config.toml`; do not put engineering rules there.

## Monorepo Boundaries

- Prefer existing workspace packages, helpers, types, constants, schemas, and patterns before introducing new logic.
- Treat package names as semantic ownership boundaries: use `@shamt/app-env` for app env contracts, `@shamt/envs` for runtime-neutral env primitives, and `@shamt/database` for database-backed shapes.
- App-local schemas, types, enums, or utilities are acceptable only for app-boundary adaptation, browser-safe serialization, transport concerns, or behavior not owned by a package.
- Packages must not import `apps/*` or app runtime infrastructure. Import sibling package-owned concepts when dependency direction allows it.
- Use TypeScript `tsconfig` path aliases only under `apps/*`; packages under `packages/*` must not use `tsconfig` aliases.
- Avoid duplicating package-owned behavior in apps or sibling packages. Extract shared concepts to the correct lower-level package when reuse becomes real.

## Coding Rules

- Follow the referenced folder's architecture, naming, file layout, validation style, error handling style, export shape, tests, and docs style.
- Before large rewrites, inspect call sites, public API boundaries, tests, and runtime constraints. Preserve behavior unless a breaking change is intended.
- Use structured parsers and typed APIs instead of ad hoc string manipulation when practical.
- Put reusable public types in `types.ts`, reusable multi-file helpers in `utils.ts`, and stable public constants in `constants.ts` or `constants/`.
- Keep one-off feature-local helpers close to their caller.
- Export through package or folder `index.ts` files according to existing package style.
- When adding a package-owned public concept, update entrypoints and package docs.
- Add JSDoc/TSDoc for exported public APIs. Include examples in package README or JSDoc when usage is not trivial.

## README And Docs

- Keep root README navigational and architectural.
- Package READMEs should document purpose, imports, public API, examples, gotchas, and runtime notes.
- App READMEs should document purpose, local development, env, commands, runtime behavior, deployment, and troubleshooting.
- If paired `README.md` and `README.zh-CN.md` files exist for a changed workspace, keep both aligned before push or release prep.
- Put agent-generated implementation plans under the closest relevant `docs/plans/`; use root `docs/plans/` only for repo-wide plans.
- Put task-oriented guides under `docs/guides/` or the closest workspace `docs/guides/`.
- Put descriptions, explanations, and usage manuals under `docs/references/` or the closest workspace `docs/references/`.
- Put ongoing notes or backlog under `docs/notes/` or the closest workspace `docs/notes/`.

## Generated Files And Secrets

- Do not commit secrets or print secret values in final answers.
- Treat `.env.*`, `.dev.vars`, Shopify secrets, Cloudflare tokens, Redis credentials, database URLs, and private keys as sensitive.
- Do not hand-edit generated Shopify or Wrangler files unless the user explicitly asks for generated-output debugging.
- Root prepare scripts own generated Shopify and Wrangler config.
- D1 local data lives under `.wrangler/`; do not delete it unless explicitly asked.

## Commands And Verification

- Install: `pnpm install`
- Local development: `pnpm dev`
- Fixed tunnel development: `pnpm dev:tunnel`
- Deploy: `pnpm deploy`
- Workspace checks: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm format`
- Prefer focused commands, for example `pnpm -F @shamt/server test`, `pnpm -F @shamt/web build`, or `pnpm -F @shamt/database build`.
- Run the narrowest relevant lint, test, type, or build command before claiming code changes are complete.
- For docs-only changes, read back the rendered Markdown structure mentally or with file reads; tests are not required unless docs generation scripts changed.
- When a workspace has tests under a local `tests/` directory, keep a `tests/tsconfig.json` next to those tests and verify it with `tsc -p tests/tsconfig.json --noEmit` before treating test TypeScript errors as fixed.
