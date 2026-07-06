import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { sqliteReferences } from "../../models/sqlite";

export const insertSqliteReferenceSchema = createInsertSchema(sqliteReferences);
export const updateSqliteReferenceSchema = createUpdateSchema(sqliteReferences);
export const selectSqliteReferenceSchema = createSelectSchema(sqliteReferences);
