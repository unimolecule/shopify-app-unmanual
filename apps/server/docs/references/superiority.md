# Project Superiority

本文总结当前 `apps/server` 相较于许多常见 Shopify app 模板式项目的优势。这里不针对某个仓库逐一评测，而是围绕本项目已经落地的能力边界进行对比。

## 双 Runtime 支持

项目同时支持：

- Node process
- Cloudflare Workers isolate
- 预留 Vercel Edge 类型和 schema 分支

常见 Shopify app 示例往往绑定单一 runtime，例如只面向 Node server 或只面向特定平台部署。本项目把 runtime 差异放进显式 `RuntimeCapabilities`，使业务 controller、Shopify app-flow 和 resource API 可以复用。

优势：

- 本地或传统服务可以走 Node。
- 边缘部署可以走 Cloudflare Workers。
- 新 runtime 可以通过 schema、entry、capability 扩展，而不是重写业务模块。

## Embedded + Standalone 双模式

项目同时支持 Shopify app 的两种使用形态：

| Mode         | 身份来源                                    | App Shell              |
| ------------ | ------------------------------------------- | ---------------------- |
| `embedded`   | App Bridge session token + token exchange   | App Bridge + Polaris   |
| `standalone` | app account session cookie + stored session | Polaris web components |

许多示例项目只覆盖 embedded app，或者把 standalone 当成完全独立实现。本项目用 Shopify mode capability 保持两种 flow 的同一套接口。

优势：

- OAuth callback、App Shell、Admin session strategy 可以按 mode 分发。
- resource controller 不关心当前是 embedded 还是 standalone。
- 未来 standalone 接入完整账户体系时，可以扩展 mode capability，不必改 product/shop controller。

## Runtime 与 Shopify Mode 正交

runtime、Shopify mode 和 frontend target 是独立轴，具体 env 语义见 [env.md](./env.md#shopify-相关-env)。

这意味着组合空间是清晰的，例如：

- Cloudflare + embedded
- Cloudflare + standalone
- Node development + embedded
- Node development + standalone

常见项目容易把部署平台和 Shopify app flow 混在一起。本项目用 runtime capability、Shopify mode capability 和 frontend target 配置分别承载三类差异，降低组合复杂度。

## 统一 Env 模型

业务层不直接读 `process.env` 或 `c.env`，而是使用已校验的 `runtimeEnv`。

项目支持：

- bootstrap 阶段读取字符串 env。
- request 阶段合并平台 binding。
- `RuntimeConfig` union 按 `APP_RUNTIME` 分发 schema。
- Hono `Bindings` 从 runtime schema 推导。

优势：

- 新增普通 env 时不用在大量业务模块手写类型。
- Cloudflare request-bound binding 不阻塞 bootstrap。
- 真正使用平台 binding 时由 capability 做强校验。

## 小型 DI 而不是框架锁定

项目用小型 provider API 加显式 runtime capabilities 注入基础设施能力：

- provider API 管理 env/logger/client/shopify config。
- runtime entry 创建显式 `RuntimeCapabilities`，管理 database、database-backed repositories、bucket、queue、scheduler 和 file resolver。
- Shopify mode capability registry 管理 app-flow 差异。

这种方式比引入大型 IoC container 更轻，适合 Hono + edge/runtime mixed 项目。

优势：

- 依赖边界清晰。
- 测试时可以 reset/dispose。
- Cloudflare bundle 不容易被 Node-only import 污染。

## Provider Signature 统一失效

provider API 不只缓存实例，还把调用方传入的配置 DTO 归一化成 signature。`env` provider 使用 schema 字段生成 signature；`logger`、`client`、`shopifyConfig` provider 使用各自关心的配置子集生成 signature。

对应实现：

- `src/infra/provider/signature.ts`
- `src/infra/provider/env.ts`
- `src/infra/provider/logger.ts`
- `src/infra/provider/client.ts`
- `src/infra/provider/shopify.ts`

这种设计的优势是：调用方仍然可以传完整 `RuntimeConfig`，provider 自己决定哪些字段影响缓存。配置没有变化时复用实例；配置变化时自动重建并注册 disposer。相比手写一堆“如果字段 X/Y/Z 变了就重置”的逻辑，signature 方法更集中，也更容易测试。

例如 HTTP client 只关心 client env config，Shopify config 只关心 Shopify env config，logger 只关心 runtime/env/logger 字段。调用方不需要知道这些内部缓存边界。

## Bucket 与 Database 双矩阵

项目同时把 database 和 bucket 做成 runtime-aware 基础设施，而不是让业务模块分别判断 Node、Cloudflare、PostgreSQL、D1、R2。

Database 矩阵：

| Runtime      | Provider   | 实现                                    |
| ------------ | ---------- | --------------------------------------- |
| `node`       | `postgres` | `pg.Pool` + `drizzle-orm/node-postgres` |
| `cloudflare` | `d1`       | Worker D1 binding + `drizzle-orm/d1`    |

Bucket 矩阵：

| Runtime      | Provider | 实现                                   |
| ------------ | -------- | -------------------------------------- |
| `node`       | `memory` | 本地文件系统-backed memory bucket      |
| `node`       | `r2`     | R2 S3-compatible API + signed download |
| `cloudflare` | `r2`     | Worker R2 binding + stream download    |

这让 file module、Shopify session storage、product-export 和 health/database 都只消费 capability：

- `runtimeCapabilities.database()`
- `runtimeCapabilities.database.repositories.*()`
- `runtimeCapabilities.bucket()`
- `runtimeCapabilities.shopifySessionStorage()`
- `runtimeCapabilities.file.downloadResolver()`
- `runtimeCapabilities.queue.producer()`

优势：

- Node 开发、本地文件、PostgreSQL 可以组合使用。
- Cloudflare 部署可以使用 D1/R2 binding，而不改业务 controller。
- `scripts/write-wrangler-file` 能根据同一组 env 生成最小 Wrangler binding，避免每个环境手写一份资源配置。

## 更完整的 Shopify Session 策略

项目覆盖多种 session 场景：

- embedded online token exchange。
- active session reuse。
- Admin API 401 后刷新并重试一次。
- standalone account session cookie。
- Shopify session storage 抽象。
- app uninstall webhook 删除 shop sessions。

常见模板通常只覆盖 happy path OAuth 和简单 Admin API 调用。本项目把 session 续期、存储和 webhook 清理都放进明确模块。

## Retryable Admin GraphQL Client

`shopifyAdminClient()` 中间件注入 retryable Admin client。controller 只负责业务查询：

```ts
await getProducts(c.var.shopifyAdminClient);
await getShopInfo(c.var.shopifyAdminClient);
```

如果 Shopify 返回 `401`，client wrapper 会刷新 session 并重试一次。

优势：

- controller 不处理 token refresh。
- embedded/standalone session refresh 策略由 mode capability 决定。
- 后续新增 orders/customers/inventory API 可以复用同一套中间件。

## Resource API 与 Shopify App Flow 分离

项目把 Shopify app-flow 和业务资源 API 分开：

- `modules/shopify`: App Shell、OAuth、mode、session、webhook、Admin client。
- `modules/shop`: Shop resource API。
- `modules/product`: Product resource API。

这比把所有 Shopify 相关代码都塞进 `modules/shopify` 更可扩展。

优势：

- 业务模块可以按资源增长。
- Shopify app-flow 不被业务查询污染。
- OpenAPI metadata 和 controller 更清晰。

## Cloudflare 友好的 Import Graph

项目明确隔离 Node-only 依赖：

- process runtime 才 import Node disk/network utils。
- process logger 动态 import file sink。
- database/bucket/queue/scheduler 的 infra index 只导出共享契约、类型或 registry。
- process/isolate adapter 由 runtime capability 注册处显式引入，避免 Cloudflare 入口经过共享 barrel 看到 Node-only 依赖。
- Cloudflare entry 不静态 import `node:*`。
- runtime capability 暴露抽象能力。

这对 Workers 很重要，因为不干净的 import graph 很容易让 bundle 在启动阶段失败。

## 文档和测试覆盖同步

项目在 `apps/server/docs` 下维护专门文档：

- runtime
- env
- logger
- error
- Shopify
- technique
- superiority

测试方面，Shopify 相关核心逻辑配置了 V8 coverage，并保持 100% 阈值。相比只依赖手动验证的示例项目，这能更早发现 OAuth/session/mode/provider 回归。

## 可迁移的工程结构

这个项目的结构不是只服务当前 shop/product demo。它已经为后续扩展预留了清晰路径：

- 新增 resource API: 新建业务模块，复用 Admin middleware。
- 新增 Shopify app mode: 注册新的 mode capability。
- 新增 runtime: 补 schema、entry、runtime capability。
- 新增 platform binding: schema optional，capability 使用点强校验。
- 新增 async job: 注册 queue job，保持 payload 小而幂等。
- 新增 scheduled task: 注册 scheduler task，并在 Wrangler 中配置 cron。
- 新增 logger sink: 扩展 runtime logger setup。

这让项目更像一个可演进的 Shopify app server 基座，而不是一次性的 demo app。
