# Shopify Hono App

<p><a href="./README.md">English</a> | <strong>Chinese</strong></p>

Shopify Hono App 是一个用于 Shopify 应用的 pnpm monorepo。服务端可以按环境选择
Cloudflare Workers 或 Node 进程运行，后端使用 Hono 和 TypeScript，管理端 UI 是
Vite React SPA，共享 workspace packages 负责环境契约和数据库数据形状。

## 快速开始

在仓库根目录安装依赖、生成本地 Shopify/Wrangler 文件，然后启动 Shopify CLI：

```bash
pnpm install
pnpm dev:prepare
pnpm dev
```

只有需要固定开发域名时才使用 Cloudflare Tunnel 固定入口：

```bash
pnpm dev:tunnel
```

## Workspaces

### Apps

| Workspace                                                              | 类型 | 说明                                                                                   |
| ---------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------- |
| [`@unimolecule/shopify-app-unmanual-server`](./apps/server#readme)     | app  | Hono 服务端，负责 Shopify auth、app shell、Admin API routes、webhooks 和运行时适配器。 |
| [`@unimolecule/shopify-app-unmanual-web`](./apps/web#readme)           | app  | 面向 Shopify 管理端 UI 的 Vite React 前端。                                            |
| [`@unimolecule/shopify-app-unmanual-document`](./apps/document#readme) | app  | VitePress 文档 workspace。                                                             |

### Shared Packages

| Workspace                                                                  | 类型    | 说明                                                   |
| -------------------------------------------------------------------------- | ------- | ------------------------------------------------------ |
| [`@unimolecule/shopify-app-unmanual-envs`](./packages/envs#readme)         | package | 运行时无关的环境常量和 Zod schema。                    |
| [`@unimolecule/shopify-app-unmanual-app-env`](./packages/app-env#readme)   | package | 基于 env 基础包组合出的 Shopify 应用环境 schema。      |
| [`@unimolecule/shopify-app-unmanual-database`](./packages/database#readme) | package | 应用数据使用的 Drizzle schema、model、常量和推导类型。 |

## 架构

依赖方向保持单向：

```text
@unimolecule/shopify-app-unmanual-envs
  -> @unimolecule/shopify-app-unmanual-app-env
  -> apps/server / apps/web

@unimolecule/shopify-app-unmanual-database
  -> apps/server / apps/web

external runtime-neutral libraries
  -> packages/*
  -> apps/*
```

`apps/server` 通过环境驱动的 capability 边界选择运行时和基础设施 provider。应用代码
应复用 package 拥有的 env 和 database 导出，不要在本地重复定义 schema、enum 或状态值。

`apps/web` 是专用的 Vite React SPA，用于 Shopify 管理端 UI。它通过共享 client
工具访问 Hono API，并在 app shell 需要时使用 Shopify App Bridge 和 Polaris web
components。

## 要求

- Node.js `26.2.0`，由 [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) 声明。
- pnpm `>=11.0.0`。
- 根 dev dependencies 中的 Shopify CLI 和 Wrangler。
- Shopify Partner 账号和开发店铺。
- `.env.development`、`.env.production` 等运行时 env 文件。

不要提交 env 文件中的 secret、Shopify 凭据、Cloudflare token、数据库 URL、Redis URL
或私钥。

## 命令

| 命令                  | 说明                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `pnpm dev:prepare`    | 从 `.env.development` 生成本地 Shopify 和 Wrangler 配置。        |
| `pnpm dev`            | 先生成本地配置，再用 Shopify CLI 默认 tunnel 启动开发环境。      |
| `pnpm dev:tunnel`     | 先生成本地配置，启动命名 Cloudflare Tunnel，再运行 Shopify CLI。 |
| `pnpm deploy:prepare` | 从 `.env.production` 生成生产 Shopify 和 Wrangler 配置。         |
| `pnpm deploy`         | 生成配置、部署选中的运行时，然后部署 Shopify app 配置。          |
| `pnpm format`         | 运行各 workspace 的格式化脚本。                                  |
| `pnpm lint`           | 运行各 workspace 的 lint 脚本。                                  |
| `pnpm test`           | 运行存在测试脚本的 workspace 测试。                              |
| `pnpm clean`          | 通过 workspace 脚本清理生成产物和依赖/缓存目录。                 |

功能开发时优先使用聚焦命令：

```bash
pnpm -F @unimolecule/shopify-app-unmanual-server test
pnpm -F @unimolecule/shopify-app-unmanual-web test
pnpm -F @unimolecule/shopify-app-unmanual-web build
pnpm -F @unimolecule/shopify-app-unmanual-envs build
```

## 测试和类型检查

每个 workspace 负责自己的聚焦验证命令。测试文件放在 workspace 本地 `tests/`
目录时，应在该目录旁保留 `tests/tsconfig.json`：它应继承所属 workspace 的
tsconfig，包含测试运行器/运行时类型，并设置 `noEmit`。

示例：

```bash
pnpm -F @unimolecule/shopify-app-unmanual-server exec tsc -p tests/tsconfig.json --noEmit
pnpm -F @unimolecule/shopify-app-unmanual-web exec tsc -p tests/tsconfig.json --noEmit
```

## 文档

- 根 README 保持导航和架构说明。
- 应用级运行说明放在对应 app README，例如
  [`apps/server/README.md`](./apps/server/README.md) 和
  [`apps/web/README.md`](./apps/web/README.md)。
- 服务端指南放在 [`apps/server/docs/guides`](./apps/server/docs/guides)。
- 服务端参考材料放在 [`apps/server/docs/references`](./apps/server/docs/references)。
- 持久项目规则放在 [`AGENTS.md`](./AGENTS.md)。

## 生成文件

根 prepare 脚本负责生成 Shopify 和 Wrangler 文件。除非任务就是调试生成结果，否则不要
手动编辑生成的 `shopify.web.toml` 或 `apps/server/wrangler.json`。

生成的部署文件和本地 Cloudflare 数据属于运行时产物。`.wrangler/` 可能包含本地 D1
状态，除非明确要求，不要删除。

## 部署

生产部署从 `.env.production` 开始：

```bash
pnpm deploy:prepare
pnpm deploy
```

`deploy` 会运行 `deploy:prepare`，根据 `APP_RUNTIME` 分发到服务端部署路径，然后执行
Shopify app deployment。Cloudflare 运行时使用 Wrangler；Node 运行时使用服务端拥有的
Docker/Nginx 部署生成器。
