import { serve } from "@hono/node-server";
import { DEFAULT_ENVS } from "@shamt/app-env";
import { bootstrapApp } from "@/app/bootstrap";
import { registerJobs } from "@/app/bootstrap/register-jobs";
import { registerProcessExceptions } from "@/app/runtime/process/node/register-process-exceptions";
import { registerProcessExits } from "@/app/runtime/process/node/register-process-exits";
import { runtimeCapabilityNode } from "@/app/runtime/process/node/runtime-capabilities";
import { setupProcessLogger } from "@/infra/logger/process";
import { getEnvProvider, getLoggerProvider } from "@/infra/provider";
import { registerProcessLoggerSetup } from "@/infra/provider/logger";
import { name } from "../../../../../package.json";

export async function bootstrap() {
  registerJobs();
  registerProcessLoggerSetup(setupProcessLogger);

  // error catch first
  await registerProcessExceptions();

  const env = getEnvProvider();
  const logger = await getLoggerProvider(env);
  const runtimeCapabilities = runtimeCapabilityNode({
    runtimeEnv: env,
  });
  const app = await bootstrapApp({
    createRuntimeCapabilities: (c) => {
      const runtimeEnv = getEnvProvider(c.get("runtimeEnv") ?? c.env);

      return runtimeCapabilityNode({
        runtimeEnv,
      });
    },
    registerOpenApi: env.APP_ENV !== DEFAULT_ENVS.PRODUCTION,
  });
  const nodeApp = serve({
    fetch: app.fetch,
    port: env.APP__SERVER_PORT,
  });
  await registerProcessExits(nodeApp);

  logger.info(
    `🎉 ${name} is running on port ${env.APP__SERVER_PORT}! OpenAPI Route: 👉 /openapi`,
  );

  const queueConsumer = await runtimeCapabilities.queue.consumer();
  await queueConsumer?.start({
    logger,
    runtimeCapabilities,
    runtimeEnv: env,
  });
  const scheduler = await runtimeCapabilities.scheduler();
  await scheduler?.start({
    logger,
    runtimeCapabilities,
    runtimeEnv: env,
  });
}

bootstrap();
