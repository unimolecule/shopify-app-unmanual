# Provider Lifecycle 决策

本文记录 `apps/server` 中 provider 的使用边界，以及为什么 provider 内部不再默认使用中心 `Map` registry。

## 决策

保留 `getEnvProvider()`、`getLoggerProvider()`、`getClientProvider()`、`getShopifyConfigProvider()` 这类 provider API，但 provider 模块内部优先使用 typed slot 保存自己的值、签名和生命周期状态。

provider 是生命周期入口，不是通用容器。调用方通过 provider 获取当前可用对象；provider 自己负责解析 env、计算 signature、复用缓存、重建实例和释放资源。

推荐形态：

```ts
type EnvProviderSlot = {
  signature: string;
  value: RuntimeConfig;
};

let envProviderSlot: EnvProviderSlot | undefined;

export function getEnvProvider(rawEnv?: unknown): RuntimeConfig {
  const signature = createSignature(rawEnv);

  if (envProviderSlot?.signature === signature) {
    return envProviderSlot.value;
  }

  const value = parseRuntimeConfig(rawEnv);
  envProviderSlot = { signature, value };
  return value;
}
```

不再推荐把不同 provider 的值统一放进一个中心 `Map`：

```ts
providers.set("env", config);
providers.get("env") as RuntimeConfig;
```

## 什么时候需要 Provider

需要 provider 的对象通常满足至少一个条件：

- 创建成本高，需要复用，例如 logger setup、HTTP client、Shopify config、database pool。
- 依赖 env，且 env 可能在 bootstrap、request 或 event 阶段变化。
- 需要按 signature 判断复用、重建或 reset。
- 启动期没有 request 时也要可用，例如 env 和 logger。
- 有明确的 dispose 生命周期，例如 logger、HTTP client、database pool。
- 需要隐藏 runtime 差异，例如 Node logger 与 Cloudflare logger 使用同一个 `getLoggerProvider()` 入口。

不需要 provider 的内容：

- 纯函数。
- 轻量 DTO。
- request-scoped 值本身。
- 没有缓存、reset、dispose 或 runtime 差异的对象。
- 已经由 `RuntimeCapabilities` 显式注入的业务 port adapter。

## 什么时候需要 Map

中心 `Map` 适合真正动态的 registry：

- key 集合运行时动态扩展，编译期无法列出。
- 插件或用户代码可以注册未知 provider。
- 需要按名字枚举、批量发现、动态覆盖。
- 值的类型天然是同一种接口，或者可以通过 discriminated union 安全区分。

如果 provider 集合是固定的，例如 `env`、`logger`、`client`、`shopifyConfig`，中心 `Map` 的收益通常不够。它会把类型擦成 union 或 `unknown`，调用点只能用 `as` 把类型补回来。

## 为什么去 Map

旧的中心 registry 同时保存多类 provider：

```ts
type ProviderInstances = {
  client: unknown;
  env: RuntimeConfig;
  shopifyConfig: unknown;
};

const providers = new Map<ProviderName, ProviderInstances[ProviderName]>();
```

这个结构有几个问题。

第一，类型收益不稳定。`providers.get("env")` 返回的是宽类型，调用点仍然需要 `as RuntimeConfig`。`client` 和 `shopifyConfig` 还会退回 `unknown`。

第二，值和签名分裂。值放在 `Map` 中，signature 放在各 provider 模块的局部变量中，维护者需要同时理解两个状态源。

第三，内部实现泄漏。测试或其它 provider 容易直接 `providers.set("env", value)`，绕过 `getEnvProvider()` 的解析和 signature 逻辑。

第四，dispose 的统一收益有限。当前 provider 数量固定，显式调用各 provider 的 reset/dispose 更清楚，也不会要求所有 provider 都进入同一个 registry。

因此本项目选择：

- provider API 保持统一。
- 每个 provider 模块自己持有 typed slot。
- signature 与 value 放在同一个 slot。
- middleware 只同步 request context 数据，不成为 env/logger 的权威来源。
- `RuntimeCapabilities` 只保存 runtime port，不保存 env/logger 快照。

## Env 的当前规则

`getEnvProvider()` 是 runtime config 的权威入口。

启动期：

```ts
const env = getEnvProvider();
```

request 期：

```ts
const env = getEnvProvider(c.env);
```

`runtimeEnvMiddleware()` 仍会在 request 进入时调用 `getEnvProvider(c.env)`，并把结果同步到 Hono context：

```ts
c.set("runtimeEnv", getEnvProvider(c.env));
```

这份 context 数据只用于兼容 Hono 变量和少量边界同步。业务代码需要 env 时优先直接调用 `getEnvProvider(...)`，不要从 `RuntimeCapabilities` 读取 env。

## Logger 的当前规则

`getLoggerProvider()` 是 logger 的权威入口。

启动期：

```ts
const logger = await getLoggerProvider();
```

request 期：

```ts
const logger = await getLoggerProvider(getEnvProvider(c.env));
```

`runtimeLoggerMiddleware()` 会在 request 进入时调用 provider，并把结果同步到 Hono context：

```ts
c.set("runtimeLogger", await getLoggerProvider(getEnvProvider(c.env)));
```

这份 context 数据只用于 request 管线同步，例如 `loggerMiddleware()` 读取当前 request logger。业务代码需要 logger 时优先直接调用 `getLoggerProvider(...)`，不要从 `RuntimeCapabilities` 读取 logger。

## RuntimeCapabilities 边界

`RuntimeCapabilities` 表示当前 runtime 显式提供给业务的 port，例如 database、bucket、queue、session storage、health checker、file resolver。

它不应该保存 env 或 logger 快照。runtime capability creator 可以接收 env 来创建 adapter，但返回对象不再携带 env 或 logger：

```ts
export function runtimeCapabilityCloudflare(options: {
  env: Record<string, unknown>;
  runtimeEnv: RuntimeConfig;
}): RuntimeCapabilities {
  const database = runtimeCapabilityLazy(() =>
    createIsolateDatabase(options.runtimeEnv, {
      d1: options.env[options.runtimeEnv.APP_DATABASE_D1_BINDING],
    }),
  );

  return {
    database,
    // other ports
  };
}
```

这样 env 的生命周期由 provider 管，runtime ports 的生命周期由 capabilities 管，两者不会互相复制状态。
