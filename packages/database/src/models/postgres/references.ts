import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const postgresReferences = pgTable(
  "references",
  {
    id: text("id").primaryKey(),
    shopDomain: text("shop_domain").notNull(),
    namespace: text("namespace").notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    enabled: boolean("enabled").notNull(),
    system: boolean("system").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
