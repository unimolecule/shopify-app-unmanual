# Runtime Capabilities 决策

本文记录 `apps/server` 后续用显式 `RuntimeCapabilities` 对象统一 runtime 能力的架构决策。它是架构 guide，不是接口 reference。

本文补充并取代早期以 runtime capability registry 作为主要入口的叙述。旧 capability 方案可以作为迁移期背景理解；后续新增 runtime 能力、重构现有 runtime 能力时，以本文为准。

## 决策

`apps/server` 继续使用 capability 作为对外概念，但废弃全局 capability registry 作为主要实现方式。

也就是说，业务和使用者看到的是 `RuntimeCapabilities`：当前 runtime 能提供哪些能力。runtime 入口负责选择并创建该 runtime 可用的 adapter，然后把这些能力作为显式对象传入通用业务应用。业务模块只依赖 port，不从全局 `setRuntimeCapability/getRuntimeCapability` registry 读取能力，也不直接判断 Node、Cloudflare、PostgreSQL、D1、R2 或 Queue provider。

这个模式可以描述为 Runtime Capabilities via Composition：

- capability 是业务可见的能力名。
- composition 是 runtime 入口创建和注入这些能力的方式。
- composition root 只作为维护者理解装配边界的架构术语，不作为日常 API 名称。

目标形态：

```text
process entry
  -> runtimeCapabilityNode()
  -> bootstrapApp({ createRuntimeCapabilities })

cloudflare entry
  -> runtimeCapabilityCloudflare(env)
  -> bootstrapApp({ createRuntimeCapabilities })

app modules
  -> depend on RuntimeCapabilities ports
  -> never import runtime-only adapters
```

核心类型命名应保持直观：

```ts
type RuntimeCapabilities = {
  database: Lazy<Database> & {
    repositories: {
      files: () => FilesRepository;
      productExports: () => ProductExportRepository;
      references: () => ReferenceRepository;
    };
  };
  bucket: Lazy<Bucket>;
  shopifySessionStorage: Lazy<SessionStorage>;
};
```

`RuntimeCapabilities` 不保存 env 或 logger 快照。runtime capability creator 可以接收 `runtimeEnv` 来创建 adapter，但 env 的权威入口是 `getEnvProvider()`；logger 的权威入口是 `getLoggerProvider()`。request 阶段由 middleware 把二者同步到 Hono context。

不要再新增这种全局注册表 API：

```ts
getRuntimeCapability("bucketFactory");
setRuntimeCapability("bucketFactory", factory);
```

架构上仍然属于 Ports and Adapters：

| 概念                | 在本项目中的含义                                              |
| ------------------- | ------------------------------------------------------------- |
| RuntimeCapabilities | 当前 runtime 显式提供给 app/module 的能力对象                 |
| Composition root    | runtime entry 附近负责对象创建、adapter 选择和生命周期的位置  |
| Port                | 业务模块需要的抽象能力，例如 database、bucket、queue、session |
| Adapter             | Node PostgreSQL、Cloudflare D1、R2、pg-boss 等具体实现        |

## 为什么替代 capabilities

capability registry 的优点是能把业务模块和 runtime 实现隔开，但它本质上接近 Service Locator：业务代码在运行时按名字读取全局能力。这会带来几个长期问题。

第一，import graph 不够直观。Cloudflare bundle 是否会看到 Node-only 依赖，取决于 capability 注册文件、infra barrel、动态 import 和 bundler 静态分析的组合。维护者需要理解很多间接规则，才能判断 `pg-core`、`node:fs` 或第三方 Node adapter 会不会进入 Worker bundle。

第二，使用者心智负担偏高。开源 template 的用户新增一个能力时，需要知道能力类型、注册函数、disposer、resource context、业务读取方式和 runtime 注册位置。显式 `RuntimeCapabilities` 把问题变成一个更直接的规则：这个 runtime 需要什么能力，就在这个 runtime 的能力创建函数中创建并传进去。

第三，全局 registry 容易隐藏生命周期。Node process 中缓存的 pool、bucket client、queue consumer 需要释放；Cloudflare isolate 中很多 binding 是 request-bound。`RuntimeCapabilities` 创建函数能把创建、缓存、释放和 request binding 读取放在同一个 runtime 边界里，而不是散在 registry 和业务模块之间。

更准确地说，Cloudflare binding 不是应用创建的连接资源，没有 `pool.end()` 或 `client.close()` 这类显式释放动作。`RuntimeCapabilities` 负责的是 scope 管理：request-bound 的 D1、R2、Queue binding 只进入 request/event capabilities，不进入 module scope、全局 registry 或跨 request singleton。request 或 queue/scheduled event 结束后，app 代码不再持有这些 binding 引用，由 Worker runtime 与 GC 自然回收。

第四，显式 `RuntimeCapabilities` 可以解决 capability factory 在同一个 request 内重复创建 adapter wrapper 的问题。capability registry 常见形态是 `databaseFactory(context)`、`bucketFactory(context)` 每次调用都重新创建一层 adapter；当一个 request 内多个 service 都需要 bucket、database 或 session storage 时，容易重复包装同一个 binding。新的 capabilities 对象可以提供 scope-aware lazy cache：Node 使用 process scope，Cloudflare 使用 request/event scope。

第五，Cloudflare 安全边界更清楚。Cloudflare entry 只 import Cloudflare-safe capability creator；Node entry 只 import Node/process capability creator。只要 capabilities 创建函数不跨 runtime 引入 adapter，Worker bundle 就不应该包含 PostgreSQL、`pg-core`、Node 内置模块或 Node-only Shopify adapter。

## Scope 与 Lazy Cache

`RuntimeCapabilities` 不表示所有 adapter 都应该全局缓存。缓存 scope 必须跟资源生命周期一致。

| 资源                    | Node process                                  | Cloudflare isolate                        |
| ----------------------- | --------------------------------------------- | ----------------------------------------- |
| PostgreSQL `pg.Pool`    | process-wide lazy singleton，shutdown dispose | 不存在                                    |
| S3/R2 HTTP client       | process-wide lazy singleton                   | 不缓存 request-bound binding              |
| D1 database adapter     | 不存在                                        | request-scoped lazy                       |
| R2 binding adapter      | 不存在                                        | request-scoped lazy                       |
| Shopify session storage | 可 process-wide 或 database-scoped lazy       | request-scoped lazy                       |
| queue consumer          | process root 创建，shutdown dispose           | queue event-scoped，不进全局 registry     |
| scheduler               | process root 创建，shutdown dispose           | scheduled event-scoped，不进全局 registry |

Cloudflare request capabilities 可以对同一个 request 内的 adapter 做 lazy memoization：

```ts
function runtimeCapabilityCloudflare(env, runtimeEnv) {
  const database = once(() =>
    createIsolateDatabase(runtimeEnv, {
      d1: env[runtimeEnv.APP_DATABASE_D1_BINDING],
    }),
  );

  const bucket = once(() =>
    createIsolateBucket(runtimeEnv, {
      r2: env[runtimeEnv.APP_BUCKET_R2_BINDING],
    }),
  );

  const sessionStorage = once(async () =>
    createD1ShopifySessionStorage(await database()),
  );

  return {
    bucket,
    database,
    sessionStorage,
  };
}
```

这个 `once(...)` 只属于当前 request capabilities。它可以避免同一个 request 内多个 service 重复创建 D1/R2/session adapter wrapper，但不能升到 isolate module scope。

不要这样缓存 request-bound binding：

```ts
let cachedDatabase;

function createCloudflareRuntimeCapabilities(env, runtimeEnv) {
  cachedDatabase ??= createIsolateDatabase(runtimeEnv, {
    d1: env[runtimeEnv.APP_DATABASE_D1_BINDING],
  });

  return {
    database: cachedDatabase,
  };
}
```

上面这类写法会把 request-bound binding 变成 isolate 全局引用，破坏 Cloudflare 的 request/event 生命周期边界。Cloudflare capabilities 的规则是：module scope 可以缓存不持有 request binding 的纯函数、schema、static config 和 runtime-neutral app；持有 `env`、`ctx`、D1、R2、Queue binding 或 request body 的对象必须停留在 request/event scope。

## Logger 与 Bootstrap 能力

不是所有旧 capability 都应该进入 request capabilities。先区分 bootstrap 能力、request/event 能力和业务 port。

| 已移除的旧 registry capability      | 新位置                                                           | 处理方式                                                              |
| ----------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `runtimeLoggerSetup`                | logger provider                                                  | 改为 `getLoggerProvider(runtimeEnv)`                                  |
| `runtimeEnvSourceResolver`          | runtime entry / request capabilities 创建处                      | 已删除，`runtimeEnvMiddleware` 直接读取 `c.env` 并回退 `process.env`  |
| `moduleHealthDiskChecker`           | `runtimeCapabilities.health.disk`                                | 作为 health port 注入，Node 返回真实检查，Cloudflare 返回 unsupported |
| `moduleHealthMemoryChecker`         | `runtimeCapabilities.health.memory`                              | 同上                                                                  |
| `moduleFileDownloadResolverFactory` | `runtimeCapabilities.file.downloadResolver` 或 file service 组合 | 归入 file 边界，不再作为全局 runtime factory                          |

logger 需要特别处理。D1、R2 这类 adapter 可以是 request-scoped lazy capability；但 LogTape 的 `configure/reset` 是 isolate/process 级全局配置。如果 Cloudflare 每个 request 都无条件 reset logger，会带来不必要的开销，也可能让并发 request 互相影响全局 logger config。

新模式下保留启动期 bootstrap logger，并在 runtime request/event 入口通过 logger provider 做幂等的 logger 确认：

```ts
await getLoggerProvider();

export default {
  async fetch(request, env, ctx) {
    const runtimeEnv = createCloudflareRuntimeEnv(env);
    const logger = await getLoggerProvider(runtimeEnv);
    const capabilities = runtimeCapabilityCloudflare({
      ctx,
      env,
      runtimeEnv,
    });

    return app.fetch(request, env, ctx);
  },
};
```

`getLoggerProvider(runtimeEnv)` 按 logger config signature 做幂等 setup。第一次 request 进入 isolate 时用 Cloudflare env 配置 runtime logger；后续同一个 isolate、同一份 logger 配置不重复 reset。只有 signature 变化时才重新 setup。同一 signature 的并发 setup 会复用同一个 setup promise。

Node process runtime 也通过同一个 provider 入口完成 runtime logger setup，并在 process shutdown 时统一 dispose：

```ts
const runtimeEnv = getEnvProvider();
const logger = await getLoggerProvider(runtimeEnv);
const capabilities = runtimeCapabilityNode({
  runtimeEnv,
});
```

因此，`RuntimeCapabilities` 不持有 `logger`，也不持有 `runtimeLoggerSetup` 这类会 reset 全局 logger 配置的 setup function。request logger 由 `runtimeLoggerMiddleware()` 调用 `getLoggerProvider(getEnvProvider(c.env))` 后同步到 Hono context。

## 放置规则

新增或迁移 runtime 能力时按下面的规则放置代码：

| 内容                          | 放置位置                                                               |
| ----------------------------- | ---------------------------------------------------------------------- |
| runtime 入口                  | `src/app/runtime/process/node` 或 `src/app/runtime/isolate/cloudflare` |
| runtime capabilities creator  | 对应 runtime 入口附近，例如 `runtime-capabilities.ts`                  |
| 业务 port 类型                | 使用该能力的 app/module 边界，或共享 `RuntimeCapabilities` 类型        |
| Node-only adapter             | `src/infra/*/process.ts` 或明确的 process runtime 文件                 |
| Cloudflare-only adapter       | `src/infra/*/isolate.ts` 或明确的 isolate runtime 文件                 |
| app module service/repository | 只接收 port，不直接读取 runtime/provider                               |
| database repository index     | 只导出 repository 类型；dialect 实现在 `postgres.ts` / `sqlite.ts`     |
| package 级 schema/model       | `packages/*`，保持不依赖 `apps/*`                                      |

不要把 runtime/provider switch 写进业务模块：

```ts
if (runtime === "cloudflare") {
  // create D1/R2 adapter
} else {
  // create PostgreSQL/S3 adapter
}
```

也不要为了统一入口创建会混合跨 runtime 依赖的 barrel：

```ts
export * from "./postgres";
export * from "./sqlite";
```

Cloudflare 可达入口不应通过任何共享聚合文件间接 import PostgreSQL schema、`drizzle-orm/pg-core`、`pg`、`node:*` 或 Node-only Shopify adapter。

## Schema 引入规则

数据库初始化入口可以直接引入当前 runtime/provider 需要的 schema。为了统一维护 schema，可以让 `createProcessDatabase`、`createIsolateDatabase` 这类 runtime database entry 明确组合自己需要的 schema 对象。

允许：

```text
infra/database/process.ts
  -> import PostgreSQL models from @shamt/database
  -> create process database schema

infra/database/isolate.ts
  -> import SQLite/D1 models from @shamt/database
  -> create isolate database schema
```

不建议为了“自动聚合”在 app 内再创建 `postgres-schema.ts`、`sqlite-schema.ts`，也不建议创建一个同时可达 PostgreSQL 与 SQLite 的共享 schema barrel。后续 schema 增长时，优先在 `@shamt/database` 保持模型归属清晰，再由各 runtime database capabilities creator 直接选择对应 runtime 的模型集合。

如果未来确实需要自动发现 schema，生成结果也必须是 runtime-specific 的产物：Cloudflare 生成文件只能引用 SQLite/D1 schema，Node 生成文件只能引用 PostgreSQL schema。

## Shopify Session Storage

Shopify session storage 是显式 `RuntimeCapabilities` 的典型例子。

业务上需要的是 Shopify `SessionStorage` port。具体 adapter 由 Shopify module 下的 runtime-specific session-storage factory 创建，runtime capabilities creator 只负责传入当前 runtime database：

| Runtime      | Session storage adapter                            |
| ------------ | -------------------------------------------------- |
| Node process | PostgreSQL-backed Shopify session storage          |
| Cloudflare   | app-owned D1/SQLite-backed Shopify session storage |

`@shopify/shopify-app-session-storage` 可以作为类型和接口语义来源。Postgres 与 SQLite/D1 adapter 分别收敛在 `shopify/session-storage/postgres.ts` 与 `shopify/session-storage/sqlite.ts`，避免通过一个 provider switch 同时触达 Node/PostgreSQL 和 Cloudflare/D1 实现。

这样可以避免 Cloudflare 入口因为复用 Node/PostgreSQL Shopify adapter 而把 `drizzle-orm/pg-core` 或 `PgTextBuilder` 带入 Worker bundle。

## 旧 registry 移除后的规则

旧 runtime capability registry 已从当前代码中移除。后续新增或调整 runtime 能力时，不再新增 `getRuntimeCapability(...)` / `setRuntimeCapability(...)` 名称，也不保留全局 registry 作为兼容桥。

维护规则：

1. 新增 runtime 能力先放进显式 `RuntimeCapabilities` 对象，不新增全局 registry 名称。
2. runtime entry 通过 `runtimeCapabilityNode(...)`、`runtimeCapabilityCloudflare(...)`、`runtimeCapabilityCloudflareQueue(...)` 或 `runtimeCapabilityCloudflareScheduled(...)` 创建当前 scope 的能力集合。
3. 业务模块先定义或复用 app capabilities port，再从 `runtimeCapabilities(c)` 或 queue/scheduler context 获取能力。
4. Node-only 与 Cloudflare-only adapter 只在对应 runtime capability creator 中引入，不通过共享 barrel 间接暴露。
5. 如果发现旧 registry 术语或 `getRuntimeCapability(...)` 示例，只能作为历史背景或反例保留，不能描述当前实现。

迁移完成后的业务代码应该能从函数参数、context variable 或明确的 `RuntimeCapabilities` 类型看出依赖了哪些能力，而不是需要搜索 `getRuntimeCapability(...)`。

## 新增 runtime 的判断路径

新增 runtime 或 provider 时按这个顺序做决定：

1. 这个能力是业务 port 还是 runtime adapter？
2. 该 runtime 是否能原生提供这个能力？
3. 该 adapter 是否会引入 runtime-only 依赖？
4. capabilities creator 是否能只 import 当前 runtime 安全的文件？
5. lifecycle 是 process-wide、request-bound，还是 event-bound？
6. 业务模块是否能继续只依赖 port？

如果答案需要业务模块知道 runtime/provider，说明边界放错了。把选择逻辑上移到 runtime capabilities creator。

## 验证

迁移或新增 runtime capabilities 后至少检查：

```bash
pnpm --dir apps/server run build
pnpm --dir apps/server run lint
```

Cloudflare 产物还应检查不包含 Node/PostgreSQL 依赖：

```bash
rg "PgTextBuilder|drizzle-orm/pg-core|@shamt/database/models/postgres|postgresShopifySessions|shopify-app-session-storage-drizzle.*postgres|node:" apps/server/dist
```

如果 production Wrangler 使用编译后产物作为 `main`，本地调试仍可以保留源码 `main`。`RuntimeCapabilities` 的目标不是依赖某个 bundler 技巧，而是让源码 import graph 本身就表达 runtime 边界。
