import { z } from "zod";
import {
  DEFAULT_APP_FILE_DIR,
  DEFAULT_APP_FILE_EXPIRE,
  DEFAULT_APP_FILE_MAX_SIZE,
  DEFAULT_APP_FILE_UPLOAD_MULTIPLE_SIZE,
  DEFAULT_APP_FILE_UPLOAD_TIMEOUT,
} from "../constants";

export const fileConfigSchema = z.object({
  APP_FILE_DIR: z.string().trim().optional().default(DEFAULT_APP_FILE_DIR),
  APP_FILE_EXPIRE: z.coerce
    .number()
    .optional()
    .default(DEFAULT_APP_FILE_EXPIRE),
  APP_FILE_MAX_SIZE: z.coerce
    .number()
    .optional()
    .default(DEFAULT_APP_FILE_MAX_SIZE),
  APP_FILE_UPLOAD_TIMEOUT: z.coerce
    .number()
    .optional()
    .default(DEFAULT_APP_FILE_UPLOAD_TIMEOUT),
  APP_FILE_UPLOAD_MULTIPLE_SIZE: z.coerce
    .number()
    .optional()
    .default(DEFAULT_APP_FILE_UPLOAD_MULTIPLE_SIZE),
});

export type FileConfigSchema = z.infer<typeof fileConfigSchema>;
