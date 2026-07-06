# @shamt/database

`@shamt/database` is the workspace package for shared Drizzle table
definitions, Drizzle-Zod schemas, and inferred database types.

Applications should import schema objects from this package and create their own
runtime-specific Drizzle clients. This package does not open database
connections and does not read environment variables.

`apps/server` currently consumes these schemas through a runtime-aware database
factory. PostgreSQL models are used by Node PostgreSQL. SQLite models are used
by Cloudflare D1.

## Exports

| Entry                          | Purpose                                         |
| ------------------------------ | ----------------------------------------------- |
| `@shamt/database/constants`    | Shared database-domain constants                |
| `@shamt/database/models`       | All Drizzle table models                        |
| `@shamt/database/models/*`     | Dialect Drizzle table models                    |
| `@shamt/database/schemas`      | All Drizzle-Zod validation schemas              |
| `@shamt/database/schemas/*`    | Dialect insert/update/select schemas            |
| `@shamt/database/types`        | Dialect-neutral app-facing database shape types |
| `@shamt/database/package.json` | Package metadata                                |

The package intentionally has no root `@shamt/database` export. Import from a
specific boundary so consumers do not accidentally depend on every table,
schema, and type.

## Build Output

The package builds with `tsdown --config ./build.config.ts` and keeps the
constants, model, schema, and type entrypoints as files under `dist`.

| Published export            | Output path example        |
| --------------------------- | -------------------------- |
| `@shamt/database/constants` | `dist/constants/index.mjs` |
| `@shamt/database/models`    | `dist/models/index.mjs`    |
| `@shamt/database/models/*`  | `dist/models/*/index.mjs`  |
| `@shamt/database/schemas`   | `dist/schemas/index.mjs`   |
| `@shamt/database/schemas/*` | `dist/schemas/*/index.mjs` |
| `@shamt/database/types`     | `dist/types/index.mjs`     |

Source workspace exports point at `src/*` for local TypeScript development.
Published exports point at `dist/*`. The package exposes only boundary-level
entrypoints; file-level model or schema paths are internal implementation
details.

## Models

The package keeps PostgreSQL and SQLite/D1 models separate because the two
dialects represent dates, booleans, enums, and integers differently. The app
layer maps both dialects behind the same store interfaces.

`postgresFiles`

| Column            | Type        | Notes                          |
| ----------------- | ----------- | ------------------------------ |
| `id`              | text        | primary key                    |
| `shop_domain`     | text        | Shopify shop owner boundary    |
| `original_name`   | text        | uploaded filename for display  |
| `safe_name`       | text        | sanitized filename suffix      |
| `content_type`    | text        | uploaded MIME type             |
| `byte_size`       | bigint      | number mode, defaults to `0`   |
| `bucket_provider` | pg enum     | `memory` or `r2`               |
| `bucket_key`      | text        | generated object key           |
| `status`          | pg enum     | file lifecycle status          |
| `expires_at`      | timestamptz | expiry timestamp               |
| `created_at`      | timestamptz | creation timestamp             |
| `updated_at`      | timestamptz | update timestamp               |
| `deleted_at`      | timestamptz | nullable soft-delete timestamp |

File status values:

- `uploading`
- `available`
- `expired`
- `deleted`
- `failed`

File indexes:

- `files_shop_created_at_idx` on `shop_domain`, `created_at`
- `files_shop_status_idx` on `shop_domain`, `status`
- `files_expires_at_idx` on `expires_at`

The app-side file store uses `shop_domain`, `created_at`, and `id` for seek
pagination, and keeps page-number pagination shallow. Cursor requests avoid a
total-count query; page requests return `total` for the current filter.

`sqliteFiles`

SQLite/D1 file metadata table. It mirrors `files` with SQLite-compatible
types: enum values are stored as text, byte size as integer, and date columns as
integer `timestamp_ms` values.

`postgresShopifySessions`

PostgreSQL Shopify session table for
`@shopify/shopify-app-session-storage-drizzle`.

| Column                | Type      | Notes                       |
| --------------------- | --------- | --------------------------- |
| `id`                  | text      | primary key                 |
| `shop`                | text      | required                    |
| `state`               | text      | required                    |
| `isOnline`            | boolean   | required, defaults `false`  |
| `scope`               | text      | nullable                    |
| `expires`             | timestamp | nullable, date mode         |
| `accessToken`         | text      | required by adapter `4.0.0` |
| `userId`              | bigint    | nullable, number mode       |
| `firstName`           | text      | nullable                    |
| `lastName`            | text      | nullable                    |
| `email`               | text      | nullable                    |
| `accountOwner`        | boolean   | nullable                    |
| `locale`              | text      | nullable                    |
| `collaborator`        | boolean   | nullable                    |
| `emailVerified`       | boolean   | nullable                    |
| `refreshToken`        | text      | nullable                    |
| `refreshTokenExpires` | timestamp | nullable, date mode         |

`sqliteShopifySessions`

SQLite/D1 Shopify session table for
`@shopify/shopify-app-session-storage-drizzle`.

The columns mirror `postgresShopifySessions`, using SQLite-compatible column
types: boolean values are stored as integer booleans, `expires` values as text,
and `userId` as a bigint blob.

`postgresProductExports` and `sqliteProductExports`

Product export job metadata table. PostgreSQL and SQLite/D1 variants mirror the
same logical shape and keep dialect-specific date/status storage inside their
own model files.

The table includes a required `template` column that defaults to `basic`.
Template codes are exported from `@shamt/database/constants` as
`PRODUCT_EXPORT_TEMPLATE_CODE_VALUES`.

Key query indexes:

- `product_exports_shop_created_id_idx` on `shop_domain`, `created_at`, `id`
- `product_exports_shop_status_created_id_idx` on `shop_domain`, `status`, `created_at`, `id`
- `product_exports_status_updated_id_idx` on `status`, `updated_at`, `id`
- `product_exports_bulk_operation_idx` on `shopify_bulk_operation_id`

`postgresProductExportParts` and `sqliteProductExportParts`

Product export part rows used by the export worker. The server store aggregates
part status counts in the database rather than loading every part into
application memory.

`postgresReferences` and `sqliteReferences`

Shop-scoped reference data table for standard options and operator-managed
reference values.

| Column        | Type        | Notes                                      |
| ------------- | ----------- | ------------------------------------------ |
| `id`          | text        | primary key                                |
| `shop_domain` | text        | Shopify shop owner boundary                |
| `namespace`   | text        | reference namespace, such as `gender`      |
| `code`        | text        | stable machine-readable code               |
| `label`       | text        | human-readable label                       |
| `enabled`     | boolean/int | whether this reference can be selected     |
| `system`      | boolean/int | whether this is a system default reference |
| `sort_order`  | integer     | display and cursor ordering                |
| `created_at`  | timestamp   | creation timestamp                         |
| `updated_at`  | timestamp   | update timestamp                           |
| `deleted_at`  | timestamp   | nullable soft-delete timestamp             |

Reference indexes:

- `references_shop_namespace_code_idx` on `shop_domain`, `namespace`, `code`
- `references_shop_namespace_sort_idx` on `shop_domain`, `namespace`, `enabled`, `sort_order`, `code`

## Constants

`@shamt/database/constants` owns product export enum-like values shared by
database schemas and app code:

```ts
import {
  PRODUCT_EXPORT_PART_STATUS_VALUES,
  PRODUCT_EXPORT_STATUS_VALUES,
  PRODUCT_EXPORT_TEMPLATE_CODE_VALUES,
} from "@shamt/database/constants";
```

Use these exports instead of duplicating status or template arrays in app code.

## Zod Schemas

The package exports Drizzle-Zod schemas for inserts, updates, and selects:

```ts
import {
  insertPostgresFileSchema,
  selectPostgresFileSchema,
  updatePostgresFileSchema,
} from "@shamt/database/schemas/postgres";
import {
  insertSqliteFileSchema,
  selectSqliteFileSchema,
  updateSqliteFileSchema,
} from "@shamt/database/schemas/sqlite";
```

Dialect schema entrypoints export dialect-prefixed inferred types such as
`InsertPostgresFile`, `UpdatePostgresFile`, `SelectPostgresFile`,
`InsertSqliteFile`, `UpdateSqliteFile`, and `SelectSqliteFile`. These types are
derived from the exported Zod schemas.

The package also keeps pure Zod response entity schemas under
`@shamt/database/entities/plain-zod-schema`. These schemas describe serialized
PostgreSQL select results for API responses and browser/runtime parsing. They
import only Zod and shared constants, so they do not pull Drizzle table models
or `drizzle-zod` into web or Cloudflare bundles.

```ts
import {
  FileSchema,
  ProductExportPartSchema,
  ProductExportSchema,
  ReferenceSchema,
  ShopifySessionSchema,
} from "@shamt/database/entities/plain-zod-schema";
```

Date and timestamp fields in these response schemas are ISO datetime strings,
not `Date` instances. Insert and update validation remains owned by the
Drizzle-Zod dialect schemas or by app-specific request body schemas.

## Types

`@shamt/database/types` exports dialect-neutral aliases for app and web code
that should not care which database provider backs the app:

```ts
import type {
  InsertProductExport,
  SelectFile,
  SelectProductExport,
  UpdateReference,
} from "@shamt/database/types";
```

These aliases are generated from the canonical PostgreSQL schema types. They
avoid hand-written frontend contract shapes while keeping `apps/web` away from
the low-level PostgreSQL and SQLite entrypoints.

## Usage

Create a Drizzle client in an app and pass the shared schema:

```ts
import {
  postgresFiles,
  postgresProductExports,
  postgresReferences,
  postgresShopifySessions,
} from "@shamt/database/models/postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.APP_DATABASE_URL });
const db = drizzle({
  client: pool,
  schema: {
    files: postgresFiles,
    productExports: postgresProductExports,
    references: postgresReferences,
    shopifySessions: postgresShopifySessions,
  },
});
```

Create a D1/SQLite Drizzle client with the SQLite schema:

```ts
import {
  sqliteFiles,
  sqliteProductExports,
  sqliteReferences,
  sqliteShopifySessions,
} from "@shamt/database/models/sqlite";
import { drizzle } from "drizzle-orm/d1";

const db = drizzle(env.DB, {
  schema: {
    files: sqliteFiles,
    productExports: sqliteProductExports,
    references: sqliteReferences,
    shopifySessions: sqliteShopifySessions,
  },
});
```

Use models in queries:

```ts
import { postgresFiles } from "@shamt/database/models/postgres";
import { eq } from "drizzle-orm";

function listFiles() {
  return db
    .select()
    .from(postgresFiles)
    .where(eq(postgresFiles.shopDomain, "example.myshopify.com"));
}
```

## Boundaries

- This package is schema-only.
- Runtime strategy belongs in apps, such as `apps/server/src/infra/database`.
- Migrations are generated from app-owned Drizzle config.
- Models are Drizzle table definitions; schemas are Drizzle-Zod validation
  schemas; types are dialect-neutral aliases for app-facing database shapes.
- File metadata has PostgreSQL and SQLite/D1 schemas.
- Product export metadata, part metadata, and template code values live in this
  package.
- Reference data has PostgreSQL and SQLite/D1 schemas.
- Shopify session storage has PostgreSQL and SQLite/D1 schemas.
- Node D1 support is implemented in the app layer by wrapping Cloudflare's D1
  HTTP API as a `D1Database`-compatible client.
