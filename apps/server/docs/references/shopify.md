# Shopify App Design

本文说明 `apps/server` 中 Shopify app-flow 的当前代码事实。重点是三条边界：

1. `modules/shopify` 只负责 Shopify app 流程。
2. `modules/product`、`modules/shop` 是业务资源模块。
3. Shopify Admin API 访问通过 `modules/shopify/admin` 中间件注入。

## 当前模式

Shopify app mode 必须显式配置，具体 env 取值和 frontend target 组合见 [env.md](./env.md#shopify-相关-env)。

| Mode         | App Shell                     | Admin API 身份来源                          | OAuth callback 后行为           |
| ------------ | ----------------------------- | ------------------------------------------- | ------------------------------- |
| `embedded`   | 加载 App Bridge + Polaris     | App Bridge session token + token exchange   | 跳回 Shopify Admin embedded URL |
| `standalone` | 只加载 Polaris web components | app account session cookie + stored session | 写入 account cookie 后跳 shell  |

mode 分发位于：

- `src/app/modules/shopify/mode`

runtime、Shopify mode 和 frontend target 是独立配置轴，详细规则见 [env.md](./env.md#shopify-相关-env)。

## 模块边界

| 模块/目录                                 | 职责                                                      |
| ----------------------------------------- | --------------------------------------------------------- |
| `src/app/modules/shopify/app-shell`       | 返回 embedded/standalone App Shell HTML                   |
| `src/app/modules/shopify/auth`            | Shopify OAuth begin/callback                              |
| `src/app/modules/shopify/mode`            | embedded/standalone capability registry                   |
| `src/app/modules/shopify/account`         | standalone account session cookie 与 Shopify session 映射 |
| `src/app/modules/shopify/admin`           | 注入 retryable Shopify Admin GraphQL client               |
| `src/app/modules/shopify/session.ts`      | embedded online session 读取、token exchange、刷新        |
| `src/app/modules/shopify/session-storage` | 根据 database capability 获取 Shopify session storage     |
| `src/app/modules/shopify/webhook`         | Shopify webhook 路由                                      |
| `src/app/modules/product`                 | Product resource API                                      |
| `src/app/modules/shop`                    | Shop resource API                                         |
| `src/shared/middlewares/shopify`          | session token、token exchange、webhook 验证中间件         |
| `src/infra/provider/shopify.ts`           | Shopify SDK config provider 与 request client factory     |

`modules/shopify` 不再注册 `shop` 和 `product` controller。它们由 route aggregator 单独注册：

- `src/app/bootstrap/register-routes.ts`

## App Shell

App Shell 路由：

```txt
/
/app
/app/*
```

入口：

- `src/app/modules/shopify/app-shell/index.ts`
- `src/app/modules/shopify/app-shell/templates.ts`

embedded shell 加载：

- `https://cdn.shopify.com/shopifycloud/app-bridge.js`
- `https://cdn.shopify.com/shopifycloud/polaris.js`

standalone shell 只加载：

- `https://cdn.shopify.com/shopifycloud/polaris.js`

页面请求：

- `/api/shop`
- `/api/product`

Shell 内所有服务端注入到 HTML 的字符串都必须 escape。当前使用 `@unimolecule/utils` re-export 的 `escape`。

## OAuth

OAuth 路由：

```txt
/auth
/auth/callback
```

入口：

- `src/app/modules/shopify/auth/index.ts`

`/auth` 会校验 `shop` 参数必须是合法 `*.myshopify.com` 域名，然后调用：

```ts
shopify.auth.begin({ ...options });
```

`/auth/callback` 调用：

```ts
shopify.auth.callback({ ...options });
```

回调得到的 Shopify session 会写入当前 runtime 的 session storage，然后交给 mode capability 处理 redirect。

### Embedded Callback

embedded mode 优先使用 `host` query 参数构建 Shopify Admin embedded URL：

```ts
shopify.auth.buildEmbeddedAppUrl(host);
```

如果没有 `host`，fallback 到：

```ts
getShopifyAppShellUrl(runtimeEnv, { shop: session.shop });
```

这个 helper 会根据 [frontend target](./env.md#shopify-frontend-target) 选择 `${SHOPIFY_APP_URL}/app?shop=...` 或 `${SHOPIFY_APP_URL}/?shop=...`。

### Standalone Callback

standalone mode 写入 app account session cookie，然后跳转：

```ts
getShopifyAppShellUrl(runtimeEnv);
```

这个 helper 会根据 [frontend target](./env.md#shopify-frontend-target) 选择 `${SHOPIFY_APP_URL}/app` 或 `${SHOPIFY_APP_URL}/`。

cookie 名来自：

```ts
DEFAULT_APP_ACCOUNT_SESSION_COOKIE = `${APP_NAME}:account_session_cookie`;
```

过期时间：

```ts
DEFAULT_APP_ACCOUNT_SESSION_EXPIRE = 60 * 60 * 24 * 30;
```

注意：该 cookie 当前保存的是 account session id，并映射到 session storage 中的 Shopify session id。未来完整账户体系可以替换 `src/app/modules/shopify/account/session.ts`，而不需要改 product/shop controller。

## Admin API 访问

Resource API routes 使用两个中间件：

```ts
[shopifyAdminSession(), shopifyAdminClient()] as const;
```

### `shopifyAdminSession()`

位置：

- `src/app/modules/shopify/mode/capabilities.ts`

职责：根据 `SHOPIFY_APP_MODE` 解析当前请求的 Shopify session。

embedded mode：

1. `verifySessionToken`
2. `tokenExchange`
3. 设置 `shopifySession`、`shopifyAccessToken`

standalone mode：

1. 读取 app account session cookie。
2. 从 Shopify session storage 读取对应 session。
3. 校验 session active。
4. 设置 `shopifySession`、`shopifyAccessToken`。

### `shopifyAdminClient()`

位置：

- `src/app/modules/shopify/admin/middleware.ts`
- `src/app/modules/shopify/admin/client.ts`

职责：创建 retryable Shopify Admin GraphQL client，并写入：

```ts
c.var.shopifyAdminClient;
```

resource controller 直接消费：

```ts
await getProducts(c.var.shopifyAdminClient);
await getShopInfo(c.var.shopifyAdminClient);
```

不再写：

```ts
runWithShopifyAdminClient(c, operation);
```

### 401 Retry

`createRetryableShopifyAdminClient()` 会包装 Shopify GraphQL client 的 `request` 方法。

如果 Shopify Admin API 返回 `401`：

1. 使用当前 mode 的 `refreshAdminSession(c)`。
2. 更新 Hono context 中的 Shopify session。
3. 重新创建 Shopify GraphQL client。
4. 使用同一组 request 参数重试一次。

embedded mode 会删除当前 online session 并重新 token exchange。

standalone mode 当前不会刷新 account session，而是抛出：

```txt
Standalone Shopify session expired or was revoked
```

未来如果有完整账户体系，可以在 standalone mode capability 的 `refreshAdminSession` 中接入账户刷新逻辑。

## Session Storage

Shopify session storage 由 `RuntimeCapabilities` 提供，并在 runtime boundary 内基于统一 database capability 创建 Drizzle-backed adapter：

| Runtime / Provider  | Storage 策略                                  |
| ------------------- | --------------------------------------------- |
| `node` + `postgres` | `DrizzleSessionStoragePostgres` + `pg.Pool`   |
| `cloudflare` + `d1` | `DrizzleSessionStorageSQLite` + Cloudflare D1 |
| `vercel-edge`       | 预留 runtime，没有完整 session storage 能力   |

入口：

- `src/app/modules/shopify/session-storage/index.ts`
- `src/app/modules/shopify/session-storage/postgres.ts`
- `src/app/modules/shopify/session-storage/sqlite.ts`
- `src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`
- `src/app/runtime/isolate/cloudflare/bindings.ts`
- `src/app/runtime/process/node/runtime-capabilities.ts`
- `src/infra/database`
- `packages/database/src/models/postgres/shopify-sessions.ts`
- `packages/database/src/models/sqlite/shopify-sessions.ts`

Cloudflare 下的 D1 binding 在 config schema 中允许 bootstrap 阶段缺失。真正创建 database 时，Cloudflare runtime capability 会强校验 `APP_DATABASE_D1_BINDING` 指向的 request-bound binding。这样 route metadata 等模块 import 阶段不会因为 request-bound binding 尚未进入而失败，但 session storage 使用点仍然会快速失败。

数据库 schema 来自 `@unimolecule/shopify-app-unmanual-database` 的 PostgreSQL / SQLite models，与 file module 共享同一个 `runtimeCapabilities.database()`。本地验证可使用：

```bash
pnpm --dir apps/server run db:seed:dev:pg
pnpm --dir apps/server run db:seed:dev:d1
```

默认的 D1 development seed 写入远端 dev D1；显式本地 Wrangler D1 调试时可临时设置 `D1_SEED_LOCAL=true` 后复用 `db:seed:dev:d1`。

## Resource API

当前 Shopify-backed resource API：

| Path           | Module                    | 说明             |
| -------------- | ------------------------- | ---------------- |
| `/api/shop`    | `src/app/modules/shop`    | 查询店铺基本信息 |
| `/api/product` | `src/app/modules/product` | 查询商品列表     |

这些模块不属于 Shopify app-flow，但依赖 Shopify Admin middleware：

- `shopifyAdminSession()`
- `shopifyAdminClient()`

这样后续新增 `orders`、`customers`、`inventory` 等资源时，可以复用同一套 Admin API 访问能力。

## Webhook

Webhook 路由统一挂载：

```txt
/webhooks
```

入口：

- `src/app/modules/shopify/webhook/index.ts`
- `src/shared/middlewares/shopify/verify-webhook.ts`

所有 webhook 请求先经过 Shopify 官方验签：

```ts
shopify.webhooks.validate({ ...options });
```

验签前会通过 `readLimitedBody()` 读取 raw body，并按 `DEFAULT_WEBHOOK_MAX_SIZE` 做硬限制。这样既保留 Shopify HMAC 校验需要的原始 body，也避免不受控地把超大 webhook payload 读入内存。

当前处理：

- `/webhooks/app/uninstalled`: 删除该 shop 的已保存 Shopify sessions。
- `/webhooks/customers/data-request`: 记录请求并返回成功。
- `/webhooks/customers/redact`: 记录请求并返回成功。
- `/webhooks/shop/redact`: 记录请求并返回成功。

## 路由总览

| 路径                               | 所属模块          | 身份/验证方式                                                    |
| ---------------------------------- | ----------------- | ---------------------------------------------------------------- |
| `/`                                | Shopify app shell | backend frontend target 渲染 shell；frontend target 重定向到 web |
| `/app`                             | Shopify app shell | backend frontend target 渲染 shell；frontend target 重定向到 web |
| `/app/*`                           | Shopify app shell | backend frontend target 渲染 shell；frontend target 重定向到 web |
| `/auth`                            | Shopify OAuth     | shop query validation                                            |
| `/auth/callback`                   | Shopify OAuth     | Shopify OAuth callback validation                                |
| `/api/shop`                        | Shop resource     | Shopify Admin session + Admin client                             |
| `/api/product`                     | Product resource  | Shopify Admin session + Admin client                             |
| `/webhooks/app/uninstalled`        | Shopify webhook   | Shopify webhook validation                                       |
| `/webhooks/customers/data-request` | Shopify webhook   | Shopify webhook validation                                       |
| `/webhooks/customers/redact`       | Shopify webhook   | Shopify webhook validation                                       |
| `/webhooks/shop/redact`            | Shopify webhook   | Shopify webhook validation                                       |

## Provider 边界

`src/infra/provider/shopify.ts` 缓存 app-level Shopify SDK config。

缓存签名包含：

- runtime
- env
- app key
- app mode
- frontend target
- app URL
- API version
- scopes

request-level Admin GraphQL client 不全局缓存，因为它绑定当前请求的 Shopify session。

## 安全规则

1. OAuth、session token decode、token exchange、webhook HMAC validation 交给 Shopify 官方 SDK。
2. 所有需要 Admin API 的 resource route 必须先经过 `shopifyAdminSession()`。
3. 所有需要 Admin API 的 resource route 必须再经过 `shopifyAdminClient()`。
4. 不把 Shopify access token 写入 cookie。
5. standalone account cookie 只保存 account session id。
6. HTML 中服务端注入的字符串必须 escape。
7. Webhook handler 不绕过 `verifyWebhook`。

## 常见问题

### 为什么 product/shop 不在 `modules/shopify` 下？

`modules/shopify` 只负责 Shopify app-flow：App Shell、OAuth、mode、session、webhook、Admin client 能力。

`product`、`shop` 是业务资源模块。它们依赖 Shopify Admin API，但不属于 Shopify app-flow。

### 为什么 standalone cookie 名包含 `APP_NAME`？

为了让同一域名下多个 app 有不同 cookie key：

```txt
${APP_NAME}:account_session_cookie
```

如果改了 `APP_NAME`，旧 cookie 不再被读取，需要重新走 standalone OAuth/account session。

### 为什么 cookie 解析没有使用 Hono cookie helper？

当前 cookie 名按项目约定包含 `:`。Hono 的 cookie serializer 会校验 RFC cookie name，不能序列化这种名字。

因此 `account/session.ts` 对这个 cookie 做了轻量手写读写，但 cookie value 仍然使用 `encodeURIComponent` / `decodeURIComponent`。

### 为什么 standalone mode 不自动刷新 Admin session？

当前 standalone 还没有完整账户体系。session 失效时直接返回 unauthorized 更清晰。

未来账户体系落地后，可以扩展 standalone mode capability 的 `refreshAdminSession(c)`，让现有 product/shop controller 无需修改。

### 为什么 Admin client 做成中间件？

这样 controller 只关心业务 service：

```ts
await getProducts(c.var.shopifyAdminClient);
```

session 解析、client 创建、401 retry 都由 middleware 和 Shopify Admin client wrapper 负责。

## 出问题时看哪里

| 现象                         | 优先检查                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| App 页面打不开               | `app-shell/index.ts`、`mode/*`、`SHOPIFY_APP_MODE`                                       |
| embedded API 返回 401        | `verify-session-token.ts`、App Bridge 是否加载                                           |
| embedded token exchange 失败 | `token-exchange.ts`、`session.ts`、app secret/scopes                                     |
| standalone API 返回 401      | `account/session.ts`、account cookie、stored session                                     |
| Admin API 401 retry 异常     | `shopify/admin/client.ts`、`mode/*`、`session.ts`                                        |
| Shopify 数据查不到           | `modules/shop`、`modules/product`、scopes                                                |
| Webhook 失败                 | `verify-webhook.ts`、raw body、app secret                                                |
| Cloudflare session 找不到    | `APP_DATABASE_PROVIDER`、D1 binding、Cloudflare runtime capability                       |
| TOML role/mode 配置不一致    | `SHOPIFY_APP_MODE`、`SHOPIFY_APP_FRONTEND_TARGET`、`scripts/write-shopify-file/index.ts` |

## 当前测试覆盖

Shopify 相关测试主要在：

- `tests/shopify/config-provider.test.ts`
- `tests/shopify/routes-shell.test.ts`
- `tests/shopify/session-middleware.test.ts`
- `tests/shopify/services-controllers.test.ts`
- `tests/shopify/webhook-routes.test.ts`
- `tests/provider.test.ts`

覆盖范围：

- Shopify SDK config and provider cache。
- embedded/standalone App Shell。
- OAuth callback redirect and account cookie。
- session token verification。
- token exchange。
- standalone account session loading。
- runtime-specific session storage。
- Shopify mode capability reset/dispose。
- Shopify Admin client middleware and 401 retry。
- product/shop resource controller and service。
- webhook validation and handler registration。
