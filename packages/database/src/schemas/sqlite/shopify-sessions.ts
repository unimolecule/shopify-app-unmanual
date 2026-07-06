import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { sqliteShopifySessions } from "../../models/sqlite";

export const insertSqliteShopifySessionSchema = createInsertSchema(
  sqliteShopifySessions,
);
export const updateSqliteShopifySessionSchema = createUpdateSchema(
  sqliteShopifySessions,
);
export const selectSqliteShopifySessionSchema = createSelectSchema(
  sqliteShopifySessions,
);
