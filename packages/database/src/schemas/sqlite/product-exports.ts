import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import {
  sqliteProductExportParts,
  sqliteProductExports,
} from "../../models/sqlite";

export const insertSqliteProductExportSchema =
  createInsertSchema(sqliteProductExports);
export const updateSqliteProductExportSchema =
  createUpdateSchema(sqliteProductExports);
export const selectSqliteProductExportSchema =
  createSelectSchema(sqliteProductExports);
export const insertSqliteProductExportPartSchema = createInsertSchema(
  sqliteProductExportParts,
);
export const updateSqliteProductExportPartSchema = createUpdateSchema(
  sqliteProductExportParts,
);
export const selectSqliteProductExportPartSchema = createSelectSchema(
  sqliteProductExportParts,
);
