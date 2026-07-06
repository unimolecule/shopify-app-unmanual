import type {
  insertSqliteShopifySessionSchema,
  selectSqliteShopifySessionSchema,
  updateSqliteShopifySessionSchema,
} from "../../schemas/sqlite";
import type { z } from "zod";

export type InsertSqliteShopifySession = z.infer<
  typeof insertSqliteShopifySessionSchema
>;
export type UpdateSqliteShopifySession = z.infer<
  typeof updateSqliteShopifySessionSchema
>;
export type SelectSqliteShopifySession = z.infer<
  typeof selectSqliteShopifySessionSchema
>;
