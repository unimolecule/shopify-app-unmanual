import { z } from "zod";
import {
  DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS,
  DEFAULT_SHOPIFY_APP_MODES,
} from "../constants";

export const appEnvConfigSchema = z.object({
  APP__SERVER_PORT: z.coerce.number(),
  APP__WEB_PORT: z.coerce.number(),
  SHOPIFY_APP_MODE: z
    .enum(DEFAULT_SHOPIFY_APP_MODES)
    .default(DEFAULT_SHOPIFY_APP_MODES.EMBEDDED),
  SHOPIFY_APP_FRONTEND_TARGET: z
    .enum(DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS)
    .default(DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS.BACKEND),
  SHOPIFY_APP_KEY: z.string().trim(),
  SHOPIFY_APP_SECRET: z.string().trim(),
  SHOPIFY_APP_URL: z.url(),
  SHOPIFY_API_VERSION: z.string().trim(),
  SCOPES: z.string().trim(),
});

export type AppEnvConfigSchema = z.infer<typeof appEnvConfigSchema>;
