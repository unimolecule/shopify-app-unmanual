import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { memo, useCallback, useMemo, useState } from "react";
import { Empty } from "@/components/empty";
import { Offline } from "@/components/errors";
import { Loading } from "@/components/loading";
import { useProductExportReadyToast } from "./-components/ready-toast";
import {
  PRODUCT_EXPORT_POLL_MS,
  productExportListQueryOptions,
  TERMINAL_PRODUCT_EXPORT_STATUSES,
  useDeleteProductExportMutation,
  useDownloadProductExportMutation,
  useIsOnline,
} from "./-queries";
import type {
  ProductExport,
  ProductExportStatus,
} from "@/apis/product-exports";

export const Route = createFileRoute("/product-export/")({
  component: ProductExportIndex,
});

const PRODUCT_EXPORT_LIST_INPUT = { limit: 20 };

function ProductExportIndex() {
  const deleteMutation = useDeleteProductExportMutation();
  const downloadMutation = useDownloadProductExportMutation();
  const isOnline = useIsOnline();
  const [productExportToDelete, setProductExportToDelete] = useState<
    ProductExport | undefined
  >(undefined);
  const productExportsQuery = useQuery({
    ...productExportListQueryOptions(PRODUCT_EXPORT_LIST_INPUT),
    refetchInterval: (query) =>
      query.state.data?.data?.result.some(
        (row) => !TERMINAL_PRODUCT_EXPORT_STATUSES.has(row.status),
      )
        ? PRODUCT_EXPORT_POLL_MS
        : false,
  });
  const productExports = productExportsQuery.data?.data?.result ?? [];
  useProductExportReadyToast(productExports, showToast);
  const productExportById = useMemo(
    () =>
      new Map(
        productExports.map((productExport) => [
          productExport.id,
          productExport,
        ]),
      ),
    [productExports],
  );
  const deletingProductExportId = deleteMutation.isPending
    ? deleteMutation.variables
    : undefined;
  const downloadingProductExportId = downloadMutation.isPending
    ? downloadMutation.variables?.id
    : undefined;

  const handleDownload = useCallback(
    (productExportId: string) => {
      const productExport = productExportById.get(productExportId);
      if (!productExport) return;

      setLoading(true);
      downloadMutation
        .mutateAsync(productExport)
        .then(() => {
          showToast("Product export download started.");
        })
        .catch((error: unknown) => {
          showToast(getErrorMessage(error), { isError: true });
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [downloadMutation, productExportById],
  );

  const handleRequestDelete = useCallback(
    (productExportId: string) => {
      const productExport = productExportById.get(productExportId);
      if (productExport) setProductExportToDelete(productExport);
    },
    [productExportById],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!productExportToDelete || deletingProductExportId) return;

    setLoading(true);
    deleteMutation
      .mutateAsync(productExportToDelete.id)
      .then(() => {
        showToast("Product export deleted.");
        setProductExportToDelete(undefined);
      })
      .catch((error: unknown) => {
        showToast(getErrorMessage(error), { isError: true });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [deleteMutation, deletingProductExportId, productExportToDelete]);

  const handleCancelDelete = useCallback(() => {
    setProductExportToDelete(undefined);
  }, []);

  const errorMessage = useMemo(
    () =>
      productExportsQuery.error
        ? getErrorMessage(productExportsQuery.error)
        : "",
    [productExportsQuery.error],
  );

  if (!isOnline) {
    return <Offline scope="page" />;
  }

  if (productExportsQuery.isLoading) {
    return (
      <Loading
        heading="Product export"
        message="Loading product export actions"
        scope="page"
      />
    );
  }

  return (
    <s-page heading="Product export">
      <s-button
        href="/product-export/new"
        slot="primary-action"
        variant="primary"
      >
        Create
      </s-button>

      {errorMessage ? (
        <s-section>
          <s-banner heading="Unable to load product exports" tone="critical">
            <s-text>{errorMessage}</s-text>
          </s-banner>
        </s-section>
      ) : productExports.length === 0 ? (
        <Empty
          heading="No product exports"
          message="Create a product export to generate a CSV file from your Shopify products."
          scope="inline"
        />
      ) : (
        <s-section padding="none" accessibilityLabel="Product exports">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Export</s-table-header>
              <s-table-header>Created</s-table-header>
              <s-table-header>Products</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {productExports.map((productExport) => (
                <ProductExportRow
                  key={productExport.id}
                  deletingProductExportId={deletingProductExportId}
                  downloadingProductExportId={downloadingProductExportId}
                  onDownload={handleDownload}
                  onRequestDelete={handleRequestDelete}
                  productExport={productExport}
                />
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-modal
        id="delete-product-export-modal"
        heading="Delete product export?"
      >
        <s-stack gap="base">
          <s-text>Are you sure you want to delete product export?</s-text>
          <s-text tone="caution">This action cannot be undone.</s-text>
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          commandFor="delete-product-export-modal"
          command="--hide"
          onClick={handleConfirmDelete}
          disabled={
            !productExportToDelete ||
            Boolean(
              deletingProductExportId &&
              deletingProductExportId !== productExportToDelete.id,
            )
          }
          loading={deletingProductExportId === productExportToDelete?.id}
        >
          Delete
        </s-button>
        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor="delete-product-export-modal"
          command="--hide"
          onClick={handleCancelDelete}
        >
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

type ProductExportRowProps = {
  deletingProductExportId?: string;
  downloadingProductExportId?: string;
  onDownload: (productExportId: string) => void;
  onRequestDelete: (productExportId: string) => void;
  productExport: ProductExport;
};

const ProductExportRow = memo(function ProductExportRow({
  deletingProductExportId,
  downloadingProductExportId,
  onDownload,
  onRequestDelete,
  productExport,
}: ProductExportRowProps) {
  const status = getStatusDisplay(productExport.status);
  const canDownload = productExport.status === "ready";
  const isDownloading = downloadingProductExportId === productExport.id;
  const isDeleting = deletingProductExportId === productExport.id;
  const handleDownloadClick = useCallback(() => {
    onDownload(productExport.id);
  }, [onDownload, productExport.id]);
  const handleRequestDeleteClick = useCallback(() => {
    onRequestDelete(productExport.id);
  }, [onRequestDelete, productExport.id]);

  return (
    <s-table-row>
      <s-table-cell>
        <s-link href={`/product-export/${productExport.id}`}>
          {productExport.name}
        </s-link>
      </s-table-cell>
      <s-table-cell>{formatDateTime(productExport.createdAt)}</s-table-cell>
      <s-table-cell>{formatCount(productExport.objectCount)}</s-table-cell>
      <s-table-cell>
        <s-badge tone={status.tone}>{status.label}</s-badge>
      </s-table-cell>
      <s-table-cell>
        <s-stack direction="inline" gap="small-200">
          <s-button
            accessibilityLabel={`Download ${productExport.name}`}
            disabled={!canDownload || isDownloading}
            icon="download"
            loading={isDownloading}
            variant="secondary"
            onClick={handleDownloadClick}
          >
            Download
          </s-button>
          <s-button
            accessibilityLabel={`Delete ${productExport.name}`}
            command="--show"
            commandFor="delete-product-export-modal"
            disabled={Boolean(deletingProductExportId)}
            icon="delete"
            loading={isDeleting}
            tone="critical"
            variant="secondary"
            onClick={handleRequestDeleteClick}
          >
            Delete
          </s-button>
        </s-stack>
      </s-table-cell>
    </s-table-row>
  );
});

function getStatusDisplay(status: ProductExportStatus): {
  label: string;
  tone: "critical" | "info" | "success" | "warning";
} {
  switch (status) {
    case "ready":
      return { label: "Ready", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "critical" };
    case "canceled":
      return { label: "Canceled", tone: "critical" };
    case "requires_node_finalize":
      return { label: "Requires Node finalize", tone: "warning" };
    case "bulk_operation_running":
      return { label: "Running bulk operation", tone: "info" };
    case "bulk_operation_completed":
      return { label: "Bulk operation completed", tone: "info" };
    case "generating_csv":
      return { label: "Generating CSV", tone: "info" };
    case "queued":
      return { label: "Queued", tone: "info" };
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCount(value: number | null) {
  return typeof value === "number" ? String(value) : "-";
}

function setLoading(isLoading: boolean) {
  globalThis.shopify?.loading(isLoading);
}

function showToast(
  message: string,
  options?: Parameters<(typeof globalThis.shopify)["toast"]["show"]>[1],
) {
  globalThis.shopify?.toast.show(message, options);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
