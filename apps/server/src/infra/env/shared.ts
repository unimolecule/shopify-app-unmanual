import { formatZodError, throwError } from "@/utils";
import type { z } from "zod";

/**
 * Parse env with a Zod schema and throw a formatted project-level error on failure.
 */
export function parseWithSchema<TSchema extends z.ZodType>(
  schema: TSchema,
  env: Record<string, unknown>,
): z.infer<TSchema> {
  const result = schema.safeParse(env);
  if (!result.success)
    throwError(`runtime parse env error`, formatZodError(result.error));
  return result.data;
}

/**
 * Convert unknown env input into a plain object and decode string values.
 */
export function normalizeEnv(rawEnv: unknown): Record<string, unknown> {
  if (!rawEnv || typeof rawEnv !== "object") return {};
  return Object.entries(rawEnv).reduce<Record<string, unknown>>(
    (envs, [key, value]) => {
      envs[key] = typeof value === "string" ? decodeURIComponent(value) : value;
      return envs;
    },
    {},
  );
}
