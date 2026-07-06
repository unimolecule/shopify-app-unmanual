# Database

`apps/server/src/infra/database` 是 Shopify session storage、file metadata、product-export 和 database health 共用的 runtime-aware database 层。它通过 `runtimeCapabilities.database()` 暴露 Drizzle client 和 database adapter check，让业务模块不直接关心 Node PostgreSQL 与 Cloudflare D1 的平台差异。

## Provider 矩阵

数据库 provider 来自 `APP_DATABASE_PROVIDER`：

| Provider   | 值         | 说明                       |
| ---------- | ---------- | -------------------------- |
| PostgreSQL | `postgres` | Node 使用 `pg`             |
| D1         | `d1`       | Cloudflare 使用 D1 binding |

当前支持矩阵：

| Runtime      | APP_DATABASE_PROVIDER | 实现                                     | Cloudflare binding        |
| ------------ | --------------------- | ---------------------------------------- | ------------------------- |
| `node`       | `postgres`            | `pg.Pool` + `drizzle-orm/node-postgres`  | 不需要                    |
| `cloudflare` | `d1`                  | Cloudflare D1 binding + `drizzle-orm/d1` | `APP_DATABASE_D1_BINDING` |

`APP_DATABASE_PROVIDER` 缺省值按 runtime 分发：Node 缺省为 `postgres`，Cloudflare 缺省为 `d1`。`node + d1` 与 `cloudflare + postgres` 会通过 env 解析，但会在 database strategy 边界失败。

## Runtime 实现

### Node + PostgreSQL

Node PostgreSQL 通过 `pg.Pool` 连接数据库：

```text
APP_RUNTIME=node
APP_DATABASE_PROVIDER=postgres
APP_DATABASE_URL=postgresql://...
```

对应实现：

```text
apps/server/src/infra/database/process.ts
apps/server/src/infra/database/shared.ts
```

数据库连接会缓存在 process runtime 中，并在 `runtimeCapabilityNodeDispose()` 中释放。adapter 的 `check()` 复用同一个 `pg.Pool` 执行 `select 1`，用于 `/health/database` 验证应用账号、连接池和 SQL 执行链路。

`infra/database/index.ts` 只导出共享契约和 database kind helper。Node runtime capability 从 `infra/database/process.ts` 引入 process database adapter；Cloudflare runtime capability 从 `infra/database/isolate.ts` 引入 isolate database adapter。process PostgreSQL 可以缓存连接；isolate D1 当前以 request binding 为边界，不跨 request 缓存 binding。两种 runtime 的 database health 都只做最小 `select 1` 检查，不依赖业务表或 migration 状态。

### Cloudflare + D1

Cloudflare D1 通过 Worker D1 binding 访问：

```text
APP_RUNTIME=cloudflare
APP_DATABASE_PROVIDER=d1
APP_DATABASE_D1_BINDING=i7eo_shopify_app_d1
APP_DATABASE_D1_ID=...
```

`wrangler.json` 中会生成：

```json
{
  "d1_databases": [
    {
      "binding": "i7eo_shopify_app_d1",
      "database_name": "i7eo-shopify-app-d1",
      "database_id": "...",
      "migrations_dir": "drizzle.d1"
    }
  ]
}
```

runtime capability 会通过 `APP_DATABASE_D1_BINDING` 动态读取 `c.env[binding]`。

D1 adapter 的 `check()` 复用同一个 Worker D1 binding 执行 `select 1`。这和 PostgreSQL health 使用同一语义：证明当前应用 runtime adapter 可以通过实际 SQL 查询访问数据库，而不是只做外部网络连通性检测。

## Schema 与迁移目录

PostgreSQL 和 D1 使用不同 schema 输出，但业务 repository 保持同一接口。

| Provider   | Drizzle config                     | Migration dir            | Schema package                          |
| ---------- | ---------------------------------- | ------------------------ | --------------------------------------- |
| PostgreSQL | `apps/server/drizzle.pg.config.ts` | `apps/server/drizzle.pg` | `packages/database/src/models/postgres` |
| D1         | `apps/server/drizzle.d1.config.ts` | `apps/server/drizzle.d1` | `packages/database/src/models/sqlite`   |

file metadata repository 使用：

```text
apps/server/src/app/modules/file/repositories/database/index.ts
apps/server/src/app/modules/file/repositories/database/postgres.ts
apps/server/src/app/modules/file/repositories/database/sqlite.ts
apps/server/src/app/modules/file/repositories/database/shared.ts
packages/database/src/models/postgres/files.ts
packages/database/src/models/sqlite/files.ts
```

product export repository 使用：

```text
apps/server/src/app/modules/product-export/repositories/database/index.ts
apps/server/src/app/modules/product-export/repositories/database/postgres.ts
apps/server/src/app/modules/product-export/repositories/database/sqlite.ts
apps/server/src/app/modules/product-export/repositories/database/shared.ts
packages/database/src/models/postgres/product-exports.ts
packages/database/src/models/sqlite/product-exports.ts
```

`product_exports` 记录包含 `template` 字段，默认值为 `basic`。template code 的允许值由 `@unimolecule/shopify-app-unmanual-database/constants` 暴露的 `PRODUCT_EXPORT_TEMPLATE_CODE_VALUES` 统一维护，业务层不要在 app 内另写一份枚举。

reference repository 使用：

```text
apps/server/src/app/modules/reference/repositories/database/index.ts
apps/server/src/app/modules/reference/repositories/database/postgres.ts
apps/server/src/app/modules/reference/repositories/database/sqlite.ts
apps/server/src/app/modules/reference/repositories/database/shared.ts
packages/database/src/models/postgres/references.ts
packages/database/src/models/sqlite/references.ts
```

`references` 表字段为 `id`、`shop_domain`、`namespace`、`code`、`label`、`enabled`、`system`、`sort_order`、`created_at`、`updated_at`、`deleted_at`。唯一索引 `references_shop_namespace_code_idx` 约束同一 shop 和 namespace 下的 code 唯一；`references_shop_namespace_sort_idx` 支持按 `enabled`、`sort_order`、`code` 的稳定分页排序。

模块 repository 约定：

- `index.ts` 只保留 repository 类型出口，不 import PostgreSQL 或 SQLite 实现。
- `postgres.ts` 和 `sqlite.ts` 放置 SQL dialect-specific repository builder、查询、排序、聚合和事务逻辑。
- runtime capability creator 负责在 Node 入口绑定 PostgreSQL repository，在 Cloudflare 入口绑定 SQLite/D1 repository。
- `shared.ts` 放置分页转换、cursor 解析、page offset、状态统计转换等跨 dialect 逻辑。
- Cursor 列表使用 `created_at + id` seek cursor，多取一条记录判断 `hasNext`；page 列表只允许浅页导航，并额外计算 `total`。

Shopify session storage 使用：

```text
packages/database/src/models/postgres/shopify-sessions.ts
packages/database/src/models/sqlite/shopify-sessions.ts
```

## Server package commands

数据库相关命令定义在 `apps/server/package.json`：

| Command           | 作用                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `db:push:pg`      | 使用 `.env.development` 和 `drizzle.pg.config.ts` push PostgreSQL schema |
| `db:push:d1`      | 使用 `.env.development` 和 `drizzle.d1.config.ts` push D1 schema         |
| `db:generate:pg`  | 根据 PostgreSQL schema 生成 migration 到 `drizzle.pg`                    |
| `db:generate:d1`  | 根据 SQLite/D1 schema 生成 migration 到 `drizzle.d1`                     |
| `db:migrate:pg`   | 使用 `.env.production` 执行 PostgreSQL migration                         |
| `db:migrate:d1`   | 使用 Wrangler 对远端 D1 执行 migration                                   |
| `db:seed:dev:pg`  | 使用 `.env.development` 写入 development PostgreSQL seed 数据            |
| `db:seed:prod:pg` | 使用 `.env.production` 写入 production PostgreSQL seed 数据              |
| `db:seed:dev:d1`  | 使用 `.env.development` 调用 Wrangler 写入 development 远端 D1 seed      |
| `db:seed:prod:d1` | 使用 `.env.production` 调用 Wrangler 写入 production 远端 D1 seed        |

常用命令：

```bash
pnpm --dir apps/server run db:push:pg
pnpm --dir apps/server run db:push:d1
pnpm --dir apps/server run db:generate:pg
pnpm --dir apps/server run db:generate:d1
pnpm --dir apps/server run db:migrate:pg
pnpm --dir apps/server run db:migrate:d1
pnpm --dir apps/server run db:seed:dev:pg
pnpm --dir apps/server run db:seed:dev:d1
```

## Development and deployment lifecycle

根目录的 `pnpm dev:tunnel` 和 `pnpm deploy` 不会自动执行数据库命令。它们只负责生成平台配置、启动 Shopify 开发流程或分发 runtime 部署；schema push、migration 和 seed 需要按当前 `APP_DATABASE_PROVIDER` 手动执行。

### Before `pnpm dev:tunnel`

开发环境使用 `.env.development`。首次启动、切换 provider，或 `@unimolecule/shopify-app-unmanual-database` schema 变更后，先同步对应 provider 的 schema：

| Runtime      | Provider   | 启动前推荐命令                                                               |
| ------------ | ---------- | ---------------------------------------------------------------------------- |
| `node`       | `postgres` | `pnpm --dir apps/server run db:push:pg`，需要样例数据时再跑 `db:seed:dev:pg` |
| `cloudflare` | `d1`       | development binding 使用远端 dev D1，schema 同步使用 `db:push:d1`            |

Cloudflare + D1 的默认开发路径是远端 development D1。决策背景、常规步骤和 local D1 调试方式见 [D1 开发工作流](../guides/d1-development.md)。

本地 D1 只用于临时隔离调试。需要调试本地 D1 seed 时，不新增 package script，直接临时设置 `D1_SEED_LOCAL=true`：

```bash
D1_SEED_LOCAL=true pnpm --dir apps/server run db:seed:dev:d1
```

如果 development binding 名称变更，以 `apps/server/wrangler.json` 中 `env.development.d1_databases[].binding` 或 `.env.development` 的 `APP_DATABASE_D1_BINDING` 为准。

启动开发：

```bash
pnpm dev:tunnel
```

`pnpm dev:tunnel` 会先执行 `dev:prepare`，根据 `.env.development` 生成 Shopify TOML 和 `apps/server/wrangler.json`，然后启动固定 tunnel 与 Shopify app dev。它不会创建表、更新 schema 或写 seed 数据。

### After `pnpm dev:tunnel`

开发服务启动后通常不需要再跑数据库命令。只有这些情况需要补跑：

- schema 发生变化：按 provider 跑 `db:push:pg` 或 `db:push:d1`。
- 显式使用本地 `.wrangler` D1 且缺表：跑 `wrangler d1 migrations apply <binding> --env development --local`。
- 需要补 development seed 数据：按 provider 跑 `db:seed:dev:pg` 或 `db:seed:dev:d1`。
- 需要写 development 本地 D1：临时设置 `D1_SEED_LOCAL=true` 后跑 `db:seed:dev:d1`，不要和默认远端 D1 seed 混用。

### Before `pnpm deploy`

生产环境使用 `.env.production`。部署前应先确认 migration 已生成并在目标数据库执行：

| Runtime      | Provider   | 部署前推荐命令                                                        |
| ------------ | ---------- | --------------------------------------------------------------------- |
| `node`       | `postgres` | 开发变更时生成 `db:generate:pg`；部署前执行 `db:migrate:pg`           |
| `cloudflare` | `d1`       | Cloudflare 通过远端 D1 binding 访问数据库；部署前执行 `db:migrate:d1` |

部署：

```bash
pnpm deploy
```

`pnpm deploy` 的顺序是 `deploy:prepare -> deploy:runtime -> app:deploy`。`deploy:runtime` 只按 `APP_RUNTIME` 调用 server workspace 的 `cf:deploy` 或 `node:deploy`，不会自动执行 database migration。

Production seed 不是常规部署步骤，只在初始化环境或明确需要补基础数据时执行：

```bash
pnpm --dir apps/server run db:seed:prod:pg
pnpm --dir apps/server run db:seed:prod:d1
```

### Seed 参数

Seed 脚本会复用 `apps/server/scripts/database/env.ts` 的校验逻辑：

| 参数                | 作用                                                     |
| ------------------- | -------------------------------------------------------- |
| `CONFIRM_PROD_SEED` | production seed 的显式确认开关，值必须为 `true`          |
| `D1_SEED_LOCAL`     | D1 seed 是否传 `--local` 给 Wrangler，值为 `true` 时启用 |
| `D1_WRANGLER_ENV`   | D1 seed 传给 Wrangler 的 `--env` 值，例如 `production`   |

`CONFIRM_PROD_SEED` 只保护 seed，不保护 generate/migrate。原因是 seed 会写入业务数据，而 production seed 当前会写入固定的测试/初始化记录，例如 `seed-shop.myshopify.com`。production seed 必须通过命令显式传入：

```bash
CONFIRM_PROD_SEED=true
```

如果没有这个确认，`.env.production` 下执行 `seed.pg.ts` 或 `seed.d1.ts` 会直接失败。

D1 seed 默认写远端 D1。development 使用 `.env.development` 指向的远端 dev D1：

```bash
pnpm --dir apps/server run db:seed:dev:d1
```

显式写 development 本地 Wrangler D1 时使用：

```bash
D1_SEED_LOCAL=true pnpm --dir apps/server run db:seed:dev:d1
```

这个命令会设置：

```bash
D1_SEED_LOCAL=true
```

写 production 远端 D1 时使用：

```bash
pnpm --dir apps/server run db:seed:prod:d1
```

这个命令会同时设置：

```bash
CONFIRM_PROD_SEED=true
D1_WRANGLER_ENV=production
```

## 与 Wrangler 生成器的关系

`scripts/write-wrangler-file` 只在 Cloudflare runtime 需要数据库 binding 时生成数据库配置：

| Runtime      | Provider   | Wrangler 数据库配置 |
| ------------ | ---------- | ------------------- |
| `node`       | `postgres` | 不生成              |
| `cloudflare` | `d1`       | 生成 `d1_databases` |

Cloudflare + D1 需要 `APP_DATABASE_D1_ID` 生成 `d1_databases`。非 production D1 binding 会带上 `remote: true`，让本地 Worker 开发默认连接远端 dev D1。R2 binding 也使用同样的非 production 远端开发策略，避免数据库记录指向远端 R2 URL 但对象实际写入本地 R2 模拟。

## 使用边界

- 业务模块不要直接创建 `pg.Pool` 或 D1 client。
- Shopify session storage、file store、product-export 和 health/database 都应通过 `runtimeCapabilities.database()` 获取 database。
- Cloudflare binding 字段不要写死在业务代码里，必须通过 `APP_DATABASE_D1_BINDING` 动态读取。
- 迁移目录 `drizzle.pg` / `drizzle.d1` 是生成产物目录，lint 会跳过目录内容，但仍会校验 `drizzle.*.config.ts`。
