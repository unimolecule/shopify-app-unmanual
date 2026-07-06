# Technique Notes

本文总结 `apps/server` 中值得复用的架构小技巧。它不是设计草案，而是当前代码已经落地的工程约定。

## 基础设施矩阵

当前基础设施由 runtime、database provider、bucket provider 三个维度组合。业务模块通过 runtime capability 使用它们，不直接感知平台差异。

| Runtime      | Database provider | Database 实现                  | Bucket provider | Bucket 实现                | Wrangler binding             |
| ------------ | ----------------- | ------------------------------ | --------------- | -------------------------- | ---------------------------- |
| `node`       | `postgres`        | `pg.Pool` + PostgreSQL Drizzle | `memory`        | 本地文件系统 memory bucket | 无                           |
| `node`       | `postgres`        | `pg.Pool` + PostgreSQL Drizzle | `r2`            | R2 S3-compatible API       | `r2_buckets`                 |
| `cloudflare` | `d1`              | Worker D1 binding + D1 Drizzle | `r2`            | Worker R2 binding          | `d1_databases`、`r2_buckets` |

Cloudflare + `memory` bucket 当前不支持。Node + D1、Cloudflare + PostgreSQL 当前不支持，会在 database strategy 边界失败。

queue 与 scheduler 是另外两条 runtime-aware infra 轴：

| Runtime      | Queue provider | Scheduler provider | 平台入口                            |
| ------------ | -------------- | ------------------ | ----------------------------------- |
| `node`       | `pg-boss`      | `pg-boss`          | process 启动 polling / schedule     |
| `cloudflare` | `queues`       | `cron-triggers`    | Worker `queue` / `scheduled` export |

Node + `pg-boss` queue/scheduler 要求 `APP_DATABASE_PROVIDER=postgres`。
Cloudflare 使用 `APP_QUEUE_BINDING` 指向 Queue binding，Cron Triggers 由
Wrangler 配置提供。

`scripts/write-wrangler-file` 会根据 `APP_ENV`、`APP_RUNTIME`、`APP_DATABASE_PROVIDER` 和 `APP_BUCKET_PROVIDER` 生成最小 Wrangler 配置。比如 `node + postgres + r2` 只生成 R2 binding。

相关文档：

- [database.md](./database.md)
- [bucket.md](./bucket.md)
- [wrangler.md](./wrangler.md)

## 分层 DI

项目没有引入大型 DI container，而是用显式 runtime capabilities 加几组小型 registry 完成依赖注入。

### Runtime Capability

runtime capability 负责注入平台相关能力：

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

共享业务代码只调用 capability，不静态 import Node-only 或 Cloudflare-only 实现。health/disk 与 health/memory 通过 capability 暴露运行时指标：Node 使用 `@unimolecule/utils/node` 的 disk/memory helper，Cloudflare isolate 返回 unsupported。`/healths` 聚合 endpoint 复用 disk、memory、network、database 和 reserved redis 的单项检查结果；unsupported/reserved 不会单独让整体状态失败，单项 `error` 才会让整体返回 `error`。Shopify session storage 与 health/database 通过统一的 `runtimeCapabilities.database()` 获取 database adapter；file、product-export、reference 通过 `runtimeCapabilities.database.repositories.*()` 获取 runtime 已绑定的 repository，避免公共 repository index 同时 import PostgreSQL 与 SQLite 实现。
file module 通过 `runtimeCapabilities.bucket()` 获取 object bucket，并通过 `runtimeCapabilities.file.downloadResolver()` 把下载解析为 memory stream 或 R2 signed redirect；Node 与 Cloudflare runtime 共用 R2 SigV4 signer。product-export 等异步模块通过 `runtimeCapabilities.queue.producer()` 投递小 payload，通过 queue/scheduler registry 注册 handler。

对应文件：

- `src/app/runtime/runtime-capabilities.ts`
- `src/app/runtime/process/node/runtime-capabilities.ts`
- `src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`

这个技巧的价值是把平台差异限制在 runtime entry 附近。新增 runtime 时，优先补 runtime capability creator，而不是改业务 controller。

### Provider Lifecycle

provider 缓存跨请求可复用的基础设施实例。调用方统一通过 `get*Provider()` 获取当前实例，provider 模块内部用 typed slot 保存 value、signature 和 lifecycle 状态：

- env provider
- logger provider
- HTTP client provider
- Shopify SDK config provider

对应文件：

- `src/infra/provider/env.ts`
- `src/infra/provider/logger.ts`
- `src/infra/provider/shopify.ts`
- `src/infra/provider/client.ts`
- `src/infra/provider/index.ts`

每个 provider 都有 reset/disposer 入口，`src/infra/provider/index.ts` 通过 `providersDispose()` 聚合清理 provider 状态，避免 provider cache 污染下一轮运行。

database、bucket、queue 和 scheduler 没有放入 provider API，而是作为 runtime capability + infra adapter 暴露。原因是它们的 runtime/provider 支持矩阵依赖平台能力：Node 需要进程级 pg pool、memory/r2 bucket cache 和 pg-boss worker，Cloudflare 需要 request-bound D1/R2/Queue binding。`runtimeCapabilityNodeDispose()` 会在 process runtime 释放 cached pg pool、bucket adapter、queue consumer/producer 和 scheduler；isolate runtime 不保留跨 request 的 binding 引用。

### Shopify Mode Capability

Shopify app mode 不走 runtime capability，而是单独维护 mode capability：

- `embedded`
- `standalone`

它只处理 Shopify app-flow 差异，例如 App Shell、OAuth callback redirect、Admin request session strategy。

对应文件：

- `src/app/modules/shopify/mode/capabilities.ts`
- `src/app/modules/shopify/mode/embedded.ts`
- `src/app/modules/shopify/mode/standalone.ts`

runtime、Shopify mode 和 frontend target 保持正交，具体 env 语义见 [env.md](./env.md#shopify-相关-env)。

## Runtime Env 合并

env provider 支持两个阶段：

1. bootstrap 阶段读取 `process.env` 中的字符串配置。
2. request 阶段通过 `runtimeEnvMiddleware` 合并 Hono `c.env` 中的平台 binding。

Cloudflare 下 env source 来自 `c.env`，Node 下来自 `process.env`：

```ts
const envConfig = c.env ?? getSafeProcessEnv();
const runtimeEnv = getEnvProvider(envConfig);
```

`getEnvProvider(rawEnv)` 默认会把 `process.env` 与传入 env merge：

```ts
const effectiveRawEnv = { ...getSafeProcessEnv(), ...nextRawEnv };
```

这个设计让模块 import 阶段可以读取 bootstrap env，也让请求进来后可以用平台 binding 刷新为更完整的 runtime env。

## Bootstrap 边界

`bootstrapApp()` 永远 runtime-agnostic。它只组装通用 Hono app，不接收 runtime 参数，也不注册平台实现。

runtime-specific 行为只放在两个地方：

- runtime entry，例如 `src/app/runtime/process/node/index.ts`。
- runtime capability creator，例如 `src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`。

业务模块只使用通用 `AppEnv`。平台 binding 在 schema 中可以 optional，但必须在 capability 使用点通过 `requireCloudflareBinding(...)` 之类的 helper 强校验。

## Binding Optional + 使用点强校验

Cloudflare platform binding 在 schema 中不再写死具体字段。binding name 由 env file 显式配置，例如 `APP_BUCKET_R2_BINDING=SHOPIFY_APP_R2`，资源名也由 `APP_BUCKET_R2_NAME`、`APP_DATABASE_D1_NAME` 等字段显式提供。

真正需要 binding 的地方必须通过配置里的 binding name 动态读取并强校验：

```ts
const d1 = requireCloudflareBinding(
  env[runtimeEnv.APP_DATABASE_D1_BINDING],
  runtimeEnv.APP_DATABASE_D1_BINDING,
  isCloudflareD1Database,
);
```

对应文件：

- `src/infra/env/isolate.ts`
- `src/app/runtime/isolate/cloudflare/bindings.ts`
- `src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`

这条规则可以概括为：启动阶段宽，能力使用严；binding/name 由 env file 驱动，binding 值在使用点验证。

## AppEnv 从 Schema 推导

Hono `Bindings` 不手写重复字段，而是从 `RuntimeConfig` union 推导：

```ts
type RuntimeBindings<TRuntime extends RuntimeConfig["APP_RUNTIME"]> = Partial<
  Extract<RuntimeConfig, { APP_RUNTIME: TRuntime }>
>;
```

业务模块使用通用 `AppEnv`，runtime entry 可以用 `RuntimeAppEnv<"cloudflare">` 等具体类型收窄。

对应文件：

- `src/types/hono.ts`
- `src/app/runtime/isolate/cloudflare/index.ts`

这能减少新增 env 时的重复维护面。通常只需要改 schema 和必要的 binding 类型，不需要在每个业务模块重复声明字段。

## Logger Reset

logger provider 区分 bootstrap 与 runtime 阶段：

- 没有 runtime config 时初始化 bootstrap logger。
- 有 runtime config 时按 runtime/env/log 配置签名决定是否 reset。
- provider disposer 会调用 LogTape `dispose()` 并清理 provider cache。

对应文件：

- `src/infra/provider/logger.ts`
- `src/infra/logger/index.ts`
- `src/infra/logger/shared.ts`

这个技巧避免每个请求重复配置 logger，也避免测试或 runtime 切换后继续持有旧 logger sink。

## Import Graph 隔离

Cloudflare entry 不能静态引入 Node-only 依赖。项目通过几个规则保护 import graph：

- Node-only 实现放在 process entry、process capability 或 process logger 中。
- runtime-aware infra 的 `index.ts` 只导出共享契约、类型、registry 或 runtime-neutral helper。
- process/isolate adapter 由 `src/app/runtime/process/node/runtime-capabilities.ts` 与 `src/app/runtime/isolate/cloudflare/runtime-capabilities.ts` 显式引入。
- 文件日志依赖用动态 import。
- Cloudflare 共享代码不从 process util barrel 导入 Node-only 模块。
- runtime capability 只暴露抽象函数。

典型文件：

- `src/app/runtime/process/node/runtime-capabilities.ts`
- `src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`
- `src/infra/logger/process.ts`
- `src/infra/database/index.ts`
- `src/infra/bucket/index.ts`
- `src/infra/queue/index.ts`
- `src/infra/scheduler/index.ts`
- `src/app/runtime/isolate/cloudflare/index.ts`

## Retryable Shopify Admin Client

Shopify Admin GraphQL client 被 proxy 包装。`request` 遇到 Shopify `401` 时：

1. 根据当前 Shopify mode 刷新 session。
2. 更新 Hono context 中的 session。
3. 重新创建 Admin client。
4. 使用原参数重试一次。

对应文件：

- `src/app/modules/shopify/admin/client.ts`
- `src/app/modules/shopify/admin/middleware.ts`

controller 不需要关心 token 过期，只消费 `c.var.shopifyAdminClient`。

## 统一错误出口

业务代码抛 `AppError` 或错误工厂，Hono lifecycle 统一 normalize 和响应：

- `AppError`
- `HTTPException`
- `ZodError`
- upstream request error
- unknown thrown value

对应文件：

- `src/shared/exceptions/normalize.ts`
- `src/shared/exceptions/errors.ts`
- `src/app/lifecycle/error.ts`
- `src/app/runtime/process/node/register-process-exceptions.ts`

这样 controller 不手写错误 JSON，错误暴露策略集中维护。process-level
`unhandledRejection` 和 `uncaughtException` 也会先 `normalizeError(...)` 再结构化记录日志；它们不会生成 HTTP response。

## 条件 OpenAPI

`createApp()` 不默认注册 OpenAPI。OpenAPI 由 bootstrap option 控制：

- Node non-production 注册 `/document` 与 `/reference`。
- Cloudflare isolate 默认不注册。
- production 默认不注册。

对应文件：

- `src/app/bootstrap/create-app.ts`
- `src/app/bootstrap/index.ts`
- `src/app/bootstrap/register-openapi.ts`

这个技巧能避免 Cloudflare bundle 和 production runtime 加载不必要的文档依赖。

## 测试与覆盖率

server 使用 Vitest + V8 coverage，并对 Shopify 相关逻辑设 100% 阈值：

```bash
pnpm --dir apps/server run test:coverage
pnpm --dir apps/server run test:coverage:view
```

coverage include 聚焦 Shopify app-flow、Shopify middleware、provider、resource API 等文件。这样测试目标和项目核心风险对齐，而不是追求无差别全仓覆盖。
