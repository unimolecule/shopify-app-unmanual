import {
  configSchema,
  type ConfigSchema,
} from "@unimolecule/shopify-app-unmanual-app-env";
import type { z } from "zod";

const result = configSchema.safeParse(process.env);

/**
 * Formats zod issues into a single startup error message for Vite config loading.
 */
function formatZodError(error: {
  issues: readonly z.core.$ZodIssue[];
}): string {
  return `Invalid env: ${error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ")}`;
}

if (result.error) {
  console.error("❌ Invalid env:");
  console.error(formatZodError(result.error));
  process.exit(1);
}

export type Env = Omit<
  ConfigSchema,
  "SHOPIFY_APP_SECRET" | "APP_CACHE_REDIS_URL" | "APP_DATABASE_URL"
>;
export const env = { ...result.data! };
