import { DEFAULT_ENVS } from "@shamt/app-env";
import { bootstrapApp } from "@/app/bootstrap";
import { registerJobs } from "@/app/bootstrap/register-jobs";
import { getEnvProvider, getLoggerProvider } from "@/infra/provider";
import {
  runtimeCapabilityCloudflare,
  runtimeCapabilityCloudflareQueue,
  runtimeCapabilityCloudflareScheduled,
} from "./runtime-capabilities";
import type { AppEnv, RuntimeAppEnv } from "@/typings";
import type { Context } from "hono";

registerJobs();

const cloudflareApp = bootstrapApp({
  createRuntimeCapabilities: (c: Context<AppEnv>) => {
    const runtimeEnv = getEnvProvider(c.get("runtimeEnv") ?? c.env);

    return runtimeCapabilityCloudflare({
      env: c.env as Record<string, unknown>,
      runtimeEnv,
    });
  },
  registerOpenApi: getEnvProvider().APP_ENV !== DEFAULT_ENVS.PRODUCTION,
});

export default {
  async fetch(request, env, ctx) {
    const app = await cloudflareApp;
    return app.fetch(request, env, ctx);
  },
  async queue(batch, env) {
    const context = await createCloudflareQueueJobContext(env);
    const runtimeCapabilities = runtimeCapabilityCloudflareQueue({
      env,
      runtimeEnv: context.runtimeEnv,
    });
    const queueConsumer = await runtimeCapabilities.consumer();
    await queueConsumer?.consume(batch, context);
  },
  async scheduled(controller, env) {
    const context = await createCloudflareSchedulerTaskContext(
      env,
      controller.cron,
    );
    const runtimeCapabilities = runtimeCapabilityCloudflareScheduled({
      cron: controller.cron,
      env,
      runtimeEnv: context.runtimeEnv,
    });
    const scheduler = await runtimeCapabilities.scheduler();
    await scheduler?.run(controller.cron, context);
  },
} satisfies ExportedHandler<RuntimeAppEnv<"cloudflare">["Bindings"]>;

async function createCloudflareQueueJobContext(
  env: RuntimeAppEnv<"cloudflare">["Bindings"],
) {
  const runtimeEnv = getEnvProvider(env);
  const logger = await getLoggerProvider(runtimeEnv);
  const runtimeCapabilities = runtimeCapabilityCloudflare({
    env,
    runtimeEnv,
  });

  return {
    bindings: env,
    logger,
    runtimeCapabilities,
    runtimeEnv,
  };
}

async function createCloudflareSchedulerTaskContext(
  env: RuntimeAppEnv<"cloudflare">["Bindings"],
  cron: string,
) {
  const runtimeEnv = getEnvProvider(env);
  const logger = await getLoggerProvider(runtimeEnv);
  const runtimeCapabilities = runtimeCapabilityCloudflare({
    env,
    runtimeEnv,
  });

  return {
    bindings: env,
    cron,
    logger,
    runtimeCapabilities,
    runtimeEnv,
  };
}
