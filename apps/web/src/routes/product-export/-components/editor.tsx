import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import { Offline } from "@/components/errors";
import {
  PRODUCT_EXPORT_POLL_MS,
  productExportDetailQueryOptions,
  productExportTemplatesQueryOptions,
  TERMINAL_PRODUCT_EXPORT_STATUSES,
  useCreateProductExportMutation,
  useDeleteProductExportMutation,
  useIsOnline,
} from "../-queries";
import { useProductExportReadyToast } from "./ready-toast";
import type {
  ProductExport,
  ProductExportTemplate,
  ProductExportTemplateCode,
} from "@/apis/product-exports";

type ProductExportEditorProps =
  | {
      mode: "create";
      productExport?: never;
    }
  | {
      mode: "detail";
      productExport: ProductExport;
    };

type ProductExportRouteState = {
  productExportCreateSucceeded?: boolean;
};

export function ProductExportEditor({
  mode,
  productExport,
}: ProductExportEditorProps) {
  const createMutation = useCreateProductExportMutation();
  const deleteMutation = useDeleteProductExportMutation();
  const isOnline = useIsOnline();
  const navigate = useNavigate();
  const shouldShowCreatedBanner = useLocation({
    select: (location) =>
      Boolean(
        (location.state as ProductExportRouteState)
          .productExportCreateSucceeded,
      ),
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [exportFileName, setExportFileName] = useState(
    productExport?.name ?? "",
  );
  const [submittedFileName, setSubmittedFileName] = useState(
    productExport?.name ?? "",
  );
  const [selectedTemplate, setSelectedTemplate] = useState<
    ProductExportTemplateCode | undefined
  >(productExport?.template);
  const [savedProductExport, setSavedProductExport] = useState(productExport);
  const detailQuery = useQuery({
    ...productExportDetailQueryOptions(productExport?.id ?? ""),
    enabled: mode === "detail",
    initialData: mode === "detail" ? { data: productExport } : undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status && !TERMINAL_PRODUCT_EXPORT_STATUSES.has(status)
        ? PRODUCT_EXPORT_POLL_MS
        : false;
    },
  });
  const activeProductExport =
    mode === "detail" ? (detailQuery.data?.data ?? productExport) : undefined;
  const activeProductExports = useMemo(
    () => (activeProductExport ? [activeProductExport] : []),
    [activeProductExport],
  );
  const templatesQuery = useQuery(productExportTemplatesQueryOptions());
  const templates = templatesQuery.data?.data ?? [];
  const isSaving = createMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  useProductExportReadyToast(activeProductExports, showToast);

  useEffect(() => {
    if (!activeProductExport) return;

    setSavedProductExport(activeProductExport);
    setExportFileName(activeProductExport.name);
    setSubmittedFileName(activeProductExport.name);
    setSelectedTemplate(activeProductExport.template);
  }, [activeProductExport]);

  useEffect(() => {
    setSelectedTemplate((current) => current ?? templates[0]?.code);
  }, [templates]);

  const queryErrorMessage = useMemo(
    () => (templatesQuery.error ? getErrorMessage(templatesQuery.error) : ""),
    [templatesQuery.error],
  );

  if (!isOnline) {
    return <Offline scope="page" />;
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode !== "create") return;

    const form = event.currentTarget;
    const name = getFormTextValue(form, "name");
    const template = getExportFileTemplate(form);

    if (!name) {
      setErrorMessage("Enter an export file name.");
      return;
    }

    if (!template) {
      setErrorMessage("Select an export file template.");
      return;
    }

    setErrorMessage("");
    setSubmittedFileName(name);
    setLoading(true);

    try {
      if (mode === "create") {
        const response = await createMutation.mutateAsync({ name, template });

        if (response.data) {
          await navigate({
            to: "/product-export/$id",
            params: { id: response.data.id },
            replace: true,
            state: (current) => ({
              ...current,
              productExportCreateSucceeded: true,
            }),
          });
        }
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!savedProductExport || isDeleting) return;

    setLoading(true);

    try {
      await deleteMutation.mutateAsync(savedProductExport.id);
      setSavedProductExport(undefined);
      showToast("Product export deleted.");
      await navigate({ to: "/product-export" });
    } catch (error) {
      showToast(getErrorMessage(error), { isError: true });
    } finally {
      setLoading(false);
    }
  }

  function handleTemplateChange(
    event: Event & { currentTarget: HTMLElementTagNameMap["s-select"] },
  ) {
    setSelectedTemplate(
      toProductExportTemplateCode(event.currentTarget.value, templates),
    );
  }

  function handleFileNameInput(
    event: Event & { currentTarget: HTMLElementTagNameMap["s-text-field"] },
  ) {
    setExportFileName(event.currentTarget.value);
  }

  const isSaveDisabled =
    isSaving ||
    templatesQuery.isLoading ||
    !exportFileName.trim() ||
    !selectedTemplate;
  const pageHeading =
    mode === "create" ? "Create product export" : "Product export";
  const displayedErrorMessage = errorMessage || queryErrorMessage;

  return (
    <form data-save-bar onSubmit={handleSubmit}>
      <s-page heading={pageHeading}>
        <s-link slot="breadcrumb-actions" href="/product-export">
          Product export
        </s-link>

        {mode === "create" ? (
          <s-button
            slot="primary-action"
            variant="primary"
            type="submit"
            id="save-btn"
            disabled={isSaveDisabled}
            loading={isSaving}
          >
            Save
          </s-button>
        ) : null}

        {mode === "detail" && savedProductExport ? (
          <>
            <s-button slot="secondary-actions" commandFor="more-actions-id">
              More actions
            </s-button>
            <s-menu id="more-actions-id">
              {/* <s-button icon="view">Preview</s-button> */}
              <s-button
                icon="delete"
                tone="critical"
                commandFor="delete-product-export-modal"
                command="--show"
                disabled={isDeleting}
              >
                Delete
              </s-button>
            </s-menu>

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
                onClick={handleDelete}
                disabled={isDeleting}
                loading={isDeleting}
              >
                Delete
              </s-button>
              <s-button
                slot="secondary-actions"
                variant="secondary"
                commandFor="delete-product-export-modal"
                command="--hide"
              >
                Cancel
              </s-button>
            </s-modal>
          </>
        ) : null}

        {mode === "detail" && shouldShowCreatedBanner ? (
          <s-banner
            heading={`${submittedFileName} export created`}
            tone="success"
            dismissible
          >
            You can go back{" "}
            <s-link href="/product-export">product export</s-link> to view it
            later or{" "}
            <s-link href="/product-export/new"> create a new export</s-link>.
          </s-banner>
        ) : null}

        {displayedErrorMessage ? (
          <s-banner
            heading={`${submittedFileName} export failed`}
            tone="critical"
          >
            {displayedErrorMessage}
            <br />
            You can go back{" "}
            <s-link href="/product-export">product export</s-link> to view the
            others or{" "}
            <s-link href="/product-export/new"> create a new export</s-link>
          </s-banner>
        ) : null}

        <s-section>
          <s-grid gap="base">
            <s-text-field
              label="Export file name"
              labelAccessibilityVisibility="visible"
              name="name"
              value={exportFileName}
              onInput={handleFileNameInput}
              placeholder="All products"
              disabled={mode === "detail"}
              required
            ></s-text-field>
            {/* TODO: product field all/collection/specified product */}
            <s-select
              label="Export file template"
              name="template"
              value={selectedTemplate}
              onChange={handleTemplateChange}
              disabled={mode === "detail"}
              required
            >
              {templates.map((template) => (
                <s-option key={template.code} value={template.code}>
                  {template.label}
                </s-option>
              ))}
            </s-select>
          </s-grid>
        </s-section>

        <ProductExportTemplateAside
          selectedTemplate={selectedTemplate}
          templates={templates}
        />
      </s-page>
    </form>
  );
}

function ProductExportTemplateAside({
  selectedTemplate,
  templates,
}: {
  selectedTemplate: ProductExportTemplateCode | undefined;
  templates: ProductExportTemplate[];
}) {
  const selectedTemplateConfig = templates.find(
    (template) => template.code === selectedTemplate,
  );

  if (!selectedTemplateConfig) return null;

  return (
    <s-box slot="aside">
      <s-section heading={`${selectedTemplateConfig.label} template fields`}>
        {/* <s-heading>{selectedTemplateConfig.label} fields:</s-heading> */}
        <s-unordered-list>
          {selectedTemplateConfig.fields.map((field) => (
            <s-list-item key={field}>{field}</s-list-item>
          ))}
        </s-unordered-list>
      </s-section>
    </s-box>
  );
}

function getExportFileTemplate(form: HTMLFormElement) {
  const value = getFormTextValue(form, "template");
  if (!value) return;

  return value as ProductExportTemplateCode;
}

function toProductExportTemplateCode(
  value: string,
  templates: ProductExportTemplate[],
): ProductExportTemplateCode | undefined {
  return templates.some((template) => template.code === value)
    ? (value as ProductExportTemplateCode)
    : undefined;
}

function getFormTextValue(form: HTMLFormElement, key: string) {
  const value = new FormData(form).get(key);
  return typeof value === "string" ? value.trim() : "";
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
  return error instanceof Error ? error.message : String(error);
}
