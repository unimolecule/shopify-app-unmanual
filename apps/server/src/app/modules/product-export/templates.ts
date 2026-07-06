import { PRODUCT_EXPORT_TEMPLATE_CODE_VALUES } from "@unimolecule/shopify-app-unmanual-database/constants";

export const PRODUCT_EXPORT_TEMPLATE_CODES =
  PRODUCT_EXPORT_TEMPLATE_CODE_VALUES;

export type ProductExportTemplateCode =
  (typeof PRODUCT_EXPORT_TEMPLATE_CODE_VALUES)[number];

export type ProductExportTemplate = {
  code: ProductExportTemplateCode;
  fields: string[];
  label: string;
};

export const PRODUCT_EXPORT_TEMPLATES = [
  {
    code: "basic",
    fields: [
      "id",
      "productId",
      "title",
      "handle",
      "status",
      "vendor",
      "productType",
      "createdAt",
      "updatedAt",
    ],
    label: "Basic",
  },
] as const satisfies ProductExportTemplate[];

export function listProductExportTemplates(): ProductExportTemplate[] {
  return PRODUCT_EXPORT_TEMPLATES.map((template) => ({
    code: template.code,
    fields: [...template.fields],
    label: template.label,
  }));
}
