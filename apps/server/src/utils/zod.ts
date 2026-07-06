import { zValidator as zv } from "@hono/zod-validator";
import { unprocessableEntityError } from "@/shared/exceptions";
import type { ValidationTargets } from "hono";
import type * as z from "zod";

export function formatZodError(error: {
  issues: readonly z.core.$ZodIssue[];
}): string {
  return `Invalid env: ${error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ")}`;
}

export function zValidator<
  T extends z.ZodSchema,
  Target extends keyof ValidationTargets,
>(target: Target, schema: T) {
  return zv(target, schema, (result) => {
    if (!result.success) {
      throw unprocessableEntityError("zValidator error", {
        details: { cause: formatZodError(result.error) },
        expose: true,
      });
    }
  });
}
