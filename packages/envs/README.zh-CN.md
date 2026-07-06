# @unimolecule/shopify-app-unmanual-envs

<p><a href="./README.md">English</a> | <strong>中文</strong></p>

## 目录

- [介绍](#介绍)
- [设计与架构](#设计与架构)
- [静态 Env 与运行时设置](#静态-env-与运行时设置)
- [与 @unimolecule/shopify-app-unmanual-app-env 的关系](#与-shamtapp-env-的关系)
- [输入与输出](#输入与输出)
- [构建产物](#构建产物)
- [使用方式](#使用方式)
- [单位约定](#单位约定)

## 介绍

`@unimolecule/shopify-app-unmanual-envs` 是基础环境常量与 Zod 配置 schema 包。它集中维护跨应用共享的默认值、运行环境枚举、运行时枚举、HTTP 状态码、响应默认结构、日志配置、缓存配置、数据库 URL 配置、Redis 配置、文件上传限制、请求限制等。

这个包不读取 `process.env`，也不负责判断当前部署平台，也不包含 Shopify app 专属 schema。它只提供可复用的常量、类型和 schema，让业务应用在自己的 bootstrap、runtime env provider 或中间件中完成实际解析。

## 设计与架构

`@unimolecule/shopify-app-unmanual-envs` 的设计目标是让环境配置有清晰边界：

- `constants`: 只放稳定默认值和枚举式常量，例如 `DEFAULT_ENVS`、`DEFAULT_RUNTIMES`、`HTTP_STATUS_CODES`、`RESPONSE_SUCCESS_CODE`。
- `configs`: 使用 Zod 描述可解析的环境变量结构，例如 `appConfigSchema`、`envConfigSchema`、`logConfigSchema`。
- `utils`: 提供 schema 组合工具，例如 `extendConfigSchema`。

Schema 只负责验证和默认值，不绑定 Node、Cloudflare Workers、Vercel 或 Bun。不同 runtime 可以把自己的 raw env 对象传入 schema，再得到统一的 typed config。

包内刻意使用 const object 而不是 TypeScript `enum`，这样运行时值与 TypeScript 字面量类型可以保持一致。

## 静态 Env 与运行时设置分析

`@unimolecule/shopify-app-unmanual-envs` 将 env 视为部署期配置。像 `APP_ENV`、`APP_RUNTIME`、secrets、Shopify 凭据、服务 endpoint、平台 bindings 这类值，应该在应用启动或请求 bootstrap 阶段解析，然后以 typed config 的方式传递给应用使用。

不要把 env 当成完整的动态配置系统。即使平台允许从控制台修改变量，应用代码也应该默认 env 变更属于运维变更，可能需要重新部署、新 isolate 或进程重启后，所有请求才能稳定读到同一个值。

如果某个值必须在不重新部署的前提下修改，应该单独设计运行时设置层：

- 将运行时设置存入 KV、D1、数据库表，或专门的远程配置服务。
- 使用应用自己的 Zod schema 校验设置内容后再使用。
- 在代码里保留 typed defaults；远程配置短暂不可用时，优先使用 last-known-good 值。
- 给运行时设置加短 TTL 缓存，避免每个请求都读取存储。
- 需要灰度发布或紧急开关时，使用 feature flags 或发布系统承载。

### 参考

#### Deploy-time env：随版本发布的配置

这是 12-factor 里的经典 env：数据库地址、Shopify app key、canonical host、资源句柄、第三方凭证等。它们“不同 deploy 可以不同”，但一般不期望在同一个已运行版本里频繁动态变更。12-factor 的核心是配置和代码分离，env 是 per-deploy 配置，而不是实时配置中心。参考：The Twelve-Factor App Config。<https://www.12factor.net/config> Cloudflare Workers 也是这个模型偏多：Dashboard 里加变量后，需要点 Deploy 才实现变更；Wrangler 文档还提醒，如果下次用 Wrangler deploy，可能覆盖 Dashboard 改动。也就是说这更像“配置变更触发一次新 Worker version/deploy”，不是传统意义上进程内热更新。参考 Cloudflare env 文档。
<https://developers.cloudflare.com/workers/configuration/environment-variables/>
<https://developers.cloudflare.com/workers/wrangler/configuration/>

#### Runtime config：不发版也要变的运行时配置

比如日志开关、采样率、某个业务阈值、临时降级策略、开关某个调用方，这类更适合放在“运行时配置存储”里，而不是 env 里。在 Cloudflare 里常见选择是：
KV：简单配置、允许最终一致性、读多写少。
D1：需要结构化、审计、查询。
R2：大配置或 JSON 文件。
远程配置服务：比如自建 config service。
Feature flag 服务：比如 OpenFeature/Unleash/LaunchDarkly/Statsig 等。
这类配置一般会有 TTL 缓存、版本号、默认值、校验 schema、fallback。OpenFeature 这类体系也强调本地缓存、定期刷新或事件刷新，避免每次请求都打远程服务。参考 OpenFeature 关于 server-side SDK 架构。
<https://openfeature.dev/blog/feature-flags-sdks-architectures>

#### Feature flags：发布和上线解耦

如果配置本质是“开/关某个功能”“对一部分店铺开启”“灰度比例”，它应该按 feature flag 管理，而不是 env。业内比较共识的是：feature flag 是动态的、面向运行时和用户/租户上下文；静态应用配置不要混进 flag 系统，否则后面会变成 flag 债。参考 Unleash / Octopus 的说明。
<https://docs.getunleash.io/guides/feature-flag-best-practices>
<https://octopus.com/devops/feature-flags/>

## 与 @unimolecule/shopify-app-unmanual-app-env 的关系

`@unimolecule/shopify-app-unmanual-envs` 只提供 runtime-neutral 的基础积木。当前 app 使用
`@unimolecule/shopify-app-unmanual-app-env` 聚合项目 schema，其中包含 `SHOPIFY_APP_MODE`、
`SHOPIFY_APP_FRONTEND_TARGET`、`SHOPIFY_APP_KEY`、`SCOPES` 等 Shopify 字段。

```ts
import { configSchema } from "@unimolecule/shopify-app-unmanual-app-env";

const config = configSchema.parse(process.env);
```

这种拆分可以让基础常量保持可复用，同时让 app 专属 env contract 独立演进，不把 Shopify 语义塞回基础包。

## 输入与输出

输入：

- 类环境变量对象，例如 `process.env`、Cloudflare Worker bindings，或应用层合并后的 runtime config 对象。
- 需要与共享 schema 组合的 Zod object schema。

输出：

- app、cache、database URL、env、file、logger、Redis 等配置的 Zod schema。
- `AppConfigSchema`、`EnvConfigSchema`、`LogConfigSchema` 等 TypeScript 推导类型。
- HTTP 状态码、响应默认值、content type、runtime 名称、env 名称、请求限制、超时时间、大小限制等共享常量。

## 构建产物

这个包通过 `tsdown --config ./build.config.ts` 构建。

| 发布字段 / export     | 输出路径                     |
| --------------------- | ---------------------------- |
| `main`                | `dist/index.cjs`             |
| `module`              | `dist/index.mjs`             |
| `types`               | `dist/index.d.mts`           |
| `.` import            | `dist/index.mjs`             |
| `.` require           | `dist/index.cjs`             |
| `./constants` import  | `dist/constants/index.mjs`   |
| `./constants` require | `dist/constants/index.cjs`   |
| `./constants` types   | `dist/constants/index.d.mts` |

根入口不再重新导出 `./constants`；消费者只需要稳定常量时，应从
`@unimolecule/shopify-app-unmanual-envs/constants` 导入。workspace 源码 exports 仍指向 `src/*`，发布用
`publishConfig.exports` 指向构建后的 `dist/*` 文件。

## 使用方式

解析标准 runtime env 字段：

```ts
import { envConfigSchema } from "@unimolecule/shopify-app-unmanual-envs";

const config = envConfigSchema.parse({
  APP_ENV: "development",
  APP_RUNTIME: "cloudflare",
});

config.APP_ENV; // "development"
config.APP_RUNTIME; // "cloudflare"
```

组合通用配置 schema：

```ts
import {
  appConfigSchema,
  envConfigSchema,
  extendConfigSchema,
} from "@unimolecule/shopify-app-unmanual-envs";
import { z } from "zod";

const serverSchema = extendConfigSchema(
  extendConfigSchema(envConfigSchema, appConfigSchema),
  z.object({
    SERVICE_NAME: z.string().min(1),
  }),
);

const serverConfig = serverSchema.parse(process.env);
```

使用共享 HTTP 状态码与响应默认值：

```ts
import {
  HTTP_STATUS_CODES,
  RESPONSE_SUCCESS_CODE,
  RESPONSE_SUCCESS_MESSAGE,
  RESPONSE_SUCCESS_OK,
} from "@unimolecule/shopify-app-unmanual-envs";

const response = {
  code: RESPONSE_SUCCESS_CODE,
  message: RESPONSE_SUCCESS_MESSAGE,
  success: RESPONSE_SUCCESS_OK,
  data: { status: HTTP_STATUS_CODES.OK.phrase },
};
```

使用 runtime 常量，避免散落字符串字面量：

```ts
import {
  DEFAULT_RUNTIMES,
  type DEFAULT_RUNTIMES_VALUES,
} from "@unimolecule/shopify-app-unmanual-envs";

function isCloudflare(runtime: DEFAULT_RUNTIMES_VALUES) {
  return runtime === DEFAULT_RUNTIMES.CLOUDFLARE;
}
```

使用文件上传默认配置：

```ts
import { fileConfigSchema } from "@unimolecule/shopify-app-unmanual-envs";

const fileConfig = fileConfigSchema.parse({});

fileConfig.APP_FILE_DIR; // "files"
fileConfig.APP_FILE_MAX_SIZE; // 10485760
fileConfig.APP_FILE_UPLOAD_MULTIPLE_SIZE; // 10
```

## 单位约定

1. 时间单位默认均为毫秒。
2. 文件大小与内存大小单位默认均为字节。
