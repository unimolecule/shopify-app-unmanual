# Runtime Infra Entrypoints 决策

本文记录 `apps/server/src/infra/*/index.ts` 与 runtime capability 的拆分决策。它是架构 guide，不是接口 reference。

## 决策

`infra/*/index.ts` 只作为共享契约入口，不负责按 runtime 分发具体实现。

runtime-specific 实现由对应 runtime capability creator 显式引入：

| Runtime            | Capability 创建位置                                                      |
| ------------------ | ------------------------------------------------------------------------ |
| Node process       | `apps/server/src/app/runtime/process/node/runtime-capabilities.ts`       |
| Cloudflare isolate | `apps/server/src/app/runtime/isolate/cloudflare/runtime-capabilities.ts` |

公共 `infra/*/index.ts` 可以导出：

- shared types
- shared constants
- provider/env strategy parser
- registry API
- runtime-neutral helper

公共 `infra/*/index.ts` 不导出：

- `createXxx(config)` 这种内部再判断 runtime 的工厂
- `disposeXxx(config)` 这种内部再判断 runtime 的 disposer
- `await import("./process")`
- `await import("./isolate")`

## 原因

Cloudflare build 会静态分析入口可达的动态 import。即使业务代码运行时只会走 isolate 分支，只要 Cloudflare 入口间接 import 了一个公共 `infra/*/index.ts`，bundler 仍可能看到 `./process` 分支，并把 Node-only 模块纳入分析。

这会导致类似问题：

- `src/infra/bucket/process.ts` 被 Cloudflare build 分析。
- `node:fs`、`node:path`、`node:stream` 等 Node 内置模块出现 unresolved warning。
- 业务模块为了避开 warning 被迫知道 Node/Cloudflare 细节。

把 runtime 分发移动到 runtime capability creator 后，Cloudflare 入口只显式 import isolate 实现，Node 入口只显式 import process 实现。业务模块继续只依赖 `RuntimeCapabilities`，不直接依赖 runtime 实现。

## 当前边界

`infra/bucket/index.ts` 保留共享 bucket 契约和下载签名 helper：

```text
apps/server/src/infra/bucket/index.ts
apps/server/src/infra/bucket/shared.ts
apps/server/src/infra/bucket/r2-signed-url.ts
```

runtime 实现分别在：

```text
apps/server/src/infra/bucket/process.ts
apps/server/src/infra/bucket/isolate.ts
```

`infra/database/index.ts`、`infra/queue/index.ts`、`infra/scheduler/index.ts` 同理只保留共享导出和类型。具体创建与销毁逻辑放在：

```text
apps/server/src/app/runtime/process/node/runtime-capabilities.ts
apps/server/src/app/runtime/isolate/cloudflare/runtime-capabilities.ts
```

## Runtime Capabilities Context

HTTP request 通过 Hono `runtimeCapabilities` variable 读取 scoped 能力：

```ts
runtimeCapabilities(c).database();
runtimeCapabilities(c).bucket();
runtimeCapabilities(c).file.downloadResolver();
runtimeCapabilities(c).queue.producer();
```

Queue 和 Scheduler context 也携带同一个 `RuntimeCapabilities` 对象，因此后台任务可以直接读取：

```ts
type QueueJobContext = {
  runtimeCapabilities: RuntimeCapabilities;
  runtimeEnv: RuntimeConfig;
};
```

这样业务 service、HTTP route、Queue job 和 Scheduler task 都不需要读取全局 registry，也不会依赖 Hono 以外的伪造 context。

## 新增 Infra 能力的规则

新增 `infra/foo` 时按以下规则放置代码：

| 内容                                      | 放置位置                                      |
| ----------------------------------------- | --------------------------------------------- |
| 共享接口、类型、strategy parser           | `infra/foo/index.ts` 或 `infra/foo/shared.ts` |
| Node-only 实现                            | `infra/foo/process.ts`                        |
| Cloudflare-only 实现                      | `infra/foo/isolate.ts`                        |
| runtime 选择、binding 校验、disposer 注册 | `app/runtime/*/runtime-capabilities.ts`       |
| 业务模块调用                              | `runtimeCapabilities(c).foo` 或 context 能力  |

不要在业务 service、controller、queue job 中写：

```ts
if (isCloudflareRuntime(config)) {
  // create isolate infra
} else {
  // create process infra
}
```

这类 runtime 分支应该留在 runtime capability creator。

## Binding 校验

Cloudflare binding 不在 module import 阶段校验。它们在 capability 使用点通过 env 中配置的 binding name 动态读取并强校验。

示例：

```ts
requireConfiguredCloudflareBinding(
  context.bindings ?? {},
  context.runtimeEnv.APP_BUCKET_R2_BINDING,
  "APP_BUCKET_R2_BINDING",
  isCloudflareR2Bucket,
);
```

这样 bootstrap 和 route metadata import 不会因为 request-bound binding 尚未出现而失败，但真正使用 D1、R2 或 Queue 时会快速失败。

## 检查项

修改 runtime infra 后至少检查：

```bash
rg "await import\\([\"']\\./(process|isolate)[\"']\\)" apps/server/src/infra
rg "backgroundBucketFactory|createDatabase\\(|createQueueProducer\\(|createScheduler\\(" apps/server/src
pnpm --dir apps/server run build
```

`build` 会同时输出 `dist/process/node` 与 `dist/isolate/cloudflare`。Cloudflare isolate 构建不应出现来自 `infra/*/process.ts` 的 Node 内置模块 unresolved warning。
