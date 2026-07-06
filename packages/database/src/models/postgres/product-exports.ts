import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  PRODUCT_EXPORT_PART_STATUS_VALUES,
  PRODUCT_EXPORT_STATUS_VALUES,
  PRODUCT_EXPORT_TEMPLATE_CODE_VALUES,
} from "../../constants";
import { postgresShopifySessions } from "./shopify-sessions";

export const productExportStatusEnum = pgEnum(
  "product_export_status",
  PRODUCT_EXPORT_STATUS_VALUES,
);

export const productExportPartStatusEnum = pgEnum(
  "product_export_part_status",
  PRODUCT_EXPORT_PART_STATUS_VALUES,
);

export const postgresProductExports = pgTable(
  "product_exports",
  {
    id: text("id").primaryKey(),
    shopDomain: text("shop_domain").notNull(),
    shopifySessionId: text("shopify_session_id").references(
      () => postgresShopifySessions.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    template: text("template", {
      enum: PRODUCT_EXPORT_TEMPLATE_CODE_VALUES,
    })
      .notNull()
      .default("basic"),
    status: productExportStatusEnum("status").notNull(),
    shopifyBulkOperationId: text("shopify_bulk_operation_id"),
    shopifyBulkOperationStatus: text("shopify_bulk_operation_status"),
    resultUrl: text("result_url"),
    partialDataUrl: text("partial_data_url"),
    objectCount: bigint("object_count", { mode: "number" }),
    fileSize: bigint("file_size", { mode: "number" }),
    bucketProvider: text("bucket_provider"),
    bucketKey: text("bucket_key"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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

export const postgresProductExportParts = pgTable(
  "product_export_parts",
  {
    id: text("id").primaryKey(),
    exportId: text("export_id")
      .notNull()
      .references(() => postgresProductExports.id, { onDelete: "cascade" }),
    seq: bigint("seq", { mode: "number" }).notNull(),
    status: productExportPartStatusEnum("status").notNull(),
    rangeStart: bigint("range_start", { mode: "number" }).notNull(),
    rangeEnd: bigint("range_end", { mode: "number" }).notNull(),
    bucketProvider: text("bucket_provider"),
    bucketKey: text("bucket_key"),
    byteSize: bigint("byte_size", { mode: "number" }),
    rowCount: bigint("row_count", { mode: "number" }),
    attempts: bigint("attempts", { mode: "number" }).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
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
