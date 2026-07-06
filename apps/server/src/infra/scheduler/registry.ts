import { throwAppServerError as throwError } from "../../../internal";
import type { RuntimeCapabilities } from "@/app/runtime/runtime-capabilities";
import type { RuntimeConfig } from "@/infra/env";
import type { Logger } from "@/infra/logger";

export type SchedulerTaskContext = {
  bindings?: Record<string, unknown>;
  cron?: string;
  logger: Logger;
  runtimeCapabilities: RuntimeCapabilities;
  runtimeEnv: RuntimeConfig;
};

export type SchedulerTaskHandler = (
  context: SchedulerTaskContext,
) => Promise<void>;

export type SchedulerTaskDefinition = {
  cron: string;
  handler: SchedulerTaskHandler;
  name: string;
};

const schedulerTasks = new Map<string, SchedulerTaskDefinition>();

export function registerSchedulerTask(task: SchedulerTaskDefinition): void {
  if (schedulerTasks.has(task.name)) {
    throwError(`Scheduler task already registered: ${task.name}`);
  }

  schedulerTasks.set(task.name, task);
}

export function getSchedulerTask(
  name: string,
): SchedulerTaskDefinition | undefined {
  return schedulerTasks.get(name);
}

export function listSchedulerTasks(): SchedulerTaskDefinition[] {
  return [...schedulerTasks.values()];
}

export function findSchedulerTasksByCron(
  cron: string,
): SchedulerTaskDefinition[] {
  return listSchedulerTasks().filter((task) => task.cron === cron);
}

export function resetSchedulerTasks(): void {
  schedulerTasks.clear();
}
