import type {
  insertPostgresReferenceSchema,
  selectPostgresReferenceSchema,
  updatePostgresReferenceSchema,
} from "../../schemas/postgres";
import type { z } from "zod";

export type InsertPostgresReference = z.infer<
  typeof insertPostgresReferenceSchema
>;
export type UpdatePostgresReference = z.infer<
  typeof updatePostgresReferenceSchema
>;
export type SelectPostgresReference = z.infer<
  typeof selectPostgresReferenceSchema
>;
