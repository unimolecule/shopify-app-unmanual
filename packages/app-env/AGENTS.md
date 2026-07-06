# App Env Package Instructions

## Scope

`@unimolecule/shopify-app-unmanual-app-env` composes runtime-neutral schemas from `@unimolecule/shopify-app-unmanual-envs` with Shopify app, database provider, bucket provider, Cloudflare, queue, and scheduler fields.

## Boundary Rules

- This package defines and validates env shape; it must not read env files or process env directly.
- Apps decide when and where to call `configSchema.parse(...)`.
- Browser code must not import the full parsed app env contract.
- Lower-level generic schemas belong in `@unimolecule/shopify-app-unmanual-envs`; Shopify or app-specific schema belongs here.

## Schema Rules

- Keep env key families stable unless the migration is intentional and documented.
- Use const objects for provider values and mode values, following existing package style.
- Add new provider constants and schemas together.
- Keep defaults and validation behavior explicit in Zod schemas.

## File Organization

- Put app-level schemas under `src/configs/`.
- Put app-level constants under `src/constants/`.
- Keep root exports stable and update package export maps when adding public entrypoints.
- Put reusable public types in `types.ts` only when inferred schema types are not enough.

## Documentation

- README must describe this as a library package: schema composition, env fields, runtime matrix, usage, and boundaries.
- Update README when adding env fields, providers, constants, or runtime matrix behavior.

## Verification

- Run `pnpm -F @unimolecule/shopify-app-unmanual-app-env build` after schema, constants, or export changes.
- Run `pnpm -F @unimolecule/shopify-app-unmanual-app-env lint` after broad TypeScript or Markdown edits.
