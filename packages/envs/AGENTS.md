# Envs Package Instructions

## Scope

`@shamt/envs` owns runtime-neutral environment constants, Zod config schemas, HTTP status constants, response defaults, request limits, and schema composition helpers.

## Boundary Rules

- Do not read `process.env`, Worker bindings, or env files in this package.
- Do not add Shopify-specific schema here; use `@shamt/app-env` for app-specific fields.
- Keep this package independent from apps and higher-level workspace packages.
- Treat env as deployment-time configuration, not dynamic runtime settings.

## Schema And Constant Rules

- Prefer const objects over TypeScript `enum` so runtime values and literal types stay aligned.
- Keep time units in milliseconds and size units in bytes unless a field explicitly says otherwise.
- Put stable defaults and enum-like values in `src/constants/`.
- Put reusable Zod schemas in `src/configs/`.
- Put schema composition helpers in `src/utils/`.

## Documentation

- README must describe this as a library package: constants, schemas, relation to `@shamt/app-env`, usage, inputs/outputs, and unit conventions.
- Update README when adding constants, schemas, runtime names, env names, or unit-sensitive fields.

## Verification

- Run `pnpm -F @shamt/envs build` after schema, constants, or export changes.
- Run `pnpm -F @shamt/envs lint` after broad TypeScript or Markdown edits.
