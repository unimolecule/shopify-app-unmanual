import type {
  insertSqliteReferenceSchema,
  selectSqliteReferenceSchema,
  updateSqliteReferenceSchema,
} from "../../schemas/sqlite";
import type { z } from "zod";

export type InsertSqliteReference = z.infer<typeof insertSqliteReferenceSchema>;
export type UpdateSqliteReference = z.infer<typeof updateSqliteReferenceSchema>;
export type SelectSqliteReference = z.infer<typeof selectSqliteReferenceSchema>;
