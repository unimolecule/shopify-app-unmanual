import { z } from "zod";
import {
  DEFAULT_APP_API_PREFIX,
  DEFAULT_APP_LOCALE,
  DEFAULT_APP_NAME,
  DEFAULT_APP_USE_CLUSTER,
  DEFAULT_REQUEST_TIMEOUT,
} from "../constants";

export const appConfigSchema = z.object({
  APP_NAME: z.string().trim().optional().default(DEFAULT_APP_NAME),
  APP_API_PREFIX: z.string().trim().optional().default(DEFAULT_APP_API_PREFIX),
  APP_REQUEST_TIMEOUT: z.coerce
    .number()
    .optional()
    .default(DEFAULT_REQUEST_TIMEOUT),
  APP_LOCALE: z.string().trim().optional().default(DEFAULT_APP_LOCALE),
  APP_USE_CLUSTER: z.coerce
    .boolean()
    .optional()
    .default(DEFAULT_APP_USE_CLUSTER),
});

export type AppConfigSchema = z.infer<typeof appConfigSchema>;
