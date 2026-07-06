import { postgresFiles } from "@shamt/database/models/postgres";
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
import type { PostgresDatabase } from "@/infra/database";
import type { SeekCursor } from "@/shared/models";

type PostgresFilesDatabase = PostgresDatabase | Promise<PostgresDatabase>;

/**
 * Creates a PostgreSQL-backed files repository from a runtime database
 * capability.
 */
export function createPostgresFilesRepository(
  database: PostgresFilesDatabase,
): FilesRepository {
  const dbPromise = Promise.resolve(database);

  return {
    async create(file): Promise<void> {
      return createPostgresFile(await dbPromise, file);
    },
    async delete(input): Promise<void> {
      return deletePostgresFile(await dbPromise, input);
    },
    async findById(input): Promise<FileRecord | null> {
      return findPostgresFileById(await dbPromise, input);
    },
    async list(input): Promise<FilesPage> {
      return listPostgresFiles(await dbPromise, input);
    },
    async updateStatus(input): Promise<void> {
      return updatePostgresFileStatus(await dbPromise, input);
    },
  };
}

/**
 * Upserts one file metadata row through the PostgreSQL files table.
 */
export async function createPostgresFile(
  database: PostgresDatabase,
  file: FileRecord,
): Promise<void> {
  await database.db.insert(postgresFiles).values(file).onConflictDoUpdate({
    target: postgresFiles.id,
    set: file,
  });
}

/**
 * Finds a PostgreSQL file row by id and shop domain.
 */
export async function findPostgresFileById(
  database: PostgresDatabase,
  input: FileLookup,
): Promise<FileRecord | null> {
  const [file] = await database.db
    .select()
    .from(postgresFiles)
    .where(
      and(
        eq(postgresFiles.id, input.id),
        eq(postgresFiles.shopDomain, input.shopDomain),
      ),
    )
    .limit(1);

  return file ?? null;
}

/**
 * Lists active PostgreSQL files using one extra row to detect nextCursor.
 */
export async function listPostgresFiles(
  database: PostgresDatabase,
  input: FileListInput,
): Promise<FilesPage> {
  const cursor = getListCursor(input);
  const where = getPostgresListWhere(input, cursor);
  const query = database.db
    .select()
    .from(postgresFiles)
    .where(where)
    .orderBy(desc(postgresFiles.createdAt), desc(postgresFiles.id))
    .limit(input.pagination.limit + 1);

  const rows: FileRecord[] =
    input.pagination.mode === "page"
      ? await query.offset(getPageOffset(input.pagination))
      : await query;
  const total =
    input.pagination.mode === "page"
      ? await resolvePageTotalFromRows(rows, input.pagination, () =>
          countPostgresFiles(database, where),
        )
      : undefined;

  return toFilesPage(rows, input, total);
}

/**
 * Updates PostgreSQL file status fields without touching immutable metadata.
 */
export async function updatePostgresFileStatus(
  database: PostgresDatabase,
  input: FileStatusUpdate,
): Promise<void> {
  await database.db
    .update(postgresFiles)
    .set({
      deletedAt: input.deletedAt,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(postgresFiles.id, input.id),
        eq(postgresFiles.shopDomain, input.shopDomain),
      ),
    );
}

/**
 * Soft-deletes a PostgreSQL file metadata row.
 */
export async function deletePostgresFile(
  database: PostgresDatabase,
  input: FileLookup,
): Promise<void> {
  const now = new Date();

  await database.db
    .update(postgresFiles)
    .set({
      deletedAt: now,
      status: "deleted",
      updatedAt: now,
    })
    .where(
      and(
        eq(postgresFiles.id, input.id),
        eq(postgresFiles.shopDomain, input.shopDomain),
      ),
    );
}

async function countPostgresFiles(
  database: PostgresDatabase,
  where: ReturnType<typeof getPostgresListWhere>,
): Promise<number> {
  const [row] = await database.db
    .select({ total: sql<number>`count(*)` })
    .from(postgresFiles)
    .where(where);

  return Number(row?.total ?? 0);
}

function getPostgresListWhere(input: FileListInput, cursor: SeekCursor | null) {
  const conditions = [
    eq(postgresFiles.shopDomain, input.shopDomain),
    isNull(postgresFiles.deletedAt),
    ne(postgresFiles.status, "deleted"),
    ne(postgresFiles.status, "failed"),
  ];

  if (cursor) {
    conditions.push(
      or(
        lt(postgresFiles.createdAt, cursor.createdAt),
        and(
          eq(postgresFiles.createdAt, cursor.createdAt),
          lt(postgresFiles.id, cursor.id),
        ),
      )!,
    );
  }

  return and(...conditions);
}
