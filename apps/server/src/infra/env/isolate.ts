import {
  configSchema,
  DEFAULT_RUNTIMES,
  type ConfigSchema,
} from "@shamt/app-env";
import { z } from "zod";
import { parseWithSchema } from "./shared";

export type CloudflareIsolateConfig = ConfigSchema & {
  APP_RUNTIME: typeof DEFAULT_RUNTIMES.CLOUDFLARE;
};
export type VercelEdgeIsolateConfig = ConfigSchema & {
  APP_RUNTIME: typeof DEFAULT_RUNTIMES.VERCEL_EDGE;
};
export type IsolateConfig = CloudflareIsolateConfig | VercelEdgeIsolateConfig;

const cloudflareIsolateConfigSchema: z.ZodType<CloudflareIsolateConfig> =
  configSchema.extend({
    APP_RUNTIME: z.literal(DEFAULT_RUNTIMES.CLOUDFLARE),
  });
const vercelEdgeIsolateConfigSchema: z.ZodType<VercelEdgeIsolateConfig> =
  configSchema.extend({
    APP_RUNTIME: z.literal(DEFAULT_RUNTIMES.VERCEL_EDGE),
  });
const isolateConfigSchema: z.ZodType<IsolateConfig> = z.union([
  cloudflareIsolateConfigSchema,
  // Reserved for future support. Vercel Edge currently has no runtime entry,
  // platform bindings, or Shopify session storage strategy in this app.
  vercelEdgeIsolateConfigSchema,
]);

/**
 * Validate an isolate runtime config and dispatch by isolate platform.
 * Cloudflare configs may include request-bound platform bindings.
 * Vercel Edge is intentionally separate so it can grow platform-specific bindings later.
 */
export function parseIsolateConfig(
  env: Record<string, unknown>,
): IsolateConfig {
  if (env.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE) {
    return parseWithSchema(cloudflareIsolateConfigSchema, env);
  }

  if (env.APP_RUNTIME === DEFAULT_RUNTIMES.VERCEL_EDGE) {
    return parseWithSchema(vercelEdgeIsolateConfigSchema, env);
  }

  return parseWithSchema(isolateConfigSchema, env);
}
