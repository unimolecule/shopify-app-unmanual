import { z } from "zod";
import { DEFAULT_APP_QUEUE_PROVIDERS } from "../constants";

export const queueConfigSchema = z.object({
  APP_QUEUE_PROVIDER: z.enum(DEFAULT_APP_QUEUE_PROVIDERS).optional(),
  APP_QUEUE_NAME: z.string().optional(),
  APP_QUEUE_BINDING: z.string().optional(),
  APP_QUEUE_CONSUMER_MAX_BATCH_SIZE: z.coerce.number().default(1),
  APP_QUEUE_CONSUMER_MAX_RETRIES: z.coerce.number().default(3),
});

export type QueueConfigSchema = z.infer<typeof queueConfigSchema>;
