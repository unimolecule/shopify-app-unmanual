import { runtimeCapabilities } from "@/app/runtime/runtime-capabilities";
import { getEnvProvider } from "@/infra/provider";
import { badGatewayError } from "@/shared/exceptions";
import type { PRODUCT_EXPORT_QUEUE_JOBS } from "./constants";
import type { QueueJobContext, QueueMessage } from "@/infra/queue";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";

export type ProductExportJobPayload = {
  exportId: string;
  seq?: number;
  shopDomain: string;
};

export type ProductExportReconcilePayload = Record<string, never>;

export type ProductExportJobName =
  (typeof PRODUCT_EXPORT_QUEUE_JOBS)[keyof typeof PRODUCT_EXPORT_QUEUE_JOBS];

/**
 * Creates the normalized queue envelope consumed by infra/queue.
 */
export function createProductExportQueueMessage<
  TPayload extends Record<string, unknown>,
>(name: ProductExportJobName, payload: TPayload, requestId?: string) {
  return {
    name,
    payload,
    requestId,
    version: 1,
  } satisfies QueueMessage<ProductExportJobName, TPayload>;
}

/**
 * Enqueues a product-export job from an HTTP/webhook request context.
 */
export async function enqueueProductExportJob(
  c: Context<AppEnv>,
  name: ProductExportJobName,
  payload: ProductExportJobPayload | ProductExportReconcilePayload,
): Promise<void> {
  const producer = await runtimeCapabilities(c).queue.producer();
  await producer.enqueue(
    createProductExportQueueMessage(name, payload, c.get("requestId")),
    {
      idempotencyKey: createIdempotencyKey(name, payload),
      maxAttempts: getEnvProvider(c.get("runtimeEnv") ?? c.env)
        .APP_QUEUE_CONSUMER_MAX_RETRIES,
    },
  );
}

/**
 * Enqueues a single product-export job from queue/scheduler context.
 *
 * Example: reconcile can schedule `product-export.process-part` without a
 * Hono request by using runtime bindings stored on the job context.
 */
export async function enqueueProductExportJobFromContext(
  context: QueueJobContext,
  name: ProductExportJobName,
  payload: ProductExportJobPayload | ProductExportReconcilePayload,
): Promise<void> {
  const producer = await createQueueProducerFromContext(context);

  await producer.enqueue(createProductExportQueueMessage(name, payload), {
    idempotencyKey: createIdempotencyKey(name, payload),
    maxAttempts: context.runtimeEnv.APP_QUEUE_CONSUMER_MAX_RETRIES,
  });
}

/**
 * Enqueues many product-export jobs from queue/scheduler context.
 */
export async function enqueueProductExportJobsFromContext(
  context: QueueJobContext,
  name: ProductExportJobName,
  payloads: ProductExportJobPayload[],
): Promise<void> {
  if (payloads.length === 0) return;

  const producer = await createQueueProducerFromContext(context);

  await producer.enqueueBatch(
    payloads.map((payload) => createProductExportQueueMessage(name, payload)),
    {
      maxAttempts: context.runtimeEnv.APP_QUEUE_CONSUMER_MAX_RETRIES,
    },
  );
}

function createQueueProducerFromContext(context: QueueJobContext) {
  const factory = context.runtimeCapabilities.queue.producer;

  if (!factory) {
    throw badGatewayError(
      "Runtime capability is not available: queue.producer",
      {
        expose: true,
      },
    );
  }

  return factory();
}

/**
 * Builds a stable queue idempotency key for providers that support it.
 */
function createIdempotencyKey(
  name: ProductExportJobName,
  payload: ProductExportJobPayload | ProductExportReconcilePayload,
): string {
  if ("exportId" in payload) {
    return [
      name,
      payload.exportId,
      payload.seq === undefined ? "" : String(payload.seq),
    ].join(":");
  }

  return name;
}
