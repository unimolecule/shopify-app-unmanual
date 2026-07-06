import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  PRODUCT_EXPORT_PART_STATUS_VALUES,
  PRODUCT_EXPORT_STATUS_VALUES,
  PRODUCT_EXPORT_TEMPLATE_CODE_VALUES,
} from "../../constants";
import { sqliteShopifySessions } from "./shopify-sessions";

export const sqliteProductExports = sqliteTable(
  "product_exports",
  {
    id: text("id").primaryKey(),
    shopDomain: text("shop_domain").notNull(),
    shopifySessionId: text("shopify_session_id").references(
      () => sqliteShopifySessions.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    template: text("template", {
      enum: PRODUCT_EXPORT_TEMPLATE_CODE_VALUES,
    })
      .notNull()
      .default("basic"),
    status: text("status", { enum: PRODUCT_EXPORT_STATUS_VALUES }).notNull(),
    shopifyBulkOperationId: text("shopify_bulk_operation_id"),
    shopifyBulkOperationStatus: text("shopify_bulk_operation_status"),
    resultUrl: text("result_url"),
    partialDataUrl: text("partial_data_url"),
    objectCount: integer("object_count"),
    fileSize: integer("file_size"),
    bucketProvider: text("bucket_provider"),
    bucketKey: text("bucket_key"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("product_exports_shop_created_id_idx").on(
      table.shopDomain,
      table.createdAt,
      table.id,
    ),
    index("product_exports_shop_status_created_id_idx").on(
      table.shopDomain,
      table.status,
      table.createdAt,
      table.id,
    ),
    index("product_exports_status_updated_id_idx").on(
      table.status,
      table.updatedAt,
      table.id,
    ),
    index("product_exports_bulk_operation_idx").on(
      table.shopifyBulkOperationId,
    ),
  ],
);

export const sqliteProductExportParts = sqliteTable(
  "product_export_parts",
  {
    id: text("id").primaryKey(),
    exportId: text("export_id")
      .notNull()
      .references(() => sqliteProductExports.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    status: text("status", {
      enum: PRODUCT_EXPORT_PART_STATUS_VALUES,
    }).notNull(),
    rangeStart: integer("range_start").notNull(),
    rangeEnd: integer("range_end").notNull(),
    bucketProvider: text("bucket_provider"),
    bucketKey: text("bucket_key"),
    byteSize: integer("byte_size"),
    rowCount: integer("row_count"),
    attempts: integer("attempts").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("product_export_parts_export_seq_idx").on(
      table.exportId,
      table.seq,
    ),
    index("product_export_parts_export_status_idx").on(
      table.exportId,
      table.status,
    ),
  ],
);
