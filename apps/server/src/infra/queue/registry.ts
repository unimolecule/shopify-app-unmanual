import { throwAppServerError as throwError } from "../../../internal";
import type { QueueMessage } from "./shared";
import type { RuntimeCapabilities } from "@/app/runtime/runtime-capabilities";
import type { RuntimeConfig } from "@/infra/env";
import type { Logger } from "@/infra/logger";

export type QueueJobContext = {
  bindings?: Record<string, unknown>;
  logger: Logger;
  runtimeCapabilities: RuntimeCapabilities;
  runtimeEnv: RuntimeConfig;
};

export type QueueJobHandler<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = (payload: TPayload, context: QueueJobContext) => Promise<void>;

export type QueueBatchJobHandler<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = (
  messages: Array<QueueMessage<string, TPayload>>,
  context: QueueJobContext,
) => Promise<void>;

export type QueueJobDefinition =
  | {
      handler: QueueJobHandler;
      maxBatchSize?: number;
      mode?: "single";
      name: string;
    }
  | {
      batchHandler: QueueBatchJobHandler;
      maxBatchSize?: number;
      mode: "batch";
      name: string;
    };

const queueJobs = new Map<string, QueueJobDefinition>();

export function registerQueueJob(job: QueueJobDefinition): void {
  if (queueJobs.has(job.name)) {
    throwError(`Queue job already registered: ${job.name}`);
  }

  queueJobs.set(job.name, job);
}

export function getQueueJob(name: string): QueueJobDefinition | undefined {
  return queueJobs.get(name);
}

export function listQueueJobs(): QueueJobDefinition[] {
  return [...queueJobs.values()];
}

export function resetQueueJobs(): void {
  queueJobs.clear();
}
