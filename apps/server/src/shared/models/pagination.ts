import { z } from "@hono/zod-openapi";
import {
  AppError,
  createCursorPagination,
  createPagePagination,
  type Pagination,
  type PaginationInput,
} from "@unimolecule/canon/http";
export { createCursorPagination, createPagePagination };
export type {
  CursorPagination,
  PagePagination,
  PaginatedPage,
  PaginationInput,
  PaginationMode,
} from "@unimolecule/canon/http";

export const PAGINATION_LIMIT_MAX = 100; // [30,50,100]
export const PAGE_PAGINATION_MAX_PAGE = 50;
export const PAGE_PAGINATION_MAX_OFFSET =
  PAGINATION_LIMIT_MAX * PAGE_PAGINATION_MAX_PAGE;
export const PAGE_PAGINATION_DEEP_ERROR_MESSAGE =
  "Page pagination only supports shallow navigation. Use cursor pagination for deep pagination.";

export const CursorPaginationSchema = z.object({
  hasNext: z.boolean().openapi({
    description: "Whether another page is available.",
    example: true,
  }),
  limit: z.number().int().min(1).openapi({
    description: "Maximum number of resources returned.",
    example: 20,
  }),
  mode: z.literal("cursor").openapi({
    description: "Cursor pagination mode.",
    example: "cursor",
  }),
  nextCursor: z.string().optional().openapi({
    description: "Cursor to pass to the next list request.",
    example: "8f07a37b-b7dc-41f0-a9d5-3f9c28e12f2a",
  }),
});

export const PagePaginationSchema = z.object({
  hasNext: z.boolean().openapi({
    description: "Whether another page is available.",
    example: true,
  }),
  limit: z.number().int().min(1).openapi({
    description: "Maximum number of resources returned.",
    example: 20,
  }),
  mode: z.literal("page").openapi({
    description: "Page pagination mode.",
    example: "page",
  }),
  page: z.number().int().min(1).openapi({
    description: "One-based page number.",
    example: 2,
  }),
  total: z.number().int().min(0).openapi({
    description: "Total resources matching the page query.",
    example: 142,
  }),
});

export const PaginationSchema = z.union([
  CursorPaginationSchema,
  PagePaginationSchema,
]);

export const PaginationQuerySchema = z
  .object({
    cursor: z.string().optional().openapi({
      description: "Cursor returned by a previous list response.",
    }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINATION_LIMIT_MAX)
      .optional()
      .openapi({
        description: "Maximum number of resources to return.",
        example: 20,
      }),
    page: z.coerce.number().int().min(1).optional().openapi({
      description: "One-based page number. Cannot be used with cursor.",
      example: 2,
    }),
  })
  .superRefine((query, ctx) => {
    if (!query.cursor || query.page === undefined) return;

    ctx.addIssue({
      code: "custom",
      message: "cursor and page cannot be used together",
      path: ["page"],
    });
  });

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export type CursorFormat<Cursor> = {
  format: (cursor: Cursor) => string;
  parse: (value: string) => Cursor | null;
};

export type SeekCursor = {
  createdAt: Date;
  id: string;
};

export type PaginatedRowsPage<Item> = {
  items: Item[];
  pagination: Pagination;
};

export type PaginatedRowsPageOptions<Item> = {
  createCursor?: (item: Item) => string | undefined;
  total?: number;
};

export const seekCursorFormat: CursorFormat<SeekCursor> = {
  format: (cursor) =>
    [
      encodeURIComponent(cursor.createdAt.toISOString()),
      encodeURIComponent(cursor.id),
    ].join(":"),
  parse: (cursor) => {
    const [createdAtValue, idValue, ...rest] = cursor.split(":");
    if (!createdAtValue || !idValue || rest.length > 0) return null;

    try {
      const createdAt = new Date(decodeURIComponent(createdAtValue));
      const id = decodeURIComponent(idValue);

      if (Number.isNaN(createdAt.getTime()) || !id) return null;

      return { createdAt, id };
    } catch {
      return null;
    }
  },
};

export function createSeekCursor(input: SeekCursor): string {
  return seekCursorFormat.format(input);
}

export function readCursor<Cursor>(
  cursor: string | undefined,
  format: CursorFormat<Cursor>,
): Cursor | null {
  if (!cursor) return null;

  const parsed = format.parse(cursor);
  if (parsed) return parsed;

  throw new AppError({
    status: 400,
    message: "Invalid cursor.",
    expose: true,
  });
}

export function readPaginationCursor<Cursor>(
  pagination: PaginationInput,
  format: CursorFormat<Cursor>,
): Cursor | null {
  if (pagination.mode !== "cursor") return null;

  return readCursor(pagination.cursor, format);
}

export function getSeekListCursor(input: {
  pagination: PaginationInput;
}): SeekCursor | null {
  return readPaginationCursor(input.pagination, seekCursorFormat);
}

export function toPaginationInput(
  query: PaginationQuery,
  defaultLimit: number,
): PaginationInput {
  const limit = query.limit ?? defaultLimit;

  if (query.page !== undefined) {
    const offset = (query.page - 1) * limit;
    if (
      query.page > PAGE_PAGINATION_MAX_PAGE ||
      offset + limit >= PAGE_PAGINATION_MAX_OFFSET
    ) {
      throw new AppError({
        status: 400,
        message: PAGE_PAGINATION_DEEP_ERROR_MESSAGE,
        expose: true,
        details: {
          maxOffset: PAGE_PAGINATION_MAX_OFFSET,
          maxPage: PAGE_PAGINATION_MAX_PAGE,
          mode: "cursor",
        },
      });
    }

    return {
      limit,
      mode: "page",
      page: query.page,
    };
  }

  return {
    cursor: query.cursor,
    limit,
    mode: "cursor",
  };
}

/**
 * Returns the SQL offset for one-based page pagination.
 */
export function getPageOffset(pagination: {
  limit: number;
  page: number;
}): number {
  return (pagination.page - 1) * pagination.limit;
}

/**
 * Returns an exact total when `limit + 1` page rows prove this is the final
 * page. Empty deep pages still need a count query because the offset can exceed
 * the real total.
 */
export function getExactPageTotalFromRows<Item>(
  rows: Item[],
  pagination: {
    limit: number;
    page: number;
  },
): number | undefined {
  if (rows.length > pagination.limit) return undefined;
  if (rows.length === 0 && pagination.page > 1) return undefined;

  return getPageOffset(pagination) + rows.length;
}

export async function resolvePageTotalFromRows<Item>(
  rows: Item[],
  pagination: {
    limit: number;
    page: number;
  },
  countTotal: () => Promise<number>,
): Promise<number> {
  return getExactPageTotalFromRows(rows, pagination) ?? (await countTotal());
}

/**
 * Converts rows fetched with `limit + 1` into a stable pagination payload.
 */
export function toPaginatedRowsPage<Item>(
  rows: Item[],
  paginationInput: PaginationInput,
  options: PaginatedRowsPageOptions<Item> = {},
): PaginatedRowsPage<Item> {
  const items = rows.slice(0, paginationInput.limit);
  const hasNext = rows.length > paginationInput.limit;

  if (paginationInput.mode === "page") {
    return {
      items,
      pagination: createPagePagination({
        hasNext,
        limit: paginationInput.limit,
        page: paginationInput.page,
        total: options.total ?? items.length,
      }),
    };
  }

  const next = hasNext ? items.at(-1) : undefined;

  return {
    items,
    pagination: createCursorPagination({
      hasNext,
      limit: paginationInput.limit,
      nextCursor: next ? options.createCursor?.(next) : undefined,
    }),
  };
}
