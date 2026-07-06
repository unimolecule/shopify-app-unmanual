import { PRODUCT_EXPORT_STATUS_VALUES } from "@shamt/database/constants";
import {
  onlineManager,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import {
  createProductExport,
  deleteProductExport,
  downloadProductExportFile,
  getProductExport,
  listProductExports,
  listProductExportTemplates,
  type CreateProductExportInput,
  type ProductExport,
  type ProductExportListInput,
  type ProductExportsListResponse,
  type ProductExportStatus,
} from "@/apis/product-exports";

export const PRODUCT_EXPORT_POLL_MS = 1000 * 30;

export const TERMINAL_PRODUCT_EXPORT_STATUSES = new Set<ProductExportStatus>([
  "canceled",
  "failed",
  "ready",
]);

export const productExportKeys = {
  all: ["product-exports"] as const,
  detail: (id: string) => [...productExportKeys.details(), id] as const,
  details: () => [...productExportKeys.all, "detail"] as const,
  list: (input: ProductExportListInput = {}) =>
    [...productExportKeys.lists(), input] as const,
  lists: () => [...productExportKeys.all, "list"] as const,
  templates: () => [...productExportKeys.all, "templates"] as const,
};

export function productExportListQueryOptions(
  input: ProductExportListInput = {},
) {
  return queryOptions({
    queryKey: productExportKeys.list(input),
    queryFn: ({ signal }) => listProductExports(input, signal),
  });
}

export function productExportDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: productExportKeys.detail(id),
    queryFn: ({ signal }) => getProductExport(id, signal),
  });
}

export function productExportTemplatesQueryOptions() {
  return queryOptions({
    queryKey: productExportKeys.templates(),
    queryFn: ({ signal }) => listProductExportTemplates(signal),
  });
}

export function useCreateProductExportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductExportInput) => createProductExport(input),
    onSuccess: async (response) => {
      const productExport = response.data;

      if (productExport) {
        queryClient.setQueryData(
          productExportKeys.detail(productExport.id),
          response,
        );
        updateProductExportListQueries(queryClient, (current, input) =>
          addProductExportToListResponse(current, productExport, input),
        );
      }

      await queryClient.invalidateQueries({
        queryKey: productExportKeys.lists(),
        refetchType: "all",
      });
    },
  });
}

export function useDeleteProductExportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteProductExport(id),
    onSuccess: async (_response, id) => {
      queryClient.removeQueries({ queryKey: productExportKeys.detail(id) });
      updateProductExportListQueries(queryClient, (current) =>
        removeProductExportFromListResponse(current, id),
      );
      await queryClient.invalidateQueries({
        queryKey: productExportKeys.lists(),
        refetchType: "all",
      });
    },
  });
}

export function useDownloadProductExportMutation() {
  return useMutation({
    mutationFn: (productExport: ProductExport) =>
      downloadProductExportFile(productExport),
  });
}

export function useIsOnline() {
  return useSyncExternalStore(
    onlineManager.subscribe,
    () => onlineManager.isOnline(),
    () => true,
  );
}

function addProductExportToListResponse(
  response: ProductExportsListResponse | undefined,
  productExport: ProductExport,
  input: ProductExportListInput,
) {
  if (!response?.data) return response;
  if (!shouldInsertProductExportIntoList(input, productExport)) {
    return response;
  }

  const result = [
    productExport,
    ...response.data.result.filter((row) => row.id !== productExport.id),
  ];

  return {
    ...response,
    data: {
      ...response.data,
      result,
    },
  };
}

function removeProductExportFromListResponse(
  response: ProductExportsListResponse | undefined,
  id: string,
) {
  if (!response?.data) return response;

  return {
    ...response,
    data: {
      ...response.data,
      result: response.data.result.filter((row) => row.id !== id),
    },
  };
}

function updateProductExportListQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  update: (
    current: ProductExportsListResponse | undefined,
    input: ProductExportListInput,
  ) => ProductExportsListResponse | undefined,
) {
  const queries = queryClient.getQueriesData<ProductExportsListResponse>({
    queryKey: productExportKeys.lists(),
  });

  for (const [queryKey] of queries) {
    queryClient.setQueryData<ProductExportsListResponse>(queryKey, (current) =>
      update(current, getProductExportListInput(queryKey)),
    );
  }
}

function shouldInsertProductExportIntoList(
  input: ProductExportListInput,
  productExport: ProductExport,
) {
  if (input.cursor) return false;
  if (input.page && input.page > 1) return false;
  if (input.status && input.status !== productExport.status) return false;

  return true;
}

function getProductExportListInput(
  queryKey: readonly unknown[],
): ProductExportListInput {
  const input = queryKey[2];
  if (!isProductExportListInputRecord(input)) return {};

  return {
    cursor: typeof input.cursor === "string" ? input.cursor : undefined,
    limit: typeof input.limit === "number" ? input.limit : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
    status: isProductExportStatus(input.status) ? input.status : undefined,
  };
}

function isProductExportListInputRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProductExportStatus(value: unknown): value is ProductExportStatus {
  return (
    typeof value === "string" &&
    PRODUCT_EXPORT_STATUS_VALUES.includes(value as ProductExportStatus)
  );
}
