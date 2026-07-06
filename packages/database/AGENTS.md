# Database Package Instructions

## Scope

`@shamt/database` owns shared Drizzle table definitions, Drizzle-Zod schemas, and inferred database types.

## Boundary Rules

- This package is schema-only.
- Do not open database connections here.
- Do not read env files, process env, Worker bindings, or runtime provider state here.
- Runtime database strategy belongs in apps, especially `apps/server/src/infra/database`.
- Migrations are generated from app-owned Drizzle config; keep package schemas compatible with that flow.

## Dialect Rules

- Keep PostgreSQL and SQLite/D1 models separate when dialect behavior differs.
- Preserve explicit handling of dates, booleans, enums, bigint/integer modes, and timestamp storage for each dialect.
- Keep PostgreSQL exports under `models/postgres` and `schemas/postgres`.
- Keep SQLite/D1 exports under `models/sqlite` and `schemas/sqlite`.

## Type And API Rules

- Export table models and insert/update/select schemas from stable dialect entrypoints.
- Export dialect-neutral app-facing aliases from `types` when consumers should not care which database provider backs the app.
- When updating `models`, update the corresponding `schemas` and `entities` in the same change.
- Reference schemas under `entities` must be handwritten Zod schemas that stay independent from Drizzle and PostgreSQL runtime code.
- Avoid app-specific names unless the schema is intentionally app-owned and documented.
- Add JSDoc and README examples for non-obvious table or schema usage.

## Documentation

- README must describe this as a library package: exports, models, schemas, usage examples, and boundaries.
- Update README when adding tables, columns, indexes, schemas, or export entrypoints.

## Verification

- Run `pnpm -F @shamt/database build` after schema or export changes.
- Run `pnpm -F @shamt/database lint` after broad TypeScript or Markdown edits.
