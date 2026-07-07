# Wrangler 配置生成

`apps/server/wrangler.json` 是生成文件。根目录的 prepare 脚本会根据当前 env file 重新生成它：

```bash
pnpm dev:prepare:wrangler
pnpm deploy:prepare:wrangler
```

对应命令：

```json
{
  "dev:prepare:wrangler": "node --env-file=./.env.development --import tsx ./scripts/write-wrangler-file/index.ts",
  "deploy:prepare:wrangler": "node --env-file=./.env.production --import tsx ./scripts/write-wrangler-file/index.ts"
}
```

生成器只负责写 `wrangler.json`，不会自动执行 `pnpm cf:type`。

生成器也不会写 `vars`。Cloudflare runtime 需要的 `APP_*` 值由命令注入：

| 场景       | 注入方式                                                      |
| ---------- | ------------------------------------------------------------- |
| 本地开发   | `wrangler dev --env-file ../../.env.development`              |
| 生产部署   | `wrangler secret bulk ../../.env.production --env production` |
| Worker env | `wrangler dev/deploy --env <APP_ENV>` 选择对应环境            |

## 输入

生成逻辑读取 `@unimolecule/shopify-app-unmanual-app-env` 的 `configSchema`，核心输入是：

| Env                        | 作用                                    |
| -------------------------- | --------------------------------------- |
| `APP_ENV`                  | 决定 Wrangler env key 和 Worker name    |
| `APP_RUNTIME`              | 决定是否需要 Cloudflare runtime binding |
| `APP_DATABASE_PROVIDER`    | 决定是否生成 D1 binding                 |
| `APP_BUCKET_PROVIDER`      | 决定 R2 binding                         |
| `APP_BUCKET_R2_BINDING`    | 生成 R2 binding 时必需                  |
| `APP_BUCKET_R2_NAME`       | 生成 R2 bucket name 时必需              |
| `APP_DATABASE_D1_BINDING`  | 生成 D1 binding 时必需                  |
| `APP_DATABASE_D1_NAME`     | 生成 D1 database name 时必需            |
| `APP_DATABASE_D1_ID`       | 生成 D1 binding 时必需                  |
| `APP_QUEUE_BINDING`        | 生成 Queue producer/consumer 时必需     |
| `APP_QUEUE_NAME`           | 生成 Queue 名称时必需                   |
| `APP_SCHEDULER_CRON_VALUE` | 生成 Cron Trigger 时使用                |

如果 `.env.*` 中某行被 `#` 注释，`node --env-file` 不会把它放进 `process.env`。生成器会按 runtime 默认值补 provider：

| 字段                     | 缺省行为                                             |
| ------------------------ | ---------------------------------------------------- |
| `APP_DATABASE_PROVIDER`  | Node 默认 `postgres`，Cloudflare 默认 `d1`           |
| `APP_BUCKET_PROVIDER`    | Node 默认 `memory`，Cloudflare 默认 `r2`             |
| `APP_QUEUE_PROVIDER`     | Node 默认 `pg-boss`，Cloudflare 默认 `queues`        |
| `APP_SCHEDULER_PROVIDER` | Node 默认 `pg-boss`，Cloudflare 默认 `cron-triggers` |

## 命名规则

Cloudflare app base name 固定为：

```text
i7eo-shopify-app
```

`APP_ENV=production` 不加后缀；其他环境加后缀：

| APP_ENV       | Worker name             |
| ------------- | ----------------------- |
| `development` | `i7eo-shopify-app-dev`  |
| `production`  | `i7eo-shopify-app`      |
| `test`        | `i7eo-shopify-app-test` |

`env.<APP_ENV>.name` 是 Worker 服务名，也就是 `wrangler deploy --env <APP_ENV>` 的部署目标。它只描述 Worker 本身，不描述 R2 或 D1 资源。

| Wrangler 字段                  | 作用                                      |
| ------------------------------ | ----------------------------------------- |
| `env.<APP_ENV>.name`           | Worker 服务名                             |
| `r2_buckets[].binding`         | Worker 代码中访问 R2 的 `env` 变量名      |
| `r2_buckets[].bucket_name`     | Cloudflare R2 bucket 的真实资源名         |
| `r2_buckets[].remote`          | 本地 `wrangler dev` 是否访问远端 R2       |
| `d1_databases[].binding`       | Worker 代码中访问 D1 的 `env` 变量名      |
| `d1_databases[].database_name` | Cloudflare D1 database 的真实资源名       |
| `d1_databases[].remote`        | 本地 `wrangler dev` 是否访问远端 D1       |
| `queues.producers[].binding`   | Worker 代码中访问 Queue producer 的变量名 |
| `queues.producers[].queue`     | Cloudflare Queue 的真实资源名             |
| `queues.consumers[].queue`     | 当前 Worker 消费的 Cloudflare Queue 名    |
| `triggers.crons[]`             | Cloudflare Cron Triggers 表达式           |

R2 和 D1 的 binding/resource name 不再由生成器推导，必须在 env file 中显式声明。建议 binding 名保持稳定，资源名按环境变化：

```env
APP_BUCKET_R2_BINDING=i7eo_shopify_app_dev_r2
APP_BUCKET_R2_NAME=i7eo-shopify-app-dev-r2

APP_DATABASE_D1_BINDING=i7eo_shopify_app_dev_d1
APP_DATABASE_D1_NAME=i7eo-shopify-app-dev-d1

APP_QUEUE_BINDING=i7eo_shopify_app_dev_queue
APP_QUEUE_NAME=i7eo-shopify-app-dev-queue
```

## 生成矩阵

| APP_RUNTIME  | APP_DATABASE_PROVIDER | APP_BUCKET_PROVIDER | 生成 binding                             |
| ------------ | --------------------- | ------------------- | ---------------------------------------- |
| `node`       | `postgres`            | `memory`            | 无                                       |
| `node`       | `postgres`            | `r2`                | `r2_buckets`                             |
| `cloudflare` | `d1`                  | `r2`                | `r2_buckets`、`d1_databases`、Queue/Cron |

Node + PostgreSQL 走 `pg`，不生成 database binding。Node + D1、Cloudflare + PostgreSQL 当前不支持，会由 database strategy 边界拒绝。

非 production 的 Cloudflare + D1/R2 会生成 `remote: true`，让 `wrangler dev` 默认访问远端 development D1/R2。production 部署本来就在 Cloudflare 上访问远端资源，因此不需要写这个本地开发开关。

Cloudflare + memory bucket 当前不支持。`APP_BUCKET_PROVIDER=memory` 与 `APP_RUNTIME=cloudflare` 会在 runtime bucket strategy 中失败。

## 输出

生成器只写当前 `APP_ENV` 对应的一个 Wrangler env。比如：

```json
{
  "main": "src/app/runtime/isolate/cloudflare/index.ts",
  "compatibility_date": "2026-06-05",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true
  },
  "env": {
    "development": {
      "name": "i7eo-shopify-app-dev",
      "r2_buckets": [
        {
          "binding": "i7eo_shopify_app_dev_r2",
          "bucket_name": "i7eo-shopify-app-dev-r2"
        }
      ]
    }
  }
}
```

`node + postgres + r2` 只生成 R2 binding，不生成 D1 binding。

## Runtime vars 注入

`wrangler.json` 不生成 `vars` 后，runtime 变量统一来自 env file：

- 本地开发用 `cf:dev`，Wrangler 通过 `--env-file ../../.env.development` 读取。
- 生产部署用 `cf:deploy`，先执行 `wrangler secret bulk ../../.env.production --env production`，再执行 `wrangler deploy --env production`。
- `--env` 仍然需要保留，因为它选择的是 `wrangler.json` 中的 Worker environment；`secret bulk` 只负责把键值写入对应 Worker environment 的 secrets。

## Runtime binding 读取

Cloudflare runtime capability 不写死 binding 字段。它读取 runtime env 中的 binding name，再从 `c.env` 动态取值：

```ts
context.env[config.APP_BUCKET_R2_BINDING];
context.env[config.APP_DATABASE_D1_BINDING];
context.env[config.APP_QUEUE_BINDING];
```

真正使用 binding 时才调用 `requireCloudflareBinding(...)` 强校验。binding name 由 env file 显式配置，业务代码不需要知道环境名或资源名。

## 类型生成

生成 `wrangler.json` 后，如需同步 Cloudflare binding 类型，手动执行：

```bash
pnpm --dir apps/server run cf:type
```

当前生成器不会自动执行这个命令，避免 prepare 阶段做额外副作用。
