import {
  createSeekCursor,
  getSeekListCursor,
  toPaginatedRowsPage,
  type SeekCursor,
} from "@/shared/models";
import type {
  ProductExportListInput,
  ProductExportPartRecord,
  ProductExportPartStats,
  ProductExportRecord,
  ProductExportsPage,
} from "../../types";

export { getPageOffset, resolvePageTotalFromRows } from "@/shared/models";

export function toProductExportsPage(
  rows: ProductExportRecord[],
  input: ProductExportListInput,
  total?: number,
): ProductExportsPage {
  const page = toPaginatedRowsPage(rows, input.pagination, {
    createCursor: createProductExportCursor,
    total,
  });

  return {
    pagination: page.pagination,
    productExports: page.items,
  };
}

export function createProductExportCursor(
  record?: ProductExportRecord,
): string | undefined {
  if (!record) return undefined;

  return createSeekCursor({
    createdAt: record.createdAt,
    id: record.id,
  });
}

export function getListCursor(
  input: ProductExportListInput,
): SeekCursor | null {
  return getSeekListCursor(input);
}

export function toPartStats(
  groups: Array<Pick<ProductExportPartRecord, "status"> & { total: number }>,
) {
  const stats: ProductExportPartStats = {
    done: 0,
    failed: 0,
    pending: 0,
    processing: 0,
    total: 0,
  };

  for (const group of groups) {
    const total = Number(group.total);
    stats[group.status] += total;
    stats.total += total;
  }

  return stats;
}
