import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import {
  postgresProductExportParts,
  postgresProductExports,
} from "../../models/postgres";

export const insertPostgresProductExportSchema = createInsertSchema(
  postgresProductExports,
);
export const updatePostgresProductExportSchema = createUpdateSchema(
  postgresProductExports,
);
export const selectPostgresProductExportSchema = createSelectSchema(
  postgresProductExports,
);
export const insertPostgresProductExportPartSchema = createInsertSchema(
  postgresProductExportParts,
);
export const updatePostgresProductExportPartSchema = createUpdateSchema(
  postgresProductExportParts,
);
export const selectPostgresProductExportPartSchema = createSelectSchema(
  postgresProductExportParts,
);
