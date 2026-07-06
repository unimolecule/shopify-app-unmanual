import { z } from "zod";
import { DEFAULT_APP_BUCKET_PROVIDERS } from "../constants";

export const bucketConfigSchema = z.object({
  APP_BUCKET_PROVIDER: z.enum(DEFAULT_APP_BUCKET_PROVIDERS).optional(),
  APP_BUCKET_R2_URL: z.url().optional(),
  APP_BUCKET_R2_BINDING: z.string().optional(),
  APP_BUCKET_R2_NAME: z.string().optional(),
});

export type BucketConfigSchema = z.infer<typeof bucketConfigSchema>;
