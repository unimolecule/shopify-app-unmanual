import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const sqliteReferences = sqliteTable(
  "references",
  {
    id: text("id").primaryKey(),
    shopDomain: text("shop_domain").notNull(),
    namespace: text("namespace").notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    system: integer("system", { mode: "boolean" }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("references_shop_namespace_code_idx").on(
      table.shopDomain,
      table.namespace,
      table.code,
    ),
    index("references_shop_namespace_sort_idx").on(
      table.shopDomain,
      table.namespace,
      table.enabled,
      table.sortOrder,
      table.code,
    ),
  ],
);
