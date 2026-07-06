# Server Docs

这里是 `apps/server` 的文档入口。`apps/server` 是一个基于 Hono 的 Shopify app 服务端，支持 `embedded` 与 `standalone` 两种 Shopify app mode，并同时支持 Node process 和 Cloudflare Workers isolate。

## 当前项目状态

- Runtime: Node process 和 Cloudflare Workers，通过 `APP_RUNTIME` 选择。
- Framework: Hono + TypeScript。
- Shopify: 使用 `@shopify/shopify-api` 官方包处理 OAuth、session token、token exchange、webhook 校验和 Admin GraphQL client。
- Shopify app mode: `SHOPIFY_APP_MODE=embedded|standalone` 必须显式配置；embedded 使用 App Bridge session token，standalone 使用 app account session cookie。
- Shopify frontend target: `SHOPIFY_APP_FRONTEND_TARGET=backend|frontend` 决定 app shell 由 server 还是 web 承载。
- Session storage: Node 通过 `runtimeCapabilities.shopifySessionStorage()` 使用 PostgreSQL，Cloudflare 通过同一 capability 使用 D1 Worker binding；二者都复用统一的 `runtimeCapabilities.database()` 边界。
- Resource APIs: `shop`、`product`、`file`、`product-export`、`reference` 已作为独立业务模块注册，复用 Shopify Admin middleware，不再放在 Shopify app-flow 模块下。
- OpenAPI: 非 production Node 可注册 `/document` 和 `/reference`；生产和 Cloudflare isolate 默认不注册。
- Env typing: Hono `AppEnv` 从 runtime schema 推导 bindings；runtime 入口可用 `RuntimeAppEnv<"cloudflare">` 等具体类型收窄。
- Cloudflare bindings: 平台 binding 在 schema 中允许 bootstrap 阶段缺失，并在 runtime capability 使用点强校验；Wrangler 生成类型到 `typings/cloudflare-worker-configuration.d.ts`。
- Queue/Scheduler: `infra/queue` 与 `infra/scheduler` 像 runtime capabilities 一样支持注册和调用；Node 使用 `pg-boss` 并在 shutdown 释放，Cloudflare 使用 Queues/Cron Triggers 并按 event scope 创建。
- Bucket/Database: `infra/bucket` 与 `infra/database` 的 index 只保留共享契约和 runtime-neutral helper；process/isolate 实现由 runtime capability creator 显式创建，process 侧缓存资源，isolate 侧按 request/event binding lazy 创建。
- Error: Hono `app.onError` 和 process-level exception handlers 都会先 normalize 到项目统一 `AppError` 结构；registry 重复注册错误仍保留为启动期 fail-fast 错误。

## 文档导航

| 文档                                                     | 内容边界                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [runtime.md](./docs/references/runtime.md)               | Runtime 支持状态、入口、capability、构建产物、OpenAPI 注册策略                               |
| [env.md](./docs/references/env.md)                       | Env 来源、request binding 合并、schema 分发、provider 缓存                                   |
| [logger.md](./docs/references/logger.md)                 | Bootstrap/runtime logger、process/isolate sink、错误日志入口                                 |
| [error.md](./docs/references/error.md)                   | `AppError`、错误工厂、响应格式、生产环境暴露策略                                             |
| [shopify.md](./docs/references/shopify.md)               | Shopify app mode、App Shell、OAuth、account/session、Admin middleware、webhook、resource API |
| [queue.md](./docs/references/queue.md)                   | Queue provider 矩阵、job registry、producer/consumer 生命周期、Cloudflare Queues 行为        |
| [scheduler.md](./docs/references/scheduler.md)           | Scheduler provider 矩阵、task registry、Node pg-boss schedule、Cloudflare Cron Triggers      |
| [database.md](./docs/references/database.md)             | Node PostgreSQL、Cloudflare D1 binding 的 runtime-aware database 实现                        |
| [d1-development.md](./docs/guides/d1-development.md)     | Development 直连远端 D1、local D1 调试与 seed 使用决策                                       |
| [reference-data.md](./docs/guides/reference-data.md)     | Product export templates 与通用 reference module 的边界决策                                  |
| [bucket.md](./docs/references/bucket.md)                 | Memory/R2 bucket、Node S3-compatible、Cloudflare R2 binding、下载策略                        |
| [file.md](./docs/references/file.md)                     | 文件上传、元数据、bucket key、下载/删除、runtime capability 使用                             |
| [product-export.md](./docs/references/product-export.md) | 产品 CSV 导出 job、模板查询、分页列表、下载、part 聚合与数据库 store 边界                    |
| [technique.md](./docs/references/technique.md)           | DI、env 合并、binding 强校验、logger reset、import graph 隔离等架构技巧                      |
| [superiority.md](./docs/references/superiority.md)       | Runtime 切换、embedded/standalone 双模式、session 策略等项目优势                             |

## 常用命令

`apps/server` 的脚本按 runtime 分为 Node process 与 Cloudflare Workers 两组。
本地 Shopify 联调通常由根目录 `pnpm dev` 或 `pnpm dev:tunnel` 间接启动。

| Script               | Purpose                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `cf:type`            | 生成 Cloudflare Worker binding 类型到 `typings/cloudflare-worker-configuration.d.ts`。         |
| `cf:dev`             | 读取 development env，用 Wrangler dev 启动 Cloudflare Worker runtime。                         |
| `cf:deploy`          | 准备 Cloudflare 静态资源配置，批量写入 Wrangler secrets，然后执行 `wrangler deploy`。          |
| `node:dev`           | 读取 development env，用 `tsx watch` 启动 Node process runtime。                               |
| `node:deploy`        | 运行 Node 部署脚本，生成 Compose/Nginx 并部署 Docker + PM2 runtime。                           |
| `bundle`             | 使用 `tsdown --config ./build.config.ts` 构建两套 runtime 产物。                               |
| `build`              | 读取 production env 后运行 `bundle`，输出到 `dist/process/node` 与 `dist/isolate/cloudflare`。 |
| `db:push:pg`         | 使用 development env push PostgreSQL schema。                                                  |
| `db:push:d1`         | 使用 development env push D1 schema。                                                          |
| `db:generate:pg`     | 生成 PostgreSQL migration。                                                                    |
| `db:generate:d1`     | 生成 D1 migration。                                                                            |
| `db:migrate:pg`      | 使用 production env 执行 PostgreSQL migration。                                                |
| `db:migrate:d1`      | 使用 Wrangler 对远端 D1 执行 migration。                                                       |
| `db:seed:dev:pg`     | 写入 development PostgreSQL seed 数据。                                                        |
| `db:seed:prod:pg`    | 显式确认后写入 production PostgreSQL seed 数据。                                               |
| `db:seed:dev:d1`     | 写入 development 远端 D1 seed 数据。                                                           |
| `db:seed:prod:d1`    | 显式确认后写入 production 远端 D1 seed 数据。                                                  |
| `test`               | 运行 Vitest。                                                                                  |
| `test:coverage`      | 运行 Vitest coverage。                                                                         |
| `test:coverage:view` | 打开 coverage HTML 报告。                                                                      |
| `format`             | 格式化 server workspace 内的 JS/TS/Markdown/JSON 文件。                                        |
| `lint`               | 修复 server workspace 内的 ESLint 问题。                                                       |
| `clean`              | 并行运行 server workspace 清理任务。                                                           |
| `clean:cache`        | 删除 `dist`。                                                                                  |
| `clean:deps`         | 删除 `node_modules`。                                                                          |

数据库命令不会由根目录 `pnpm dev:tunnel` 或 `pnpm deploy` 自动执行。启动、部署前的 schema 同步、migration 和 seed 时机见 [database.md](./docs/references/database.md#development-and-deployment-lifecycle)。

## 基础设施生命周期

`apps/server` 的基础设施分成三层：

| 层级               | 典型能力                                      | 生命周期                                                                              |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Provider API       | env、logger、HTTP client、Shopify SDK config  | 各 provider 模块按配置签名缓存，`providersDispose()` 在 shutdown/test teardown 中清理 |
| Runtime capability | database、bucket、queue、scheduler、file 能力 | runtime entry 显式创建具体 adapter；Node shutdown 释放 process-scoped 资源            |
| Module registry    | queue jobs、scheduler tasks、Shopify mode     | 模块 bootstrap 注册；重复注册是启动期不变量错误，测试可 reset/dispose 对应 registry   |

Node process 启动时会注册 jobs、创建 `runtimeCapabilityNode(...)`、启动 Hono
server，再启动 queue consumer 和 scheduler。Cloudflare Worker 在 module 初始化时
只注册 jobs，`fetch`、`queue`、`scheduled` 三个 export 分别为本次 HTTP、Queue
batch 和 Cron Trigger event 创建对应的 Cloudflare capabilities。

process 侧 database/bucket/queue/scheduler 可以持有缓存连接或 worker；shutdown 时
通过 `runtimeCapabilityNodeDispose()` 释放。Cloudflare isolate 侧实现以
request/event binding 为边界，不保留跨 request 的 binding 引用。

`shopify app dev` 会为 server web target 注入 `BACKEND_PORT`、`APP_URL`、`HOST`
等运行期值。`cf:dev` 把 `BACKEND_PORT` 传给 Wrangler 的 `--port`，并通过
`--var "SHOPIFY_APP_URL:${APP_URL:-$HOST}"` 把本次 dev tunnel URL 传入
Worker。`node:dev` 通过前置 env 赋值把 `BACKEND_PORT` 映射为
`APP__SERVER_PORT`，并把 `APP_URL`/`HOST` 映射为 `SHOPIFY_APP_URL`，保证 Node
runtime 和 Cloudflare runtime 使用同一套 Shopify CLI 注入语义。

本地 Shopify 开发入口仍以根目录脚本为准：

```bash
pnpm dev
```

该命令会先生成 Shopify 配置文件，再由 Shopify CLI 启动开发流程。根目录的
`pnpm app:dev` 只是原始 Shopify CLI 启动命令，通常不要绕过 `pnpm dev`
直接执行。

生产部署也以根目录脚本为准：

```bash
pnpm deploy
```

`pnpm deploy` 会先写入 Shopify TOML，再按 `.env.production` 中的
`APP_RUNTIME` 分发到 server workspace：

```bash
pnpm --dir apps/server run cf:deploy
pnpm --dir apps/server run node:deploy
```

`cf:deploy` 先运行 `scripts/deploy/cloudflare.ts` 写入 Worker assets 配置，
再执行 `wrangler secret bulk ../../.env.production && wrangler deploy`。
`node:deploy` 运行 `scripts/deploy/node.ts`，构建 web/server 产物，生成
`docker-compose.yml` 与 `nginx.conf`，Docker 内的 PM2 runtime 启动
`dist/process/node/index.mjs`，然后通过同机 Nginx 完成部署。

## 维护原则

1. 文档只记录当前代码事实，不保留过期设计草案。
2. Shopify app-flow 和 Admin API 访问能力写在 [shopify.md](./docs/references/shopify.md)，runtime/build 细节写在 [runtime.md](./docs/references/runtime.md)。
3. Env、Logger、Error 各自只说明自己的基础设施边界。
4. 如果某个说明已经有专门文档，其他文档只简要介绍并链接过去。
