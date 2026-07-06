import {
  postgresProductExportParts,
  postgresProductExports,
} from "@shamt/database/models/postgres";
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
import type { PostgresDatabase } from "@/infra/database";
import type { SeekCursor } from "@/shared/models";

type PostgresProductExportsDatabase =
  PostgresDatabase | Promise<PostgresDatabase>;

/**
 * Creates a PostgreSQL-backed product-export repository from a runtime
 * database capability.
 */
export function createPostgresProductExportsRepository(
  database: PostgresProductExportsDatabase,
): ProductExportRepository {
  const dbPromise = Promise.resolve(database);

  return {
    async claimPart(input): Promise<ProductExportPartRecord | null> {
      return claimPostgresProductExportPart(await dbPromise, input);
    },
    async create(record): Promise<void> {
      return createPostgresProductExport(await dbPromise, record);
    },
    async createParts(parts): Promise<void> {
      return createPostgresProductExportParts(await dbPromise, parts);
    },
    async delete(input): Promise<void> {
      return deletePostgresProductExport(await dbPromise, input);
    },
    async findByBulkOperationId(
      bulkOperationId,
    ): Promise<ProductExportRecord | null> {
      return findPostgresProductExportByBulkOperationId(
        await dbPromise,
        bulkOperationId,
      );
    },
    async findById(input): Promise<ProductExportRecord | null> {
      return findPostgresProductExportById(await dbPromise, input);
    },
    async getPartStats(exportId): Promise<ProductExportPartStats> {
      return getPostgresProductExportPartStats(await dbPromise, exportId);
    },
    async list(input): Promise<ProductExportsPage> {
      return listPostgresProductExports(await dbPromise, input);
    },
    async listParts(exportId): Promise<ProductExportPartRecord[]> {
      return listPostgresProductExportParts(await dbPromise, exportId);
    },
    async listPartsByStatus(input): Promise<ProductExportPartRecord[]> {
      return listPostgresProductExportPartsByStatus(await dbPromise, input);
    },
    async listPartsPage(input): Promise<ProductExportPartRecord[]> {
      return listPostgresProductExportPartsPage(await dbPromise, input);
    },
    async listRecoverableExports(input): Promise<ProductExportRecord[]> {
      return listPostgresRecoverableProductExports(await dbPromise, input);
    },
    async markPartDone(input): Promise<void> {
      return markPostgresProductExportPartDone(await dbPromise, input);
    },
    async markPartFailed(input): Promise<void> {
      return markPostgresProductExportPartFailed(await dbPromise, input);
    },
    async update(record): Promise<void> {
      return updatePostgresProductExport(await dbPromise, record);
    },
  };
}

export async function createPostgresProductExportParts(
  database: PostgresDatabase,
  parts: ProductExportPartRecord[],
): Promise<void> {
  if (parts.length === 0) return;

  await database.db
    .insert(postgresProductExportParts)
    .values(parts)
    .onConflictDoNothing({
      target: [
        postgresProductExportParts.exportId,
        postgresProductExportParts.seq,
      ],
    });
}

export async function createPostgresProductExport(
  database: PostgresDatabase,
  record: ProductExportRecord,
): Promise<void> {
  await database.db
    .insert(postgresProductExports)
    .values(record)
    .onConflictDoUpdate({
      target: postgresProductExports.id,
      set: record,
    });
}

export async function updatePostgresProductExport(
  database: PostgresDatabase,
  record: ProductExportRecord,
): Promise<void> {
  await database.db
    .update(postgresProductExports)
    .set(record)
    .where(
      and(
        eq(postgresProductExports.id, record.id),
        eq(postgresProductExports.shopDomain, record.shopDomain),
      ),
    );
}

export async function findPostgresProductExportById(
  database: PostgresDatabase,
  input: ProductExportLookup,
): Promise<ProductExportRecord | null> {
  const [record] = await database.db
    .select()
    .from(postgresProductExports)
    .where(
      and(
        eq(postgresProductExports.id, input.id),
        eq(postgresProductExports.shopDomain, input.shopDomain),
        isNull(postgresProductExports.deletedAt),
      ),
    )
    .limit(1);

  return record ?? null;
}

export async function findPostgresProductExportByBulkOperationId(
  database: PostgresDatabase,
  bulkOperationId: string,
): Promise<ProductExportRecord | null> {
  const [record] = await database.db
    .select()
    .from(postgresProductExports)
    .where(eq(postgresProductExports.shopifyBulkOperationId, bulkOperationId))
    .limit(1);

  return record ?? null;
}

export async function claimPostgresProductExportPart(
  database: PostgresDatabase,
  input: ProductExportPartLookup,
): Promise<ProductExportPartRecord | null> {
  const now = new Date();
  const [record] = await database.db
    .update(postgresProductExportParts)
    .set({
      attempts: sql`${postgresProductExportParts.attempts} + 1`,
      errorCode: null,
      errorMessage: null,
      lockedAt: now,
      status: PRODUCT_EXPORT_PART_STATUSES.PROCESSING,
      updatedAt: now,
    })
    .where(
      and(
        eq(postgresProductExportParts.exportId, input.exportId),
        eq(postgresProductExportParts.seq, input.seq),
        inArray(postgresProductExportParts.status, [
          ...PRODUCT_EXPORT_RETRYABLE_PART_STATUSES,
        ]),
      ),
    )
    .returning();

  return record ?? null;
}

export async function listPostgresProductExports(
  database: PostgresDatabase,
  input: ProductExportListInput,
): Promise<ProductExportsPage> {
  const cursor = getListCursor(input);
  const where = getPostgresListWhere(input, cursor);
  const query = database.db
    .select()
    .from(postgresProductExports)
    .where(where)
    .orderBy(
      desc(postgresProductExports.createdAt),
      desc(postgresProductExports.id),
    )
    .limit(input.pagination.limit + 1);

  const rows =
    input.pagination.mode === "page"
      ? await query.offset(getPageOffset(input.pagination))
      : await query;
  const total =
    input.pagination.mode === "page"
      ? await resolvePageTotalFromRows(rows, input.pagination, () =>
          countPostgresProductExports(database, where),
        )
      : undefined;

  return toProductExportsPage(rows, input, total);
}

export async function listPostgresProductExportParts(
  database: PostgresDatabase,
  exportId: string,
): Promise<ProductExportPartRecord[]> {
  return await database.db
    .select()
    .from(postgresProductExportParts)
    .where(eq(postgresProductExportParts.exportId, exportId))
    .orderBy(postgresProductExportParts.seq);
}

export async function listPostgresProductExportPartsPage(
  database: PostgresDatabase,
  input: Parameters<ProductExportRepository["listPartsPage"]>[0],
): Promise<ProductExportPartRecord[]> {
  const where =
    input.afterSeq === undefined
      ? eq(postgresProductExportParts.exportId, input.exportId)
      : and(
          eq(postgresProductExportParts.exportId, input.exportId),
          gt(postgresProductExportParts.seq, input.afterSeq),
        );

  return await database.db
    .select()
    .from(postgresProductExportParts)
    .where(where)
    .orderBy(postgresProductExportParts.seq)
    .limit(input.limit);
}

export async function listPostgresProductExportPartsByStatus(
  database: PostgresDatabase,
  input: { exportId: string; statuses: ProductExportPartStatus[] },
): Promise<ProductExportPartRecord[]> {
  if (input.statuses.length === 0) return [];

  return await database.db
    .select()
    .from(postgresProductExportParts)
    .where(
      and(
        eq(postgresProductExportParts.exportId, input.exportId),
        inArray(postgresProductExportParts.status, input.statuses),
      ),
    )
    .orderBy(postgresProductExportParts.seq);
}

export async function listPostgresRecoverableProductExports(
  database: PostgresDatabase,
  input: Parameters<ProductExportRepository["listRecoverableExports"]>[0],
): Promise<ProductExportRecord[]> {
  return await database.db
    .select()
    .from(postgresProductExports)
    .where(getPostgresRecoverableWhere(input))
    .orderBy(
      asc(postgresProductExports.updatedAt),
      asc(postgresProductExports.id),
    )
    .limit(input.limit);
}

export async function getPostgresProductExportPartStats(
  database: PostgresDatabase,
  exportId: string,
): Promise<ProductExportPartStats> {
  const rows = await database.db
    .select({
      status: postgresProductExportParts.status,
      total: sql<number>`count(*)`,
    })
    .from(postgresProductExportParts)
    .where(eq(postgresProductExportParts.exportId, exportId))
    .groupBy(postgresProductExportParts.status);

  return toPartStats(rows);
}

export async function markPostgresProductExportPartDone(
  database: PostgresDatabase,
  input: ProductExportPartLookup & {
    bucketKey: string;
    bucketProvider: string;
    byteSize: number;
    rowCount: number;
  },
): Promise<void> {
  const now = new Date();
  await database.db
    .update(postgresProductExportParts)
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
        eq(postgresProductExportParts.exportId, input.exportId),
        eq(postgresProductExportParts.seq, input.seq),
      ),
    );
}

export async function markPostgresProductExportPartFailed(
  database: PostgresDatabase,
  input: ProductExportPartLookup & {
    errorCode: string;
    errorMessage: string;
  },
): Promise<void> {
  const now = new Date();
  await database.db
    .update(postgresProductExportParts)
    .set({
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      status: PRODUCT_EXPORT_PART_STATUSES.FAILED,
      updatedAt: now,
    })
    .where(
      and(
        eq(postgresProductExportParts.exportId, input.exportId),
        eq(postgresProductExportParts.seq, input.seq),
      ),
    );
}

export async function deletePostgresProductExport(
  database: PostgresDatabase,
  input: ProductExportLookup,
): Promise<void> {
  const now = new Date();

  await database.db
    .update(postgresProductExports)
    .set({
      deletedAt: now,
      status: PRODUCT_EXPORT_STATUSES.CANCELED,
      updatedAt: now,
    })
    .where(
      and(
        eq(postgresProductExports.id, input.id),
        eq(postgresProductExports.shopDomain, input.shopDomain),
      ),
    );
}

function getPostgresListWhere(
  input: ProductExportListInput,
  cursor: SeekCursor | null,
) {
  const conditions = [
    eq(postgresProductExports.shopDomain, input.shopDomain),
    isNull(postgresProductExports.deletedAt),
  ];

  if (input.status) {
    conditions.push(eq(postgresProductExports.status, input.status));
  }

  if (cursor) {
    conditions.push(
      or(
        lt(postgresProductExports.createdAt, cursor.createdAt),
        and(
          eq(postgresProductExports.createdAt, cursor.createdAt),
          lt(postgresProductExports.id, cursor.id),
        ),
      )!,
    );
  }

  return and(...conditions);
}

function getPostgresRecoverableWhere(
  input: Parameters<ProductExportRepository["listRecoverableExports"]>[0],
) {
  const conditions = [
    isNull(postgresProductExports.deletedAt),
    ne(postgresProductExports.status, PRODUCT_EXPORT_STATUSES.READY),
    ne(postgresProductExports.status, PRODUCT_EXPORT_STATUSES.CANCELED),
    or(
      lt(postgresProductExports.updatedAt, input.olderThan),
      eq(
        postgresProductExports.status,
        PRODUCT_EXPORT_STATUSES.BULK_OPERATION_RUNNING,
      ),
      eq(
        postgresProductExports.status,
        PRODUCT_EXPORT_STATUSES.BULK_OPERATION_COMPLETED,
      ),
      eq(postgresProductExports.status, PRODUCT_EXPORT_STATUSES.GENERATING_CSV),
      eq(
        postgresProductExports.status,
        PRODUCT_EXPORT_STATUSES.REQUIRES_NODE_FINALIZE,
      ),
    )!,
  ];

  if (input.cursor) {
    conditions.push(
      or(
        gt(postgresProductExports.updatedAt, input.cursor.updatedAt),
        and(
          eq(postgresProductExports.updatedAt, input.cursor.updatedAt),
          gt(postgresProductExports.id, input.cursor.id),
        ),
      )!,
    );
  }

  return and(...conditions);
}

async function countPostgresProductExports(
  database: PostgresDatabase,
  where: ReturnType<typeof getPostgresListWhere>,
): Promise<number> {
  const [row] = await database.db
    .select({ total: sql<number>`count(*)` })
    .from(postgresProductExports)
    .where(where);

  return Number(row?.total ?? 0);
}
