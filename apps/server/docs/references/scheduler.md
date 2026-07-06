# Scheduler

`apps/server/src/infra/scheduler` 是多 runtime 的定时任务基础设施层。它把业务 scheduled task 和具体运行时后端隔开：Node 使用 `pg-boss schedule`，Cloudflare 使用 Cron Triggers。

## 设计目标

- Node runtime 使用 `pg-boss` 承载定时任务。
- Cloudflare runtime 使用 Cron Triggers。
- Scheduler 只负责触发定时任务，不提前创建 database、bucket、Shopify client。
- 业务 task 需要资源时，在 handler 内按需创建。
- 定时任务适合做 reconcile、补偿、清理，不作为长任务主链路。

## Provider 矩阵

Provider 来自 `APP_SCHEDULER_PROVIDER`：

| Runtime      | Provider        | 支持 |
| ------------ | --------------- | ---- |
| `node`       | `pg-boss`       | 是   |
| `node`       | `cron-triggers` | 否   |
| `cloudflare` | `cron-triggers` | 是   |
| `cloudflare` | `pg-boss`       | 否   |

默认值：

| Runtime      | 默认 provider   |
| ------------ | --------------- |
| `node`       | `pg-boss`       |
| `cloudflare` | `cron-triggers` |

Node + `pg-boss` 要求：

```text
APP_DATABASE_PROVIDER=postgres
```

原因是 `pg-boss` 的 schedule 能力基于 PostgreSQL。Node + D1 不支持当前 scheduler provider。

## 配置

配置定义在 `packages/app-env/src/configs/scheduler.ts`：

```ts
APP_SCHEDULER_PROVIDER;
APP_SCHEDULER_CRON_VALUE;
```

字段说明：

| Env                        | 说明                                     |
| -------------------------- | ---------------------------------------- |
| `APP_SCHEDULER_PROVIDER`   | `pg-boss` 或 `cron-triggers`             |
| `APP_SCHEDULER_CRON_VALUE` | 默认 cron 值，业务也可以自定义 task cron |

Cloudflare Cron Triggers 的实际 cron 列表由 Wrangler 配置决定。当前
`scripts/write-wrangler-file` 会在 `APP_RUNTIME=cloudflare` 且
`APP_SCHEDULER_PROVIDER=cron-triggers` 时读取 `APP_SCHEDULER_CRON_VALUE`，并写入
`triggers.crons[]`。

## Task 注册

业务模块通过 registry 注册 scheduled task：

```ts
registerSchedulerTask({
  name: "product-export:reconcile",
  cron: "*/5 * * * *",
  handler: async (context) => {
    // 按需创建 database/bucket/queue/shopify client
  },
});
```

`SchedulerTaskContext` 很薄：

```ts
type SchedulerTaskContext = {
  bindings?: Record<string, unknown>;
  cron?: string;
  logger: Logger;
  runtimeEnv: RuntimeConfig;
};
```

Cloudflare scheduled handler 会把 `env` 放入 `bindings`，并把本次触发的 cron 值放入 `cron`。

重复注册 task 是启动期不变量错误，会直接 fail-fast。执行期 task 抛出的错误由具体 runtime scheduler 处理和记录。

## Node scheduler

Node 启动时从 runtime capability 取得 scheduler：

```ts
const runtimeCapabilities = runtimeCapabilityNode({ logger, runtimeEnv: env });
const scheduler = await runtimeCapabilities.scheduler();

await scheduler?.start({
  logger,
  runtimeCapabilities,
  runtimeEnv: env,
});
```

如果没有注册 task，scheduler 是 no-op，不会打开 `pg-boss` 连接。

有注册 task 时，Node scheduler 会：

1. 动态 import `pg-boss`。
2. 调用 `boss.schedule(task.name, task.cron, { name: task.name })`。
3. 调用 `boss.work(task.name, handler)` 执行 task。
4. shutdown 时调用 `boss.offWork(task.name)`。

`pg-boss` 实例会缓存，`runtimeCapabilityNodeDispose()` 会调用 scheduler disposer，并停止实例。`infra/scheduler/index.ts` 只导出 registry 和共享类型；Node/Cloudflare scheduler adapter 由对应 runtime capability creator 显式引入。

## Cloudflare scheduler

Cloudflare Worker export 增加：

```ts
export default {
  async scheduled(controller, env) {
    const runtimeCapabilities = runtimeCapabilityCloudflareScheduled({
      cron: controller.cron,
      env,
      logger: context.logger,
      runtimeEnv: context.runtimeEnv,
    });
    const scheduler = await runtimeCapabilities.scheduler();

    await scheduler?.run(controller.cron, context);
  },
};
```

Cloudflare scheduler 会：

1. 通过 `getEnvProvider(env)` 解析本次 event 的 runtime config。
2. 通过 `getLoggerProvider(runtimeEnv)` 初始化或复用 runtime logger。
3. 把 `env` 放入 `SchedulerTaskContext.bindings`。
4. 按 `controller.cron` 查找同 cron 的 task。
5. 并发执行匹配 task。

只有注册 task 的 `cron` 和 `controller.cron` 完全一致时才会执行。

Cloudflare scheduler 当前以 event binding 为边界，`disposeIsolateScheduler()` 是预留 no-op。process scheduler disposer 会停止缓存的 `pg-boss` schedule worker。

Wrangler 配置示例：

```json
{
  "triggers": {
    "crons": ["*/5 * * * *"]
  }
}
```

## 业务边界

Scheduler infra 不负责业务资源创建。不要在 scheduler 入口默认创建：

- database
- bucket
- queue producer
- Shopify Admin client
- product service

业务 task 需要什么资源，就在 handler 内显式创建什么。这样可以避免每次 cron 触发都带过重 context，也能让 module 自己声明 runtime 依赖。

## 推荐约定

- task 必须幂等。
- task 不应执行大规模长任务，应 enqueue job 或做小规模 reconcile。
- task 名使用模块前缀，例如：

```text
product-export:reconcile
file:cleanup-expired
shopify:refresh-webhook-subscriptions
```

- Cloudflare Cron Triggers 是平台配置，应用 registry 只是运行时路由。
- Node 和 Cloudflare 的 cron 字符串应保持一致，避免同一个 task 在两个 runtime 表现不同。

## 测试

聚焦 scheduler 测试：

```bash
pnpm -F @shamt/server exec vitest run tests/scheduler.test.ts
```

类型检查：

```bash
pnpm -F @shamt/server exec tsc --noEmit
```

当前测试覆盖：

- Node 默认 provider 是 `pg-boss`
- Cloudflare 默认 provider 是 `cron-triggers`
- runtime/provider 能力矩阵
- Node `pg-boss` 必须搭配 postgres
- registry 能按 cron 查找 task
- Cloudflare scheduled 只运行匹配 cron 的 task
