import { getEnvProvider, getLoggerProvider } from "@/infra/provider";
import { createResponse } from "@/shared/models";
import {
  parseNullableDate,
  readNullableNumber,
  readNullableString,
} from "@/utils";
import { enqueueProductExportJob } from "../queue";
import { PRODUCT_EXPORT_QUEUE_JOBS } from "../queue/constants";
import {
  completeProductExportBulkOperation,
  getProductExportsRepository,
} from "../service";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";

type BulkOperationFinishWebhookPayload = {
  admin_graphql_api_id?: unknown;
  completed_at?: unknown;
  error_code?: unknown;
  file_size?: unknown;
  object_count?: unknown;
  partial_data_url?: unknown;
  status?: unknown;
  url?: unknown;
};

/**
 * Handles Shopify's bulk operation finish webhook.
 *
 * The webhook payload is small and only signals completion. Large JSONL data is
 * fetched later by queued Range jobs using the result URL.
 */
export async function handleProductExportBulkOperationFinishWebhook(
  c: Context<AppEnv>,
) {
  const webhook = c.var.shopifyWebhook;
  const payload = parseBulkOperationFinishWebhookPayload(webhook.payload);
  const logger = await getLoggerProvider(
    getEnvProvider(c.get("runtimeEnv") ?? c.env),
  );

  if (!payload) {
    logger.warn(
      `Ignored bulk operation finish webhook with invalid payload from ${webhook.shop}`,
    );

    return c.json(
      createResponse({
        data: { ok: true },
        requestId: c.get("requestId"),
      }),
    );
  }

  const record = await completeProductExportBulkOperation({
    input: {
      bulkOperationId: payload.admin_graphql_api_id,
      completedAt: parseNullableDate(payload.completed_at),
      errorCode: readNullableString(payload.error_code),
      fileSize: readNullableNumber(payload.file_size),
      objectCount: readNullableNumber(payload.object_count),
      partialDataUrl: readNullableString(payload.partial_data_url),
      resultUrl: readNullableString(payload.url),
      shopDomain: webhook.shop,
      status: payload.status,
    },
    repository: getProductExportsRepository(c),
  });

  if (record) {
    await enqueueProductExportJob(c, PRODUCT_EXPORT_QUEUE_JOBS.BULK_FINISHED, {
      exportId: record.id,
      shopDomain: webhook.shop,
    });
  } else {
    logger.info(
      `Ignored bulk operation finish webhook for unmanaged operation ${payload.admin_graphql_api_id}`,
    );
  }

  return c.json(
    createResponse({
      data: { ok: true },
      requestId: c.get("requestId"),
    }),
  );
}

/**
 * Validates the fields required to identify a Shopify BulkOperation.
 */
function parseBulkOperationFinishWebhookPayload(value: unknown):
  | ({
      admin_graphql_api_id: string;
      completed_at?: unknown;
      status: string;
    } & BulkOperationFinishWebhookPayload)
  | null {
  if (!value || typeof value !== "object") return null;

  const payload = value as BulkOperationFinishWebhookPayload;
  if (
    typeof payload.admin_graphql_api_id !== "string" ||
    typeof payload.status !== "string"
  ) {
    return null;
  }

  return {
    ...payload,
    admin_graphql_api_id: payload.admin_graphql_api_id,
    status: payload.status,
  };
}
