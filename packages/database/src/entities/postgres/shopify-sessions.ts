import type {
  insertPostgresShopifySessionSchema,
  selectPostgresShopifySessionSchema,
  updatePostgresShopifySessionSchema,
} from "../../schemas/postgres";
import type { z } from "zod";

export type InsertPostgresShopifySession = z.infer<
  typeof insertPostgresShopifySessionSchema
>;
export type UpdatePostgresShopifySession = z.infer<
  typeof updatePostgresShopifySessionSchema
>;
export type SelectPostgresShopifySession = z.infer<
  typeof selectPostgresShopifySessionSchema
>;
