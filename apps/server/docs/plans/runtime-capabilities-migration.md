# Runtime Capabilities Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global runtime capability registry with explicit `runtimeCapability*` creators and scoped `*Capabilities` objects for Node and Cloudflare runtimes.

**Architecture:** Keep `capability` as the public concept, but stop using global `setRuntimeCapability/getRuntimeCapability` service-locator state. Runtime entries create scoped capabilities explicitly: Node capabilities are process-scoped where safe; Cloudflare capabilities are request/event-scoped for request-bound bindings. File organization keeps `process` and `isolate` path names, while exported runtime naming uses `Node` and `Cloudflare`.

**Tech Stack:** Hono, TypeScript, Cloudflare Workers, Node process runtime, Drizzle, Shopify session storage, `@unimolecule/utils`, pnpm workspace.

---

## Non-Negotiable Rules

- Public capability creator names must start with `runtimeCapability*`.
- Capability collection object names must end with `*Capabilities`, for example `RuntimeCapabilities`, `NodeRuntimeCapabilities`, `CloudflareRequestRuntimeCapabilities`.
- File and folder organization can keep `process` and `isolate`, for example `src/app/runtime/process/node/runtime-capabilities.ts` and `src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`.
- Internal runtime names in types/functions must use `Node` and `Cloudflare`, not `Process` and `Isolate`, unless referring to an existing package/runtime constant.
- Before writing utility code, inspect `@unimolecule/utils` exports and reuse existing helpers such as `checkProcessDiskUsage`, `checkProcessMemoryUsage`, `createProcessGracefulExit`, `notNullish`, `isTruthy`, `serializeValue`, and `createProviderSignature`-style existing local helpers where already present.
- Do not create schema aggregation files such as `postgres-schema.ts` or `sqlite-schema.ts`. Keep runtime-specific schema imports directly in Node/Cloudflare database entry files.
- Do not introduce global singletons that hold Cloudflare `env`, `ctx`, D1, R2, Queue binding, request, request body, or event payload.
- Node may use process-scoped lazy resources with explicit disposal. Cloudflare may use request/event-scoped lazy resources only.
- Do not hand-edit generated Wrangler/Shopify output while executing this plan unless a task explicitly says so.
- Preserve user staged changes. Stage only files changed by the task being executed.

## Target Naming

Use this naming consistently:

| Concept                         | Name                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| Shared collection               | `RuntimeCapabilities`                                        |
| Node collection                 | `NodeRuntimeCapabilities`                                    |
| Cloudflare HTTP collection      | `CloudflareRequestRuntimeCapabilities`                       |
| Cloudflare queue collection     | `CloudflareQueueRuntimeCapabilities`                         |
| Cloudflare scheduled collection | `CloudflareScheduledRuntimeCapabilities`                     |
| Shared Hono getter              | `runtimeCapability(c)`                                       |
| Optional typed getter           | `runtimeCapabilityLogger(c)`, `runtimeCapabilityDatabase(c)` |
| Node creator                    | `runtimeCapabilityNode(...)`                                 |
| Cloudflare request creator      | `runtimeCapabilityCloudflareRequest(...)`                    |
| Cloudflare queue creator        | `runtimeCapabilityCloudflareQueue(...)`                      |
| Cloudflare scheduled creator    | `runtimeCapabilityCloudflareScheduled(...)`                  |
| Node disposer                   | `runtimeCapabilityNodeDispose(...)`                          |

Avoid these names for new code:

```ts
getRuntimeCapability("databaseFactory");
setRuntimeCapability("databaseFactory", factory);
createProcessRuntimeCapabilities();
createCloudflareRequestRuntimeCapabilities();
```

The existing registry may remain temporarily during migration, but no new business code should be added to it.

## Target RuntimeCapabilities Shape

The final shape can be adjusted during implementation, but start from this:

```ts
export type RuntimeCapabilityLazy<T> = () => T | Promise<T>;

export type RuntimeCapabilities = {
  logger: Logger;
  runtimeEnv: RuntimeConfig;
  database: RuntimeCapabilityLazy<Database>;
  bucket: RuntimeCapabilityLazy<Bucket>;
  shopifySessionStorage: RuntimeCapabilityLazy<SessionStorage>;
  health: {
    disk: RuntimeCapabilityDiskChecker;
    memory: RuntimeCapabilityMemoryChecker;
  };
  file: {
    downloadResolver: RuntimeCapabilityLazy<FileDownloadResolver>;
  };
  queue: {
    producer: RuntimeCapabilityLazy<QueueProducer>;
  };
};
```

Cloudflare queue and scheduled event capabilities can omit HTTP-only ports if the event path does not need them. Prefer narrower event-specific capability types over optional fields when that keeps call sites honest.

## Utility Strategy

Use the smallest possible local utility surface:

- Reuse `@unimolecule/utils/node` for disk, memory, and graceful shutdown.
- Reuse existing provider signature helpers under `src/infra/provider/signature.ts` for logger idempotency.
- If `@unimolecule/utils` exposes a suitable lazy/once helper in the installed version, use it.
- If it does not, add a tiny app-local helper named `runtimeCapabilityLazy` near the runtime capability code. It must cache the promise and value inside the current capabilities object only.

Suggested fallback helper:

```ts
export function runtimeCapabilityLazy<T>(
  create: () => T | Promise<T>,
): RuntimeCapabilityLazy<T> {
  let value: T | Promise<T> | undefined;

  return () => {
    value ??= create();
    return value;
  };
}
```

This helper must never be used at Cloudflare module scope for resources that hold request-bound bindings.

## Task 1: Baseline Audit And Guardrails

**Files:**

- Read: `apps/server/docs/guides/runtime-capabilities.md`
- Read: `apps/server/src/app/runtime/capabilities.ts`
- Read: `apps/server/src/app/runtime/process/node/capabilities.ts`
- Read: `apps/server/src/app/runtime/isolate/cloudflare/capabilities.ts`
- Read: `apps/server/src/shared/middlewares/runtime-env.ts`
- Read: `apps/server/src/shared/middlewares/runtime-logger.ts`
- Read: `apps/server/src/typings/hono.ts`
- Read: `node_modules/.pnpm/@unimolecule+utils@*/node_modules/@unimolecule/utils/dist/index.d.mts`
- Read: `node_modules/.pnpm/@unimolecule+utils@*/node_modules/@unimolecule/utils/dist/node/index.d.mts`

- [ ] **Step 1: Capture current registry use sites**

Run:

```bash
rg -n "getRuntimeCapability|setRuntimeCapability|disposeRuntimeCapabilities|register.*RuntimeCapabilities|runtimeLoggerSetup|runtimeEnvSourceResolver|databaseFactory|bucketFactory|queueProducerFactory|queueConsumerFactory|schedulerFactory|moduleFileDownloadResolverFactory" apps/server/src apps/server/tests
```

Expected: A complete list of old registry use sites. Save the output in the task notes or PR description, not in source files.

- [ ] **Step 2: Check utility availability**

Run:

```bash
sed -n '1,220p' node_modules/.pnpm/@unimolecule+utils@0.1.4/node_modules/@unimolecule/utils/dist/index.d.mts
sed -n '1,220p' node_modules/.pnpm/@unimolecule+utils@0.1.4/node_modules/@unimolecule/utils/dist/node/index.d.mts
```

Expected: Confirm whether `@unimolecule/utils` already exports a lazy/once helper. If it does, plan to use it. If not, use the tiny local `runtimeCapabilityLazy` helper described above.

- [ ] **Step 3: Confirm current tests before changing runtime wiring**

Run:

```bash
pnpm --dir apps/server run test
```

Expected: Record current pass/fail state. Do not fix unrelated failures in this task.

## Task 2: Add Shared RuntimeCapabilities Types And Hono Variable

**Files:**

- Create: `apps/server/src/app/runtime/runtime-capabilities.ts`
- Modify: `apps/server/src/typings/hono.ts`
- Modify: `apps/server/src/app/runtime/index.ts` if it exists or create only when existing export style needs it
- Test: `apps/server/tests/runtime/runtime-capabilities.test.ts`

- [ ] **Step 1: Add the shared types**

Create `apps/server/src/app/runtime/runtime-capabilities.ts` with:

```ts
import type { FileDownloadResolver } from "@/app/modules/file/types";
import type { Bucket } from "@/infra/bucket";
import type { Database } from "@/infra/database";
import type { RuntimeConfig } from "@/infra/env";
import type { Logger } from "@/infra/logger";
import type { QueueProducer } from "@/infra/queue";
import type { AppEnv } from "@/typings";
import type { RuntimeUnsupportedResult } from "@/utils/runtime";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import type {
  ProcessDiskUsageCheckResult,
  ProcessMemoryUsageCheckResult,
} from "@unimolecule/utils/node";
import type { Context } from "hono";

export type RuntimeCapabilityLazy<T> = () => T | Promise<T>;
export type RuntimeCapabilityHealthRuntimeResult = {
  runtime: string;
};
export type RuntimeCapabilityDiskCheckResult =
  | (ProcessDiskUsageCheckResult & RuntimeCapabilityHealthRuntimeResult)
  | RuntimeUnsupportedResult;
export type RuntimeCapabilityMemoryCheckResult =
  | (ProcessMemoryUsageCheckResult & RuntimeCapabilityHealthRuntimeResult)
  | RuntimeUnsupportedResult;
export type RuntimeCapabilityDiskChecker = (
  context: Context<AppEnv>,
) =>
  Promise<RuntimeCapabilityDiskCheckResult> | RuntimeCapabilityDiskCheckResult;
export type RuntimeCapabilityMemoryChecker = (
  context: Context<AppEnv>,
) =>
  | Promise<RuntimeCapabilityMemoryCheckResult>
  | RuntimeCapabilityMemoryCheckResult;

export type RuntimeCapabilities = {
  logger: Logger;
  runtimeEnv: RuntimeConfig;
  database: RuntimeCapabilityLazy<Database>;
  bucket: RuntimeCapabilityLazy<Bucket>;
  shopifySessionStorage: RuntimeCapabilityLazy<SessionStorage>;
  health: {
    disk: RuntimeCapabilityDiskChecker;
    memory: RuntimeCapabilityMemoryChecker;
  };
  file: {
    downloadResolver: RuntimeCapabilityLazy<FileDownloadResolver>;
  };
  queue: {
    producer: RuntimeCapabilityLazy<QueueProducer>;
  };
};

export function runtimeCapabilityLazy<T>(
  create: () => T | Promise<T>,
): RuntimeCapabilityLazy<T> {
  let value: T | Promise<T> | undefined;

  return () => {
    value ??= create();
    return value;
  };
}
```

If `@unimolecule/utils` exposes a suitable lazy/once helper, replace the local helper implementation with that helper or a thin wrapper around it.

- [ ] **Step 2: Add Hono variable**

Modify `apps/server/src/typings/hono.ts` and add:

```ts
import type { RuntimeCapabilities } from "@/app/runtime/runtime-capabilities";
```

Then add this field to `Variables`:

```ts
RuntimeCapabilities;
```

- [ ] **Step 3: Add a focused unit test for lazy caching**

Create `apps/server/tests/runtime/runtime-capabilities.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runtimeCapabilityLazy } from "@/app/runtime/runtime-capabilities";

describe("runtimeCapabilityLazy", () => {
  it("memoizes a synchronous capability within one scope", () => {
    let calls = 0;
    const value = {};
    const lazy = runtimeCapabilityLazy(() => {
      calls += 1;
      return value;
    });

    expect(lazy()).toBe(value);
    expect(lazy()).toBe(value);
    expect(calls).toBe(1);
  });

  it("memoizes an asynchronous capability promise within one scope", async () => {
    let calls = 0;
    const value = {};
    const lazy = runtimeCapabilityLazy(() => {
      calls += 1;
      return Promise.resolve(value);
    });

    const first = lazy();
    const second = lazy();

    expect(first).toBe(second);
    await expect(first).resolves.toBe(value);
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --dir apps/server exec vitest run tests/runtime/runtime-capabilities.test.ts
pnpm --dir apps/server run typecheck
```

Expected: Test passes. Typecheck may still fail if the project has no `typecheck` script; if so, use the server package's existing TypeScript check command from `package.json`.

## Task 3: Add Runtime Capability Accessors

**Files:**

- Create: `apps/server/src/app/runtime/runtime-capability.ts`
- Modify: `apps/server/src/shared/middlewares/index.ts`
- Create: `apps/server/src/shared/middlewares/runtime-capabilities.ts`
- Test: `apps/server/tests/runtime/runtime-capability-context.test.ts`

- [ ] **Step 1: Add accessor helpers**

Create `apps/server/src/app/runtime/runtime-capability.ts`:

```ts
import { internalServerError } from "@/shared/exceptions";
import type { RuntimeCapabilities } from "./runtime-capabilities";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";

export function runtimeCapability(c: Context<AppEnv>): RuntimeCapabilities {
  const capabilities = c.get("runtimeCapabilities");

  if (!capabilities) {
    throw internalServerError("Runtime capabilities are not available", {
      expose: true,
    });
  }

  return capabilities;
}

export function runtimeCapabilityLogger(c: Context<AppEnv>) {
  return runtimeCapability(c).logger;
}
```

- [ ] **Step 2: Add middleware to attach capabilities**

Create `apps/server/src/shared/middlewares/runtime-capabilities.ts`:

```ts
import { createMiddleware } from "hono/factory";
import { runtimeCapabilityCloudflareRequest } from "@/app/runtime/isolate/cloudflare/runtime-capabilities";
import { runtimeCapabilityNodeRequest } from "@/app/runtime/process/node/runtime-capabilities";
import { internalServerError } from "@/shared/exceptions";
import type { AppEnv } from "@/typings";

export function runtimeCapabilitiesContextMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const runtimeEnv = c.get("runtimeEnv");
    const logger = c.get("runtimeLogger");

    if (runtimeEnv.APP_RUNTIME === "cloudflare") {
      c.set(
        "runtimeCapabilities",
        runtimeCapabilityCloudflareRequest({
          env: c.env as Record<string, unknown>,
          logger,
          runtimeEnv,
        }),
      );
      await next();
      return;
    }

    if (runtimeEnv.APP_RUNTIME === "node") {
      c.set(
        "runtimeCapabilities",
        runtimeCapabilityNodeRequest({
          logger,
          runtimeEnv,
        }),
      );
      await next();
      return;
    }

    throw internalServerError("Unsupported runtime capabilities", {
      details: { runtime: runtimeEnv.APP_RUNTIME },
      expose: true,
    });
  });
}
```

This will not compile until Task 4 and Task 5 create the runtime-specific creators. Keep this task staged only with its dependent tasks or implement in the same checkpoint.

- [ ] **Step 3: Export middleware**

Modify `apps/server/src/shared/middlewares/index.ts`:

```ts
export * from "./runtime-capabilities";
```

- [ ] **Step 4: Register middleware after env/logger**

Modify `apps/server/src/app/bootstrap/register-middleware.ts`:

```ts
import {
  emojiFaviconMiddleware,
  loggerMiddleware,
  requestMiddleware,
  runtimeCapabilitiesContextMiddleware,
  runtimeEnvMiddleware,
  runtimeLoggerMiddleware,
} from "@/shared/middlewares";
```

Then register:

```ts
app.use("*", runtimeEnvMiddleware());
app.use("*", runtimeLoggerMiddleware());
app.use("*", runtimeCapabilitiesContextMiddleware());
```

Keep `loggerMiddleware` after this so request logs use the already configured logger.

- [ ] **Step 5: Verify once runtime creators exist**

Run after Task 4 and Task 5:

```bash
pnpm --dir apps/server run test
pnpm --dir apps/server run build
```

Expected: No runtime capabilities missing errors in middleware tests.

## Task 4: Implement Node Runtime Capabilities

**Files:**

- Create: `apps/server/src/app/runtime/process/node/runtime-capabilities.ts`
- Modify: `apps/server/src/app/runtime/process/node/index.ts`
- Modify: `apps/server/src/app/runtime/process/node/lifecycle/shutdown.ts`
- Reuse: `apps/server/src/infra/database/process.ts`
- Reuse: `apps/server/src/infra/bucket/process.ts`
- Reuse: `apps/server/src/infra/queue/process.ts`
- Reuse: `apps/server/src/infra/scheduler/process.ts`
- Reuse: `@unimolecule/utils/node`
- Test: `apps/server/tests/runtime/node-runtime-capabilities.test.ts`

- [ ] **Step 1: Create Node capabilities creator**

Create `apps/server/src/app/runtime/process/node/runtime-capabilities.ts`:

```ts
import {
  checkProcessDiskUsage,
  checkProcessMemoryUsage,
  type ProcessDiskUsageCheckResult,
  type ProcessMemoryUsageCheckResult,
} from "@unimolecule/utils/node";
import { BucketFileDownloadResolver } from "@/app/modules/file/download";
import { createBucketDownloadSigner } from "@/infra/bucket";
import { disposeProcessBucket, getProcessBucket } from "@/infra/bucket/process";
import {
  disposeProcessDatabase,
  getProcessDatabase,
} from "@/infra/database/process";
import {
  createProcessQueueConsumer,
  createProcessQueueProducer,
  disposeProcessQueueProducer,
} from "@/infra/queue/process";
import {
  createProcessScheduler,
  disposeProcessScheduler,
} from "@/infra/scheduler/process";
import { runtimeNotSupported } from "@/utils/runtime";
import {
  runtimeCapabilityLazy,
  type RuntimeCapabilities,
} from "../runtime-capabilities";
import type { RuntimeConfig } from "@/infra/env";
import type { Logger } from "@/infra/logger";
import type { QueueConsumer } from "@/infra/queue";
import type { Scheduler } from "@/infra/scheduler";

export type NodeRuntimeCapabilities = RuntimeCapabilities & {
  queue: RuntimeCapabilities["queue"] & {
    consumer: () => QueueConsumer<any> | Promise<QueueConsumer<any>>;
  };
  scheduler: () => Scheduler | Promise<Scheduler>;
};

export function runtimeCapabilityNode(options: {
  logger: Logger;
  runtimeEnv: RuntimeConfig;
}): NodeRuntimeCapabilities {
  const { logger, runtimeEnv } = options;
  const database = runtimeCapabilityLazy(() => getProcessDatabase(runtimeEnv));
  const bucket = runtimeCapabilityLazy(() => getProcessBucket(runtimeEnv));

  return {
    logger,
    runtimeEnv,
    database,
    bucket,
    shopifySessionStorage: runtimeCapabilityLazy(() => {
      throw new Error("Task 6 wires Node Shopify session storage");
    }),
    health: {
      disk: async () =>
        ({
          ...(await checkProcessDiskUsage()),
          runtime: runtimeEnv.APP_RUNTIME,
        }) satisfies ProcessDiskUsageCheckResult & { runtime: string },
      memory: () =>
        ({
          ...checkProcessMemoryUsage(),
          runtime: runtimeEnv.APP_RUNTIME,
        }) satisfies ProcessMemoryUsageCheckResult & { runtime: string },
    },
    file: {
      downloadResolver: runtimeCapabilityLazy(async () => {
        return new BucketFileDownloadResolver(
          await bucket(),
          await createBucketDownloadSigner(runtimeEnv),
        );
      }),
    },
    queue: {
      producer: runtimeCapabilityLazy(() =>
        createProcessQueueProducer(runtimeEnv),
      ),
      consumer: runtimeCapabilityLazy(() =>
        createProcessQueueConsumer(runtimeEnv),
      ),
    },
    scheduler: runtimeCapabilityLazy(() => createProcessScheduler(runtimeEnv)),
  };
}

export function runtimeCapabilityNodeRequest(options: {
  logger: Logger;
  runtimeEnv: RuntimeConfig;
}): RuntimeCapabilities {
  return runtimeCapabilityNode(options);
}

export async function runtimeCapabilityNodeDispose(): Promise<void> {
  await disposeProcessScheduler();
  await disposeProcessQueueProducer();
  disposeProcessBucket();
  await disposeProcessDatabase();
}
```

Replace the temporary session storage throw in Task 6 before removing the registry fallback.

- [ ] **Step 2: Update Node bootstrap to create capabilities once**

Modify `apps/server/src/app/runtime/process/node/index.ts` after logger setup:

```ts
const runtimeCapabilities = runtimeCapabilityNode({
  logger,
  runtimeEnv: env,
});
```

Use `runtimeCapabilities.queue.consumer()` and `runtimeCapabilities.scheduler()` instead of `getRuntimeCapability(...)`.

- [ ] **Step 3: Update Node shutdown**

Modify `apps/server/src/app/runtime/process/node/lifecycle/shutdown.ts`:

```ts
import { runtimeCapabilityNodeDispose } from "@/app/runtime/process/node/runtime-capabilities";
import { providersDispose } from "@/infra/provider";

export async function shutdown() {
  await runtimeCapabilityNodeDispose();
  await providersDispose();
}
```

Keep old `disposeRuntimeCapabilities()` only until all registry call sites are removed.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --dir apps/server run test
pnpm --dir apps/server run build
```

Expected: Node queue/scheduler startup no longer depends on global runtime registry.

## Task 5: Implement Cloudflare Runtime Capabilities

**Files:**

- Create: `apps/server/src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`
- Modify: `apps/server/src/app/runtime/isolate/cloudflare/index.ts`
- Reuse: `apps/server/src/app/runtime/isolate/cloudflare/bindings.ts`
- Reuse: `apps/server/src/infra/database/isolate.ts`
- Reuse: `apps/server/src/infra/bucket/isolate.ts`
- Reuse: `apps/server/src/infra/queue/isolate.ts`
- Reuse: `apps/server/src/infra/scheduler/isolate.ts`
- Test: `apps/server/tests/runtime/cloudflare-runtime-capabilities.test.ts`

- [ ] **Step 1: Create Cloudflare request capabilities**

Create `apps/server/src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`:

```ts
import { BucketFileDownloadResolver } from "@/app/modules/file/download";
import { createBucketDownloadSigner } from "@/infra/bucket";
import { createIsolateBucket } from "@/infra/bucket/isolate";
import { createIsolateDatabase } from "@/infra/database/isolate";
import {
  createIsolateQueueConsumer,
  createIsolateQueueProducer,
} from "@/infra/queue/isolate";
import { createIsolateScheduler } from "@/infra/scheduler/isolate";
import { runtimeNotSupported } from "@/utils/runtime";
import {
  runtimeCapabilityLazy,
  type RuntimeCapabilities,
} from "../../runtime-capabilities";
import {
  isCloudflareD1Database,
  isCloudflareQueue,
  isCloudflareR2Bucket,
  requireCloudflareBinding,
} from "./bindings";
import type { RuntimeConfig } from "@/infra/env";
import type { Logger } from "@/infra/logger";

type CloudflareRuntimeCapabilityOptions = {
  env: Record<string, unknown>;
  logger: Logger;
  runtimeEnv: RuntimeConfig;
};

export type CloudflareRequestRuntimeCapabilities = RuntimeCapabilities;

export function runtimeCapabilityCloudflareRequest(
  options: CloudflareRuntimeCapabilityOptions,
): CloudflareRequestRuntimeCapabilities {
  const { env, logger, runtimeEnv } = options;
  const database = runtimeCapabilityLazy(() =>
    createIsolateDatabase(runtimeEnv, {
      d1: requireConfiguredCloudflareBinding(
        env,
        runtimeEnv.APP_DATABASE_D1_BINDING,
        "APP_DATABASE_D1_BINDING",
        isCloudflareD1Database,
      ),
    }),
  );
  const bucket = runtimeCapabilityLazy(() =>
    createIsolateBucket(runtimeEnv, {
      r2: requireConfiguredCloudflareBinding(
        env,
        runtimeEnv.APP_BUCKET_R2_BINDING,
        "APP_BUCKET_R2_BINDING",
        isCloudflareR2Bucket,
      ),
    }),
  );

  return {
    logger,
    runtimeEnv,
    database,
    bucket,
    shopifySessionStorage: runtimeCapabilityLazy(() => {
      throw new Error("Task 6 wires Cloudflare Shopify session storage");
    }),
    health: {
      disk: () => runtimeNotSupported({ runtime: runtimeEnv.APP_RUNTIME }),
      memory: () => runtimeNotSupported({ runtime: runtimeEnv.APP_RUNTIME }),
    },
    file: {
      downloadResolver: runtimeCapabilityLazy(async () => {
        return new BucketFileDownloadResolver(
          await bucket(),
          await createBucketDownloadSigner(runtimeEnv),
        );
      }),
    },
    queue: {
      producer: runtimeCapabilityLazy(() =>
        createIsolateQueueProducer(runtimeEnv, {
          queue: requireConfiguredCloudflareBinding(
            env,
            runtimeEnv.APP_QUEUE_BINDING,
            "APP_QUEUE_BINDING",
            isCloudflareQueue,
          ),
        }),
      ),
    },
  };
}

export function runtimeCapabilityCloudflareQueue(
  options: CloudflareRuntimeCapabilityOptions,
) {
  return {
    logger: options.logger,
    runtimeEnv: options.runtimeEnv,
    consumer: runtimeCapabilityLazy(() =>
      createIsolateQueueConsumer(options.runtimeEnv),
    ),
  };
}

export function runtimeCapabilityCloudflareScheduled(
  options: CloudflareRuntimeCapabilityOptions & { cron: string },
) {
  return {
    cron: options.cron,
    logger: options.logger,
    runtimeEnv: options.runtimeEnv,
    scheduler: runtimeCapabilityLazy(() =>
      createIsolateScheduler(options.runtimeEnv),
    ),
  };
}

function requireConfiguredCloudflareBinding<T>(
  env: Record<string, unknown>,
  binding: string | undefined,
  bindingConfigKey: string,
  validate: (value: unknown) => value is T,
): T {
  if (!binding) {
    return requireCloudflareBinding(undefined, bindingConfigKey, validate);
  }

  return requireCloudflareBinding(env[binding], binding, validate);
}
```

Replace the temporary session storage throw in Task 6 before removing registry fallback.

- [ ] **Step 2: Update Cloudflare entry queue/scheduled paths**

Modify `apps/server/src/app/runtime/isolate/cloudflare/index.ts`:

```ts
const context = await createCloudflareQueueJobContext(env);
const runtimeCapabilities = runtimeCapabilityCloudflareQueue({
  env,
  logger: context.logger,
  runtimeEnv: context.runtimeEnv,
});
const queueConsumer = await runtimeCapabilities.consumer();
await queueConsumer.consume(batch, context);
```

And for scheduled:

```ts
const context = await createCloudflareSchedulerTaskContext(
  env,
  controller.cron,
);
const runtimeCapabilities = runtimeCapabilityCloudflareScheduled({
  cron: controller.cron,
  env,
  logger: context.logger,
  runtimeEnv: context.runtimeEnv,
});
const scheduler = await runtimeCapabilities.scheduler();
await scheduler.run(controller.cron, context);
```

- [ ] **Step 3: Verify no Cloudflare module-scope binding cache**

Run:

```bash
rg -n "let .*Database|let .*Bucket|cached.*D1|cached.*R2|cached.*Queue|env:" apps/server/src/app/runtime/isolate apps/server/src/infra
```

Expected: No module-scope cache that holds Cloudflare binding objects.

## Task 6: Move Shopify Session Storage Into RuntimeCapabilities

**Files:**

- Modify: `apps/server/src/app/runtime/process/node/runtime-capabilities.ts`
- Modify: `apps/server/src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`
- Modify: `apps/server/src/app/modules/shopify/session-storage/index.ts`
- Add: `apps/server/src/app/modules/shopify/session-storage/postgres.ts`
- Add: `apps/server/src/app/modules/shopify/session-storage/sqlite.ts`
- Delete: `apps/server/src/app/modules/shopify/session-storage/database.ts`
- Modify: `apps/server/src/app/modules/shopify/session-storage/types.ts` if needed
- Test: `apps/server/tests/shopify/session-middleware.test.ts`

- [ ] **Step 1: Make module getter read capabilities**

Modify `apps/server/src/app/modules/shopify/session-storage/index.ts`:

```ts
import { runtimeCapability } from "@/app/runtime/runtime-capability";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";

export async function getShopifySessionStorage(c: Context<AppEnv>) {
  return await runtimeCapability(c).shopifySessionStorage();
}
```

- [ ] **Step 2: Wire Node session storage in Node creator**

In `apps/server/src/app/runtime/process/node/runtime-capabilities.ts`, delegate the Node-specific adapter to the Shopify module:

```ts
const capabilities = {
  shopifySessionStorage: runtimeCapabilityLazy(async () =>
    createPostgresShopifySessionStorage(await database()),
  ),
};
```

Keep `DrizzleSessionStoragePostgres` and `postgresShopifySessions` imports in `shopify/session-storage/postgres.ts`.

- [ ] **Step 3: Wire Cloudflare session storage in Cloudflare creator**

In `apps/server/src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`, delegate the Cloudflare adapter to the Shopify module:

```ts
const capabilities = {
  shopifySessionStorage: runtimeCapabilityLazy(async () =>
    createSqliteShopifySessionStorage(await database()),
  ),
};
```

Keep `DrizzleSessionStorageSQLite` and `sqliteShopifySessions` imports in `shopify/session-storage/sqlite.ts`.

- [ ] **Step 4: Delete provider switch**

Delete `apps/server/src/app/modules/shopify/session-storage/database.ts` so no module reachable by Cloudflare imports both Postgres and SQLite adapters.

- [ ] **Step 5: Verify Cloudflare bundle**

Run:

```bash
pnpm --dir apps/server run build
rg "PgTextBuilder|drizzle-orm/pg-core|@shamt/database/models/postgres|postgresShopifySessions|drizzle-postgres.adapter|node:" apps/server/dist
```

Expected: `rg` finds no PostgreSQL/Node-only references in Cloudflare output. If it finds matches only in Node output, narrow the search path to the Cloudflare dist directory configured by `apps/server/build.config.ts`.

## Task 7: Migrate Database, Bucket, File, And Health Call Sites

**Files:**

- Modify: `apps/server/src/app/modules/file/service.ts`
- Modify: `apps/server/src/app/modules/product-export/service.ts`
- Modify: `apps/server/src/app/modules/product-export/runtime.ts`
- Modify: `apps/server/src/app/modules/reference/service.ts`
- Modify: `apps/server/src/app/modules/health/service.ts`
- Modify: `apps/server/src/app/modules/file/repositories/database/index.ts`
- Modify: `apps/server/src/app/modules/reference/repositories/database/index.ts`
- Modify: `apps/server/src/app/modules/product-export/repositories/database/index.ts`

- [ ] **Step 1: Replace database factory reads**

For each service that currently does:

```ts
const databaseFactory = getRuntimeCapability("databaseFactory");
const database = await databaseFactory(createRuntimeResourceContextFromHono(c));
```

Change it to:

```ts
const database = await runtimeCapability(c).database();
```

- [ ] **Step 2: Replace bucket factory reads**

For each service that currently does:

```ts
const bucketFactory = getRuntimeCapability("bucketFactory");
const bucket = await bucketFactory(createRuntimeResourceContextFromHono(c));
```

Change it to:

```ts
const bucket = await runtimeCapability(c).bucket();
```

- [ ] **Step 3: Replace file download resolver factory**

Change resolver creation to:

```ts
const resolver = await runtimeCapability(c).file.downloadResolver();
```

- [ ] **Step 4: Replace health checkers**

In health service:

```ts
const capabilities = runtimeCapability(c);
const disk = await capabilities.health.disk(c);
const memory = await capabilities.health.memory(c);
const database = await capabilities.database();
```

Do not keep `getRuntimeCapability("moduleHealthDiskChecker")`.

- [ ] **Step 5: Verify repository lazy behavior**

Ensure repository helpers still accept a lazy database promise if that avoids duplicate database adapter creation within one request. Prefer passing `runtimeCapability(c).database()` once from the service and sharing it across repositories in that request.

- [ ] **Step 6: Verify**

Run:

```bash
rg -n "databaseFactory|bucketFactory|moduleFileDownloadResolverFactory|moduleHealthDiskChecker|moduleHealthMemoryChecker|getRuntimeCapability" apps/server/src/app/modules apps/server/src/shared
pnpm --dir apps/server run test
pnpm --dir apps/server run build
```

Expected: No old registry reads remain in app modules or shared middleware.

## Task 8: Migrate Queue Producer Call Sites

**Files:**

- Modify: `apps/server/src/app/modules/product-export/queue/index.ts`
- Modify: `apps/server/src/app/modules/product-export/queue/jobs.ts`
- Modify: `apps/server/src/app/modules/product-export/runtime.ts`

- [ ] **Step 1: Replace queue producer factory**

Replace:

```ts
const queueProducerFactory = getRuntimeCapability("queueProducerFactory");
```

With:

```ts
const queueProducer = await runtimeCapability(c).queue.producer();
```

For non-Hono job helpers, pass the producer or the relevant capabilities object explicitly instead of reconstructing a fake Hono context.

- [ ] **Step 2: Keep event context scoped**

In Cloudflare queue events, use `runtimeCapabilityCloudflareQueue(...)` from the event entry and pass explicit context to job handlers. Do not store queue batch, queue binding, or event context in module-level variables.

- [ ] **Step 3: Verify**

Run:

```bash
rg -n "queueProducerFactory|getRuntimeCapability" apps/server/src/app/modules/product-export apps/server/src/app/runtime
pnpm --dir apps/server run test
```

Expected: Product export queue producer no longer depends on the global registry.

## Task 9: Remove Runtime Env Source Resolver

**Files:**

- Modify: `apps/server/src/shared/middlewares/runtime-env.ts`
- Modify: `apps/server/src/app/runtime/process/node/index.ts`
- Modify: `apps/server/src/app/runtime/isolate/cloudflare/index.ts`
- Modify: `apps/server/src/app/runtime/process/node/runtime-capabilities.ts`
- Modify: `apps/server/src/app/runtime/isolate/cloudflare/runtime-capabilities.ts`

- [ ] **Step 1: Make runtimeEnvMiddleware explicit**

Modify `runtime-env.ts` to stop reading `runtimeEnvSourceResolver`:

```ts
const envConfig = c.env ?? getSafeProcessEnv();
const runtimeEnv = getEnvProvider(envConfig);
c.set("runtimeEnv", runtimeEnv);
```

If Node request `c.env` is empty, ensure `getSafeProcessEnv()` remains the fallback.

- [ ] **Step 2: Ensure runtime entries resolve env before capabilities**

Node bootstrap:

```ts
const runtimeEnv = getEnvProvider();
```

Cloudflare fetch/queue/scheduled:

```ts
const runtimeEnv = getEnvProvider(env);
```

Do not reintroduce runtime env global registry.

- [ ] **Step 3: Verify**

Run:

```bash
rg -n "runtimeEnvSourceResolver" apps/server/src apps/server/tests
pnpm --dir apps/server run test
```

Expected: No references remain.

## Task 10: Replace Runtime Logger Setup Registry

**Files:**

- Create: `apps/server/src/app/runtime/process/node/logger.ts`
- Create: `apps/server/src/app/runtime/isolate/cloudflare/logger.ts`
- Modify: `apps/server/src/infra/logger/index.ts`
- Modify: `apps/server/src/infra/provider/logger.ts`
- Modify: `apps/server/src/shared/middlewares/runtime-logger.ts`
- Modify: `apps/server/src/app/runtime/process/node/index.ts`
- Modify: `apps/server/src/app/runtime/isolate/cloudflare/index.ts`

- [ ] **Step 1: Add Node logger ensure function**

Create `apps/server/src/app/runtime/process/node/logger.ts`:

```ts
import { getLoggerProvider } from "@/infra/provider";
import type { RuntimeConfig } from "@/infra/env";

export async function runtimeCapabilityNodeLogger(runtimeEnv: RuntimeConfig) {
  return await getLoggerProvider(runtimeEnv);
}
```

- [ ] **Step 2: Add Cloudflare logger ensure function**

Create `apps/server/src/app/runtime/isolate/cloudflare/logger.ts`:

```ts
import { getLoggerProvider } from "@/infra/provider";
import type { RuntimeConfig } from "@/infra/env";

let loggerSignature: string | undefined;
let loggerSetupPromise: Promise<unknown> | undefined;

export async function runtimeCapabilityCloudflareLogger(
  runtimeEnv: RuntimeConfig,
) {
  const logger = await getLoggerProvider(runtimeEnv, {
    override: loggerSignature !== runtimeEnv.APP_LOGGER_LEVEL,
  });
  loggerSignature = runtimeEnv.APP_LOGGER_LEVEL;
  loggerSetupPromise = Promise.resolve(logger);
  await loggerSetupPromise;
  return logger;
}
```

During implementation, use the existing provider signature helper instead of only `APP_LOGGER_LEVEL`. The signature must include every logger config field used by `getLoggerEnvConfig(...)`.

- [ ] **Step 3: Remove `setupLogger` registry dependency**

Modify `apps/server/src/infra/logger/index.ts` so it no longer imports `getRuntimeCapability("runtimeLoggerSetup")`. Runtime-specific logger setup should be selected by the runtime-specific ensure function, not by a global registry.

- [ ] **Step 4: Update runtime logger middleware**

Keep middleware simple:

```ts
const runtimeCapabilities = c.get("runtimeCapabilities");
c.set("runtimeLogger", runtimeCapabilities.logger);
```

If middleware order makes this impossible, merge logger setup into runtime capabilities middleware and delete `runtimeLoggerMiddleware`.

- [ ] **Step 5: Verify no per-request unconditional reset**

Run:

```bash
rg -n "setupLogger\\(|reset: true|runtimeLoggerSetup|getRuntimeCapability" apps/server/src/infra apps/server/src/app apps/server/src/shared
```

Expected: `reset: true` remains only in an idempotent logger provider path. Cloudflare request path must not unconditionally reset every request.

## Task 11: Delete Global Runtime Capability Registry

**Files:**

- Modify/Delete: `apps/server/src/app/runtime/capabilities.ts`
- Modify: every remaining import found by `rg`
- Modify: `apps/server/docs/references/*` only if references become actively misleading for changed code

- [ ] **Step 1: Confirm no runtime registry consumers**

Run:

```bash
rg -n "getRuntimeCapability|setRuntimeCapability|disposeRuntimeCapabilities|RuntimeCapabilityInstances|RuntimeCapabilityName|registerProcessRuntimeCapabilities|registerCloudflareIsolateRuntimeCapabilities" apps/server/src apps/server/tests
```

Expected: No active runtime registry consumers. If mode capabilities still exist under Shopify mode, leave them alone unless explicitly part of a separate plan.

- [ ] **Step 2: Delete or shrink registry file**

If `apps/server/src/app/runtime/capabilities.ts` only contains old registry code, delete it. If it still owns shared health result types, move those types to `apps/server/src/app/runtime/runtime-capabilities.ts` first.

- [ ] **Step 3: Remove old runtime registration calls**

Remove these calls:

```ts
registerProcessRuntimeCapabilities();
registerCloudflareIsolateRuntimeCapabilities();
```

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --dir apps/server run lint
pnpm --dir apps/server run test
pnpm --dir apps/server run build
```

Expected: No TypeScript imports from the deleted registry remain.

## Task 12: Cloudflare Bundle Safety Check

**Files:**

- Read: `apps/server/build.config.ts`
- Read: generated `apps/server/dist/**`
- Modify only if build config still makes Cloudflare import Node-only files.

- [ ] **Step 1: Build**

Run:

```bash
pnpm --dir apps/server run build
```

Expected: Build completes without Cloudflare unresolved warnings for `node:*`, PostgreSQL, or pg-core.

- [ ] **Step 2: Search Cloudflare output**

Run:

```bash
rg "PgTextBuilder|drizzle-orm/pg-core|@shamt/database/models/postgres|postgresShopifySessions|drizzle-postgres.adapter|node:fs|node:path|node:stream|pg-boss|\\bpg\\b" apps/server/dist
```

Expected: Cloudflare output has no matches. If Node output is mixed under the same dist folder, restrict the search to the Cloudflare output directory and document that path.

- [ ] **Step 3: Run Wrangler deploy dry path if available**

Run the repo's non-production Cloudflare build/deploy validation command if one exists:

```bash
pnpm --dir apps/server run cf:deploy --dry-run
```

If no dry-run script exists, run the closest local Wrangler validation command already used by the repo.

Expected: No `PgTextBuilder is not a constructor` validation error.

## Task 13: Documentation Alignment

**Files:**

- Modify: `apps/server/docs/guides/runtime-capabilities.md`
- Modify: `apps/server/docs/guides/runtime-infra-entrypoints.md`
- Modify: `apps/server/docs/references/runtime.md`
- Modify: `apps/server/docs/references/database.md`
- Modify: `apps/server/docs/references/shopify.md`
- Modify: `apps/server/docs/references/bucket.md`
- Modify: `apps/server/docs/references/queue.md`
- Modify: `apps/server/docs/references/scheduler.md`

- [ ] **Step 1: Search stale docs**

Run:

```bash
rg -n "runtime capability registry|getRuntimeCapability|setRuntimeCapability|databaseFactory|bucketFactory|runtimeLoggerSetup|runtimeEnvSourceResolver|moduleFileDownloadResolverFactory|capabilities\\.ts" apps/server/docs
```

- [ ] **Step 2: Update docs to new naming**

Replace stale guidance with:

```text
Runtime abilities are exposed through explicit RuntimeCapabilities objects.
Capability creator functions use runtimeCapability* names.
Node and Cloudflare implementations live under process/isolate file paths but use Node/Cloudflare names internally.
```

- [ ] **Step 3: Keep the guide as canonical**

Ensure `apps/server/docs/guides/runtime-capabilities.md` remains the canonical decision guide and other references link back to it rather than duplicating long architecture explanations.

- [ ] **Step 4: Verify Markdown formatting**

Run:

```bash
pnpm -F @shamt/server exec prettier "docs/**/*.md" --check
```

Expected: All changed docs are formatted.

## Task 14: Final Verification And Leak Audit

**Files:**

- Read all changed runtime files.
- Read generated Cloudflare output only for import verification.

- [ ] **Step 1: Full server checks**

Run:

```bash
pnpm --dir apps/server run lint
pnpm --dir apps/server run test
pnpm --dir apps/server run build
```

Expected: All pass.

- [ ] **Step 2: Workspace checks if server passes**

Run:

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: All pass, or only documented unrelated pre-existing failures remain.

- [ ] **Step 3: Memory leak audit**

Run:

```bash
rg -n "let .*env|let .*ctx|let .*request|let .*binding|cached.*env|cached.*ctx|cached.*D1|cached.*R2|cached.*Queue|globalThis|Map<.*Runtime|new Map" apps/server/src/app/runtime apps/server/src/infra
```

Expected:

- Node process caches have explicit disposal.
- Cloudflare module-scope code does not cache request/event-bound values.
- Any `Map` used in runtime code has a bounded lifecycle or explicit dispose path.

- [ ] **Step 4: Import graph audit**

Run:

```bash
rg -n "@shopify/shopify-app-session-storage-drizzle.*postgres|drizzle-orm/pg-core|@shamt/database/models/postgres|node:" apps/server/src/app/runtime/isolate apps/server/src/infra/database/isolate.ts apps/server/src/infra/bucket/isolate.ts
```

Expected: No Cloudflare/isolate source imports Node/PostgreSQL-only modules.

- [ ] **Step 5: Commit in small checkpoints**

Commit by completed task group, not as one giant commit. Suggested grouping:

```bash
git add apps/server/src/app/runtime apps/server/src/typings apps/server/tests/runtime
git commit -m "refactor(server): add explicit runtime capabilities"

git add apps/server/src/app/modules apps/server/src/shared apps/server/tests
git commit -m "refactor(server): consume runtime capabilities explicitly"

git add apps/server/docs
git commit -m "docs(server): document runtime capabilities migration"
```

Do not stage unrelated user changes.

## Execution Notes

- Implement Task 2 through Task 5 in one local checkpoint if TypeScript cannot compile with partially created creators.
- Keep registry compatibility only as long as needed to maintain green tests between checkpoints.
- Prefer passing capabilities explicitly over reconstructing Hono contexts in queue/scheduled code.
- If Cloudflare session storage cannot safely import Shopify's SQLite Drizzle adapter without pulling PostgreSQL, implement an app-owned D1 `SessionStorage` adapter in the Cloudflare runtime boundary.
- If old docs conflict with this plan, update the closest docs after code migration; do not rewrite root README during implementation unless a command or user request requires it.
