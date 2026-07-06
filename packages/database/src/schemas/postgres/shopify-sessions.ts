import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { postgresShopifySessions } from "../../models/postgres";

export const insertPostgresShopifySessionSchema = createInsertSchema(
  postgresShopifySessions,
);
export const updatePostgresShopifySessionSchema = createUpdateSchema(
  postgresShopifySessions,
);
export const selectPostgresShopifySessionSchema = createSelectSchema(
  postgresShopifySessions,
);
