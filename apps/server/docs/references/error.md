# Error Design

本文说明服务端错误处理边界。目标是让业务错误、Zod 错误、Hono 错误、上游请求错误和未知异常都进入同一套响应格式。

## 响应格式

错误响应保持简单：

```json
{
  "code": 400,
  "message": "Invalid shop domain",
  "success": false,
  "data": null,
  "requestId": "..."
}
```

字段说明：

- `code`: HTTP status code。
- `message`: 对外返回的错误说明。
- `success`: 固定为 `false`。
- `data`: 错误响应中默认为 `null`。
- `requestId`: 当前请求 ID。
- `details`: 仅非 production 环境返回，用于调试。

项目不维护额外业务错误码。需要稳定区分错误时，使用稳定的 `message`。

## AppError

`AppError` 是统一错误模型：

```ts
type AppErrorOptions = {
  message?: string;
  status?: number;
  expose?: boolean;
  data?: unknown | null;
  details?: Record<string, unknown>;
  headers?: Record<string, string>;
};
```

约定：

- `status` 决定 HTTP 响应码。
- `code` 等于 `status`。
- `expose` 决定是否返回原始 `message`。
- `details` 放调试信息，包括原始错误 `cause`。
- 原始错误不要放在顶层字段，统一放进 `details.cause`。

## 错误工厂

业务代码通过 HTTP 标准错误工厂抛错：

```ts
throw badRequestError("Invalid shop domain");
throw unauthorizedError("Invalid session token");
throw badGatewayError("Token exchange failed", {
  details: {
    cause: error,
    message: error instanceof Error ? error.message : String(error),
  },
});
```

常用工厂：

- `badRequestError`
- `unauthorizedError`
- `forbiddenError`
- `notFoundError`
- `unprocessableEntityError`
- `timeoutError`
- `conflictError`
- `payloadTooLargeError`
- `rateLimitError`
- `badGatewayError`
- `serviceUnavailableError`
- `internalServerError`

工厂只负责选择 HTTP status 和默认 `expose` 策略。业务语义由调用方写入 `message`。

## normalizeError

`normalizeError` 负责把任意 thrown value 转成 `AppError`：

- `AppError`: 原样返回。
- `HttpRequestError`: timeout/abort 转 `408`，其他上游错误转 `502`。
- `ZodError`: 转 `422 Validation failed`。
- `HTTPException`: 保留 Hono status 和 message。
- 未知错误: 转 `500 Unhandled application error`。

对应文件：

- `src/shared/exceptions/normalize.ts`
- `src/shared/exceptions/errors.ts`
- `src/shared/models/error.ts`

## Lifecycle

Hono 统一错误入口：

- `src/app/lifecycle/error.ts`
- `src/app/lifecycle/not-found.ts`
- `src/app/runtime/process/node/register-process-exceptions.ts`

`app.onError` 流程：

1. `normalizeError(error)`。
2. 使用 `runtimeLogger` 记录错误；如果 runtime logger 不可用，动态引入默认 logger。
3. `createErrorResponse(c, appError)` 返回 JSON。

`app.notFound` 复用同一套响应生成逻辑。

process runtime 还有进程级异常入口：

1. `unhandledRejection` 和 `uncaughtException` 先调用 `normalizeError(...)`。
2. logger 记录 `code`、`status`、`message` 和 `details`。
3. `uncaughtException` 在非 development 环境继续 `process.exit(1)`。

这个入口只负责结构化日志和进程生命周期，不生成 HTTP response，也没有 Hono
`Context`、request id、path 或 method。

## 捕捉边界

同样是 `throw`，捕捉位置取决于它发生在哪条执行链路。

### 注册期错误

Queue job 和 scheduler task 的重复注册属于启动期不变量错误：

```ts
throwError(`Queue job already registered: ${job.name}`);
throwError(`Scheduler task already registered: ${task.name}`);
```

这类错误通常发生在 `registerJobs()` 或模块 bootstrap 阶段。它不走
`app.onError`，因为此时还不是 HTTP request。

Node process 下，如果错误发生在 process exception handler 注册之后，并且变成
`unhandledRejection` 或 `uncaughtException`，会被
`registerProcessExceptions()` 捕捉、normalize 并记录日志。但当前启动顺序中
`registerJobs()` 早于 `registerProcessExceptions()`，同步重复注册会直接让启动失败。

Cloudflare 下，`registerJobs()` 在 Worker module 初始化阶段执行。重复注册会导致
Worker module 初始化失败，也不会进入 Hono `app.onError`。

这类错误应保持 fail-fast，用来暴露重复 import、重复注册或启动配置问题。

### HTTP 请求链路

HTTP request 内抛出的错误最终由 Hono `app.onError` 捕捉：

```ts
try {
  await getProducts(c.var.shopifyAdminClient);
} catch (error) {
  if (error instanceof AppError) throw error;

  throw badGatewayError("Failed to fetch products", {
    details: {
      cause: error,
    },
  });
}
```

这里的 `throw error` 或 `throw xxxError(...)` 都会沿着 Hono middleware/controller
链路冒泡，进入：

```ts
app.onError((error, c) => {
  const appError = normalizeError(error);
  return createErrorResponse(c, appError);
});
```

因此 HTTP 链路可以依赖统一响应格式。

### Queue 执行链路

Queue job 内抛出的错误不会进入 `app.onError`。它会被
`consumeQueueBatch(...)` 捕捉并转成 retry 结果：

```ts
try {
  await job.handler(message.body.payload, context);
  results.push({ action: "ack", id: message.id });
} catch (error) {
  results.push({ action: "retry", error, id: message.id });
}
```

之后由 runtime adapter 映射到平台行为：

- Node `pg-boss`: 失败消息调用 `boss.fail(...)`，由 `pg-boss` 负责重试。
- Cloudflare Queues: 失败消息调用 `message.retry()`。

未注册 job 也按执行期错误处理，会以
`internalServerError("Unknown queue job", ...)` 进入 retry 结果。

### Scheduler 执行链路

Scheduler task 内抛出的错误属于定时任务执行错误，不生成 HTTP response。

Node scheduler 由 `pg-boss` schedule/work 执行；Cloudflare scheduler 由 Worker
`scheduled(controller, env)` event 执行。task handler 的错误应在 scheduler
adapter 或平台日志中体现，并由任务自身保证幂等和可重试。

## 暴露策略

- `4xx` 默认 `expose: true`，返回业务 message。
- `5xx` 默认 `expose: false`，返回 HTTP 标准 phrase。
- 显式设置 `expose: true` 时，即使是 `5xx` 也会返回自定义 message。
- `details` 只在非 production 环境返回。
- 如果无法识别环境，默认不返回 `details`。

这意味着生产环境不会把第三方响应体、stack、token、env 等调试信息返回给调用方；这些信息只进入日志和非 production details。

## 业务代码规则

1. 失败时 `throw xxxError(...)`，不要手写错误 JSON。
2. 不维护项目级错误码。
3. 原始错误统一放入 `details.cause`。
4. 第三方错误正文、stack、环境信息只进入 `details`。
5. 成功响应仍由 route/controller 自己返回。
6. registry 重复注册这类启动期不变量错误可以保留普通 `Error`，让进程 fail-fast。
7. queue/scheduler 执行期错误应使用错误工厂或能被 `normalizeError` 识别的错误类型，不依赖普通 `Error` 逃逸成匿名 500。
