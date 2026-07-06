import {
  AppError as CanonAppError,
  AppResponse as CanonAppResponse,
  createCursorPagination as createCanonCursorPagination,
  createError as createCanonError,
  createPagePagination as createCanonPagePagination,
  createResponse as createCanonResponse,
  HTTP_STATUS_CODES,
} from "@unimolecule/canon/http";
import { describe, expect, it } from "vitest";
import {
  AppError,
  AppResponse,
  createCursorPagination,
  createError,
  createPagePagination,
  createResponse,
  RESPONSE_ERROR_CODE,
  RESPONSE_ERROR_MESSAGE,
  RESPONSE_ERROR_OK,
  RESPONSE_SUCCESS_CODE,
  RESPONSE_SUCCESS_MESSAGE,
  RESPONSE_SUCCESS_OK,
} from "@/shared/models";

describe("shared models canon adapter", () => {
  it("exports response and error defaults derived from canon HTTP status codes", () => {
    expect(RESPONSE_SUCCESS_CODE).toBe(HTTP_STATUS_CODES.OK.code);
    expect(RESPONSE_SUCCESS_MESSAGE).toBe(HTTP_STATUS_CODES.OK.phrase);
    expect(RESPONSE_SUCCESS_OK).toBe(true);

    expect(RESPONSE_ERROR_CODE).toBe(
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR.code,
    );
    expect(RESPONSE_ERROR_MESSAGE).toBe(
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR.phrase,
    );
    expect(RESPONSE_ERROR_OK).toBe(false);
  });

  it("re-exports canon runtime primitives while keeping local schemas separate", () => {
    expect(AppError).toBe(CanonAppError);
    expect(AppResponse).toBe(CanonAppResponse);
    expect(createError).toBe(createCanonError);
    expect(createResponse).toBe(createCanonResponse);
    expect(createCursorPagination).toBe(createCanonCursorPagination);
    expect(createPagePagination).toBe(createCanonPagePagination);
  });
});
