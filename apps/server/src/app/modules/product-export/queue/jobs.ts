import { chunk } from "@unimolecule/utils";
import { registerQueueJob, type QueueJobContext } from "@/infra/queue";
import { registerSchedulerTask } from "@/infra/scheduler";
import { badGatewayError, internalServerError } from "@/shared/exceptions";
import { createBucketObjectKey } from "@/utils";
import {
  createProductExportBucket,
  createProductExportShopifyClient,
  createProductExportShopifyClientContext,
} from "../runtime";
import {
  completeProductExportBulkOperation,
  fetchProductExportBulkOperation,
  startProductExportBulkOperationForRecord,
} from "../service";
import {
  createProductExportCsvPartStream,
  CSV_HEADER,
  getProductExportFilename,
  isCloudflareRuntime,
  parseProductExportJobPayload,
  PRODUCT_EXPORT_PART_STATUSES,
  PRODUCT_EXPORT_RETRYABLE_PART_STATUSES,
  PRODUCT_EXPORT_STATUSES,
} from "../utils";
import {
  PRODUCT_EXPORT_CLOUDFLARE_FINALIZE_PART_THRESHOLD,
  PRODUCT_EXPORT_CSV_CONTENT_TYPE,
  PRODUCT_EXPORT_JSONL_CHUNK_BYTES,
  PRODUCT_EXPORT_JSONL_CHUNK_OVERLAP_BYTES,
  PRODUCT_EXPORT_MAX_MULTIPART_UPLOAD_PARTS,
  PRODUCT_EXPORT_MAX_PART_BYTES,
  PRODUCT_EXPORT_PART_PAGE_SIZE,
  PRODUCT_EXPORT_QUEUE_JOBS,
  PRODUCT_EXPORT_RECONCILE_BATCH_SIZE,
  PRODUCT_EXPORT_RECONCILE_CONCURRENCY,
  PRODUCT_EXPORT_RECONCILE_CRON,
} from "./constants";
import {
  enqueueProductExportJobFromContext,
  enqueueProductExportJobsFromContext,
} from ".";
import type { ProductExportRepository } from "../repositories/database";
import type { ProductExportPartRecord, ProductExportRecord } from "../types";
import type { Bucket } from "@/infra/bucket";

let registered = false;
const PRODUCT_EXPORT_PART_DELETE_CONCURRENCY = 10;

/**
 * Registers every background entrypoint used by product exports.
 *
 * Example: importing the product-export module during app bootstrap registers
 * both queue jobs and the daily reconcile scheduler before consumers start.
 */
export function registerModuleProductExportJobs(): void {
  if (registered) return;
  registered = true;

  registerQueueJob({
    handler: startBulkJob,
    name: PRODUCT_EXPORT_QUEUE_JOBS.START_BULK,
  });
  registerQueueJob({
    handler: bulkFinishedJob,
    name: PRODUCT_EXPORT_QUEUE_JOBS.BULK_FINISHED,
  });
  registerQueueJob({
    handler: planPartsJob,
    name: PRODUCT_EXPORT_QUEUE_JOBS.PLAN_PARTS,
  });
  registerQueueJob({
    handler: processPartJob,
    name: PRODUCT_EXPORT_QUEUE_JOBS.PROCESS_PART,
  });
  registerQueueJob({
    handler: finalizeJob,
    name: PRODUCT_EXPORT_QUEUE_JOBS.FINALIZE,
  });
  registerQueueJob({
    handler: reconcileJob,
    name: PRODUCT_EXPORT_QUEUE_JOBS.RECONCILE,
  });
  registerSchedulerTask({
    cron: PRODUCT_EXPORT_RECONCILE_CRON,
    handler: async (context) => {
      await enqueueProductExportJobFromContext(
        context,
        PRODUCT_EXPORT_QUEUE_JOBS.RECONCILE,
        {},
      );
    },
    name: PRODUCT_EXPORT_QUEUE_JOBS.RECONCILE,
  });
}

async function startBulkJob(
  payload: Record<string, unknown>,
  context: QueueJobContext,
): Promise<void> {
  const job = parseProductExportJobPayload(payload);
  const repository = await createRepository(context);
  const record = await repository.findById({
    id: job.exportId,
    shopDomain: job.shopDomain,
  });

  if (!record || record.status !== PRODUCT_EXPORT_STATUSES.QUEUED) return;

  const storage = await context.runtimeCapabilities.shopifySessionStorage();
  const { client, session } = await createProductExportShopifyClientContext(
    context.runtimeEnv,
    storage,
    job.shopDomain,
  );
  await startProductExportBulkOperationForRecord({
    client,
    record,
    shopifySessionId: session.id,
    repository,
  });
}

/**
 * Handles the post-webhook stage. The webhook may already have persisted the
 * result URL, but the job re-queries Shopify when the URL is still missing.
 */
async function bulkFinishedJob(
  payload: Record<string, unknown>,
  context: QueueJobContext,
): Promise<void> {
  const job = parseProductExportJobPayload(payload);
  const repository = await createRepository(context);
  const record = await repository.findById({
    id: job.exportId,
    shopDomain: job.shopDomain,
  });

  if (!record?.shopifyBulkOperationId) return;

  if (!record.resultUrl) {
    const storage = await context.runtimeCapabilities.shopifySessionStorage();
    const client = await createProductExportShopifyClient(
      context.runtimeEnv,
      storage,
      job.shopDomain,
    );
    const operation = await fetchProductExportBulkOperation(
      client,
      record.shopifyBulkOperationId,
    );

    if (!operation) return;

    await updateBulkOperationResult(context, record, operation);
  }

  await enqueueProductExportJobFromContext(
    context,
    PRODUCT_EXPORT_QUEUE_JOBS.PLAN_PARTS,
    job,
  );
}

/**
 * Splits the Shopify JSONL result into idempotent byte-range parts.
 *
 * The unique database key `(exportId, seq)` makes repeated webhooks, cron
 * retries and duplicate queue messages safe.
 */
async function planPartsJob(
  payload: Record<string, unknown>,
  context: QueueJobContext,
): Promise<void> {
  const job = parseProductExportJobPayload(payload);
  const repository = await createRepository(context);
  const record = await repository.findById({
    id: job.exportId,
    shopDomain: job.shopDomain,
  });

  if (!record?.resultUrl || !record.fileSize) return;

  const existingStats = await repository.getPartStats(record.id);
  if (existingStats.total > 0) {
    await enqueuePendingParts(context, repository, record);
    return;
  }

  const now = new Date();
  const parts = createPartRecords(record, now);
  await repository.createParts(parts);
  await repository.update({
    ...record,
    status: PRODUCT_EXPORT_STATUSES.GENERATING_CSV,
    updatedAt: new Date(),
  });
  await enqueueProductExportJobsFromContext(
    context,
    PRODUCT_EXPORT_QUEUE_JOBS.PROCESS_PART,
    parts.map((part) => ({
      exportId: record.id,
      seq: part.seq,
      shopDomain: record.shopDomain,
    })),
  );
}

/**
 * Processes one product export part.
 *
 * The database claim step is the idempotency gate: only `pending` or `failed`
 * parts can move to `processing`, so duplicate messages simply no-op.
 */
async function processPartJob(
  payload: Record<string, unknown>,
  context: QueueJobContext,
): Promise<void> {
  const job = parseProductExportJobPayload(payload);
  if (job.seq === undefined) return;

  const repository = await createRepository(context);
  const record = await repository.findById({
    id: job.exportId,
    shopDomain: job.shopDomain,
  });
  const part = await repository.claimPart({
    exportId: job.exportId,
    seq: job.seq,
  });

  if (!record?.resultUrl || !part) return;

  try {
    const bucket = await createProductExportBucket(context);
    const processed = await processPart(record, part, bucket);
    await repository.markPartDone({
      bucketKey: processed.bucketKey,
      bucketProvider: processed.bucketProvider,
      byteSize: processed.byteSize,
      exportId: part.exportId,
      rowCount: processed.rowCount,
      seq: part.seq,
    });
  } catch (error) {
    await repository.markPartFailed({
      errorCode: "PROCESS_PART_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
      exportId: part.exportId,
      seq: part.seq,
    });
    throw error;
  }

  const stats = await repository.getPartStats(record.id);
  if (stats.total > 0 && stats.done === stats.total) {
    await enqueueProductExportJobFromContext(
      context,
      PRODUCT_EXPORT_QUEUE_JOBS.FINALIZE,
      job,
    );
  }
}

/**
 * Assembles CSV parts into the final export file.
 *
 * Cloudflare can finalize small exports. Large exports fail with a clear
 * runtime boundary because a Worker queue cannot switch itself to Node.
 */
async function finalizeJob(
  payload: Record<string, unknown>,
  context: QueueJobContext,
): Promise<void> {
  const job = parseProductExportJobPayload(payload);
  const repository = await createRepository(context);
  const record = await repository.findById({
    id: job.exportId,
    shopDomain: job.shopDomain,
  });

  if (!record) return;

  if (record.status === PRODUCT_EXPORT_STATUSES.READY) {
    const bucket = await createProductExportBucket(context);
    await deleteProductExportPartObjectsByPage(repository, record.id, bucket);
    return;
  }

  const stats = await repository.getPartStats(record.id);
  if (stats.total === 0 || stats.done !== stats.total) return;

  if (
    isCloudflareRuntime(context.runtimeEnv) &&
    stats.total > PRODUCT_EXPORT_CLOUDFLARE_FINALIZE_PART_THRESHOLD
  ) {
    const errorMessage =
      "Product export cannot be finalized in Cloudflare runtime because it exceeds the Cloudflare finalize part threshold and this environment cannot switch to Node.";
    await repository.update({
      ...record,
      errorCode: "CLOUDFLARE_FINALIZE_UNSUPPORTED",
      errorMessage,
      status: PRODUCT_EXPORT_STATUSES.FAILED,
      updatedAt: new Date(),
    });
    throw badGatewayError(errorMessage, {
      details: {
        exportId: record.id,
        partThreshold: PRODUCT_EXPORT_CLOUDFLARE_FINALIZE_PART_THRESHOLD,
        totalParts: stats.total,
      },
      expose: true,
    });
  }

  const bucket = await createProductExportBucket(context);
  const finalObject = await finalizeParts(record, repository, bucket);
  await repository.update({
    ...record,
    bucketKey: finalObject.bucketKey,
    bucketProvider: finalObject.bucketProvider,
    completedAt: new Date(),
    fileSize: finalObject.byteSize,
    status: PRODUCT_EXPORT_STATUSES.READY,
    updatedAt: new Date(),
  });
  await deleteProductExportPartObjectsByPage(repository, record.id, bucket);
}

/**
 * Daily safety net for missed webhooks, failed parts and duplicate events.
 * Ready/canceled records are excluded by the repository query, so successful exports
 * disappear from reconciliation naturally.
 */
async function reconcileJob(
  _payload: Record<string, unknown>,
  context: QueueJobContext,
): Promise<void> {
  const repository = await createRepository(context);
  const olderThan = new Date(Date.now() - 15 * 60 * 1000);
  let cursor: { id: string; updatedAt: Date } | undefined;

  while (true) {
    const records = await repository.listRecoverableExports({
      cursor,
      limit: PRODUCT_EXPORT_RECONCILE_BATCH_SIZE,
      olderThan,
    });

    if (records.length === 0) return;

    await reconcileRecords(context, repository, records);

    const lastRecord = records.at(-1)!;
    cursor = {
      id: lastRecord.id,
      updatedAt: lastRecord.updatedAt,
    };

    if (records.length < PRODUCT_EXPORT_RECONCILE_BATCH_SIZE) return;
  }
}

async function reconcileRecords(
  context: QueueJobContext,
  repository: ProductExportRepository,
  records: ProductExportRecord[],
): Promise<void> {
  const failures: Array<{ error: unknown; exportId: string }> = [];

  for (const batch of chunk(records, PRODUCT_EXPORT_RECONCILE_CONCURRENCY)) {
    const results = await Promise.allSettled(
      batch.map((record) => reconcileRecord(context, repository, record)),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") return;

      failures.push({
        error: result.reason,
        exportId: batch[index]!.id,
      });
    });
  }

  if (failures.length > 0) {
    throw internalServerError("Failed to reconcile product exports", {
      details: {
        failures: failures.map(({ error, exportId }) => ({
          error: error instanceof Error ? error.message : String(error),
          exportId,
        })),
      },
    });
  }
}

async function reconcileRecord(
  context: QueueJobContext,
  repository: ProductExportRepository,
  record: ProductExportRecord,
): Promise<void> {
  if (record.status === PRODUCT_EXPORT_STATUSES.QUEUED) {
    await enqueueProductExportJobFromContext(
      context,
      PRODUCT_EXPORT_QUEUE_JOBS.START_BULK,
      { exportId: record.id, shopDomain: record.shopDomain },
    );
    return;
  }

  if (record.status === PRODUCT_EXPORT_STATUSES.BULK_OPERATION_RUNNING) {
    await enqueueProductExportJobFromContext(
      context,
      PRODUCT_EXPORT_QUEUE_JOBS.BULK_FINISHED,
      { exportId: record.id, shopDomain: record.shopDomain },
    );
    return;
  }

  if (record.status === PRODUCT_EXPORT_STATUSES.BULK_OPERATION_COMPLETED) {
    const nextJob =
      record.resultUrl && record.fileSize
        ? PRODUCT_EXPORT_QUEUE_JOBS.PLAN_PARTS
        : PRODUCT_EXPORT_QUEUE_JOBS.BULK_FINISHED;
    await enqueueProductExportJobFromContext(context, nextJob, {
      exportId: record.id,
      shopDomain: record.shopDomain,
    });
    return;
  }

  const retryParts = await repository.listPartsByStatus({
    exportId: record.id,
    statuses: [...PRODUCT_EXPORT_RETRYABLE_PART_STATUSES],
  });
  await enqueueProductExportJobsFromContext(
    context,
    PRODUCT_EXPORT_QUEUE_JOBS.PROCESS_PART,
    retryParts.map((part) => ({
      exportId: record.id,
      seq: part.seq,
      shopDomain: record.shopDomain,
    })),
  );

  const stats = await repository.getPartStats(record.id);
  if (stats.total > 0 && stats.done === stats.total) {
    await enqueueProductExportJobFromContext(
      context,
      PRODUCT_EXPORT_QUEUE_JOBS.FINALIZE,
      { exportId: record.id, shopDomain: record.shopDomain },
    );
  }
}

/**
 * Persists fresh BulkOperation metadata fetched by a queue worker using the
 * same use-case helper as the webhook, but with queue-native dependencies.
 */
async function updateBulkOperationResult(
  context: QueueJobContext,
  record: ProductExportRecord,
  operation: NonNullable<
    Awaited<ReturnType<typeof fetchProductExportBulkOperation>>
  >,
): Promise<void> {
  await completeProductExportBulkOperation({
    input: {
      bulkOperationId: record.shopifyBulkOperationId!,
      completedAt: operation.completedAt,
      errorCode: operation.errorCode,
      fileSize: operation.fileSize,
      objectCount: operation.objectCount,
      partialDataUrl: operation.partialDataUrl,
      resultUrl: operation.resultUrl,
      shopDomain: record.shopDomain,
      status: operation.status,
    },
    repository: createRepository(context),
  });
}

/**
 * Re-enqueues all retryable parts for an export.
 *
 * Example: when `plan-parts` is retried after parts already exist, it does not
 * recreate rows; it only schedules unfinished work.
 */
async function enqueuePendingParts(
  context: QueueJobContext,
  repository: ProductExportRepository,
  record: ProductExportRecord,
): Promise<void> {
  const retryParts = await repository.listPartsByStatus({
    exportId: record.id,
    statuses: [...PRODUCT_EXPORT_RETRYABLE_PART_STATUSES],
  });

  await enqueueProductExportJobsFromContext(
    context,
    PRODUCT_EXPORT_QUEUE_JOBS.PROCESS_PART,
    retryParts.map((part) => ({
      exportId: record.id,
      seq: part.seq,
      shopDomain: record.shopDomain,
    })),
  );
}

/**
 * Creates a product-export repository from the queue runtime context.
 */
function createRepository(context: QueueJobContext): ProductExportRepository {
  return context.runtimeCapabilities.database.repositories.productExports();
}

/**
 * Builds part rows from a Shopify result size.
 *
 * `rangeStart` may include overlap for parts after the first one, while `seq`
 * still defines the nominal chunk used to decide which complete JSONL lines
 * belong to this part.
 */
function createPartRecords(
  record: ProductExportRecord,
  now: Date,
): ProductExportPartRecord[] {
  const fileSize = record.fileSize ?? 0;
  const parts: ProductExportPartRecord[] = [];

  for (
    let start = 0, seq = 0;
    start < fileSize;
    start += PRODUCT_EXPORT_JSONL_CHUNK_BYTES, seq += 1
  ) {
    const rangeStart =
      seq === 0
        ? start
        : Math.max(0, start - PRODUCT_EXPORT_JSONL_CHUNK_OVERLAP_BYTES);
    const rangeEnd = Math.min(
      fileSize - 1,
      start + PRODUCT_EXPORT_JSONL_CHUNK_BYTES - 1,
    );

    parts.push({
      attempts: 0,
      bucketKey: null,
      bucketProvider: null,
      byteSize: null,
      completedAt: null,
      createdAt: now,
      errorCode: null,
      errorMessage: null,
      exportId: record.id,
      id: crypto.randomUUID(),
      lockedAt: null,
      rangeEnd,
      rangeStart,
      rowCount: null,
      seq,
      status: PRODUCT_EXPORT_PART_STATUSES.PENDING,
      updatedAt: now,
    });
  }

  return parts;
}

/**
 * Fetches one Range chunk, keeps only complete JSONL lines owned by the part,
 * converts those products to CSV rows, and stores the CSV part in the bucket.
 */
async function processPart(
  record: ProductExportRecord,
  part: ProductExportPartRecord,
  bucket: Bucket,
): Promise<{
  bucketKey: string;
  bucketProvider: string;
  byteSize: number;
  rowCount: number;
}> {
  const response = await fetch(record.resultUrl!, {
    headers: {
      Range: `bytes=${part.rangeStart}-${part.rangeEnd}`,
    },
  });

  if (!response.ok && response.status !== 206) {
    throw badGatewayError("Failed to fetch product export part", {
      details: {
        status: response.status,
        statusText: response.statusText,
        url: record.resultUrl,
      },
    });
  }

  if (!response.body) {
    throw badGatewayError(
      "Product export part response did not include a body",
      {
        details: {
          url: record.resultUrl,
        },
      },
    );
  }

  const csv = createProductExportCsvPartStream(response.body, part);
  const key = createBucketObjectKey({
    date: record.createdAt,
    filename: `${part.seq}.csv`,
    id: record.id,
    namespace: "product-exports",
    shopDomain: record.shopDomain,
  });
  const stored = await bucket.put({
    body: csv.body,
    contentType: PRODUCT_EXPORT_CSV_CONTENT_TYPE,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    key,
    maxBytes: PRODUCT_EXPORT_MAX_PART_BYTES,
    maxParts: PRODUCT_EXPORT_MAX_MULTIPART_UPLOAD_PARTS,
    originalName: `${part.seq}.csv`,
    safeName: `${part.seq}.csv`,
    shopDomain: record.shopDomain,
  });

  return {
    bucketKey: stored.key,
    bucketProvider: stored.provider,
    byteSize: stored.byteSize,
    rowCount: csv.getRowCount(),
  };
}

/**
 * Concatenates CSV parts into a merchant-facing CSV file.
 *
 * The header is written once here; individual CSV parts contain data rows only.
 */
async function finalizeParts(
  record: ProductExportRecord,
  repository: ProductExportRepository,
  bucket: Bucket,
): Promise<{
  bucketKey: string;
  bucketProvider: string;
  byteSize: number;
}> {
  const filename = getProductExportFilename(record.name);
  const key = createBucketObjectKey({
    date: record.createdAt,
    filename,
    id: record.id,
    namespace: "product-exports",
    shopDomain: record.shopDomain,
  });
  const stored = await bucket.put({
    body: createFinalCsvStream(bucket, repository, record.id),
    contentType: PRODUCT_EXPORT_CSV_CONTENT_TYPE,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    key,
    maxBytes: Math.max(record.fileSize ?? 0, PRODUCT_EXPORT_MAX_PART_BYTES),
    maxParts: PRODUCT_EXPORT_MAX_MULTIPART_UPLOAD_PARTS,
    originalName: filename,
    safeName: filename,
    shopDomain: record.shopDomain,
  });

  return {
    bucketKey: stored.key,
    bucketProvider: stored.provider,
    byteSize: stored.byteSize,
  };
}

function createFinalCsvStream(
  bucket: Bucket,
  repository: ProductExportRepository,
  exportId: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let afterSeq: number | undefined;
  let didWriteHeader = false;
  let page: ProductExportPartRecord[] = [];
  let pageIndex = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!didWriteHeader) {
        didWriteHeader = true;
        controller.enqueue(encoder.encode(CSV_HEADER));
        return;
      }

      while (true) {
        if (!reader) {
          const part = await nextPart();
          if (!part) {
            controller.close();
            return;
          }

          if (!part?.bucketKey) {
            continue;
          }
          const object = await bucket.open({ key: part.bucketKey });
          reader = object.body.getReader();
        }

        const { done, value } = await reader.read();
        if (done) {
          reader = undefined;
          continue;
        }

        controller.enqueue(value);
        return;
      }
    },
    async cancel(reason) {
      await reader?.cancel(reason).catch(() => undefined);
    },
  });

  async function nextPart(): Promise<ProductExportPartRecord | undefined> {
    while (pageIndex >= page.length) {
      page = await repository.listPartsPage({
        afterSeq,
        exportId,
        limit: PRODUCT_EXPORT_PART_PAGE_SIZE,
      });
      pageIndex = 0;

      if (page.length === 0) return undefined;

      afterSeq = page.at(-1)!.seq;
    }

    const part = page[pageIndex];
    pageIndex += 1;
    return part;
  }
}

/**
 * Removes intermediate CSV parts after the final merchant-facing CSV is ready.
 *
 * R2 folders are key prefixes, so deleting every part object removes the
 * temporary folder-like entries while keeping `products.csv` available.
 */
export async function deleteProductExportPartObjects(
  parts: ProductExportPartRecord[],
  bucket: Bucket,
): Promise<void> {
  const errors: Array<{ error: unknown; key: string }> = [];
  const keys = parts.flatMap((part) =>
    part.bucketKey ? [part.bucketKey] : [],
  );

  for (const batch of chunk(keys, PRODUCT_EXPORT_PART_DELETE_CONCURRENCY)) {
    const results = await Promise.allSettled(
      batch.map((key) => bucket.delete({ key })),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") return;

      errors.push({
        error: result.reason,
        key: batch[index]!,
      });
    });
  }

  if (errors.length > 0) {
    throw badGatewayError("Failed to delete product export part objects", {
      details: {
        failures: errors.map(({ error, key }) => ({
          error: error instanceof Error ? error.message : String(error),
          key,
        })),
      },
    });
  }
}

async function deleteProductExportPartObjectsByPage(
  repository: ProductExportRepository,
  exportId: string,
  bucket: Bucket,
): Promise<void> {
  let afterSeq: number | undefined;

  while (true) {
    const parts = await repository.listPartsPage({
      afterSeq,
      exportId,
      limit: PRODUCT_EXPORT_PART_PAGE_SIZE,
    });

    if (parts.length === 0) return;

    await deleteProductExportPartObjects(parts, bucket);
    afterSeq = parts.at(-1)!.seq;
  }
}
