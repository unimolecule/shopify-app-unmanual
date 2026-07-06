import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { sqliteFiles } from "../../models/sqlite";

export const insertSqliteFileSchema = createInsertSchema(sqliteFiles);
export const updateSqliteFileSchema = createUpdateSchema(sqliteFiles);
export const selectSqliteFileSchema = createSelectSchema(sqliteFiles);
