import type {
  insertPostgresProductExportPartSchema,
  insertPostgresProductExportSchema,
  selectPostgresProductExportPartSchema,
  selectPostgresProductExportSchema,
  updatePostgresProductExportPartSchema,
  updatePostgresProductExportSchema,
} from "../../schemas/postgres";
import type { z } from "zod";

export type InsertPostgresProductExport = z.infer<
  typeof insertPostgresProductExportSchema
>;
export type UpdatePostgresProductExport = z.infer<
  typeof updatePostgresProductExportSchema
>;
export type SelectPostgresProductExport = z.infer<
  typeof selectPostgresProductExportSchema
>;
export type InsertPostgresProductExportPart = z.infer<
  typeof insertPostgresProductExportPartSchema
>;
export type UpdatePostgresProductExportPart = z.infer<
  typeof updatePostgresProductExportPartSchema
>;
export type SelectPostgresProductExportPart = z.infer<
  typeof selectPostgresProductExportPartSchema
>;
