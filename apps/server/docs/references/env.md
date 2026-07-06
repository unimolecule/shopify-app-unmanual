# Env Design

本文说明服务端 env 的解析、合并和缓存方式。业务代码不直接解析 `process.env` 或 `c.env`，只使用已校验的 `runtimeEnv`。

## 目标

env 层只负责：

1. 在 bootstrap 阶段读取字符串 env。
2. 在 request 阶段合并平台 binding。
3. 根据 `APP_RUNTIME` 选择 process 或 isolate schema。
4. 通过 provider 返回已校验的 `RuntimeConfig`。

平台 binding 不在 bootstrap 阶段强制存在。它们可以随 `c.env` 在 request 阶段进入 provider，并由实际使用该 binding 的 runtime capability 做强校验。

## 两个调用点

### Module Constants

部分 route constants 会在模块 import 阶段读取 env provider：

```ts
const env = getEnvProvider();
```

这是项目刻意保持的全局 env 读取方式。它让 `APP_API_PREFIX` 等全局配置在 route metadata 创建时就固定下来，也避免同一类配置在不同模块里用不同读取方式。测试和启动环境必须提供完整基础 env，包括必填的 `SHOPIFY_APP_MODE`。

### Bootstrap

启动阶段还没有 Hono context，因此只能读取进程已注入的字符串 env：

```ts
getEnvProvider(process.env);
```

Node process 会在启动时调用它。Cloudflare isolate 也可能在模块 import 阶段读取 `process.env` 中的字符串配置，例如 route metadata 需要的 `APP_API_PREFIX`。请求级平台 binding 不要求在 bootstrap 阶段存在。

### Request

进入请求后，`runtimeEnvMiddleware` 会通过 runtime capability 获取最新 env source：

```ts
const runtimeEnv = getEnvProvider(envConfig);
c.set("runtimeEnv", runtimeEnv);
```

Cloudflare 下 `envConfig` 来自 `c.env`，其中包含 request-bound 平台 binding。Node 下来自 `process.env`。

对应文件：

- `src/shared/middlewares/runtime-env.ts`
- `src/infra/provider/env.ts`
- `src/app/runtime/process/node/index.ts`
- `src/app/runtime/isolate/cloudflare/index.ts`

## Provider 缓存

`getEnvProvider()` 内部保存两份状态：

- 已校验的 `RuntimeConfig`：用于复用同一份基础配置。
- env signature：用于判断有效配置是否变化。

如果签名没有变化，provider 会直接返回上一次解析好的 `RuntimeConfig`，不会每个请求都重新跑 schema parse。

env provider 的签名由 `@shamt/app-env` 的 `configSchema.shape` 自动生成，不再手写字段清单。新增 env schema 文件时，只要字段被合入 `configSchema`，`getEnvProvider()` 的缓存签名就会自动包含这些字段。

签名不会把平台 binding 对象整体 stringify。Cloudflare D1 这类 binding 只记录是否存在，避免把 request-bound 对象细节写入缓存 key。

其他 provider 不直接复用全量 env 签名，而是先把 `RuntimeConfig` 投影成自己实际消费的配置 DTO，再用这个 DTO 生成签名。例如 HTTP client 只关心 `APP_REQUEST_TIMEOUT`，不会因为 `APP_FILE_UPLOAD_TIMEOUT` 变化而重建。

相关文件：

- `src/infra/provider/signature.ts`
- `src/infra/provider/env.ts`
- `src/infra/provider/client.ts`
- `src/infra/provider/logger.ts`
- `src/infra/provider/shopify.ts`

`SHOPIFY_APP_FRONTEND_TARGET` 属于签名字段，因为它会改变 server app shell route 和 OAuth callback fallback URL。切换 frontend target 后，provider 必须重新解析配置，不能复用旧的 `runtimeEnv`。

## Runtime Schema

统一入口：

```ts
getRuntimeConfig(rawEnv);
```

内部流程：

```txt
normalizeEnv(rawEnv)
  -> 读取 APP_RUNTIME
  -> APP_RUNTIME=cloudflare/vercel-edge ? parseIsolateConfig
  -> APP_RUNTIME=node ? parseProcessConfig
```

当前 Cloudflare isolate schema 允许 request-bound binding 在 bootstrap 阶段缺失：

```ts
type CloudflareBindings = {
  [bindingFromAPP_DATABASE_D1_BINDING]?: D1Database;
  [bindingFromAPP_BUCKET_R2_BINDING]?: R2Bucket;
};
```

这不是静默放宽使用要求。真正消费 binding 的 runtime capability 必须在使用点强校验。Cloudflare D1 和 R2 都通过对应的 `APP_*_BINDING` 读取 `c.env[binding]`，业务代码不写死环境名或资源名。

## Env File 字段

当前项目通过根目录 env file 注入部署期配置：

- `.env.development`
- `.env.production`

两份文件当前维护这些字段：

| 字段                          | 示例/取值                           | 说明                                                                      |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| `APP_ENV`                     | `development`、`test`、`production` | 当前配置环境                                                              |
| `APP_RUNTIME`                 | `node`、`cloudflare`、`vercel-edge` | server 执行环境，`vercel-edge` 当前预留                                   |
| `APP_DATABASE_PROVIDER`       | `postgres`、`d1`                    | 数据库 provider；`d1` 当前用于 Cloudflare file 与 Shopify session storage |
| `APP_BUCKET_PROVIDER`         | `memory`、`r2`                      | bucket provider；Cloudflare runtime 当前应使用 `r2`                       |
| `APP_LOGGER_EXPIRE`           | `604800000`                         | 日志过期时间                                                              |
| `APP__SERVER_PORT`            | `10001`                             | `apps/server` dev 端口                                                    |
| `APP__WEB_PORT`               | `10002`                             | `apps/web` dev 端口                                                       |
| `SHOPIFY_APP_MODE`            | `embedded`、`standalone`            | Shopify app-flow                                                          |
| `SHOPIFY_APP_FRONTEND_TARGET` | `backend`、`frontend`               | Shopify frontend role 承载位置                                            |
| `SHOPIFY_APP_KEY`             | Shopify app client ID               | Shopify app key                                                           |
| `SHOPIFY_APP_SECRET`          | Shopify app secret                  | Shopify app secret                                                        |
| `SHOPIFY_APP_URL`             | `https://example.com`               | Shopify app 对外 URL                                                      |
| `SHOPIFY_API_VERSION`         | `2026-07`                           | Shopify Admin API version                                                 |
| `SCOPES`                      | `read_products,write_products`      | Shopify access scopes                                                     |

其他字段来自 schema 默认值，只有需要覆盖默认行为或启用对应 provider 时才写入 env file，例如 `APP_NAME`、`APP_API_PREFIX`、`APP_REQUEST_TIMEOUT`、`APP_LOCALE`、`APP_USE_CLUSTER`、`APP_LOGGER_DIR`、`APP_LOGGER_LEVEL`、`APP_LOGGER_MAX_SIZE`、`APP_FILE_UPLOAD_TIMEOUT`、`APP_FILE_UPLOAD_MULTIPLE_SIZE`、`APP_FILE_DIR`、`APP_FILE_EXPIRE`、`APP_FILE_MAX_SIZE`、`APP_BUCKET_R2_URL`、`APP_BUCKET_R2_BINDING`、`APP_BUCKET_R2_NAME`、`APP_DATABASE_URL`、`APP_DATABASE_D1_BINDING`、`APP_DATABASE_D1_NAME`、`APP_DATABASE_D1_ID`、`APP_QUEUE_PROVIDER`、`APP_QUEUE_NAME`、`APP_QUEUE_BINDING`、`APP_QUEUE_CONSUMER_MAX_BATCH_SIZE`、`APP_QUEUE_CONSUMER_MAX_RETRIES`、`APP_SCHEDULER_PROVIDER`、`APP_SCHEDULER_CRON_VALUE`、`APP_CLOUDFLARE_WORKER_NAME`、`APP_CLOUDFLARE_WORKER_ACCOUNT_ID`、`APP_CLOUDFLARE_USER_TOKEN`、`APP_CACHE_EXPIRE`、`APP_CACHE_MAX_SIZE`、`APP_CACHE_REDIS_URL`。

这些字段在 `@shamt/app-env` schema 中多为 optional，是为了允许同一份 schema 覆盖 Node、Cloudflare、PostgreSQL、D1、R2 和 memory 多种组合。真正是否必填由 runtime/provider 矩阵决定。

## Cloudflare 资源 Env

`scripts/write-wrangler-file` 不从 `APP_ENV` 推导 R2 或 D1 的 binding/name。它只把 env file 中显式声明的字段写入 `wrangler.json`，当前 runtime/provider 组合需要哪个字段，缺失就报错。

| 资源  | Env 字段                                                                | 写入 Wrangler 字段                                             |
| ----- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| R2    | `APP_BUCKET_R2_BINDING`、`APP_BUCKET_R2_NAME`                           | `r2_buckets[].binding/bucket_name`                             |
| D1    | `APP_DATABASE_D1_BINDING`、`APP_DATABASE_D1_NAME`、`APP_DATABASE_D1_ID` | `d1_databases[].binding/database_name/database_id`             |
| Queue | `APP_QUEUE_BINDING`、`APP_QUEUE_NAME`                                   | `queues.producers[].binding/queue`、`queues.consumers[].queue` |

建议让 binding 名保持稳定、让资源名按环境变化：

```env
APP_BUCKET_R2_BINDING=SHOPIFY_APP_R2
APP_BUCKET_R2_NAME=i7eo-shopify-app-dev-r2

APP_DATABASE_D1_BINDING=SHOPIFY_APP_D1
APP_DATABASE_D1_NAME=i7eo-shopify-app-dev-d1
APP_DATABASE_D1_ID=<dev-d1-id>

APP_QUEUE_BINDING=SHOPIFY_APP_QUEUE
APP_QUEUE_NAME=i7eo-shopify-app-dev-queue
```

`APP_BUCKET_R2_NAME` 是 R2 bucket 名，不是 Worker binding 名；`APP_DATABASE_D1_NAME` 是 D1 database 名，不是 Worker binding 名；`APP_QUEUE_NAME` 是 Cloudflare Queue 名或 Node 队列命名空间，不是 Worker binding 名。Cloudflare runtime capability 会通过 `APP_*_BINDING` 动态读取 `c.env[binding]`。

Node + R2 走 S3-compatible API，仍需要 `APP_BUCKET_R2_URL` 以及对应 S3 credential。Cloudflare + R2 不读取 S3 credential，而使用 `APP_BUCKET_R2_BINDING` 指向的 Worker binding。因为 `write-wrangler-file` 只关心 Wrangler binding，即使当前是 `APP_RUNTIME=node + APP_BUCKET_PROVIDER=r2`，只要要生成 R2 binding，就仍会要求 `APP_BUCKET_R2_BINDING` 和 `APP_BUCKET_R2_NAME`。

Node runtime 只支持 PostgreSQL。Cloudflare + D1 需要 `APP_DATABASE_D1_BINDING` 生成 Worker binding。

## Wrangler 生成校验规则

`write-wrangler-file` 会根据 `APP_RUNTIME`、`APP_DATABASE_PROVIDER` 和 `APP_BUCKET_PROVIDER` 生成最小 Wrangler binding。下表中的字段是生成阶段强校验字段：

| 当前组合                                               | 必填字段                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `APP_BUCKET_PROVIDER=r2`                               | `APP_BUCKET_R2_BINDING`、`APP_BUCKET_R2_NAME`                           |
| `APP_RUNTIME=cloudflare` + `APP_DATABASE_PROVIDER=d1`  | `APP_DATABASE_D1_BINDING`、`APP_DATABASE_D1_NAME`、`APP_DATABASE_D1_ID` |
| `APP_RUNTIME=cloudflare` + `APP_QUEUE_PROVIDER=queues` | `APP_QUEUE_BINDING`、`APP_QUEUE_NAME`                                   |
| `APP_RUNTIME=node` + `APP_DATABASE_PROVIDER=postgres`  | 不生成 database binding；Node 直接通过 `APP_DATABASE_URL` 使用 `pg`     |

因此，如果 `.env.*` 中注释掉某个当前矩阵需要的字段，prepare wrangler 会直接失败；如果字段属于未启用的 runtime/provider 路线，则不会被要求。

## 部署期 Env

下面两个字段不属于运行时 config schema，只由
`apps/server/scripts/deploy/node.ts` 在 Node 部署阶段读取：

| 字段                       | 默认值                                          | 说明                              |
| -------------------------- | ----------------------------------------------- | --------------------------------- |
| `DEPLOY_WEB_ROOT`          | `/var/www/<deployment-name>/web`                | Nginx 读取 `apps/web/dist` 的目录 |
| `DEPLOY_NGINX_CONF_TARGET` | `/etc/nginx/conf.d/<SHOPIFY_APP_URL host>.conf` | 生成的 Nginx 配置复制到的目标路径 |

`deployment-name` 由根 `package.json` 的 `name` 派生，例如
`@shamt/repository` 会生成 `shamt-repository-server`。这些字段适合放在
`.env.production` 中覆盖机器路径，但不会被浏览器 public env 注入。

## Hono AppEnv 类型

Hono env 类型从 `RuntimeConfig` union 推导 bindings，避免新增普通 env 时重复维护手写 `Bindings`：

```ts
type RuntimeBindings<TRuntime extends RuntimeConfig["APP_RUNTIME"]> = Partial<
  Extract<RuntimeConfig, { APP_RUNTIME: TRuntime }>
>;

type RuntimeAppEnv<
  TRuntime extends RuntimeConfig["APP_RUNTIME"] = RuntimeConfig["APP_RUNTIME"],
> = {
  Bindings: RuntimeBindings<TRuntime>;
  Variables: Variables;
};
```

业务模块使用通用 `AppEnv`，不直接关心当前 runtime。runtime entry 或 capability 边界可以使用 `RuntimeAppEnv<"cloudflare">`、`RuntimeAppEnv<"node">` 等具体类型做局部收窄。

## Shopify 相关 env

Shopify app mode 是显式配置，不再有隐藏 fallback。`SHOPIFY_APP_MODE` 和 `APP_RUNTIME` 正交：

```txt
SHOPIFY_APP_MODE=embedded
SHOPIFY_APP_MODE=standalone
```

这个值同时影响：

- Shopify SDK 的 `isEmbeddedApp`。
- App Shell 是否加载 App Bridge。
- Admin API 请求使用 session token/token exchange，还是 standalone account session cookie。
- OAuth callback 后的 redirect 和 cookie 写入策略。

### Shopify Frontend Target

`SHOPIFY_APP_FRONTEND_TARGET` 和 `APP_RUNTIME`、`SHOPIFY_APP_MODE` 都正交。它只决定 Shopify `frontend` role 由哪个 web target 承载：

```txt
SHOPIFY_APP_FRONTEND_TARGET=backend
SHOPIFY_APP_FRONTEND_TARGET=frontend
```

| `SHOPIFY_APP_FRONTEND_TARGET` | `apps/server/shopify.web.toml`    | `apps/web/shopify.web.toml` | 说明                                                  |
| ----------------------------- | --------------------------------- | --------------------------- | ----------------------------------------------------- |
| `backend`                     | `roles = ["frontend", "backend"]` | 不生成                      | server 同时负责 app shell、API、auth、webhooks        |
| `frontend`                    | `roles = ["backend"]`             | `roles = ["frontend"]`      | web 负责 app shell，server 只负责 API、auth、webhooks |

因此 `SHOPIFY_APP_FRONTEND_TARGET=frontend` 不表示只支持 embedded，也不表示只支持 Cloudflare。它只把 HTML app shell 从 `apps/server` 移到 `apps/web`。

当 frontend target 为 `frontend` 时，浏览器入口是 `apps/web`：

```text
apps/web
  /              -> Vite/SPA app shell

apps/server
  /api/*         -> business API
  /auth/*        -> Shopify OAuth
  /webhooks/*    -> Shopify webhooks
```

开发环境中，`apps/web` 应通过 Vite proxy 把后端路径转发给 `apps/server`。前端业务代码始终使用相对路径，例如 `fetch("/api/xxx")`，不要硬编码 server origin。生产环境中也应保持同域路由：

```text
/            -> web static assets
/assets/*    -> web static assets
/api/*       -> server
/auth/*      -> server
/webhooks/*  -> server
```

这条规则对 standalone 尤其重要。standalone 依赖浏览器 cookie/account session，如果 web 和 server 分域，会引入 CORS、`credentials`、`SameSite` 和 callback URL 的额外复杂度。

`SHOPIFY_APP_FRONTEND_TARGET=frontend` 不能抹平 `embedded` 和 `standalone` 的认证差异。`apps/web` 可以是同一个 shell，但 API client 必须按 `SHOPIFY_APP_MODE` 选择认证策略：

| `SHOPIFY_APP_MODE` | 前端请求策略                                                          | server 认证策略                                         |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------------------- |
| `embedded`         | App Bridge 获取 session token，并发送 `Authorization: Bearer <token>` | `verifySessionToken` + token exchange / online session  |
| `standalone`       | `fetch(..., { credentials: "include" })`                              | account session cookie + `loadShopifySessionForAccount` |

新增 admin API route 时，不要把 middleware 写死成 embedded session token。业务 route 应继续通过 Shopify mode capability 获取 Admin request session strategy。

当 `SHOPIFY_APP_FRONTEND_TARGET=backend` 时，`apps/server` 可以注册 `/`、`/app`、`/app/*` 并返回 app shell HTML。

当 `SHOPIFY_APP_FRONTEND_TARGET=frontend` 时，`apps/server` 不应再作为主要 app shell renderer。可选策略是：

- 不注册 `/`、`/app`、`/app/*` shell routes。
- 或只把 `/app`、`/app/*` 重定向到 `SHOPIFY_APP_URL`。

OAuth callback 结束后的 fallback redirect 也要跟随 frontend target：

| `SHOPIFY_APP_FRONTEND_TARGET` | callback fallback        |
| ----------------------------- | ------------------------ |
| `backend`                     | `${SHOPIFY_APP_URL}/app` |
| `frontend`                    | `${SHOPIFY_APP_URL}/`    |

embedded 模式中，如果 callback 带有 `host`，仍可优先使用 `shopify.auth.buildEmbeddedAppUrl(host)`。

`APP_NAME` 也会影响 standalone account session cookie 名：

```txt
${APP_NAME}:account_session_cookie
```

默认值来自 `@shamt/app-env` 的 `DEFAULT_APP_NAME`。如果修改 `APP_NAME`，已有浏览器 cookie 名也会变化，需要重新建立 standalone account session。

## normalizeEnv

`normalizeEnv` 把未知输入转换为普通对象，并对字符串值执行 `decodeURIComponent`。

它用于统一处理：

- `process.env`
- Cloudflare `c.env`
- 测试传入的普通对象

## 错误处理

env 解析失败会由 `runtimeEnvMiddleware` 转成统一错误：

```ts
throw internalServerError("runtime env errors", {
  details: { cause: error, message },
  expose: true,
});
```

错误响应规则见 [error.md](./error.md)。

## 规则

1. `bootstrapApp()` 永远 runtime-agnostic，不接收 runtime 参数。
2. runtime-specific 行为只放在 runtime entry 或 runtime capability。
3. 业务模块只使用通用 `AppEnv`，不按 runtime 分支。
4. 业务代码优先从 `c.get("runtimeEnv")` 获取 env。
5. provider 内部可以缓存已校验 config，但不能缓存每个请求的业务数据。
6. 平台 binding 必须在 request 阶段通过 `c.env` 合并，并在 capability 使用点强校验。
7. `APP_RUNTIME` 是事实配置，不新增 `APP_RUNTIME_MODE`。
8. `SHOPIFY_APP_MODE` 是 Shopify app-flow 配置，不要和 `APP_RUNTIME` 混用。
9. `SHOPIFY_APP_FRONTEND_TARGET` 只决定 frontend role 承载位置，不改变 runtime 或 Shopify mode。
10. `SHOPIFY_APP_FRONTEND_TARGET=frontend` 时，server 不应继续作为主要 app shell renderer。
11. `embedded` 与 `standalone` 的认证策略必须继续由 Shopify mode capability 分流。
12. 新增 runtime 时，需要同步扩展 schema、capability 和 runtime entry。
