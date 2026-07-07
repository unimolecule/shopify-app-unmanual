import {
  DEFAULT_APP_BUCKET_PROVIDERS,
  type DEFAULT_APP_BUCKET_PROVIDERS_VALUES,
} from "@unimolecule/shopify-app-unmanual-app-env/constants";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { FILE_STATUS_VALUES } from "../../constants";

const FILE_BUCKET_PROVIDER_VALUES = Object.values(
  DEFAULT_APP_BUCKET_PROVIDERS,
) as [
  DEFAULT_APP_BUCKET_PROVIDERS_VALUES,
  ...DEFAULT_APP_BUCKET_PROVIDERS_VALUES[],
];

export const sqliteFiles = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    shopDomain: text("shop_domain").notNull(),
    originalName: text("original_name").notNull(),
    safeName: text("safe_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull().default(0),
    bucketProvider: text("bucket_provider", {
      enum: FILE_BUCKET_PROVIDER_VALUES,
    }).notNull(),
    bucketKey: text("bucket_key").notNull(),
    status: text("status", { enum: FILE_STATUS_VALUES }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("files_shop_created_id_idx").on(
      table.shopDomain,
      table.createdAt,
      table.id,
    ),
    index("files_shop_status_idx").on(table.shopDomain, table.status),
    index("files_expires_at_idx").on(table.expiresAt),
  ],
);
