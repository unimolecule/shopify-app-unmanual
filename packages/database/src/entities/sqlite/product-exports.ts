import type {
  insertSqliteProductExportPartSchema,
  insertSqliteProductExportSchema,
  selectSqliteProductExportPartSchema,
  selectSqliteProductExportSchema,
  updateSqliteProductExportPartSchema,
  updateSqliteProductExportSchema,
} from "../../schemas/sqlite";
import type { z } from "zod";

export type InsertSqliteProductExport = z.infer<
  typeof insertSqliteProductExportSchema
>;
export type UpdateSqliteProductExport = z.infer<
  typeof updateSqliteProductExportSchema
>;
export type SelectSqliteProductExport = z.infer<
  typeof selectSqliteProductExportSchema
>;
export type InsertSqliteProductExportPart = z.infer<
  typeof insertSqliteProductExportPartSchema
>;
export type UpdateSqliteProductExportPart = z.infer<
  typeof updateSqliteProductExportPartSchema
>;
export type SelectSqliteProductExportPart = z.infer<
  typeof selectSqliteProductExportPartSchema
>;
