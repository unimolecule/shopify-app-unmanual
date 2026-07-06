import { describe, expect, it } from "vitest";
import {
  getExactPageTotalFromRows,
  toPaginatedRowsPage,
} from "@/shared/models";

describe("pagination utils", () => {
  it("creates page pagination from one extra row", () => {
    const page = toPaginatedRowsPage(
      [{ id: "first" }, { id: "second" }, { id: "third" }],
      {
        limit: 2,
        mode: "page",
        page: 3,
      },
      {
        total: 7,
      },
    );

    expect(page).toEqual({
      items: [{ id: "first" }, { id: "second" }],
      pagination: {
        hasNext: true,
        limit: 2,
        mode: "page",
        page: 3,
        total: 7,
      },
    });
  });

  it("creates cursor pagination with a custom next cursor", () => {
    const page = toPaginatedRowsPage(
      [{ id: "first" }, { id: "second" }, { id: "third" }],
      {
        cursor: "before",
        limit: 2,
        mode: "cursor",
      },
      {
        createCursor: (item) => `after:${item.id}`,
      },
    );

    expect(page).toEqual({
      items: [{ id: "first" }, { id: "second" }],
      pagination: {
        hasNext: true,
        limit: 2,
        mode: "cursor",
        nextCursor: "after:second",
      },
    });
  });

  it("derives exact page totals from final page rows", () => {
    expect(
      getExactPageTotalFromRows([{ id: "third" }], {
        limit: 2,
        page: 2,
      }),
    ).toBe(3);
    expect(
      getExactPageTotalFromRows([], {
        limit: 2,
        page: 1,
      }),
    ).toBe(0);
  });

  it("requires a count query when page rows cannot prove the total", () => {
    expect(
      getExactPageTotalFromRows(
        [{ id: "first" }, { id: "second" }, { id: "third" }],
        {
          limit: 2,
          page: 1,
        },
      ),
    ).toBeUndefined();
    expect(
      getExactPageTotalFromRows([], {
        limit: 2,
        page: 2,
      }),
    ).toBeUndefined();
  });
});
