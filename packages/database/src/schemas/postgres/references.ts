import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { postgresReferences } from "../../models/postgres";

export const insertPostgresReferenceSchema =
  createInsertSchema(postgresReferences);
export const updatePostgresReferenceSchema =
  createUpdateSchema(postgresReferences);
export const selectPostgresReferenceSchema =
  createSelectSchema(postgresReferences);
