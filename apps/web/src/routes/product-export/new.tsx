import { createFileRoute } from "@tanstack/react-router";
import { ProductExportEditor } from "./-components/editor";

export const Route = createFileRoute("/product-export/new")({
  component: NewProductExport,
});

function NewProductExport() {
  return <ProductExportEditor mode="create" />;
}
