import {
  configSchema,
  DEFAULT_RUNTIMES,
  type ConfigSchema,
} from "@unimolecule/shopify-app-unmanual-app-env";
import { z } from "zod";
import { parseWithSchema } from "./shared";

export type ProcessConfig = ConfigSchema & {
  APP_RUNTIME: typeof DEFAULT_RUNTIMES.NODE;
};

const processConfigSchema: z.ZodType<ProcessConfig> = configSchema.extend({
  APP_RUNTIME: z.literal(DEFAULT_RUNTIMES.NODE),
});

/**
 * Validate a process runtime config.
 * Process configs are expected to be available from process.env at bootstrap time.
 */
export function parseProcessConfig(
  env: Record<string, unknown>,
): ProcessConfig {
  return parseWithSchema(processConfigSchema, env);
}
