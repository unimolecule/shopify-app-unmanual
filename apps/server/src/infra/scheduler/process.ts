import { getDatabaseUrl } from "@/infra/database/shared";
import { listSchedulerTasks, type SchedulerTaskContext } from "./registry";
import { getSchedulerEnvConfig, type Scheduler } from "./shared";
import type { RuntimeConfig } from "@/infra/env";
import type { PgBoss } from "pg-boss";

let processSchedulerBoss: Promise<PgBoss> | undefined;
let processSchedulerCacheKey: string | undefined;
let processScheduler: Scheduler | undefined;

export async function createProcessScheduler(
  config: RuntimeConfig,
): Promise<Scheduler> {
  const tasks = listSchedulerTasks();

  if (tasks.length === 0) {
    return {
      run: () => Promise.resolve(),
      start: () => Promise.resolve(),
      stop: () => Promise.resolve(),
    };
  }

  getSchedulerEnvConfig(config);
  const boss = await getProcessSchedulerBoss(config);

  return {
    async run(cron, context) {
      await Promise.all(
        tasks
          .filter((task) => task.cron === cron)
          .map((task) =>
            task.handler({
              ...context,
              cron,
            }),
          ),
      );
    },
    async start(context) {
      await Promise.all(
        tasks.map(async (task) => {
          await ensureProcessSchedulerQueueExists(boss, task.name);
          await boss.schedule(task.name, task.cron, {
            name: task.name,
          });
          await boss.work(task.name, async () => {
            await task.handler(context);
          });
        }),
      );
    },
    async stop() {
      await Promise.all(tasks.map((task) => boss.offWork(task.name)));
    },
  };
}

export async function startProcessScheduler(
  config: RuntimeConfig,
  context: SchedulerTaskContext,
): Promise<void> {
  if (processScheduler) return;

  processScheduler = await createProcessScheduler(config);
  await processScheduler.start(context);
}

export async function stopProcessScheduler(): Promise<void> {
  const scheduler = processScheduler;
  processScheduler = undefined;

  await scheduler?.stop();
}

async function ensureProcessSchedulerQueueExists(
  boss: PgBoss,
  queueName: string,
): Promise<void> {
  await boss.createQueue(queueName);
}

export async function disposeProcessScheduler(): Promise<void> {
  await stopProcessScheduler();

  const boss = await processSchedulerBoss;
  processSchedulerBoss = undefined;
  processSchedulerCacheKey = undefined;

  await boss?.stop();
}

function getProcessSchedulerBoss(config: RuntimeConfig): Promise<PgBoss> {
  const cacheKey = getProcessSchedulerCacheKey(config);

  if (!processSchedulerBoss || processSchedulerCacheKey !== cacheKey) {
    processSchedulerBoss = createProcessSchedulerBoss(config);
    processSchedulerCacheKey = cacheKey;
  }

  return processSchedulerBoss;
}

async function createProcessSchedulerBoss(
  config: RuntimeConfig,
): Promise<PgBoss> {
  getSchedulerEnvConfig(config);

  const { PgBoss } = await import("pg-boss");
  const boss = new PgBoss({
    connectionString: getDatabaseUrl(config),
  });

  await boss.start();
  return boss;
}

function getProcessSchedulerCacheKey(config: RuntimeConfig): string {
  const strategy = getSchedulerEnvConfig(config);
  return JSON.stringify({
    databaseUrl: getDatabaseUrl(config),
    provider: strategy.provider,
    runtime: strategy.runtime,
  });
}
