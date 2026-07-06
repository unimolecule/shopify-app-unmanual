# `@shamt/web`

`apps/web` 是 Shopify app 的前端工作区，使用 Vite、React、TanStack Router、TanStack Query 和 Tailwind CSS v4。Admin UI 以 Shopify Polaris web components 为主，浏览器侧通过构建期注入的 public env 感知 runtime、mode 和 frontend target，不直接读取 Node/Vite 侧完整 env。

## 启动

从 `apps/web` 工作区启动时，脚本会通过 Node 的 `--env-file` 读取仓库根目录 env file，并用 `tsx/esm` 让 Vite config 可以直接加载 workspace TypeScript 包。

```sh
pnpm -F @shamt/web dev
pnpm -F @shamt/web build
pnpm -F @shamt/web test
```

对应脚本：

```sh
node --env-file=../../.env.development --import tsx/esm ./node_modules/vite/bin/vite.js
node --env-file=../../.env.production --import tsx/esm ./node_modules/vite/bin/vite.js build
```

`tsx/esm` 只解决 Vite config 在本地直接加载 workspace TS 源码的问题，不代表所有 Node 入口都能自动解析扩展名不完整的 ESM import。

## Package Scripts

`apps/web` 的脚本都在 web workspace 内执行；本地 Shopify 联调通常由根目录
`pnpm dev` 或 `pnpm dev:tunnel` 间接启动。

| Script               | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| `dev`                | 读取 `../../.env.development`，用 Vite 启动前端 dev server。 |
| `build`              | 读取 `../../.env.production`，构建生产静态产物到 `dist`。    |
| `test`               | 运行 Vitest。                                                |
| `test:coverage`      | 运行 Vitest coverage。                                       |
| `test:coverage:view` | 打开 coverage HTML 报告。                                    |
| `format`             | 格式化 web workspace 内的 JS/TS/React/Markdown/JSON 文件。   |
| `lint`               | 修复 web workspace 内的 ESLint 问题。                        |
| `clean`              | 并行运行 web workspace 清理任务。                            |
| `clean:cache`        | 删除 `dist`。                                                |
| `clean:deps`         | 删除 `node_modules`。                                        |

## Env 分层

Node/Vite 侧配置集中在 [`configs/env.ts`](./configs/env.ts)。它使用 `@shamt/app-env` 的 `configSchema` 校验 `process.env`，并导出校验后的 `env` 给 `vite.config.ts` 和 Vite plugins 使用。

浏览器侧代码不要 import `configs/env.ts`。该文件会读取完整 env，其中包含 Shopify secret、Redis、database 等服务端配置。`src` 下如果需要 runtime、mode、frontend target 等公开值，统一从 [`src/utils/public-env.ts`](./src/utils/public-env.ts) 获取。

## HTML 与 Public Env 注入

[`scripts/vite/plugins/html.ts`](./scripts/vite/plugins/html.ts) 负责替换 `index.html` 中的 Shopify 占位符：

- `%SHOPIFY_APP_FRONTEND_NAME%`
- `%SHOPIFY_APP_FRONTEND_HEAD%`

它会写入 `app-runtime`、`shopify-api-key`、`shopify-app-mode` meta，并根据 `SHOPIFY_APP_MODE` 决定是否加载 App Bridge。Polaris web components 脚本由 HTML head 模板承载。

[`scripts/vite/plugins/public-env.ts`](./scripts/vite/plugins/public-env.ts) 会接收已校验的完整 env，过滤敏感字段后写入 HTML head，并注册为只读全局变量：

```text
globalThis.__PUBLIC_ENV__
```

业务代码使用：

```text
import {
  getShopifyAppMode,
  isEmbeddedShopifyApp,
  isNodeRuntime,
} from "@/utils/public-env";
```

全局变量类型声明在 [`typings/index.d.ts`](./typings/index.d.ts)。如果 VSCode 对 `globalThis.__PUBLIC_ENV__` 或 `globalThis.shopify` 报类型错误，先执行 `TypeScript: Restart TS Server`；声明本身使用 `declare global { var ... }`，命令行 `tsc` 已可识别。

## 敏感 Key 防护

[`constants/index.ts`](./constants/index.ts) 定义 public env 全局变量名和敏感 env key 标识：

```text
export const PUBLIC_ENV_GLOBAL_NAME = "__PUBLIC_ENV__";

export const SENSITIVE_ENV_KEY_IDENTIFIERS = [
  "secret",
  "scope",
  "redis",
  "database",
  "password",
  "pwd",
  "private",
  "token",
  "id",
] as const;
```

`publicEnvPlugin` 会用大小写不敏感正则检查 env key。命中这些标识的字段会被过滤，不会注入浏览器。因为当前策略是“传入完整 env 后过滤敏感字段”，新增 secret、token、database、Redis、ID 类字段时必须确认 key 命名能被这组标识捕获。

`globalName` 仍会被校验为合法 JavaScript 标识符，避免生成不可执行的 inline script。

## Vite Dev Server

Vite dev server 配置集中在 [`scripts/vite/server.ts`](./scripts/vite/server.ts)，并拆分出：

- [`scripts/vite/allowed-hosts.ts`](./scripts/vite/allowed-hosts.ts)：从 `SHOPIFY_APP_URL`、Shopify CLI tunnel env、`VITE_ALLOWED_HOSTS` 等来源生成 `server.allowedHosts`。
- [`scripts/vite/proxy.ts`](./scripts/vite/proxy.ts)：把 `/api`、`/auth`、`/webhooks` 代理到 `apps/server`。

`shopify app dev` 会注入 `FRONTEND_PORT` 和 `BACKEND_PORT`。`apps/web` 会优先使用这两个端口；没有注入时回退到 `APP__WEB_PORT` 和 `APP__SERVER_PORT`。

## Build 图片优化

[`scripts/vite/plugins/image-optimizer.ts`](./scripts/vite/plugins/image-optimizer.ts) 只在 `vite build` 时启用。它会优化 `public` 与 `src/assets` 中的图片，并在安装了 `svgo` 时额外处理 SVG。

开发模式不启用图片优化，避免拖慢 `pnpm dev` 和 React Refresh。

## HTTP Client 边界

Shopify app 后端 API 的浏览器侧 HTTP client 统一从
[`src/utils/client.shopify.ts`](./src/utils/client.shopify.ts) 获取：

```text
import { shopifyClient, ShopifyAuthRedirectError } from "@/utils/client.shopify";
```

- `shopifyClient`：基于 `@unimolecule/oh-my-fetch` 的 `createHttpClient().extend({ hooks })` 创建，保留 `.get()`、`.post()`、`.put()`、`.patch()`、`.delete()`、`.upload()` 和 `.request()` 等原生方法。
- `ShopifyAuthRedirectError`：401 OAuth recovery 时抛出的业务错误，页面层可用它区分授权跳转状态。
- `HttpRequestError`：从这里 re-export，便于测试或边界层判断底层 HTTP 错误。

`shopifyClient` 通过 hooks 统一处理 Shopify app 请求策略：

- `beforeRequest`：根据 `SHOPIFY_APP_MODE` 设置 `credentials`，embedded 模式下通过 `globalThis.shopify?.idToken()` 注入 `Authorization`。
- `afterResponse`：成功响应后重置 OAuth redirect throttle。
- `beforeError`：把 401 `HttpRequestError` 转换成 `ShopifyAuthRedirectError`，并按当前 `shop` 参数触发 `/auth` 顶层跳转。

业务 API 文件只保留数据类型与端点调用，例如
[`src/apis/shopify.ts`](./src/apis/shopify.ts)：

```text
shopifyClient.get<ApiResponse<{ shop?: ShopInfo }>>("shop", { signal });
shopifyClient.get<ApiResponse<ProductsData>>("product", { signal });
```

页面层使用这些业务函数，不直接拼认证 header 或处理 OAuth recovery。

## 列表 API 响应

浏览器侧列表 API 统一消费后端的 `data.result` 和 `data.pagination` 结构。`pagination.mode` 可能是 `cursor` 或 `page`：

```ts
type ListData<T> = {
  result: T[];
  pagination:
    | {
        mode: "cursor";
        limit: number;
        nextCursor?: string;
        hasNext: boolean;
      }
    | {
        mode: "page";
        limit: number;
        page: number;
        total: number;
        hasNext: boolean;
      };
};
```

业务列表函数可以传 `limit + cursor` 或 `limit + page`，但两种模式不能混用。`limit` 最大为 `100`；page 模式只用于浅页跳转，深翻页需要沿用服务端返回的 `nextCursor`。

## Error Routes

错误页组件集中在 [`src/components/errors`](./src/components/errors)，路由统一放在 `/errors` 路径下：

| Route             | Component     | Purpose              |
| ----------------- | ------------- | -------------------- |
| `/errors/403`     | `Forbidden`   | 权限不足或拒绝访问   |
| `/errors/404`     | `NotFound`    | 页面不存在或已移动   |
| `/errors/500`     | `ServerError` | 服务端或未知错误     |
| `/errors/offline` | `Offline`     | 网络不可用或请求失败 |

React Query 的 `onlineManager` 用于页面级离线状态判断。`product-export` 路由在请求前发现离线时会进入 `/errors/offline`，避免在断网时继续展示依赖远端数据的页面。

## Product Export Routes

`src/routes/product-export` 使用 TanStack Router loader 与 React Query 共享同一个 `queryClient`：

- `/product-export` 读取列表 query，并用 mutation 状态控制单行 download/delete loading。
- `/product-export/new` 创建导出记录，成功后更新列表缓存并跳转到详情页。
- `/product-export/$id` 通过 loader `ensureQueryData` 读取详情，请求期间显示 `Loading` 组件且 `scope="page"`。
- 模板下拉菜单来自 `GET /api/product-exports/reference/templates`，前端只渲染 server 返回的 `code`、`label` 和 `fields`。

创建和删除 mutation 会先更新当前缓存，再 invalidate product export list queries，让列表和详情页保持一致。

## 目录边界

- `configs/`：Node/Vite 侧配置，只允许 Vite config、scripts、plugins 使用。
- `constants/`：web package 层常量，主要给 Vite plugins 使用。
- `scripts/vite/`：Vite plugin 与构建期逻辑。
- `src/apis/`：业务 API 类型与端点函数，只调用领域 client，不承载通用请求策略。
- `src/components/`：跨路由复用的 UI 状态组件，例如 loading 与 errors。
- `src/utils/public-env.ts`：浏览器侧 public env 唯一入口。
- `src/utils/client.shopify.ts`：Shopify app 后端 API 的领域 HTTP client。
- `src/utils/client.query.ts`：React Query client 工厂，避免组件重复创建缓存实例。
- `typings/`：Polaris web components、App Bridge 和 public env 全局类型。

保持这个边界可以避免服务端 env、Zod schema 或 Node-only 逻辑进入浏览器 bundle。
