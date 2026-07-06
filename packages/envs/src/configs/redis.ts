import { z } from "zod";
import { DEFAULT_CACHE_REDIS_URL } from "../constants";

export const redisSchema = z.object({
  APP_CACHE_REDIS_URL: z.url().optional().default(DEFAULT_CACHE_REDIS_URL),
});

export type ResidSchema = z.infer<typeof redisSchema>;
