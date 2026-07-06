import { z } from "zod";

export const databaseSchema = z.object({
  APP_DATABASE_URL: z.url().optional(),
});

export type DatabaseSchema = z.infer<typeof databaseSchema>;
