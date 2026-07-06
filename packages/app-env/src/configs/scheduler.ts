import { z } from "zod";
import { DEFAULT_APP_SCHEDULER_PROVIDERS } from "../constants";

export const schedulerConfigSchema = z.object({
  APP_SCHEDULER_PROVIDER: z.enum(DEFAULT_APP_SCHEDULER_PROVIDERS).optional(),
  APP_SCHEDULER_CRON_VALUE: z.string().optional(),
});

export type SelectPostgresShopifySessionchedulerConfigSchema = z.infer<
  typeof schedulerConfigSchema
>;
