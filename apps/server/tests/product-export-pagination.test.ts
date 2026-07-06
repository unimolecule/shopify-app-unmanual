import { DEFAULT_APP_DATABASE_PROVIDERS } from "@shamt/app-env";
import { describe, expect, it } from "vitest";
import { createPostgresProductExportsRepository } from "@/app/modules/product-export/repositories/database/postgres";
import { createSeekCursor } from "@/shared/models";
import type { ProductExportRecord } from "@/app/modules/product-export/types";
import type { PostgresDatabase } from "@/infra/database";

describe("product export pagination", () => {
  it("lists product exports with page pagination metadata", async () => {
    const repository = createPostgresProductExportsRepository(
      createMemoryExportsDatabase(),
    );

    for (let index = 0; index < 25; index += 1) {
      await repository.create(
        createProductExportRecord({
          createdAt: new Date(Date.UTC(2026, 5, 20, 0, index)),
          id: `export_${index.toString().padStart(2, "0")}`,
          name: `Export ${index}`,
        }),
      );
    }

    const result = await repository.list({
      pagination: {
        limit: 20,
        mode: "page",
        page: 2,
      },
      shopDomain: "test-shop.myshopify.com",
    });

    expect(result.productExports).toHaveLength(5);
    expect(result.productExports[0]?.id).toBe("export_04");
    expect(result.pagination).toEqual({
      hasNext: false,
      limit: 20,
      mode: "page",
      page: 2,
      total: 25,
    });
  });

  it("continues product export lists after the cursor resource", async () => {
    const repository = createPostgresProductExportsRepository(
      createMemoryExportsDatabase(),
    );

    for (let index = 0; index < 5; index += 1) {
      await repository.create(
        createProductExportRecord({
          createdAt: new Date(Date.UTC(2026, 5, 20, 0, index)),
          id: `export_${index}`,
        }),
      );
    }

    const firstPage = await repository.list({
      pagination: { limit: 2, mode: "cursor" },
      shopDomain: "test-shop.myshopify.com",
    });
    const secondPage = await repository.list({
      pagination: {
        cursor:
          firstPage.pagination.mode === "cursor"
            ? firstPage.pagination.nextCursor
            : undefined,
        limit: 2,
        mode: "cursor",
      },
      shopDomain: "test-shop.myshopify.com",
    });

    expect(firstPage.productExports.map((record) => record.id)).toEqual([
      "export_4",
      "export_3",
    ]);
    expect(firstPage.pagination).toEqual({
      hasNext: true,
      limit: 2,
      mode: "cursor",
      nextCursor: createSeekCursor({
        createdAt: new Date(Date.UTC(2026, 5, 20, 0, 3)),
        id: "export_3",
      }),
    });
    expect(secondPage.productExports.map((record) => record.id)).toEqual([
      "export_2",
      "export_1",
    ]);
  });

  it("lists recoverable exports in updated-at batches", async () => {
    const repository = createPostgresProductExportsRepository(
      createMemoryExportsDatabase(),
    );
    const olderThan = new Date("2026-06-20T01:00:00.000Z");

    for (let index = 0; index < 5; index += 1) {
      await repository.create(
        createProductExportRecord({
          id: `export_${index}`,
          status: "queued",
          updatedAt: new Date(Date.UTC(2026, 5, 20, 0, index)),
        }),
      );
    }

    const firstBatch = await repository.listRecoverableExports({
      limit: 2,
      olderThan,
    });
    const last = firstBatch.at(-1)!;
    const secondBatch = await repository.listRecoverableExports({
      cursor: {
        id: last.id,
        updatedAt: last.updatedAt,
      },
      limit: 2,
      olderThan,
    });

    expect(firstBatch.map((record) => record.id)).toEqual([
      "export_0",
      "export_1",
    ]);
    expect(secondBatch.map((record) => record.id)).toEqual([
      "export_2",
      "export_3",
    ]);
  });
});

function createMemoryExportsDatabase(): PostgresDatabase {
  const rows = new Map<string, ProductExportRecord>();

  const db = {
    insert: () => ({
      values: (value: ProductExportRecord) => ({
        onConflictDoUpdate: () => {
          rows.set(value.id, cloneProductExport(value));
          return Promise.resolve();
        },
      }),
    }),
    select: (shape?: Record<string, unknown>) => ({
      from: () => ({
        where: (condition: unknown) => {
          const predicates = collectSqlPredicates(condition);
          const selectRows = (ordered: boolean, limit: number, offset = 0) => {
            const productExports = [...rows.values()]
              .filter((record) => matchesSqlPredicates(record, predicates))
              .toSorted((a, b) =>
                ordered ? compareProductExportOrder(a, b, predicates) : 0,
              )
              .slice(offset, offset + limit)
              .map(cloneProductExport);

            return Promise.resolve(productExports);
          };
          const selectCount = () =>
            Promise.resolve([
              {
                total: [...rows.values()].filter((record) =>
                  matchesSqlPredicates(record, predicates),
                ).length,
              },
            ]);

          if (isCountSelectShape(shape)) return selectCount();

          return {
            limit: (limit: number) => selectRows(false, limit),
            orderBy: () => ({
              limit: (limit: number) =>
                withOffset(selectRows(true, limit), {
                  offset: (offset: number) => selectRows(true, limit, offset),
                }),
            }),
          };
        },
      }),
    }),
  };

  return {
    check: () =>
      Promise.resolve({
        dialect: "postgres" as const,
        latencyMs: 0,
        provider: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
        runtime: "node" as const,
        status: "ok" as const,
      }),
    db: db as never,
    dialect: "postgres",
    dispose: () => Promise.resolve(),
    provider: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
    runtime: "node",
  };
}

function compareProductExportOrder(
  left: ProductExportRecord,
  right: ProductExportRecord,
  predicates: SqlPredicate[],
): number {
  if (
    predicates.some(
      (predicate) =>
        predicate.field === "updatedAt" &&
        (predicate.operator === "<" || predicate.operator === ">"),
    )
  ) {
    const updatedAtOrder = left.updatedAt.getTime() - right.updatedAt.getTime();
    return updatedAtOrder || left.id.localeCompare(right.id);
  }

  const createdAtOrder = right.createdAt.getTime() - left.createdAt.getTime();
  return createdAtOrder || right.id.localeCompare(left.id);
}

function createProductExportRecord(
  overrides: Partial<ProductExportRecord> = {},
): ProductExportRecord {
  const now = new Date("2026-06-20T00:00:00.000Z");

  return {
    bucketKey: null,
    bucketProvider: null,
    completedAt: null,
    createdAt: now,
    deletedAt: null,
    errorCode: null,
    errorMessage: null,
    fileSize: null,
    id: "export_test",
    name: "All products",
    objectCount: null,
    partialDataUrl: null,
    resultUrl: null,
    shopDomain: "test-shop.myshopify.com",
    shopifyBulkOperationId: null,
    shopifyBulkOperationStatus: null,
    shopifySessionId: null,
    status: "queued",
    template: "basic",
    updatedAt: now,
    ...overrides,
  };
}

function cloneProductExport(record: ProductExportRecord): ProductExportRecord {
  return {
    ...record,
    completedAt: record.completedAt ? new Date(record.completedAt) : null,
    createdAt: new Date(record.createdAt),
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
    updatedAt: new Date(record.updatedAt),
  };
}

type SqlPredicate =
  | {
      field: keyof ProductExportRecord;
      operator: "=" | "<" | "<>" | ">";
      value: unknown;
    }
  | {
      field: keyof ProductExportRecord;
      operator: "is null";
    };
type SqlValuePredicate = Extract<SqlPredicate, { value: unknown }>;

function collectSqlPredicates(value: unknown): SqlPredicate[] {
  if (!isSqlLike(value)) return [];

  const chunks = value.queryChunks;
  const simplePredicate = toSimpleSqlPredicate(chunks);
  if (simplePredicate) return [simplePredicate];

  return chunks.flatMap(collectSqlPredicates);
}

function toSimpleSqlPredicate(chunks: unknown[]): SqlPredicate | undefined {
  const field = toProductExportRecordField(chunks[1]);
  const operator = toSqlOperator(chunks[2]);

  if (!field || !operator) return undefined;

  if (operator === "is null") {
    return { field, operator };
  }

  return {
    field,
    operator,
    value: isSqlParam(chunks[3]) ? chunks[3].value : undefined,
  };
}

function matchesSqlPredicates(
  record: ProductExportRecord,
  predicates: SqlPredicate[],
): boolean {
  const seek = toCursorSeek(predicates);
  const recoverableSeek = toRecoverableSeek(predicates);
  const statusAlternates = toStatusAlternates(predicates);
  const normalPredicates = recoverableSeek
    ? predicates.filter(
        (predicate) => !recoverableSeek.predicates.includes(predicate),
      )
    : seek
      ? predicates.filter((predicate) => !seek.predicates.includes(predicate))
      : predicates;

  if (seek && !matchesCursorSeek(record, seek)) return false;
  if (recoverableSeek && !matchesRecoverableSeek(record, recoverableSeek)) {
    return false;
  }

  return normalPredicates.every((predicate) => {
    if (statusAlternates.includes(predicate)) return true;

    if (predicate.operator === "is null") {
      return (
        record[predicate.field] === null ||
        record[predicate.field] === undefined
      );
    }

    if (predicate.operator === "=") {
      return areSqlValuesEqual(record[predicate.field], predicate.value);
    }

    if (predicate.operator === "<") {
      return compareSqlValues(record[predicate.field], predicate.value) < 0;
    }

    if (predicate.operator === ">") {
      return compareSqlValues(record[predicate.field], predicate.value) > 0;
    }

    return !areSqlValuesEqual(record[predicate.field], predicate.value);
  });
}

function toStatusAlternates(predicates: SqlPredicate[]) {
  const statusEquals = predicates.filter(
    (predicate) => predicate.field === "status" && predicate.operator === "=",
  );

  return statusEquals.length > 1 ? statusEquals : [];
}

function toProductExportRecordField(
  value: unknown,
): keyof ProductExportRecord | undefined {
  if (!isColumnLike(value)) return undefined;

  const fieldByColumnName = {
    created_at: "createdAt",
    deleted_at: "deletedAt",
    id: "id",
    shop_domain: "shopDomain",
    status: "status",
    updated_at: "updatedAt",
  } satisfies Record<string, keyof ProductExportRecord>;

  return fieldByColumnName[value.name as keyof typeof fieldByColumnName];
}

function toSqlOperator(value: unknown): SqlPredicate["operator"] | undefined {
  if (!isStringChunkLike(value)) return undefined;

  const text = value.value.join("").trim().toLowerCase();
  if (
    text === "=" ||
    text === "<" ||
    text === "<>" ||
    text === ">" ||
    text === "is null"
  )
    return text;
  return undefined;
}

function toCursorSeek(predicates: SqlPredicate[]) {
  const createdAtBefore = predicates.find(
    (predicate): predicate is SqlValuePredicate =>
      predicate.field === "createdAt" && predicate.operator === "<",
  );
  const createdAtEqual = predicates.find(
    (predicate): predicate is SqlValuePredicate =>
      predicate.field === "createdAt" && predicate.operator === "=",
  );
  const idBefore = predicates.find(
    (predicate): predicate is SqlValuePredicate =>
      predicate.field === "id" && predicate.operator === "<",
  );

  if (!createdAtBefore || !createdAtEqual || !idBefore) return;

  const seekPredicates: SqlPredicate[] = [
    createdAtBefore,
    createdAtEqual,
    idBefore,
  ];

  return {
    createdAtBefore,
    createdAtEqual,
    idBefore,
    predicates: seekPredicates,
  };
}

function toRecoverableSeek(predicates: SqlPredicate[]) {
  const updatedAtAfter = predicates.find(
    (predicate): predicate is SqlValuePredicate =>
      predicate.field === "updatedAt" && predicate.operator === ">",
  );
  const updatedAtEqual = predicates.find(
    (predicate): predicate is SqlValuePredicate =>
      predicate.field === "updatedAt" && predicate.operator === "=",
  );
  const idAfter = predicates.find(
    (predicate): predicate is SqlValuePredicate =>
      predicate.field === "id" && predicate.operator === ">",
  );

  if (!updatedAtAfter || !updatedAtEqual || !idAfter) return;

  const seekPredicates: SqlPredicate[] = [
    updatedAtAfter,
    updatedAtEqual,
    idAfter,
  ];

  return {
    idAfter,
    predicates: seekPredicates,
    updatedAtAfter,
    updatedAtEqual,
  };
}

function matchesCursorSeek(
  record: ProductExportRecord,
  seek: NonNullable<ReturnType<typeof toCursorSeek>>,
): boolean {
  return (
    compareSqlValues(record.createdAt, seek.createdAtBefore.value) < 0 ||
    (areSqlValuesEqual(record.createdAt, seek.createdAtEqual.value) &&
      compareSqlValues(record.id, seek.idBefore.value) < 0)
  );
}

function matchesRecoverableSeek(
  record: ProductExportRecord,
  seek: NonNullable<ReturnType<typeof toRecoverableSeek>>,
): boolean {
  return (
    compareSqlValues(record.updatedAt, seek.updatedAtAfter.value) > 0 ||
    (areSqlValuesEqual(record.updatedAt, seek.updatedAtEqual.value) &&
      compareSqlValues(record.id, seek.idAfter.value) > 0)
  );
}

function areSqlValuesEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  return left === right;
}

function compareSqlValues(left: unknown, right: unknown): number {
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  if (typeof leftValue === "string" && typeof rightValue === "string") {
    return leftValue.localeCompare(rightValue);
  }

  return 0;
}

function withOffset<T>(
  promise: Promise<T>,
  extension: {
    offset: (offset: number) => Promise<T>;
  },
): Promise<T> & typeof extension {
  return Object.assign(promise, extension);
}

function isSqlLike(value: unknown): value is { queryChunks: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "queryChunks" in value &&
    Array.isArray(value.queryChunks)
  );
}

function isColumnLike(value: unknown): value is { name: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string"
  );
}

function isStringChunkLike(value: unknown): value is { value: string[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    Array.isArray(value.value)
  );
}

function isSqlParam(value: unknown): value is { value: unknown } {
  return typeof value === "object" && value !== null && "value" in value;
}

function isCountSelectShape(value: unknown): value is { total: unknown } {
  return typeof value === "object" && value !== null && "total" in value;
}
