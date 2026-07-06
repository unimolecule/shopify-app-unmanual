import { z } from "@hono/zod-openapi";
import {
  RESPONSE_ERROR_CODE,
  RESPONSE_ERROR_MESSAGE,
  RESPONSE_ERROR_OK,
} from "@unimolecule/canon/http";

export {
  AppError,
  createError,
  RESPONSE_ERROR_CODE,
  RESPONSE_ERROR_MESSAGE,
  RESPONSE_ERROR_OK,
} from "@unimolecule/canon/http";
export type {
  AppErrorOptions,
  ErrorDetails,
  ErrorResponse,
} from "@unimolecule/canon/http";

export const ErrorSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    code: z.number().openapi({ example: RESPONSE_ERROR_CODE }),
    message: z.string().openapi({ example: RESPONSE_ERROR_MESSAGE }),
    success: z.literal(false).openapi({ example: RESPONSE_ERROR_OK }),
    data: dataSchema.nullable().optional(),
    requestId: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  });
