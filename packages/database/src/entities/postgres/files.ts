import type {
  insertPostgresFileSchema,
  selectPostgresFileSchema,
  updatePostgresFileSchema,
} from "../../schemas/postgres";
import type { z } from "zod";

export type InsertPostgresFile = z.infer<typeof insertPostgresFileSchema>;
export type UpdatePostgresFile = z.infer<typeof updatePostgresFileSchema>;
export type SelectPostgresFile = z.infer<typeof selectPostgresFileSchema>;
