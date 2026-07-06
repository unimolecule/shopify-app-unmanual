import { describe, expect, it } from "vitest";
import {
  PAGE_PAGINATION_DEEP_ERROR_MESSAGE,
  PaginationQuerySchema,
  toPaginationInput,
} from "@/shared/models";

describe("pagination query schema", () => {
  it("rejects cursor and page in the same request", () => {
    const result = PaginationQuerySchema.safeParse({
      cursor: "cursor",
      limit: "20",
      page: "2",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "cursor and page cannot be used together",
          path: ["page"],
        }),
      ]),
    );
  });

  it("rejects limits greater than 100", () => {
    const result = PaginationQuerySchema.safeParse({
      limit: "101",
      page: "1",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["limit"],
        }),
      ]),
    );
  });

  it("rejects page pagination beyond the shallow page window", () => {
    expect(() =>
      toPaginationInput(
        {
          limit: 100,
          page: 51,
        },
        20,
      ),
    ).toThrow(PAGE_PAGINATION_DEEP_ERROR_MESSAGE);
  });

  it("rejects page pagination beyond the shallow offset window", () => {
    expect(() =>
      toPaginationInput(
        {
          limit: 100,
          page: 50,
        },
        20,
      ),
    ).toThrow(PAGE_PAGINATION_DEEP_ERROR_MESSAGE);
  });
});
