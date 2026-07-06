import { internalServerError } from "@/shared/exceptions";
import { getQueueJob, type QueueJobContext } from "./registry";
import type { QueueMessage } from "./shared";

export type QueueConsumerMessage = {
  attempts: number;
  body: QueueMessage;
  id: string;
};

export type QueueConsumerBatch = {
  messages: QueueConsumerMessage[];
};

export type QueueMessageConsumeResult =
  | {
      action: "ack";
      id: string;
    }
  | {
      action: "retry";
      error: unknown;
      id: string;
    };

export type QueueBatchConsumeResult = {
  results: QueueMessageConsumeResult[];
};

/**
 * Routes a runtime consumer batch to registered job handlers. Business jobs are
 * single-message by default but can opt into batch handlers.
 */
export async function consumeQueueBatch(
  batch: QueueConsumerBatch,
  context: QueueJobContext,
): Promise<QueueBatchConsumeResult> {
  const results: QueueMessageConsumeResult[] = [];

  for (const group of groupMessagesByName(batch.messages)) {
    const job = getQueueJob(group.name);

    if (!job) {
      const error = internalServerError("Unknown queue job", {
        details: {
          name: group.name,
        },
        expose: true,
      });
      results.push(
        ...group.messages.map((message) => ({
          action: "retry" as const,
          error,
          id: message.id,
        })),
      );
      continue;
    }

    if (job.mode === "batch") {
      try {
        await job.batchHandler(
          group.messages.map((message) => message.body),
          context,
        );
        results.push(
          ...group.messages.map((message) => ({
            action: "ack" as const,
            id: message.id,
          })),
        );
      } catch (error) {
        results.push(
          ...group.messages.map((message) => ({
            action: "retry" as const,
            error,
            id: message.id,
          })),
        );
      }

      continue;
    }

    for (const message of group.messages) {
      try {
        await job.handler(message.body.payload, context);
        results.push({ action: "ack", id: message.id });
      } catch (error) {
        results.push({ action: "retry", error, id: message.id });
      }
    }
  }

  return { results };
}

function groupMessagesByName(messages: QueueConsumerMessage[]): Array<{
  messages: QueueConsumerMessage[];
  name: string;
}> {
  const groups = new Map<string, QueueConsumerMessage[]>();

  for (const message of messages) {
    const group = groups.get(message.body.name) ?? [];
    group.push(message);
    groups.set(message.body.name, group);
  }

  return [...groups].map(([name, groupedMessages]) => ({
    messages: groupedMessages,
    name,
  }));
}
