export const PRODUCT_EXPORT_STATUS_VALUES = [
  "queued",
  "bulk_operation_running",
  "bulk_operation_completed",
  "generating_csv",
  "ready",
  "requires_node_finalize",
  "failed",
  "canceled",
] as const;

export const PRODUCT_EXPORT_PART_STATUS_VALUES = [
  "pending",
  "processing",
  "done",
  "failed",
] as const;

export const PRODUCT_EXPORT_TEMPLATE_CODE_VALUES = ["basic"] as const;
