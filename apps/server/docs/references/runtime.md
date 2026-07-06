# Runtime Design

本文说明 `apps/server` 的运行时边界：项目同时支持 Node process 和 Cloudflare Workers isolate，但业务代码尽量不直接感知平台差异。

## 当前支持状态

| Runtime       | 执行模型 | 状态     | 说明                                          |
| ------------- | -------- | -------- | --------------------------------------------- |
| `node`        | process  | 正式支持 | 本地开发、普通 Node 服务、Node build 目标     |
| `cloudflare`  | isolate  | 正式支持 | Cloudflare Workers、D1-backed session storage |
| `vercel-edge` | isolate  | 预留     | 只有类型预留，没有完整入口和部署配置          |

项目只让用户配置事实型变量 `APP_RUNTIME`，不再额外配置 `APP_RUNTIME_MODE`。执行模型由代码根据 `APP_RUNTIME` 推导。

## 入口文件

| Runtime      | 入口                                          | 作用                                       |
| ------------ | --------------------------------------------- | ------------------------------------------ |
| Node process | `src/app/runtime/process/node/index.ts`       | 注册 Node 能力并启动 server                |
| Cloudflare   | `src/app/runtime/isolate/cloudflare/index.ts` | 注册 Cloudflare 能力并导出 `fetch` handler |

Node entry 可以使用 `@hono/node-server`、进程信号、Node 文件系统等能力。Cloudflare entry 只导出 Worker module handler，不能静态引入 Node-only 实现。

`bootstrapApp()` 永远保持 runtime-agnostic。它只创建通用 Hono app、注册 middleware、routes、lifecycle 和可选 OpenAPI，不接收 runtime 参数，也不分支处理平台能力。runtime-specific 行为只允许放在 runtime entry 或 runtime capability 中。

## Runtime Capabilities

跨 runtime 的平台能力通过显式 `RuntimeCapabilities` 对象注入。runtime entry 负责创建 scoped capabilities，middleware 把它写入 Hono context，业务模块通过 `runtimeCapabilities(c)` 读取。

核心能力包括：

- `runtimeCapabilities.database()`
- `runtimeCapabilities.database.repositories.files()`
- `runtimeCapabilities.database.repositories.productExports()`
- `runtimeCapabilities.database.repositories.references()`
- `runtimeCapabilities.bucket()`
- `runtimeCapabilities.shopifySessionStorage()`
- `runtimeCapabilities.health.disk(c)`
- `runtimeCapabilities.health.memory(c)`
- `runtimeCapabilities.file.downloadResolver()`
- `runtimeCapabilities.queue.producer()`

对应文件：

- `src/app/runtime/runtime-capabilities.ts`
- `src/app/runtime/process/node/runtime-capabilities.ts`
- `src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`
- `src/shared/middlewares/runtime-capabilities.ts`
- `src/infra/database`
- `src/infra/bucket`
- `src/infra/queue`
- `src/infra/scheduler`

共享业务代码只读取 capability，不直接 import Node-only 或 Cloudflare-only 实现。health/disk 与 health/memory 也遵循这条边界：Node process runtime 通过 `@unimolecule/utils/node` 读取进程磁盘与内存指标，Cloudflare isolate runtime 对这两项返回 `unsupported`。`/healths` 聚合 endpoint 复用 disk、memory、network、database 和 reserved redis 的单项检查结果；只有单项返回 `error` 时才把整体状态标记为 `error`。这样可以保护 Cloudflare bundle 的 import graph。

database、bucket、queue 和 scheduler 各自还保留自己的 infra index，但 index
只导出共享契约、类型、registry 或 runtime-neutral helper。process/isolate
实现由 `src/app/runtime/process/node/runtime-capabilities.ts` 与
`src/app/runtime/isolate/cloudflare/runtime-capabilities.ts` 显式引入。这样
Cloudflare entry 不会因为共享 infra barrel 间接看到 Node-only process adapter。

process 实现可以缓存长生命周期资源，例如 `pg.Pool`、bucket adapter、`pg-boss`
producer/consumer 和 schedule worker。Cloudflare isolate 实现以 request/event
binding 为边界，不保留跨 request 的 D1、R2 或 Queue binding 引用。

### Database Capability

`runtimeCapabilities.database()` 是 Shopify session storage 与 health/database 的统一数据库入口；`runtimeCapabilities.database.repositories.*()` 是同一个 database capability 下的 repository 绑定出口。Node runtime 只 import `postgres.ts` repository builder，Cloudflare runtime 只 import `sqlite.ts` repository builder；公共 `repositories/database/index.ts` 只保留类型出口，不再按 provider 动态分发。health/database 调用 database adapter 的 `check()`，由具体 runtime 通过 `select 1` 验证最小 SQL 查询链路。

当前策略：

| Runtime      | Provider   | 行为                                    |
| ------------ | ---------- | --------------------------------------- |
| `node`       | `postgres` | `pg.Pool` + `drizzle-orm/node-postgres` |
| `cloudflare` | `d1`       | Cloudflare D1 + `drizzle-orm/d1`        |

PostgreSQL 使用 `drizzle.pg.config.ts` 和 `drizzle.pg`。D1 使用 `drizzle.d1.config.ts` 和 `drizzle.d1`，Wrangler binding 的 `migrations_dir` 指向 `drizzle.d1`。
Node 只支持 PostgreSQL；Cloudflare 只支持 D1。非法组合会通过 runtime env 解析，但会在 database strategy 边界失败。

### Bucket Capability

`runtimeCapabilities.bucket()` 是 file module 与 product-export 的统一 object bucket 入口。Node 支持 `memory` 和 `r2`，Cloudflare 当前只支持 `r2`。Node + R2 使用 `@aws-sdk/client-s3` 的 S3-compatible 实现；Cloudflare + R2 使用 request-bound Worker R2 binding。

### Queue And Scheduler

queue 与 scheduler 和 bucket/database 一样走 runtime-aware infra：

| 能力           | Node process       | Cloudflare isolate             |
| -------------- | ------------------ | ------------------------------ |
| Queue producer | `pg-boss`          | Cloudflare Queue binding       |
| Queue consumer | `pg-boss` polling  | Worker `queue(batch, env)`     |
| Scheduler      | `pg-boss` schedule | Worker `scheduled(controller)` |
| dispose 行为   | 停止缓存实例       | no-op 预留口子                 |

业务模块通过 `registerQueueJob(...)` 和 `registerSchedulerTask(...)` 注册工作单元。
Node entry 在启动时创建 consumer/scheduler 并调用 `start(...)`。Cloudflare entry
在 `queue`/`scheduled` export 中为本次 event 创建 context，然后调用对应 adapter。

### Cloudflare Binding 校验

Cloudflare request-bound binding 不要求在 bootstrap 阶段存在。schema 允许这类字段 optional，runtime capability 在真正使用时负责强校验。

例如 Cloudflare D1 database capability 在 `runtimeCapabilityCloudflare(...)` 中读取 `APP_DATABASE_D1_BINDING` 指向的 `env[binding]`，并通过 `requireCloudflareBinding(...)` 校验：

```ts
const binding = runtimeEnv.APP_DATABASE_D1_BINDING;
const d1 = requireCloudflareBinding(
  env[binding],
  binding,
  isCloudflareD1Database,
);
```

这条边界保证：

- Worker 模块 import 阶段可以只依赖 `process.env` 中的字符串配置完成 app/bootstrap。
- request 进入后，`runtimeEnvMiddleware` 从 `c.env` 合并平台 binding。
- 业务代码不需要到处判断平台 binding 是否存在。

## Hono Runtime Env Types

业务模块使用通用 `AppEnv`，让 controller、middleware、provider 不感知具体 runtime。runtime 入口可以使用具体类型收窄：

```ts
RuntimeAppEnv<"node">;
RuntimeAppEnv<"cloudflare">;
RuntimeAppEnv<"vercel-edge">;
```

Cloudflare Worker 入口使用 `RuntimeAppEnv<"cloudflare">` 作为 `ExportedHandler` bindings 类型。这个类型从 `RuntimeConfig` union 推导，不手写重复 env 字段。

## Shopify Mode Capabilities

Shopify app mode 不是 runtime capability。它和 `APP_RUNTIME` 正交，具体 env 语义见 [env.md](./env.md#shopify-相关-env)。

Shopify mode capability 只负责 app-flow 差异，例如 App Shell、OAuth callback redirect、Admin request session strategy。它位于：

- `src/app/modules/shopify/mode`

runtime capability 只负责平台 port 差异，例如 database、bucket、queue、session storage、health checker 和 file resolver。env 与 logger 的权威入口仍是 provider。

## Shopify Frontend Target

Shopify frontend target 也不是 runtime capability。它和 `APP_RUNTIME`、`SHOPIFY_APP_MODE` 都正交，具体 env 语义、`shopify.web.toml` 生成规则和 app shell route 策略见 [env.md](./env.md#shopify-frontend-target)。

## 构建目标

| 目标               | 构建配置          | 输出目录                  |
| ------------------ | ----------------- | ------------------------- |
| Node process       | `build.config.ts` | `dist/process/node`       |
| Cloudflare isolate | `build.config.ts` | `dist/isolate/cloudflare` |

对应脚本：

```bash
pnpm --dir apps/server run build
```

`build` 使用 production env 运行 `bundle`。`bundle` 调用 tsdown，同一个配置同时构建 Node process 和 Cloudflare isolate 两个入口；process 目标会清理 `dist`，isolate 目标使用 `clean: false`，因此一次构建后会同时保留两套产物。Node Docker runtime 启动 `dist/process/node/index.mjs`。

## 部署入口

根目录部署入口是：

```bash
pnpm deploy
```

执行顺序固定为：

```text
deploy:prepare -> deploy:runtime -> app:deploy
```

- `deploy:prepare` 使用 `.env.production` 重新生成 `shopify.app.toml` 和
  `shopify.web.toml`。
- `deploy:runtime` 只做 runtime 分发。根脚本
  `scripts/deploy/index.ts` 校验 `APP_RUNTIME`，然后调用 server workspace 的
  `cf:deploy` 或 `node:deploy`。
- `app:deploy` 交给 Shopify CLI 同步 app 配置。

`pnpm deploy` 不会自动执行 database migration。部署前应按当前 `APP_DATABASE_PROVIDER` 执行对应迁移命令，详见 [database.md](./database.md#development-and-deployment-lifecycle)。

server workspace 拥有具体部署实现：

| Runtime      | Server script | 说明                                                                                                      |
| ------------ | ------------- | --------------------------------------------------------------------------------------------------------- |
| `cloudflare` | `cf:deploy`   | 运行 `scripts/deploy/cloudflare.ts` 构建 web 产物并写入 Wrangler assets，然后执行 Wrangler secrets/deploy |
| `node`       | `node:deploy` | 运行 `scripts/deploy/node.ts` 构建 web/server，生成 Compose/Nginx，并通过 Docker + PM2 runtime 部署       |

Cloudflare 部署脚本会把 `apps/server/wrangler.json` 的 `assets` 动态写成：

```json
{
  "directory": "../web/dist",
  "not_found_handling": "single-page-application",
  "binding": "ASSETS",
  "run_worker_first": ["/api/*", "/auth", "/auth/*", "/webhooks", "/webhooks/*"]
}
```

这样 Worker 统一托管 SPA 静态资源和 Hono 动态路由。`/api/*`、`/auth*`、
`/webhooks*` 必须先进入 Hono，其他路径才走静态资源或 SPA fallback。

Node 部署脚本会生成这两个本地文件：

```text
apps/server/docker-compose.yml
apps/server/nginx.conf
```

它们是部署产物，已在 `.gitignore` 中忽略。Compose 的 image 和
container_name 由根 `package.json` 的 `name` 派生，容器内通过
[`apps/server/Dockerfile`](../Dockerfile) 使用 PM2 runtime 启动 Node build。
Nginx 负责同域托管：`/assets/*` 直接读取 web build，`/api/*`、`/auth*`、
`/webhooks*` 代理到本机 Node 容器，其余路径回落到 `index.html`。

Node 部署默认把 web 产物同步到 `/var/www/<deployment-name>/web`，把 Nginx
配置复制到 `/etc/nginx/conf.d/<SHOPIFY_APP_URL host>.conf`。如需覆盖路径，
使用 [env.md](./env.md#部署期-env) 中的部署期 env。

## OpenAPI 注册

`createApp()` 只创建 Hono app、注册 middleware、业务路由和 lifecycle，不默认注册 OpenAPI。

OpenAPI 由 `bootstrapApp({ registerOpenApi })` 控制：

- Node process: 非 production 注册 `/document` 和 `/reference`。
- Cloudflare isolate: 默认不注册 OpenAPI。
- production: 不注册 OpenAPI 和 Scalar，Scalar 使用动态 import，避免生产环境加载不必要代码。

对应文件：

- `src/app/bootstrap/create-app.ts`
- `src/app/bootstrap/index.ts`
- `src/app/bootstrap/register-openapi.ts`

## Cloudflare 类型

Cloudflare bindings 类型由 Wrangler 生成：

```bash
pnpm --dir apps/server run cf:type
```

输出文件：

- `typings/cloudflare-worker-configuration.d.ts`

这是生成物，不手动维护。提交前的 lint-staged 已过滤该文件，避免 ESLint/Prettier 修改 Wrangler 输出。

如果需要排查 Wrangler CLI 子进程实际拿到的 env，可以临时使用
`scripts/print/wrangler-env.ts` 作为 `NODE_OPTIONS` 调试入口，例如在
`apps/server` 目录下执行 Wrangler 前临时加上
`NODE_OPTIONS="--import tsx --import ./scripts/print/wrangler-env.ts"`。它只
打印白名单 key，并会对 secret 值做长度级别的脱敏。

## 边界规则

1. `bootstrapApp()` 永远 runtime-agnostic，不接收 runtime 参数。
2. runtime-specific 行为只放在 runtime entry 或 runtime capability。
3. 业务模块只使用通用 `AppEnv`，不按 runtime 分支。
4. 平台 binding 在 schema 中可以 optional，但使用点必须通过 runtime capability 强校验。
5. 业务代码通过 provider、middleware、infra adapter 或 capability 获取 runtime 能力。
6. Node-only 依赖只出现在 process entry、process capability、process infra adapter 或 `.node.ts` 文件中。
7. Cloudflare entry 不静态导入 `node:*`、`@hono/node-server`、`@logtape/file`。
8. `APP_RUNTIME=cloudflare` 时，request-bound binding 从 `c.env` 进入。
9. `vercel-edge` 当前只作为未来扩展预留，不作为可部署目标。
10. env var 语义和组合规则集中维护在 [env.md](./env.md)。

## 相关文档

- Env 解析和 provider 缓存见 [env.md](./env.md)。
- Logger 在不同 runtime 下的 sink 策略见 [logger.md](./logger.md)。
- Bucket provider 策略见 [bucket.md](./bucket.md)。
- File module 的下载和元数据策略见 [file.md](./file.md)。
- Shopify session storage 的 runtime 差异见 [shopify.md](./shopify.md)。
