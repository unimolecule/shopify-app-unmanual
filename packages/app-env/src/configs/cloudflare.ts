import { z } from "zod";

export const cloudflareConfigSchema = z.object({
  APP_CLOUDFLARE_WORKER_NAME: z.string(),
  APP_CLOUDFLARE_WORKER_ACCOUNT_ID: z.string().optional(),
  APP_CLOUDFLARE_USER_TOKEN: z.string().optional(),
});

export type CloudflareConfigSchema = z.infer<typeof cloudflareConfigSchema>;
