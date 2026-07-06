import {
  sqliteProductExportParts,
  sqliteProductExports,
} from "@shamt/database/models/sqlite";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  PRODUCT_EXPORT_PART_STATUSES,
  PRODUCT_EXPORT_RETRYABLE_PART_STATUSES,
  PRODUCT_EXPORT_STATUSES,
} from "../../utils";
import {
  getListCursor,
  getPageOffset,
  resolvePageTotalFromRows,
  toPartStats,
  toProductExportsPage,
} from "./shared";
import type { ProductExportRepository } from ".";
import type {
  ProductExportListInput,
  ProductExportLookup,
  ProductExportPartLookup,
  ProductExportPartRecord,
  ProductExportPartStats,
  ProductExportPartStatus,
  ProductExportRecord,
  ProductExportsPage,
} from "../../types";
import type { D1DatabaseClient } from "@/infra/database";
import type { SeekCursor } from "@/shared/models";

type SqliteProductExportsDatabase =
  D1DatabaseClient | Promise<D1DatabaseClient>;

/**
 * Creates a SQLite/D1-backed product-export repository from a runtime
 * database capability.
 */
export function createSqliteProductExportsRepository(
  database: SqliteProductExportsDatabase,
): ProductExportRepository {
  const dbPromise = Promise.resolve(database);

  return {
    async claimPart(input): Promise<ProductExportPartRecord | null> {
      return claimSqliteProductExportPart(await dbPromise, input);
    },
    async create(record): Promise<void> {
      return createSqliteProductExport(await dbPromise, record);
    },
    async createParts(parts): Promise<void> {
      return createSqliteProductExportParts(await dbPromise, parts);
    },
    async delete(input): Promise<void> {
      return deleteSqliteProductExport(await dbPromise, input);
    },
    async findByBulkOperationId(
      bulkOperationId,
    ): Promise<ProductExportRecord | null> {
      return findSqliteProductExportByBulkOperationId(
        await dbPromise,
        bulkOperationId,
      );
    },
    async findById(input): Promise<ProductExportRecord | null> {
      return findSqliteProductExportById(await dbPromise, input);
    },
    async getPartStats(exportId): Promise<ProductExportPartStats> {
      return getSqliteProductExportPartStats(await dbPromise, exportId);
    },
    async list(input): Promise<ProductExportsPage> {
      return listSqliteProductExports(await dbPromise, input);
    },
    async listParts(exportId): Promise<ProductExportPartRecord[]> {
      return listSqliteProductExportParts(await dbPromise, exportId);
    },
    async listPartsByStatus(input): Promise<ProductExportPartRecord[]> {
      return listSqliteProductExportPartsByStatus(await dbPromise, input);
    },
    async listPartsPage(input): Promise<ProductExportPartRecord[]> {
      return listSqliteProductExportPartsPage(await dbPromise, input);
    },
    async listRecoverableExports(input): Promise<ProductExportRecord[]> {
      return listSqliteRecoverableProductExports(await dbPromise, input);
    },
    async markPartDone(input): Promise<void> {
      return markSqliteProductExportPartDone(await dbPromise, input);
    },
    async markPartFailed(input): Promise<void> {
      return markSqliteProductExportPartFailed(await dbPromise, input);
    },
    async update(record): Promise<void> {
      return updateSqliteProductExport(await dbPromise, record);
    },
  };
}

export async function createSqliteProductExportParts(
  database: D1DatabaseClient,
  parts: ProductExportPartRecord[],
): Promise<void> {
  if (parts.length === 0) return;

  await database.db
    .insert(sqliteProductExportParts)
    .values(parts)
    .onConflictDoNothing({
      target: [sqliteProductExportParts.exportId, sqliteProductExportParts.seq],
    });
}

export async function createSqliteProductExport(
  database: D1DatabaseClient,
  record: ProductExportRecord,
): Promise<void> {
  await database.db
    .insert(sqliteProductExports)
    .values(record)
    .onConflictDoUpdate({
      target: sqliteProductExports.id,
      set: record,
    });
}

export async function updateSqliteProductExport(
  database: D1DatabaseClient,
  record: ProductExportRecord,
): Promise<void> {
  await database.db
    .update(sqliteProductExports)
    .set(record)
    .where(
      and(
        eq(sqliteProductExports.id, record.id),
        eq(sqliteProductExports.shopDomain, record.shopDomain),
      ),
    );
}

export async function findSqliteProductExportById(
  database: D1DatabaseClient,
  input: ProductExportLookup,
): Promise<ProductExportRecord | null> {
  const [record] = await database.db
    .select()
    .from(sqliteProductExports)
    .where(
      and(
        eq(sqliteProductExports.id, input.id),
        eq(sqliteProductExports.shopDomain, input.shopDomain),
        isNull(sqliteProductExports.deletedAt),
      ),
    )
    .limit(1);

  return record ?? null;
}

export async function findSqliteProductExportByBulkOperationId(
  database: D1DatabaseClient,
  bulkOperationId: string,
): Promise<ProductExportRecord | null> {
  const [record] = await database.db
    .select()
    .from(sqliteProductExports)
    .where(eq(sqliteProductExports.shopifyBulkOperationId, bulkOperationId))
    .limit(1);

  return record ?? null;
}

export async function claimSqliteProductExportPart(
  database: D1DatabaseClient,
  input: ProductExportPartLookup,
): Promise<ProductExportPartRecord | null> {
  const now = new Date();
  const [record] = await database.db
    .update(sqliteProductExportParts)
    .set({
      attempts: sql`${sqliteProductExportParts.attempts} + 1`,
      errorCode: null,
      errorMessage: null,
      lockedAt: now,
      status: PRODUCT_EXPORT_PART_STATUSES.PROCESSING,
      updatedAt: now,
    })
    .where(
      and(
        eq(sqliteProductExportParts.exportId, input.exportId),
        eq(sqliteProductExportParts.seq, input.seq),
        inArray(sqliteProductExportParts.status, [
          ...PRODUCT_EXPORT_RETRYABLE_PART_STATUSES,
        ]),
      ),
    )
    .returning();

  return record ?? null;
}

export async function listSqliteProductExports(
  database: D1DatabaseClient,
  input: ProductExportListInput,
): Promise<ProductExportsPage> {
  const cursor = getListCursor(input);
  const where = getSqliteListWhere(input, cursor);
  const query = database.db
    .select()
    .from(sqliteProductExports)
    .where(where)
    .orderBy(
      desc(sqliteProductExports.createdAt),
      desc(sqliteProductExports.id),
    )
    .limit(input.pagination.limit + 1);

  const rows =
    input.pagination.mode === "page"
      ? await query.offset(getPageOffset(input.pagination))
      : await query;
  const total =
    input.pagination.mode === "page"
      ? await resolvePageTotalFromRows(rows, input.pagination, () =>
          countSqliteProductExports(database, where),
        )
      : undefined;

  return toProductExportsPage(rows, input, total);
}

export async function listSqliteProductExportParts(
  database: D1DatabaseClient,
  exportId: string,
): Promise<ProductExportPartRecord[]> {
  return await database.db
    .select()
    .from(sqliteProductExportParts)
    .where(eq(sqliteProductExportParts.exportId, exportId))
    .orderBy(sqliteProductExportParts.seq);
}

export async function listSqliteProductExportPartsPage(
  database: D1DatabaseClient,
  input: Parameters<ProductExportRepository["listPartsPage"]>[0],
): Promise<ProductExportPartRecord[]> {
  const where =
    input.afterSeq === undefined
      ? eq(sqliteProductExportParts.exportId, input.exportId)
      : and(
          eq(sqliteProductExportParts.exportId, input.exportId),
          gt(sqliteProductExportParts.seq, input.afterSeq),
        );

  return await database.db
    .select()
    .from(sqliteProductExportParts)
    .where(where)
    .orderBy(sqliteProductExportParts.seq)
    .limit(input.limit);
}

export async function listSqliteProductExportPartsByStatus(
  database: D1DatabaseClient,
  input: { exportId: string; statuses: ProductExportPartStatus[] },
): Promise<ProductExportPartRecord[]> {
  if (input.statuses.length === 0) return [];

  return await database.db
    .select()
    .from(sqliteProductExportParts)
    .where(
      and(
        eq(sqliteProductExportParts.exportId, input.exportId),
        inArray(sqliteProductExportParts.status, input.statuses),
      ),
    )
    .orderBy(sqliteProductExportParts.seq);
}

export async function listSqliteRecoverableProductExports(
  database: D1DatabaseClient,
  input: Parameters<ProductExportRepository["listRecoverableExports"]>[0],
): Promise<ProductExportRecord[]> {
  return await database.db
    .select()
    .from(sqliteProductExports)
    .where(getSqliteRecoverableWhere(input))
    .orderBy(asc(sqliteProductExports.updatedAt), asc(sqliteProductExports.id))
    .limit(input.limit);
}

export async function getSqliteProductExportPartStats(
  database: D1DatabaseClient,
  exportId: string,
): Promise<ProductExportPartStats> {
  const rows = await database.db
    .select({
      status: sqliteProductExportParts.status,
      total: sql<number>`count(*)`,
    })
    .from(sqliteProductExportParts)
    .where(eq(sqliteProductExportParts.exportId, exportId))
    .groupBy(sqliteProductExportParts.status);

  return toPartStats(rows);
}

export async function markSqliteProductExportPartDone(
  database: D1DatabaseClient,
  input: ProductExportPartLookup & {
    bucketKey: string;
    bucketProvider: string;
    byteSize: number;
    rowCount: number;
  },
): Promise<void> {
  const now = new Date();
  await database.db
    .update(sqliteProductExportParts)
    .set({
      bucketKey: input.bucketKey,
      bucketProvider: input.bucketProvider,
      byteSize: input.byteSize,
      completedAt: now,
      errorCode: null,
      errorMessage: null,
      rowCount: input.rowCount,
      status: PRODUCT_EXPORT_PART_STATUSES.DONE,
      updatedAt: now,
    })
    .where(
      and(
        eq(sqliteProductExportParts.exportId, input.exportId),
        eq(sqliteProductExportParts.seq, input.seq),
      ),
    );
}

export async function markSqliteProductExportPartFailed(
  database: D1DatabaseClient,
  input: ProductExportPartLookup & {
    errorCode: string;
    errorMessage: string;
  },
): Promise<void> {
  const now = new Date();
  await database.db
    .update(sqliteProductExportParts)
    .set({
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      status: PRODUCT_EXPORT_PART_STATUSES.FAILED,
      updatedAt: now,
    })
    .where(
      and(
        eq(sqliteProductExportParts.exportId, input.exportId),
        eq(sqliteProductExportParts.seq, input.seq),
      ),
    );
}

export async function deleteSqliteProductExport(
  database: D1DatabaseClient,
  input: ProductExportLookup,
): Promise<void> {
  const now = new Date();

  await database.db
    .update(sqliteProductExports)
    .set({
      deletedAt: now,
      status: PRODUCT_EXPORT_STATUSES.CANCELED,
      updatedAt: now,
    })
    .where(
      and(
        eq(sqliteProductExports.id, input.id),
        eq(sqliteProductExports.shopDomain, input.shopDomain),
      ),
    );
}

function getSqliteListWhere(
  input: ProductExportListInput,
  cursor: SeekCursor | null,
) {
  const conditions = [
    eq(sqliteProductExports.shopDomain, input.shopDomain),
    isNull(sqliteProductExports.deletedAt),
  ];

  if (input.status) {
    conditions.push(eq(sqliteProductExports.status, input.status));
  }

  if (cursor) {
    conditions.push(
      or(
        lt(sqliteProductExports.createdAt, cursor.createdAt),
        and(
          eq(sqliteProductExports.createdAt, cursor.createdAt),
          lt(sqliteProductExports.id, cursor.id),
        ),
      )!,
    );
  }

  return and(...conditions);
}

function getSqliteRecoverableWhere(
  input: Parameters<ProductExportRepository["listRecoverableExports"]>[0],
) {
  const conditions = [
    isNull(sqliteProductExports.deletedAt),
    ne(sqliteProductExports.status, PRODUCT_EXPORT_STATUSES.READY),
    ne(sqliteProductExports.status, PRODUCT_EXPORT_STATUSES.CANCELED),
    or(
      lt(sqliteProductExports.updatedAt, input.olderThan),
      eq(
        sqliteProductExports.status,
        PRODUCT_EXPORT_STATUSES.BULK_OPERATION_RUNNING,
      ),
      eq(
        sqliteProductExports.status,
        PRODUCT_EXPORT_STATUSES.BULK_OPERATION_COMPLETED,
      ),
      eq(sqliteProductExports.status, PRODUCT_EXPORT_STATUSES.GENERATING_CSV),
      eq(
        sqliteProductExports.status,
        PRODUCT_EXPORT_STATUSES.REQUIRES_NODE_FINALIZE,
      ),
    )!,
  ];

  if (input.cursor) {
    conditions.push(
      or(
        gt(sqliteProductExports.updatedAt, input.cursor.updatedAt),
        and(
          eq(sqliteProductExports.updatedAt, input.cursor.updatedAt),
          gt(sqliteProductExports.id, input.cursor.id),
        ),
      )!,
    );
  }

  return and(...conditions);
}

async function countSqliteProductExports(
  database: D1DatabaseClient,
  where: ReturnType<typeof getSqliteListWhere>,
): Promise<number> {
  const [row] = await database.db
    .select({ total: sql<number>`count(*)` })
    .from(sqliteProductExports)
    .where(where);

  return Number(row?.total ?? 0);
}
