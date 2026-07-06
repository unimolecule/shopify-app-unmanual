import type { z } from "zod";

/**
 * Extends the appConfigSchema with additional schema properties
 * @param mainSchema - A Zod object schema to extend
 * @param schema - The additional schema properties to extend with
 * @returns A new extended Zod schema
 */
export function extendConfigSchema<
  T extends z.ZodRawShape,
  S extends z.ZodRawShape,
>(mainSchema: z.ZodObject<T>, schema: z.ZodObject<S>) {
  return mainSchema.extend(schema.shape);
}

/**
 * Type helper to infer the extended schema type
 */
export type ExtendedConfigSchema<
  T extends z.ZodRawShape,
  S extends z.ZodRawShape,
> = z.infer<ReturnType<typeof extendConfigSchema<T, S>>>;
