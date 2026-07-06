import { DEFAULT_APP_BUCKET_PROVIDERS } from "@shamt/app-env/constants";
import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { FILE_STATUS_VALUES } from "../../constants";

export const fileStatusEnum = pgEnum("file_status", FILE_STATUS_VALUES);

export const fileBucketProviderEnum = pgEnum(
  "file_bucket_provider",
  DEFAULT_APP_BUCKET_PROVIDERS,
);

export const postgresFiles = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    shopDomain: text("shop_domain").notNull(),
    originalName: text("original_name").notNull(),
    safeName: text("safe_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull().default(0),
    bucketProvider: fileBucketProviderEnum("bucket_provider").notNull(),
    bucketKey: text("bucket_key").notNull(),
    status: fileStatusEnum("status").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
