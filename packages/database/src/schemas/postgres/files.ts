import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { postgresFiles } from "../../models/postgres";

export const insertPostgresFileSchema = createInsertSchema(postgresFiles);
export const updatePostgresFileSchema = createUpdateSchema(postgresFiles);
export const selectPostgresFileSchema = createSelectSchema(postgresFiles);
