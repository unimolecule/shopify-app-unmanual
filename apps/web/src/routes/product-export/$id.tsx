import { createFileRoute } from "@tanstack/react-router";
import { Loading } from "@/components/loading";
import { throwAppWebError as throwError } from "../../../internal";
import { ProductExportEditor } from "./-components/editor";
import { productExportDetailQueryOptions } from "./-queries";

export const Route = createFileRoute("/product-export/$id")({
  component: ProductExportDetail,
  loader: async ({ context, params }) => {
    const response = await context.queryClient.ensureQueryData(
      productExportDetailQueryOptions(params.id),
    );

    if (!response.data) {
      throwError("Product export response did not include export data");
    }

    return response.data;
  },
  pendingComponent: () => (
    <Loading
      heading="Loading product export"
      message="Please wait while the product export loads."
      scope="page"
    />
  ),
});

function ProductExportDetail() {
  const productExport = Route.useLoaderData();

  return <ProductExportEditor mode="detail" productExport={productExport} />;
}
