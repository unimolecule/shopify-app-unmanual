import { DEFAULT_APP_SCHEDULER_PROVIDERS } from "@unimolecule/shopify-app-unmanual-app-env";
import { internalServerError } from "@/shared/exceptions";
import {
  findSchedulerTasksByCron,
  type SchedulerTaskContext,
} from "./registry";
import { getSchedulerEnvConfig, type Scheduler } from "./shared";
import type { RuntimeConfig } from "@/infra/env";

export type IsolateSchedulerOptions = {
  cron?: string;
};

export function createIsolateScheduler(
  config: RuntimeConfig,
  // eslint-disable-next-line unused-imports/no-unused-vars
  _options: IsolateSchedulerOptions = {},
): Scheduler {
  const strategy = getSchedulerEnvConfig(config);

  if (strategy.provider === DEFAULT_APP_SCHEDULER_PROVIDERS.CRONTRIGGERS) {
    return {
      run: runCloudflareScheduledTasks,
      start: () => Promise.resolve(),
      stop: () => Promise.resolve(),
    };
  }

  throw internalServerError(
    "Isolate runtime does not support scheduler provider",
    {
      details: strategy,
      expose: true,
    },
  );
}

/**
 * Reserved disposer for isolate scheduler resources.
 * Current Cloudflare Cron Trigger scheduler is event-scoped.
 */
export function disposeIsolateScheduler() {
  return Promise.resolve();
}

export async function runCloudflareScheduledTasks(
  cron: string,
  context: SchedulerTaskContext,
): Promise<void> {
  const tasks = findSchedulerTasksByCron(cron);

  await Promise.all(
    tasks.map((task) =>
      task.handler({
        ...context,
        cron,
      }),
    ),
  );
}
