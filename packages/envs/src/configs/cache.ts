import { z } from "zod";
import { DEFAULT_CACHE_EXPIRE, DEFAULT_CACHE_MAX_SIZE } from "../constants";

export const cacheConfigSchema = z.object({
  APP_CACHE_EXPIRE: z.coerce.number().optional().default(DEFAULT_CACHE_EXPIRE),
  APP_CACHE_MAX_SIZE: z.coerce
    .number()
    .optional()
    .default(DEFAULT_CACHE_MAX_SIZE),
});

export type CacheConfigSchema = z.infer<typeof cacheConfigSchema>;
