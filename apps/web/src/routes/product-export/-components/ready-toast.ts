import { useEffect, useRef } from "react";
import {
  getProductExportFilename,
  type ProductExport,
  type ProductExportStatus,
} from "@/apis/product-exports";

export function useProductExportReadyToast(
  productExports: ProductExport[],
  showToast: (message: string) => void,
) {
  const previousStatusesRef = useRef(new Map<string, ProductExportStatus>());

  useEffect(() => {
    const previousStatuses = previousStatusesRef.current;
    const nextStatuses = new Map<string, ProductExportStatus>();

    for (const productExport of productExports) {
      const previousStatus = previousStatuses.get(productExport.id);

      if (
        previousStatus &&
        previousStatus !== "ready" &&
        productExport.status === "ready"
      ) {
        showToast(
          `${getProductExportFilename(productExport)} is ready to download.`,
        );
      }

      nextStatuses.set(productExport.id, productExport.status);
    }

    previousStatusesRef.current = nextStatuses;
  }, [productExports, showToast]);
}
