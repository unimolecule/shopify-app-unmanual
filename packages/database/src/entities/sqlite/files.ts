import type {
  insertSqliteFileSchema,
  selectSqliteFileSchema,
  updateSqliteFileSchema,
} from "../../schemas/sqlite";
import type { z } from "zod";

export type InsertSqliteFile = z.infer<typeof insertSqliteFileSchema>;
export type UpdateSqliteFile = z.infer<typeof updateSqliteFileSchema>;
export type SelectSqliteFile = z.infer<typeof selectSqliteFileSchema>;
