import { sqliteReferences } from "@shamt/database/models/sqlite";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  getPageOffset,
  getReferenceListCursor,
  resolvePageTotalFromRows,
  toReferencesPage,
} from "./shared";
import type { ReferenceRepository } from ".";
import type {
  ReferenceCodeLookup,
  ReferenceListInput,
  ReferenceLookup,
  ReferenceRecord,
} from "../../types";
import type { D1DatabaseClient } from "@/infra/database";

type SqliteReferenceDatabase = D1DatabaseClient | Promise<D1DatabaseClient>;

/**
 * Creates a SQLite/D1-backed reference repository from a runtime database
 * capability.
 */
export function createSqliteReferenceRepository(
  database: SqliteReferenceDatabase,
): ReferenceRepository {
  const dbPromise = Promise.resolve(database);

  return {
    async create(record): Promise<void> {
      return createSqliteReference(await dbPromise, record);
    },
    async delete(input): Promise<void> {
      return deleteSqliteReference(await dbPromise, input);
    },
    async findByCode(input) {
      return findSqliteReferenceByCode(await dbPromise, input);
    },
    async findByCodeIncludingDeleted(input) {
      return findSqliteReferenceByCodeIncludingDeleted(await dbPromise, input);
    },
    async findById(input) {
      return findSqliteReferenceById(await dbPromise, input);
    },
    async list(input) {
      return listSqliteReferences(await dbPromise, input);
    },
    async update(record): Promise<void> {
      return updateSqliteReference(await dbPromise, record);
    },
  };
}

export async function createSqliteReference(
  database: D1DatabaseClient,
  record: ReferenceRecord,
): Promise<void> {
  await database.db
    .insert(sqliteReferences)
    .values(record)
    .onConflictDoNothing({
      target: [
        sqliteReferences.shopDomain,
        sqliteReferences.namespace,
        sqliteReferences.code,
      ],
    });
}

export async function findSqliteReferenceById(
  database: D1DatabaseClient,
  input: ReferenceLookup,
): Promise<ReferenceRecord | null> {
  const [record] = await database.db
    .select()
    .from(sqliteReferences)
    .where(
      and(
        eq(sqliteReferences.id, input.id),
        eq(sqliteReferences.shopDomain, input.shopDomain),
        eq(sqliteReferences.namespace, input.namespace),
        isNull(sqliteReferences.deletedAt),
      ),
    )
    .limit(1);

  return record ?? null;
}

export async function findSqliteReferenceByCode(
  database: D1DatabaseClient,
  input: ReferenceCodeLookup,
): Promise<ReferenceRecord | null> {
  const [record] = await database.db
    .select()
    .from(sqliteReferences)
    .where(
      and(
        eq(sqliteReferences.shopDomain, input.shopDomain),
        eq(sqliteReferences.namespace, input.namespace),
        eq(sqliteReferences.code, input.code),
        isNull(sqliteReferences.deletedAt),
      ),
    )
    .limit(1);

  return record ?? null;
}

export async function findSqliteReferenceByCodeIncludingDeleted(
  database: D1DatabaseClient,
  input: ReferenceCodeLookup,
): Promise<ReferenceRecord | null> {
  const [record] = await database.db
    .select()
    .from(sqliteReferences)
    .where(
      and(
        eq(sqliteReferences.shopDomain, input.shopDomain),
        eq(sqliteReferences.namespace, input.namespace),
        eq(sqliteReferences.code, input.code),
      ),
    )
    .limit(1);

  return record ?? null;
}

export async function listSqliteReferences(
  database: D1DatabaseClient,
  input: ReferenceListInput,
): Promise<ReturnType<typeof toReferencesPage>> {
  const cursor = getReferenceListCursor(input);
  const where = getSqliteReferenceListWhere(input, cursor);
  const query = database.db
    .select()
    .from(sqliteReferences)
    .where(where)
    .orderBy(
      asc(sqliteReferences.sortOrder),
      asc(sqliteReferences.code),
      asc(sqliteReferences.id),
    )
    .limit(input.pagination.limit + 1);

  const rows =
    input.pagination.mode === "page"
      ? await query.offset(getPageOffset(input.pagination))
      : await query;
  const total =
    input.pagination.mode === "page"
      ? await resolvePageTotalFromRows(rows, input.pagination, () =>
          countSqliteReferences(database, where),
        )
      : undefined;

  return toReferencesPage(rows, input, total);
}

export async function updateSqliteReference(
  database: D1DatabaseClient,
  record: ReferenceRecord,
): Promise<void> {
  await database.db
    .update(sqliteReferences)
    .set(record)
    .where(
      and(
        eq(sqliteReferences.id, record.id),
        eq(sqliteReferences.shopDomain, record.shopDomain),
        eq(sqliteReferences.namespace, record.namespace),
      ),
    );
}

export async function deleteSqliteReference(
  database: D1DatabaseClient,
  input: ReferenceLookup,
): Promise<void> {
  const now = new Date();

  await database.db
    .update(sqliteReferences)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(sqliteReferences.id, input.id),
        eq(sqliteReferences.shopDomain, input.shopDomain),
        eq(sqliteReferences.namespace, input.namespace),
        isNull(sqliteReferences.deletedAt),
      ),
    );
}

function getSqliteReferenceListWhere(
  input: ReferenceListInput,
  cursor: ReturnType<typeof getReferenceListCursor>,
) {
  const conditions = [
    eq(sqliteReferences.shopDomain, input.shopDomain),
    eq(sqliteReferences.namespace, input.namespace),
    isNull(sqliteReferences.deletedAt),
  ];

  if (input.enabled !== undefined) {
    conditions.push(eq(sqliteReferences.enabled, input.enabled));
  }

  if (cursor) {
    conditions.push(
      or(
        gt(sqliteReferences.sortOrder, cursor.sortOrder),
        and(
          eq(sqliteReferences.sortOrder, cursor.sortOrder),
          gt(sqliteReferences.code, cursor.code),
        ),
        and(
          eq(sqliteReferences.sortOrder, cursor.sortOrder),
          eq(sqliteReferences.code, cursor.code),
          gt(sqliteReferences.id, cursor.id),
        ),
      )!,
    );
  }

  return and(...conditions);
}

async function countSqliteReferences(
  database: D1DatabaseClient,
  where: ReturnType<typeof getSqliteReferenceListWhere>,
): Promise<number> {
  const [row] = await database.db
    .select({ total: sql<number>`count(*)` })
    .from(sqliteReferences)
    .where(where);

  return Number(row?.total ?? 0);
}
