import { z } from "zod";
import {
  DEFAULT_ENV,
  DEFAULT_ENVS,
  DEFAULT_RUNTIME,
  DEFAULT_RUNTIMES,
} from "../constants";

export const envConfigSchema = z.object({
  APP_ENV: z.enum(DEFAULT_ENVS).default(DEFAULT_ENV),
  APP_RUNTIME: z.enum(DEFAULT_RUNTIMES).default(DEFAULT_RUNTIME),
});

export type EnvConfigSchema = z.infer<typeof envConfigSchema>;
