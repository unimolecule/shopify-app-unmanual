import {
  readPaginationCursor,
  toPaginatedRowsPage,
  type CursorFormat,
} from "@/shared/models";
import type {
  ReferenceListInput,
  ReferenceRecord,
  ReferencesPage,
} from "../../types";

export { getPageOffset, resolvePageTotalFromRows } from "@/shared/models";

type ReferenceCursor = Pick<ReferenceRecord, "code" | "id" | "sortOrder">;

const referenceCursorFormat: CursorFormat<ReferenceCursor> = {
  format: (cursor) =>
    [
      encodeURIComponent(String(cursor.sortOrder)),
      encodeURIComponent(cursor.code),
      encodeURIComponent(cursor.id),
    ].join(":"),
  parse: (cursor) => {
    const [sortOrderValue, codeValue, idValue, ...rest] = cursor.split(":");
    if (!sortOrderValue || !codeValue || !idValue || rest.length > 0) {
      return null;
    }

    const sortOrder = Number(decodeURIComponent(sortOrderValue));
    const code = decodeURIComponent(codeValue);
    const id = decodeURIComponent(idValue);

    if (!Number.isSafeInteger(sortOrder) || !code || !id) {
      return null;
    }

    return { code, id, sortOrder };
  },
};

export function toReferencesPage(
  rows: ReferenceRecord[],
  input: ReferenceListInput,
  total?: number,
): ReferencesPage {
  const page = toPaginatedRowsPage(rows, input.pagination, {
    createCursor: createReferenceCursor,
    total,
  });

  return {
    pagination: page.pagination,
    references: page.items,
  };
}

export function createReferenceCursor(
  record?: ReferenceRecord,
): string | undefined {
  if (!record) return undefined;

  return referenceCursorFormat.format(record);
}

export function getReferenceListCursor(
  input: ReferenceListInput,
): ReferenceCursor | null {
  return readPaginationCursor(input.pagination, referenceCursorFormat);
}
