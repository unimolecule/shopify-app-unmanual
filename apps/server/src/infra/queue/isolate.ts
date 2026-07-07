import { DEFAULT_APP_QUEUE_PROVIDERS } from "@unimolecule/shopify-app-unmanual-app-env";
import { internalServerError } from "@/shared/exceptions";
import { consumeQueueBatch } from "./consumer";
import {
  getQueueEnvConfig,
  type QueueConsumer,
  type QueueEnqueueOptions,
  type QueueMessage,
  type QueueProducer,
} from "./shared";
import type { QueueJobContext } from "./registry";
import type { RuntimeConfig } from "@/infra/env";

export type IsolateQueueOptions = {
  queue?: Queue;
};

/**
 * Creates the isolate queue producer for the configured provider.
 * Cloudflare Queues use the request-bound Queue binding.
 */
export function createIsolateQueueProducer(
  config: RuntimeConfig,
  options: IsolateQueueOptions = {},
): QueueProducer {
  const strategy = getQueueEnvConfig(config);

  if (strategy.provider === DEFAULT_APP_QUEUE_PROVIDERS.QUEUES) {
    return new CloudflareQueueProducer(requireCloudflareQueue(options.queue));
  }

  throw internalServerError("Isolate runtime does not support queue provider", {
    details: strategy,
    expose: true,
  });
}

/**
 * Reserved disposer for isolate queue producers.
 * Current Cloudflare Queue producers are request-bound.
 */
export function disposeIsolateQueueProducer() {
  return Promise.resolve();
}

export function createIsolateQueueConsumer(
  config: RuntimeConfig,
): QueueConsumer<MessageBatch<unknown>> {
  const strategy = getQueueEnvConfig(config);

  if (strategy.provider === DEFAULT_APP_QUEUE_PROVIDERS.QUEUES) {
    return {
      consume: consumeCloudflareQueueBatch,
      start: () => Promise.resolve(),
      stop: () => Promise.resolve(),
    };
  }

  throw internalServerError("Isolate runtime does not support queue provider", {
    details: strategy,
    expose: true,
  });
}

/**
 * Reserved disposer for isolate queue consumers.
 * Current Cloudflare Queue consumers are event-scoped.
 */
export function disposeIsolateQueueConsumer(): Promise<void> {
  return Promise.resolve();
}

export class CloudflareQueueProducer implements QueueProducer {
  constructor(private readonly queue: Queue) {}

  async enqueue(
    message: QueueMessage,
    options: QueueEnqueueOptions = {},
  ): Promise<void> {
    await this.queue.send(message, mapCloudflareQueueOptions(options));
  }

  async enqueueBatch(
    messages: QueueMessage[],
    options: QueueEnqueueOptions = {},
  ): Promise<void> {
    if (messages.length === 0) return;

    await this.queue.sendBatch(
      messages.map((body) => ({
        body,
        ...mapCloudflareQueueOptions(options),
      })),
    );
  }
}

/**
 * Consumes a Cloudflare Queue batch through the shared batch consumer.
 */
export async function consumeCloudflareQueueBatch(
  batch: MessageBatch<unknown>,
  context: QueueJobContext,
): Promise<void> {
  const validMessages = batch.messages.filter(
    (message): message is Message<QueueMessage> => isQueueMessage(message.body),
  );

  for (const message of batch.messages) {
    if (!isQueueMessage(message.body)) {
      message.ack();
    }
  }

  const result = await consumeQueueBatch(
    {
      messages: validMessages.map((message) => ({
        attempts: message.attempts,
        body: message.body,
        id: message.id,
      })),
    },
    context,
  );

  for (const messageResult of result.results) {
    const message = batch.messages.find(
      (candidate) => candidate.id === messageResult.id,
    );

    if (!message) continue;

    if (messageResult.action === "ack") {
      message.ack();
      continue;
    }

    message.retry();
  }
}

function isQueueMessage(value: unknown): value is QueueMessage {
  if (!value || typeof value !== "object") return false;

  const message = value as Partial<QueueMessage>;
  return (
    typeof message.name === "string" &&
    typeof message.payload === "object" &&
    message.payload !== null &&
    typeof message.version === "number"
  );
}

function mapCloudflareQueueOptions(
  options: QueueEnqueueOptions,
): QueueSendOptions {
  return {
    contentType: "json",
    delaySeconds: options.delaySeconds,
  };
}

function requireCloudflareQueue(queue: Queue | undefined): Queue {
  if (!queue) {
    throw internalServerError("Cloudflare Queue binding is required", {
      expose: true,
    });
  }

  return queue;
}
