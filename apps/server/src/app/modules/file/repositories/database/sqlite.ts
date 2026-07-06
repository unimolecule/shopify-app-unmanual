import { sqliteFiles } from "@unimolecule/shopify-app-unmanual-database/models/sqlite";
import { and, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  getListCursor,
  getPageOffset,
  resolvePageTotalFromRows,
  toFilesPage,
} from "./shared";
import type { FilesRepository } from ".";
import type {
  FileListInput,
  FileLookup,
  FileRecord,
  FilesPage,
  FileStatusUpdate,
} from "../../types";
import type { D1DatabaseClient } from "@/infra/database";
import type { SeekCursor } from "@/shared/models";

type SqliteFilesDatabase = D1DatabaseClient | Promise<D1DatabaseClient>;

/**
 * Creates a SQLite/D1-backed files repository from a runtime database
 * capability.
 */
export function createSqliteFilesRepository(
  database: SqliteFilesDatabase,
): FilesRepository {
  const dbPromise = Promise.resolve(database);

  return {
    async create(file): Promise<void> {
      return createSqliteFile(await dbPromise, file);
    },
    async delete(input): Promise<void> {
      return deleteSqliteFile(await dbPromise, input);
    },
    async findById(input): Promise<FileRecord | null> {
      return findSqliteFileById(await dbPromise, input);
    },
    async list(input): Promise<FilesPage> {
      return listSqliteFiles(await dbPromise, input);
    },
    async updateStatus(input): Promise<void> {
      return updateSqliteFileStatus(await dbPromise, input);
    },
  };
}

/**
 * Upserts one file metadata row through the SQLite/D1 files table.
 */
export async function createSqliteFile(
  database: D1DatabaseClient,
  file: FileRecord,
): Promise<void> {
  await database.db.insert(sqliteFiles).values(file).onConflictDoUpdate({
    target: sqliteFiles.id,
    set: file,
  });
}

/**
 * Finds a SQLite/D1 file row by id and shop domain.
 */
export async function findSqliteFileById(
  database: D1DatabaseClient,
  input: FileLookup,
): Promise<FileRecord | null> {
  const [file] = await database.db
    .select()
    .from(sqliteFiles)
    .where(
      and(
        eq(sqliteFiles.id, input.id),
        eq(sqliteFiles.shopDomain, input.shopDomain),
      ),
    )
    .limit(1);

  return file ?? null;
}

/**
 * Lists active SQLite/D1 files using one extra row to detect nextCursor.
 */
export async function listSqliteFiles(
  database: D1DatabaseClient,
  input: FileListInput,
): Promise<FilesPage> {
  const cursor = getListCursor(input);
  const where = getSqliteListWhere(input, cursor);
  const query = database.db
    .select()
    .from(sqliteFiles)
    .where(where)
    .orderBy(desc(sqliteFiles.createdAt), desc(sqliteFiles.id))
    .limit(input.pagination.limit + 1);

  const rows: FileRecord[] =
    input.pagination.mode === "page"
      ? await query.offset(getPageOffset(input.pagination))
      : await query;
  const total =
    input.pagination.mode === "page"
      ? await resolvePageTotalFromRows(rows, input.pagination, () =>
          countSqliteFiles(database, where),
        )
      : undefined;

  return toFilesPage(rows, input, total);
}

/**
 * Updates SQLite/D1 file status fields without touching immutable metadata.
 */
export async function updateSqliteFileStatus(
  database: D1DatabaseClient,
  input: FileStatusUpdate,
): Promise<void> {
  await database.db
    .update(sqliteFiles)
    .set({
      deletedAt: input.deletedAt,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sqliteFiles.id, input.id),
        eq(sqliteFiles.shopDomain, input.shopDomain),
      ),
    );
}

/**
 * Soft-deletes a SQLite/D1 file metadata row.
 */
export async function deleteSqliteFile(
  database: D1DatabaseClient,
  input: FileLookup,
): Promise<void> {
  const now = new Date();

  await database.db
    .update(sqliteFiles)
    .set({
      deletedAt: now,
      status: "deleted",
      updatedAt: now,
    })
    .where(
      and(
        eq(sqliteFiles.id, input.id),
        eq(sqliteFiles.shopDomain, input.shopDomain),
      ),
    );
}

async function countSqliteFiles(
  database: D1DatabaseClient,
  where: ReturnType<typeof getSqliteListWhere>,
): Promise<number> {
  const [row] = await database.db
    .select({ total: sql<number>`count(*)` })
    .from(sqliteFiles)
    .where(where);

  return Number(row?.total ?? 0);
}

function getSqliteListWhere(input: FileListInput, cursor: SeekCursor | null) {
  const conditions = [
    eq(sqliteFiles.shopDomain, input.shopDomain),
    isNull(sqliteFiles.deletedAt),
    ne(sqliteFiles.status, "deleted"),
    ne(sqliteFiles.status, "failed"),
  ];

  if (cursor) {
    conditions.push(
      or(
        lt(sqliteFiles.createdAt, cursor.createdAt),
        and(
          eq(sqliteFiles.createdAt, cursor.createdAt),
          lt(sqliteFiles.id, cursor.id),
        ),
      )!,
    );
  }

  return and(...conditions);
}
