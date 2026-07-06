import {
  appConfigSchema,
  cacheConfigSchema,
  databaseSchema,
  extendConfigSchema,
  fileConfigSchema,
  logConfigSchema,
  redisSchema,
} from "@shamt/envs";
import { appEnvConfigSchema as $appConfigSchema } from "./app";
import { bucketConfigSchema } from "./bucket";
import { cloudflareConfigSchema } from "./cloudflare";
import { databaseConfigSchema } from "./database";
import { envConfigSchema } from "./env";
import { queueConfigSchema } from "./queue";
import { schedulerConfigSchema } from "./scheduler";
import type { z } from "zod";

export const configSchema = extendConfigSchema(
  appConfigSchema,
  $appConfigSchema,
)
  .extend(cacheConfigSchema.shape)
  .extend(databaseSchema.shape)
  .extend(envConfigSchema.shape)
  .extend(logConfigSchema.shape)
  .extend(redisSchema.shape)
  .extend(fileConfigSchema.shape)
  .extend(bucketConfigSchema.shape)
  .extend(cloudflareConfigSchema.shape)
  .extend(databaseConfigSchema.shape)
  .extend(queueConfigSchema.shape)
  .extend(schedulerConfigSchema.shape);

export type ConfigSchema = z.infer<typeof configSchema>;
