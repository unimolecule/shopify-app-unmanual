# Queue

`apps/server/src/infra/queue` 是多 runtime 的队列基础设施层。它把业务模块和具体队列后端隔开：业务只注册 job、投递 `QueueMessage`，运行时决定使用 `pg-boss` 还是 Cloudflare Queues。

## 设计目标

- Node runtime 使用 `pg-boss`。
- Cloudflare runtime 使用 Cloudflare Queues。
- Consumer 统一按 batch 消费，即使业务 job 默认按单条消息处理。
- Queue message 只携带小 payload，例如 `exportId`、`shopDomain`、`requestId`，不携带商品数据、文件内容或 CSV。
- Queue 只负责触发和重试；业务状态以数据库为事实源。
- Queue consumer 不提前创建数据库、bucket、Shopify client。业务 job 需要时自己按需创建。

## Provider 矩阵

Provider 来自 `APP_QUEUE_PROVIDER`：

| Runtime      | Provider  | 支持 |
| ------------ | --------- | ---- |
| `node`       | `pg-boss` | 是   |
| `node`       | `queues`  | 否   |
| `cloudflare` | `queues`  | 是   |
| `cloudflare` | `pg-boss` | 否   |

默认值：

| Runtime      | 默认 provider |
| ------------ | ------------- |
| `node`       | `pg-boss`     |
| `cloudflare` | `queues`      |

Node + `pg-boss` 还要求：

```text
APP_DATABASE_PROVIDER=postgres
```

因为 `pg-boss` 使用 PostgreSQL 存储队列状态。Node + D1 不支持当前队列能力。

## 配置

队列配置定义在 `packages/app-env/src/configs/queue.ts`：

```ts
APP_QUEUE_PROVIDER;
APP_QUEUE_NAME;
APP_QUEUE_BINDING;
APP_QUEUE_CONSUMER_MAX_BATCH_SIZE;
APP_QUEUE_CONSUMER_MAX_RETRIES;
```

字段说明：

| Env                                 | 说明                                  |
| ----------------------------------- | ------------------------------------- |
| `APP_QUEUE_PROVIDER`                | `pg-boss` 或 `queues`                 |
| `APP_QUEUE_NAME`                    | 队列命名空间，默认 `default`          |
| `APP_QUEUE_BINDING`                 | Cloudflare Queue binding 名称         |
| `APP_QUEUE_CONSUMER_MAX_BATCH_SIZE` | consumer 每批最多处理多少条，默认 `1` |
| `APP_QUEUE_CONSUMER_MAX_RETRIES`    | 平台重试次数配置来源，默认 `3`        |

Node 下实际 `pg-boss` queue 名使用：

```text
{APP_QUEUE_NAME}:{message.name}
```

例如：

```text
default:product-export:start
```

Cloudflare 下所有 job 走同一个 Queue binding，通过 `message.name` 在应用内路由。

## Message

队列消息统一使用 `QueueMessage`：

```ts
type QueueMessage = {
  name: string;
  payload: Record<string, unknown>;
  requestId?: string;
  version: number;
};
```

示例：

```ts
await queue.enqueue({
  name: "product-export:start",
  payload: {
    exportId,
    shopDomain,
  },
  requestId,
  version: 1,
});
```

投递选项：

```ts
type QueueEnqueueOptions = {
  delaySeconds?: number;
  idempotencyKey?: string;
  maxAttempts?: number;
};
```

映射关系：

| 选项             | Node `pg-boss` | Cloudflare Queues |
| ---------------- | -------------- | ----------------- |
| `delaySeconds`   | `startAfter`   | `delaySeconds`    |
| `idempotencyKey` | `singletonKey` | 当前不使用        |
| `maxAttempts`    | `retryLimit`   | 当前不使用        |

## Producer

业务代码不要直接 import `pg-boss` 或 Cloudflare Queue binding，而是通过 `runtimeCapabilities.queue.producer()` 获取 producer。

接口：

```ts
interface QueueProducer {
  enqueue: (
    message: QueueMessage,
    options?: QueueEnqueueOptions,
  ) => Promise<void>;
  enqueueBatch: (
    messages: QueueMessage[],
    options?: QueueEnqueueOptions,
  ) => Promise<void>;
}
```

运行时实现：

| Runtime      | Adapter                   |
| ------------ | ------------------------- |
| `node`       | `PgBossQueueProducer`     |
| `cloudflare` | `CloudflareQueueProducer` |

`pg-boss` 在 Node adapter `infra/queue/process.ts` 内动态加载，避免 Cloudflare bundle 静态引入 Node-only queue 依赖。`infra/queue/index.ts` 只导出 registry、consumer 和共享类型；Node/Cloudflare adapter 由对应 runtime capability 显式引入。

## Job 注册

业务模块通过 registry 注册 job：

```ts
registerQueueJob({
  name: "product-export:start",
  handler: async (payload, context) => {
    // 按需创建 database/bucket/shopify client
  },
});
```

默认是单条消息 handler：

```ts
type QueueJobHandler = (
  payload: Record<string, unknown>,
  context: QueueJobContext,
) => Promise<void>;
```

需要批处理时显式注册 batch job：

```ts
registerQueueJob({
  name: "analytics:event",
  mode: "batch",
  batchHandler: async (messages, context) => {
    // messages 是同名 job 的 QueueMessage[]
  },
});
```

`QueueJobContext` 保持很薄：

```ts
type QueueJobContext = {
  bindings?: Record<string, unknown>;
  logger: Logger;
  runtimeEnv: RuntimeConfig;
};
```

Cloudflare consumer 会把 `env` 放进 `bindings`。业务 job 如果需要 D1、R2 或 Queue binding，应在 job 内按需解析 binding 并创建对应 adapter。

## Consumer

Consumer 抽象统一由 `infra/queue` 创建，并通过 runtime capability 暴露给 process/cloudflare entry：

```ts
interface QueueConsumer {
  consume: (batch: unknown, context: QueueJobContext) => Promise<void>;
  start: (context: QueueJobContext) => Promise<void>;
  stop: () => Promise<void>;
}
```

底层共享 batch 消费函数仍然是：

```ts
consumeQueueBatch(batch, context);
```

行为：

- 按 `message.body.name` 分组。
- 未注册 job 返回 `retry`，错误值是 `internalServerError("Unknown queue job", ...)`。
- 单条 job 逐条执行，单条失败只 retry 该消息。
- batch job 按同名消息整组执行，batch handler 抛错时整组 retry。
- 成功消息返回 `ack`。

### Node consumer

Node 启动时从 runtime capability 取得 consumer：

```ts
const runtimeCapabilities = runtimeCapabilityNode({ logger, runtimeEnv: env });
const queueConsumer = await runtimeCapabilities.queue.consumer();

await queueConsumer?.start({
  logger,
  runtimeCapabilities,
  runtimeEnv: env,
});
```

如果当前没有注册任何 job，consumer 是 no-op，不会打开 `pg-boss` 连接。

有注册 job 时，Node consumer 会：

1. 动态 import `pg-boss`。
2. 按注册 job 创建 polling consumer。
3. 使用 `boss.fetch(queueName, { batchSize, includeMetadata: true })` 拉取 batch。
4. 调用共享 `consumeQueueBatch`。
5. 成功调用 `boss.complete(...)`。
6. 失败调用 `boss.fail(...)`，由 `pg-boss` 负责重试。

shutdown 时由 `runtimeCapabilityNodeDispose()` 停止 queue consumer 并释放 queue producer。
queue producer 和 consumer 都有 dispose 入口。process 侧会停止/释放缓存的
`pg-boss` 实例；isolate 侧 producer/consumer 当前以 event/request binding 为边界，
`disposeIsolateQueueProducer()` 和 `disposeIsolateQueueConsumer()` 是预留 no-op。

### Cloudflare consumer

Cloudflare Worker export 增加：

```ts
export default {
  async queue(batch, env) {
    const runtimeCapabilities = runtimeCapabilityCloudflareQueue({
      env,
      logger: context.logger,
      runtimeEnv: context.runtimeEnv,
    });
    const queueConsumer = await runtimeCapabilities.consumer();

    await queueConsumer?.consume(batch, context);
  },
};
```

Cloudflare consumer 会：

1. 通过 `getEnvProvider(env)` 解析本次 event 的 runtime config。
2. 通过 `getLoggerProvider(runtimeEnv)` 初始化或复用 runtime logger。
3. 把 `env` 放入 `QueueJobContext.bindings`。
4. 过滤非法 message body；非法消息直接 `ack()`，避免毒消息无限重试。
5. 调用共享 `consumeQueueBatch`。
6. 成功消息 `message.ack()`。
7. 失败消息 `message.retry()`。

`bindings` 保存原始 `env`，供业务 job 在需要 D1、R2 或 Queue
binding 时按需创建 adapter。

建议 Cloudflare v1 先配置：

```json
{
  "max_batch_size": 1,
  "max_retries": 3
}
```

代码按 batch 写，后续可以提高 batch size。

## 业务边界

Queue infra 不负责业务资源创建。不要在 consumer 入口默认创建：

- database
- bucket
- Shopify Admin client
- file resolver
- product-export service

业务 job 需要什么就自己创建什么。这样可以避免每个 batch 都携带过重 context，也能让每个 module 明确自己的 runtime 依赖。

## 推荐约定

- 所有 job 必须幂等。
- payload 必须小于平台限制，Cloudflare Queue 单条消息限制尤其要注意。
- payload 只放 ID 和小标量。
- DB 记录是事实源，Queue message 不是事实源。
- `APP_QUEUE_NAME` 作为命名空间，不作为业务 job 名。
- job 名使用模块前缀，例如：

```text
product-export:start
product-export:generate-csv
product-export:reconcile
product-metadata:generate
```

## 测试

聚焦 queue 测试：

```bash
pnpm -F @unimolecule/shopify-app-unmanual-server exec vitest run tests/queue-consumer.test.ts
```

类型检查：

```bash
pnpm -F @unimolecule/shopify-app-unmanual-server exec tsc --noEmit
```

当前测试覆盖：

- single job 路由与 ack
- batch job 分组与 ack
- 未注册 job retry
- 单条 job 局部失败只 retry 失败消息
- batch handler 失败时整组 retry
- runtime/provider 能力矩阵
- Node `pg-boss` 必须搭配 postgres
- Cloudflare producer `send/sendBatch` 参数映射
