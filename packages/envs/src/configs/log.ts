import { z } from "zod";
import {
  DEFAULT_APP_LOGGER_DIR,
  DEFAULT_APP_LOGGER_EXPIRE,
  DEFAULT_APP_LOGGER_MAX_SIZE,
  DEFAULT_LOG_LEVEL,
  DEFAULT_LOGGER_LEVELS,
} from "../constants";

export const logConfigSchema = z.object({
  APP_LOGGER_DIR: z.string().trim().optional().default(DEFAULT_APP_LOGGER_DIR),
  APP_LOGGER_LEVEL: z.enum(DEFAULT_LOGGER_LEVELS).default(DEFAULT_LOG_LEVEL),
  APP_LOGGER_EXPIRE: z.coerce
    .number()
    .optional()
    .default(DEFAULT_APP_LOGGER_EXPIRE),
  APP_LOGGER_MAX_SIZE: z.coerce
    .number()
    .optional()
    .default(DEFAULT_APP_LOGGER_MAX_SIZE),
});

export type LogConfigSchema = z.infer<typeof logConfigSchema>;
