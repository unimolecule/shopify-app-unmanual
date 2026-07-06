import { DEFAULT_WEBHOOK_MAX_SIZE } from "@/constants";

export const PRODUCT_EXPORT_QUEUE_JOBS = {
  BULK_FINISHED: "product-export.bulk-finished",
  FINALIZE: "product-export.finalize",
  PLAN_PARTS: "product-export.plan-parts",
  PROCESS_PART: "product-export.process-part",
  RECONCILE: "product-export.reconcile",
  START_BULK: "product-export.start-bulk",
} as const;

export const PRODUCT_EXPORT_RECONCILE_CRON = "0 0 * * *";
export const PRODUCT_EXPORT_CSV_CONTENT_TYPE = "text/csv";
export const PRODUCT_EXPORT_JSONL_CHUNK_BYTES = DEFAULT_WEBHOOK_MAX_SIZE;
export const PRODUCT_EXPORT_JSONL_CHUNK_OVERLAP_BYTES =
  DEFAULT_WEBHOOK_MAX_SIZE / 1024 / 4;
export const PRODUCT_EXPORT_MAX_PART_BYTES = DEFAULT_WEBHOOK_MAX_SIZE * 4;
export const PRODUCT_EXPORT_CLOUDFLARE_FINALIZE_PART_THRESHOLD = 64;
export const PRODUCT_EXPORT_PART_PAGE_SIZE = 100;
export const PRODUCT_EXPORT_MAX_MULTIPART_UPLOAD_PARTS = 10_000;
export const PRODUCT_EXPORT_RECONCILE_BATCH_SIZE = 100;
export const PRODUCT_EXPORT_RECONCILE_CONCURRENCY = 4;
