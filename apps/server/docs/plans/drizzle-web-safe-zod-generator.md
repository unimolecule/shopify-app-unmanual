# Drizzle Web-Safe Zod Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Drizzle PostgreSQL/SQLite schema generator package that emits web-safe Zod source files from Drizzle tables, then use it in `@shamt/database` so `apps/server` and `apps/web` can share runtime parse schemas without hand-writing entity schemas.

**Architecture:** Keep Drizzle tables as the source of truth. A Node-only generator package imports Drizzle tables during build/codegen, reads column metadata, normalizes it into a dialect-neutral schema IR, and writes plain TypeScript Zod files that import only `zod` and safe constants. Runtime consumers import generated schemas from `@shamt/database/entities`; they never import Drizzle tables, `drizzle-zod`, `pg-core`, or `sqlite-core`.

**Tech Stack:** TypeScript, pnpm workspace, Drizzle ORM PostgreSQL/SQLite column metadata, Zod 4, tsdown, Vitest/type tests, `@unimolecule/utils` for existing Node/file helpers where available.

---

## Why This Exists

`drizzle-zod` solves database-boundary validation, but it creates schemas at runtime from Drizzle table objects:

```ts
createSelectSchema(postgresFiles);
```

That pattern requires importing `postgresFiles`, which imports `drizzle-orm/pg-core`. It is correct for Node/PostgreSQL database code, but it is not safe for browser code or Cloudflare Worker bundles.

The target pattern is code generation:

```text
Drizzle table value
  -> generator runs in Node during development/build
  -> generated plain Zod source
  -> apps/server and apps/web import generated schemas at runtime
```

Generated files must be boring TypeScript:

```ts
import { z } from "zod";

export const fileSchema = z.object({
  id: z.string(),
  shopDomain: z.string(),
});
```

Generated files must not contain:

```ts
import "drizzle-orm";
import "drizzle-zod";
import "@shamt/database/models/postgres";
import "@shamt/database/models/sqlite";
```

## Non-Negotiable Rules

- Drizzle table definitions remain the source of truth.
- Runtime web-safe schemas must be generated, not hand-written.
- Generated web-safe schema files must not import Drizzle, `drizzle-zod`, PostgreSQL models, SQLite models, Node built-ins, app runtime code, or Cloudflare bindings.
- The generator package may be Node-only. Generated output must be runtime-neutral.
- Cover all Drizzle PostgreSQL and SQLite built-in column constructors that are public in `drizzle-orm/pg-core` and `drizzle-orm/sqlite-core`.
- `customType` is supported through explicit user-provided mapping. The generator must fail with a clear error if a custom column has no mapping.
- The first `@shamt/database` integration uses `postgres` as canonical schema source for shared entity schemas, because it has richer type metadata than SQLite while SQLite remains the Cloudflare/D1 persistence adapter.
- `schemas/postgres` and `schemas/sqlite` remain database-boundary Drizzle-Zod schemas.
- New shared runtime schemas are exported from `@shamt/database/entities`.
- `apps/web` may import `@shamt/database/entities` and `@shamt/database/types`; it must not import `@shamt/database/models/*` or `@shamt/database/schemas/*`.

## Target Package Layout

Create a dedicated workspace package:

```text
packages/drizzle-zod-generator/
  package.json
  build.config.ts
  tsconfig.json
  README.md
  src/
    index.ts
    config.ts
    dialect.ts
    errors.ts
    ir.ts
    generator.ts
    writer.ts
    postgres/
      inspect.ts
      map-column.ts
      types.ts
    sqlite/
      inspect.ts
      map-column.ts
      types.ts
    zod/
      emit-expression.ts
      emit-file.ts
      imports.ts
  tests/
    postgres-column-map.test.ts
    sqlite-column-map.test.ts
    generator-output.test.ts
    fixtures/
      postgres-all-columns.ts
      sqlite-all-columns.ts
```

Use it from `@shamt/database`:

```text
packages/database/
  drizzle-zod-generator.config.ts
  src/
    entities/
      index.ts
      generated/
        files.ts
        product-exports.ts
        references.ts
        shopify-sessions.ts
        index.ts
  tests/
    entities/
      generated-output.test.ts
      web-safe-imports.test.ts
      type-compatibility.test.ts
```

## Public API Shape

The generator package should expose a small API:

```ts
import type { Table } from "drizzle-orm";

export type DrizzleZodGeneratorDialect = "postgres" | "sqlite";

export type DrizzleZodGeneratorTable = {
  name: string;
  table: Table;
  dialect: DrizzleZodGeneratorDialect;
  schemas: {
    select?: string;
    insert?: string;
    update?: string;
  };
};

export type DrizzleZodGeneratorConfig = {
  outDir: string;
  tables: DrizzleZodGeneratorTable[];
  customTypes?: Record<string, string>;
  overrides?: Record<string, Record<string, string>>;
};

export function defineDrizzleZodGeneratorConfig(
  config: DrizzleZodGeneratorConfig,
): DrizzleZodGeneratorConfig;

export async function generateDrizzleZodSchemas(
  config: DrizzleZodGeneratorConfig,
): Promise<void>;
```

`customTypes` maps custom Drizzle column signatures to Zod expressions:

```ts
const config = {
  customTypes: {
    "postgres.geometry": "z.object({ x: z.number(), y: z.number() })",
    "sqlite.json": "z.unknown()",
  },
};
```

`overrides` maps individual table columns to exact Zod expressions:

```ts
const config = {
  overrides: {
    files: {
      createdAt: "z.string().datetime()",
      updatedAt: "z.string().datetime()",
    },
  },
};
```

## Column Mapping Matrix

The generator normalizes each Drizzle column into this IR:

```ts
export type ColumnZodIr = {
  propertyName: string;
  columnName: string;
  notNull: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
  baseExpression: string;
};
```

Then it derives schema kinds:

| Schema kind | Required fields                                         | Nullable fields              | Default/generated fields |
| ----------- | ------------------------------------------------------- | ---------------------------- | ------------------------ |
| `select`    | Present for every table column                          | `base.nullable()`            | Still present            |
| `insert`    | Required when `notNull && !hasDefault && !isPrimaryKey` | `base.nullable().optional()` | `base.optional()`        |
| `update`    | Every field optional                                    | `base.nullable().optional()` | `base.optional()`        |

### PostgreSQL Types

Cover these built-in PostgreSQL column families:

| Drizzle family                          | Zod output                                         |
| --------------------------------------- | -------------------------------------------------- |
| `text`, `varchar`, `char`, `uuid`       | `z.string()`                                       |
| `pgEnum`, enum text config              | `z.enum([...])`                                    |
| `boolean`                               | `z.boolean()`                                      |
| `integer`, `smallint`, `serial`         | `z.number().int()`                                 |
| `bigint({ mode: "number" })`            | `z.number().int()`                                 |
| `bigint({ mode: "bigint" })`            | `z.bigint()`                                       |
| `bigserial({ mode: "number" })`         | `z.number().int()`                                 |
| `bigserial({ mode: "bigint" })`         | `z.bigint()`                                       |
| `real`, `doublePrecision`               | `z.number()`                                       |
| `numeric`, `decimal`                    | `z.string()` by default; override may use number   |
| `timestamp`, `date`, `time`, `interval` | `z.date()` by default; override may use ISO string |
| `json`, `jsonb`                         | `z.unknown()` unless `$type<T>()` can be emitted   |
| `cidr`, `inet`, `macaddr`, `macaddr8`   | `z.string()`                                       |
| `point`, `line`                         | `z.unknown()` unless explicit override is provided |
| `vector`, `halfvec`, `sparsevec`        | `z.array(z.number())` or override                  |
| `bit`                                   | `z.string()`                                       |
| `customType`                            | Required explicit mapping                          |

### SQLite Types

Cover these built-in SQLite column families:

| Drizzle family                      | Zod output                                         |
| ----------------------------------- | -------------------------------------------------- |
| `text`                              | `z.string()`                                       |
| `text({ enum })`                    | `z.enum([...])`                                    |
| `text({ mode: "json" })`            | `z.unknown()` unless `$type<T>()` can be emitted   |
| `integer()`                         | `z.number().int()`                                 |
| `integer({ mode: "boolean" })`      | `z.boolean()`                                      |
| `integer({ mode: "timestamp" })`    | `z.date()` by default; override may use ISO string |
| `integer({ mode: "timestamp_ms" })` | `z.date()` by default; override may use ISO string |
| `real()`                            | `z.number()`                                       |
| `numeric()`                         | `z.string()` by default; override may use number   |
| `blob({ mode: "bigint" })`          | `z.bigint()`                                       |
| `blob({ mode: "json" })`            | `z.unknown()` unless `$type<T>()` can be emitted   |
| `blob({ mode: "buffer" })`          | `z.instanceof(Uint8Array)`                         |
| `customType`                        | Required explicit mapping                          |

## `@shamt/database` Integration Policy

Use generated entities for web-safe shared runtime schemas:

```ts
import { fileSchema } from "@shamt/database/entities";
```

Keep database-boundary schemas as they are:

```ts
import { selectPostgresFileSchema } from "@shamt/database/schemas/postgres";
import { selectSqliteFileSchema } from "@shamt/database/schemas/sqlite";
```

`apps/server/src/app/modules/*/schema.ts` should migrate from `@shamt/database/schemas/postgres` to `@shamt/database/entities` for API output schemas. App-owned request body schemas may remain in app modules until the generator supports configured input schemas.

## Task 1: Baseline Audit And Fixtures

**Files:**

- Read: `packages/database/src/models/postgres/*.ts`
- Read: `packages/database/src/models/sqlite/*.ts`
- Read: `packages/database/src/constants/*.ts`
- Create: `packages/drizzle-zod-generator/tests/fixtures/postgres-all-columns.ts`
- Create: `packages/drizzle-zod-generator/tests/fixtures/sqlite-all-columns.ts`
- Create: `packages/drizzle-zod-generator/tests/postgres-column-map.test.ts`
- Create: `packages/drizzle-zod-generator/tests/sqlite-column-map.test.ts`

- [ ] **Step 1: Add all-column PostgreSQL fixture**

Create a fixture that imports public PostgreSQL column constructors from `drizzle-orm/pg-core` and declares one table containing every supported built-in type listed in the PostgreSQL mapping matrix. Include at least one nullable field, one not-null field, one default field, one primary key, one enum field, and one `customType` field.

- [ ] **Step 2: Add all-column SQLite fixture**

Create a fixture that imports public SQLite column constructors from `drizzle-orm/sqlite-core` and declares one table containing every supported built-in type listed in the SQLite mapping matrix. Include `text({ enum })`, `integer({ mode: "boolean" })`, timestamp modes, `blob({ mode: "bigint" })`, and one `customType` field.

- [ ] **Step 3: Write failing mapper tests**

Add tests that call the future column mapper with fixture columns and assert expected base Zod expressions. Required examples:

```ts
expect(mapPostgresColumn(fixture.id).baseExpression).toBe("z.string()");
expect(mapPostgresColumn(fixture.enabled).baseExpression).toBe("z.boolean()");
expect(mapSqliteColumn(fixture.createdAt).baseExpression).toBe("z.date()");
expect(mapSqliteColumn(fixture.status).baseExpression).toBe(
  'z.enum(["queued", "ready"])',
);
```

Expected before implementation: tests fail because `mapPostgresColumn` and `mapSqliteColumn` do not exist.

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --dir packages/drizzle-zod-generator test
```

Expected: fail with missing package or missing mapper imports. Keep this failure as the red step.

## Task 2: Create Generator Package Skeleton

**Files:**

- Create: `packages/drizzle-zod-generator/package.json`
- Create: `packages/drizzle-zod-generator/tsconfig.json`
- Create: `packages/drizzle-zod-generator/build.config.ts`
- Create: `packages/drizzle-zod-generator/src/index.ts`
- Create: `packages/drizzle-zod-generator/src/config.ts`
- Create: `packages/drizzle-zod-generator/src/errors.ts`
- Modify: `pnpm-workspace.yaml` only if the existing `packages/**` pattern does not pick up the new package

- [ ] **Step 1: Add package manifest**

Create `packages/drizzle-zod-generator/package.json` with package name `@shamt/drizzle-zod-generator`, ESM module type, `build`, `test`, `format`, `lint`, and `clean` scripts matching the workspace package style.

- [ ] **Step 2: Add tsdown build config**

Use `tsdown` with `platform: "node"`, `dts: true`, and `outputEntryBuilder("./src", { entries: "index" })`.

- [ ] **Step 3: Export config API**

Create `defineDrizzleZodGeneratorConfig(config)` as an identity helper and export public types from `src/index.ts`.

- [ ] **Step 4: Verify package is discoverable**

Run:

```bash
pnpm -F @shamt/drizzle-zod-generator build
```

Expected: package builds or fails only because mapper/generator files are not implemented yet.

## Task 3: Implement Drizzle Metadata Extraction

**Files:**

- Create: `packages/drizzle-zod-generator/src/ir.ts`
- Create: `packages/drizzle-zod-generator/src/dialect.ts`
- Create: `packages/drizzle-zod-generator/src/postgres/inspect.ts`
- Create: `packages/drizzle-zod-generator/src/sqlite/inspect.ts`
- Test: `packages/drizzle-zod-generator/tests/postgres-column-map.test.ts`
- Test: `packages/drizzle-zod-generator/tests/sqlite-column-map.test.ts`

- [ ] **Step 1: Inspect actual Drizzle column objects**

Run a local script with `tsx` that imports the all-column fixtures and prints stable metadata keys for each column:

```bash
pnpm --dir packages/drizzle-zod-generator exec tsx ./scripts/inspect-fixtures.ts
```

Expected: identify stable public or semi-public fields for `columnType`, `dataType`, `enumValues`, `notNull`, `hasDefault`, `primary`, and name information.

- [ ] **Step 2: Add extraction adapters**

Implement small dialect adapters that convert Drizzle column objects to:

```ts
export type DrizzleColumnMetadata = {
  dialect: "postgres" | "sqlite";
  propertyName: string;
  columnName: string;
  columnType: string;
  dataType: string;
  enumValues?: readonly [string, ...string[]];
  notNull: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
};
```

- [ ] **Step 3: Guard unknown metadata**

If a column has an unknown `columnType` or missing metadata needed for output, throw `UnsupportedDrizzleColumnError` with table name, property name, dialect, and detected column type.

- [ ] **Step 4: Run mapper tests**

Run:

```bash
pnpm -F @shamt/drizzle-zod-generator test -- postgres-column-map sqlite-column-map
```

Expected: extraction works; mapper tests may still fail until Task 4 maps every type.

## Task 4: Implement PostgreSQL And SQLite Type Mapping

**Files:**

- Create: `packages/drizzle-zod-generator/src/postgres/map-column.ts`
- Create: `packages/drizzle-zod-generator/src/sqlite/map-column.ts`
- Create: `packages/drizzle-zod-generator/src/zod/emit-expression.ts`
- Test: `packages/drizzle-zod-generator/tests/postgres-column-map.test.ts`
- Test: `packages/drizzle-zod-generator/tests/sqlite-column-map.test.ts`

- [ ] **Step 1: Implement primitive mappings**

Map string, number, boolean, bigint, enum, date/time, JSON, network, vector, blob, and custom families according to the mapping matrix above.

- [ ] **Step 2: Implement custom type handling**

When metadata identifies a custom column, require either:

```ts
const config = {
  customTypes: {
    "postgres.<columnType>": "z.string()",
  },
};
```

or:

```ts
const config = {
  overrides: {
    tableName: {
      columnName: "z.string()",
    },
  },
};
```

Expected: no silent `z.any()` fallback.

- [ ] **Step 3: Add unknown-type tests**

Assert that an unmapped custom type throws `UnsupportedDrizzleColumnError` with a message containing dialect, table, and column.

- [ ] **Step 4: Run all mapper tests**

Run:

```bash
pnpm -F @shamt/drizzle-zod-generator test
```

Expected: PostgreSQL and SQLite mapper fixtures pass for every supported type.

## Task 5: Emit Select, Insert, And Update Zod Source

**Files:**

- Create: `packages/drizzle-zod-generator/src/generator.ts`
- Create: `packages/drizzle-zod-generator/src/writer.ts`
- Create: `packages/drizzle-zod-generator/src/zod/imports.ts`
- Create: `packages/drizzle-zod-generator/src/zod/emit-file.ts`
- Test: `packages/drizzle-zod-generator/tests/generator-output.test.ts`

- [ ] **Step 1: Add schema derivation**

For each table config, produce `select`, `insert`, and `update` schema IR only for names requested in `schemas`.

- [ ] **Step 2: Add Zod expression wrappers**

Apply wrappers in this order:

```text
baseExpression
  -> nullable when DB column is nullable
  -> optional when insert/update rules require optional
```

Examples:

```ts
z.string();
z.string().nullable();
z.string().optional();
z.string().nullable().optional();
```

- [ ] **Step 3: Emit deterministic TypeScript**

Generated files must be stable across runs: sorted imports, stable property order from table definition, newline at EOF, no timestamps, no absolute paths.

- [ ] **Step 4: Add snapshot-style exact output tests**

Use exact string assertions for a small table fixture:

```ts
expect(output).toBe(`import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  nickname: z.string().nullable(),
});
`);
```

- [ ] **Step 5: Run generator output tests**

Run:

```bash
pnpm -F @shamt/drizzle-zod-generator test -- generator-output
```

Expected: generated output is exact and deterministic.

## Task 6: Wire Generator Into `@shamt/database`

**Files:**

- Create: `packages/database/drizzle-zod-generator.config.ts`
- Modify: `packages/database/package.json`
- Modify: `packages/database/src/entities/index.ts`
- Create: `packages/database/src/entities/generated/index.ts`
- Generate: `packages/database/src/entities/generated/files.ts`
- Generate: `packages/database/src/entities/generated/product-exports.ts`
- Generate: `packages/database/src/entities/generated/references.ts`
- Generate: `packages/database/src/entities/generated/shopify-sessions.ts`
- Modify: `packages/database/README.md`

- [ ] **Step 1: Add generator config**

Configure `@shamt/database` to generate from the PostgreSQL table definitions:

```ts
import { defineDrizzleZodGeneratorConfig } from "@shamt/drizzle-zod-generator";
import {
  postgresFiles,
  postgresProductExportParts,
  postgresProductExports,
  postgresReferences,
  postgresShopifySessions,
} from "./src/models/postgres";

export default defineDrizzleZodGeneratorConfig({
  outDir: "./src/entities/generated",
  tables: [
    {
      dialect: "postgres",
      name: "files",
      table: postgresFiles,
      schemas: {
        insert: "insertFileSchema",
        select: "fileSchema",
        update: "updateFileSchema",
      },
    },
  ],
});
```

Add the remaining tables in the same config: `product_exports`, `product_export_parts`, `references`, and `shopify_sessions`.

- [ ] **Step 2: Add package scripts**

Add:

```json
{
  "schema:generate": "tsx ./scripts/generate-entities.ts",
  "schema:check": "tsx ./scripts/check-generated-entities.ts"
}
```

If `@unimolecule/utils` has existing file read/write/check helpers, use them in these scripts instead of custom filesystem helpers.

- [ ] **Step 3: Export generated entities**

Make `packages/database/src/entities/index.ts` export only generated runtime schemas and public inferred types:

```ts
export * from "./generated";
```

Do not export `./postgres` or `./sqlite` from `entities`; those current files are type aliases over dialect schemas and should either be removed or moved back under `types`.

- [ ] **Step 4: Generate files**

Run:

```bash
pnpm -F @shamt/database schema:generate
```

Expected: generated files contain only `zod` imports and safe package constants when configured.

- [ ] **Step 5: Build database package**

Run:

```bash
pnpm -F @shamt/database build
```

Expected: build succeeds and `@shamt/database/entities` resolves.

## Task 7: Add Safety Tests For Generated Entities

**Files:**

- Create: `packages/database/tests/entities/web-safe-imports.test.ts`
- Create: `packages/database/tests/entities/type-compatibility.test.ts`
- Create: `packages/database/tests/entities/generated-output.test.ts`
- Create or modify: `packages/database/tests/tsconfig.json`
- Modify: `packages/database/package.json`

- [ ] **Step 1: Assert generated files have no forbidden imports**

Test every file under `packages/database/src/entities/generated` and reject these strings:

```text
drizzle-orm
drizzle-zod
models/postgres
models/sqlite
schemas/postgres
schemas/sqlite
pg-core
sqlite-core
node:
```

- [ ] **Step 2: Assert Zod runtime parse works**

Create sample fixtures for `fileSchema`, `productExportSchema`, and `referenceSchema` and assert `.parse(...)` succeeds for valid records and fails for invalid enum values.

- [ ] **Step 3: Assert type compatibility**

Use TypeScript-only assertions to ensure generated entity schema types are compatible with existing `@shamt/database/types` aliases where the shared DTO intentionally matches the DB row shape.

- [ ] **Step 4: Add check command**

Add a command that verifies generated files are current:

```bash
pnpm -F @shamt/database schema:check
```

Expected: exits non-zero when generated output differs from committed files.

## Task 8: Migrate Server And Web Consumers

**Files:**

- Modify: `apps/server/src/app/modules/file/schema.ts`
- Modify: `apps/server/src/app/modules/product-export/schema.ts`
- Modify: `apps/server/src/app/modules/reference/schema.ts`
- Modify: `apps/web/src/**` only where web currently duplicates form/entity validation
- Test: `apps/server/tests/openapi-access.test.ts`
- Test: `apps/server/tests/build-contract.test.ts`

- [ ] **Step 1: Replace Postgres schema imports**

Replace server API schema imports like:

```ts
import { selectPostgresFileSchema } from "@shamt/database/schemas/postgres";
```

with:

```ts
import { fileSchema } from "@shamt/database/entities";
```

- [ ] **Step 2: Preserve OpenAPI decorations in app layer**

Keep `.openapi(...)` descriptions and examples inside `apps/server` module schemas. Generated `@shamt/database/entities` schemas must stay Zod-only and web-safe.

- [ ] **Step 3: Add import boundary guard**

Add or update a test that fails if `apps/web/src` imports:

```text
@shamt/database/models
@shamt/database/schemas
```

Allowed web imports:

```text
@shamt/database/entities
@shamt/database/types
@shamt/database/constants
```

- [ ] **Step 4: Verify server tests**

Run:

```bash
pnpm --dir apps/server run test -- openapi-access build-contract
```

Expected: OpenAPI routes still register, package export contract accepts `@shamt/database/entities`, and no server API schema imports `schemas/postgres`.

## Task 9: Cloudflare And Browser Bundle Verification

**Files:**

- Modify: `apps/server/tests/build-contract.test.ts`
- Optional Create: `apps/web/tests/database-import-boundary.test.ts` if web has a test harness

- [ ] **Step 1: Build server**

Run:

```bash
pnpm --dir apps/server run build
```

Expected: build succeeds.

- [ ] **Step 2: Dry-run Cloudflare bundle**

Run:

```bash
pnpm --dir apps/server exec wrangler deploy --env production --dry-run --outdir /private/tmp/shopify-hono-cloudflare-dry-run
```

Expected: dry-run exits successfully. Ignore sandbox-only log write warnings under `~/Library/Preferences/.wrangler/logs` when command exit code is 0.

- [ ] **Step 3: Check Cloudflare output for forbidden runtime imports**

Run:

```bash
rg -n "PgTextBuilder|drizzle-orm/pg-core|drizzle-orm/sqlite-core|@shamt/database/models/postgres|@shamt/database/schemas/postgres|postgresShopifySessions|drizzle-postgres.adapter|DrizzleSessionStoragePostgres|node:fs|node:path|node:stream|require\\(\"pg\"\\)|require\\('pg'\\)" /private/tmp/shopify-hono-cloudflare-dry-run --glob '!*.map'
```

Expected: no matches.

- [ ] **Step 4: Check generated entity entrypoint directly**

Run:

```bash
node --input-type=module -e "import('./packages/database/src/entities/index.ts').then(() => console.log('entities import ok'))"
```

Expected: import succeeds when run through the repo's TypeScript loader command. If direct Node cannot import `.ts`, use `pnpm exec tsx` for this smoke test.

## Task 10: Documentation And Maintenance Workflow

**Files:**

- Modify: `packages/drizzle-zod-generator/README.md`
- Modify: `packages/database/README.md`
- Modify: `apps/server/docs/guides/runtime-capabilities.md` only if it still mentions Postgres schema imports as acceptable in Cloudflare-safe paths
- Modify: `apps/server/docs/plans/drizzle-web-safe-zod-generator.md` by checking off completed steps during execution

- [ ] **Step 1: Document generator package usage**

The generator README must show:

```ts
import { defineDrizzleZodGeneratorConfig } from "@shamt/drizzle-zod-generator";
```

and a minimal config with one PostgreSQL table and one SQLite table.

- [ ] **Step 2: Document supported type mapping**

Copy the PostgreSQL and SQLite mapping matrices into `packages/drizzle-zod-generator/README.md` so package users can understand generated output.

- [ ] **Step 3: Document database package boundaries**

Update `packages/database/README.md` to explain:

```text
@shamt/database/models/*   database table values
@shamt/database/schemas/*  database-boundary drizzle-zod schemas
@shamt/database/entities   generated web-safe runtime Zod schemas
@shamt/database/types      type-only aliases
```

- [ ] **Step 4: Document contributor workflow**

Add the table-change workflow:

```bash
pnpm -F @shamt/database schema:generate
pnpm -F @shamt/database schema:check
pnpm -F @shamt/database build
pnpm --dir apps/server run build
```

Expected: maintainers know they only edit Drizzle tables and generator config, then regenerate entities.

## Execution Order

Implement in this order:

1. Create generator package skeleton.
2. Add all-column fixtures and failing mapper tests.
3. Implement metadata extraction.
4. Implement PostgreSQL and SQLite type mapping.
5. Implement source emitter.
6. Wire `@shamt/database` generated entities.
7. Add safety/type/bundle tests.
8. Migrate server/web imports.
9. Run Cloudflare dry-run verification.
10. Update docs.

## Final Verification Checklist

Before considering the migration complete, run:

```bash
pnpm -F @shamt/drizzle-zod-generator test
pnpm -F @shamt/drizzle-zod-generator build
pnpm -F @shamt/database schema:check
pnpm -F @shamt/database build
pnpm --dir apps/server run test -- openapi-access build-contract
pnpm --dir apps/server run build
pnpm --dir apps/server exec wrangler deploy --env production --dry-run --outdir /private/tmp/shopify-hono-cloudflare-dry-run
rg -n "PgTextBuilder|drizzle-orm/pg-core|@shamt/database/models/postgres|@shamt/database/schemas/postgres|DrizzleSessionStoragePostgres" /private/tmp/shopify-hono-cloudflare-dry-run --glob '!*.map'
```

Expected final state:

- `@shamt/database/entities` exports runtime Zod schemas safe for server, web, and Cloudflare.
- `apps/server` API schemas no longer import `@shamt/database/schemas/postgres`.
- `apps/web` can use `@shamt/database/entities` for runtime form validation.
- Cloudflare dry-run bundle contains no PostgreSQL Drizzle runtime, `PgTextBuilder`, or Postgres Shopify session adapter.
- Developers edit Drizzle tables, run `schema:generate`, and do not hand-write shared entity Zod schemas.
