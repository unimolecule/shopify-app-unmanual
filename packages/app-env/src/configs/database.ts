import { z } from "zod";
import { DEFAULT_APP_DATABASE_PROVIDERS } from "../constants";

export const databaseConfigSchema = z.object({
  APP_DATABASE_PROVIDER: z.enum(DEFAULT_APP_DATABASE_PROVIDERS).optional(),
  APP_DATABASE_D1_BINDING: z.string().optional(),
  APP_DATABASE_D1_NAME: z.string().optional(),
  APP_DATABASE_D1_ID: z.string().optional(),
});

export type DatabaseConfigSchema = z.infer<typeof databaseConfigSchema>;
