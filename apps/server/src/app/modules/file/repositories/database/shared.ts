import {
  createSeekCursor,
  getSeekListCursor,
  toPaginatedRowsPage,
  type SeekCursor,
} from "@/shared/models";
import type { FileListInput, FileRecord, FilesPage } from "../../types";

export { getPageOffset, resolvePageTotalFromRows } from "@/shared/models";

export function toFilesPage(
  rows: FileRecord[],
  input: FileListInput,
  total?: number,
): FilesPage {
  const page = toPaginatedRowsPage(rows, input.pagination, {
    createCursor: createFileCursor,
    total,
  });

  return {
    files: page.items,
    pagination: page.pagination,
  };
}

export function createFileCursor(file?: FileRecord): string | undefined {
  if (!file) return undefined;

  return createSeekCursor({
    createdAt: file.createdAt,
    id: file.id,
  });
}

export function getListCursor(input: FileListInput): SeekCursor | null {
  return getSeekListCursor(input);
}
