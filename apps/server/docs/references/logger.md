# Logger Design

本文说明服务端 logger 的生命周期和 runtime sink 策略。业务代码不直接初始化 LogTape，优先通过 `getLoggerProvider()` 获取 logger。Hono middleware 会把当前 request logger 同步到 `runtimeLogger`，供日志 middleware 等 request 管线使用。

## 两个阶段

### Bootstrap Logger

启动阶段还没有 Hono context，也不一定有 Cloudflare binding，因此 bootstrap logger 必须简单可靠：

- console-only
- 不依赖文件系统
- 不依赖 request context
- 不读取平台 binding

入口：

```ts
await getLoggerProvider();
```

对应代码：

- `src/infra/provider/logger.ts`
- `src/infra/logger/index.ts`

### Runtime Logger

runtime entry 拿到已校验的 `runtimeEnv` 后，通过 logger provider 配置或复用 runtime logger：

```ts
const logger = await getLoggerProvider(runtimeEnv);
const capabilities = runtimeCapabilityCloudflare({
  env,
  runtimeEnv,
});
```

request middleware 顺序固定为：

```ts
runtimeEnvMiddleware(); // getEnvProvider(c.env), c.set("runtimeEnv")
runtimeLoggerMiddleware(); // getLoggerProvider(getEnvProvider(c.env)), c.set("runtimeLogger")
runtimeCapabilitiesContextMiddleware(); // sync runtime ports into context
loggerMiddleware();
requestMiddleware();
```

`RuntimeCapabilities` 不保存 logger 快照。业务代码需要 logger 时优先使用：

```ts
const logger = await getLoggerProvider(getEnvProvider(c.env));
```

## Provider 行为

logger provider 使用 typed provider slot 和 signature 避免普通请求反复 reset LogTape：

- 无 config 调用 `getLoggerProvider()` 时，如果 provider 中还没有 logger，会配置 bootstrap logger。
- 已有 logger 时，无 config 调用直接返回当前 logger，不会把 runtime logger 降回 bootstrap logger。
- 传入 `RuntimeConfig` 时，provider 按 runtime 分发到 process 或 isolate logger setup。
- 同一 signature 的并发 setup 会复用同一个 setup promise。

只有以下情况会重新配置：

- 从 bootstrap 阶段切到 runtime 阶段。
- provider 被 reset 或 dispose 后重新初始化。
- logger 配置 DTO 的签名发生变化。

logger provider 不使用全量 env 签名，而是只从 `RuntimeConfig` 中投影 logger 实际消费的字段：

- `APP_RUNTIME`
- `APP_ENV`
- `APP_LOGGER_DIR`
- `APP_LOGGER_LEVEL`
- `APP_LOGGER_EXPIRE`
- `APP_LOGGER_MAX_SIZE`

这能避免 file、database、Shopify 等无关配置变化时重复 reset LogTape。

## Runtime Sink

| Runtime             | Sink 策略                     |
| ------------------- | ----------------------------- |
| Cloudflare isolate  | console-only                  |
| Node non-production | console-only                  |
| Node production     | console + rotating file sinks |

Node production 文件日志只在 process logger 中动态引入 Node-only 依赖：

- `node:fs/promises`
- `node:path`
- `node:url`
- `@logtape/file`

Process runtime entry 通过 `registerProcessLoggerSetup(setupProcessLogger)` 把 process logger setup 注册到 logger provider；Cloudflare entry 不引入 `src/infra/logger/process.ts`。这些 Node-only 依赖不会出现在 Cloudflare isolate entry 的静态 import graph 中。

对应文件：

- `src/infra/logger/shared.ts`
- `src/infra/logger/isolate.ts`
- `src/infra/logger/process.ts`
- `src/infra/provider/logger.ts`
- `src/app/runtime/process/node/index.ts`
- `src/app/runtime/isolate/cloudflare/index.ts`
- `src/app/runtime/process/node/runtime-capabilities.ts`
- `src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`

## Error Lifecycle

全局错误处理优先使用 logger provider：

```ts
const logger = await getLoggerProvider(getEnvProvider(c.env));
```

如果错误发生在 runtime logger 注入之前，会回退到无 config 的 `getLoggerProvider()` bootstrap logger。错误响应规则见 [error.md](./error.md)。

## 规则

1. 业务代码不要直接调用 LogTape `configure()`。
2. 有 Hono context 时优先使用 `getLoggerProvider(getEnvProvider(c.env))`。
3. 没有 context 的启动期代码使用 `getLoggerProvider()`。
4. Cloudflare/isolate 不写本地日志文件。
5. Node-only 文件日志能力只放在 process logger 中，并由 `getLoggerProvider(runtimeEnv)` 按 runtime 分发触发。
