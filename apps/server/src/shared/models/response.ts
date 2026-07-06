import { z } from "@hono/zod-openapi";
import {
  RESPONSE_SUCCESS_CODE,
  RESPONSE_SUCCESS_MESSAGE,
  RESPONSE_SUCCESS_OK,
} from "@unimolecule/canon/http";

export {
  AppResponse,
  createResponse,
  RESPONSE_SUCCESS_CODE,
  RESPONSE_SUCCESS_MESSAGE,
  RESPONSE_SUCCESS_OK,
} from "@unimolecule/canon/http";
export type {
  AppResponseOptions,
  SuccessResponse,
} from "@unimolecule/canon/http";

export const ResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    code: z.number().openapi({ example: RESPONSE_SUCCESS_CODE }),
    message: z.string().openapi({ example: RESPONSE_SUCCESS_MESSAGE }),
    success: z.literal(true).openapi({ example: RESPONSE_SUCCESS_OK }),
    data: dataSchema.nullable().optional(),
    requestId: z.string().optional(),
  });
